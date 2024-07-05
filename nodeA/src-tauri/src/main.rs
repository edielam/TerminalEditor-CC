// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod event;
mod protocol;
mod tty;

use anyhow::{Context, Result};
use clap::Parser;
use dotenv::dotenv;
use futures::future::{select, Either};
use futures::lock::Mutex;
use futures::StreamExt;
use libp2p::{
    core::muxing::StreamMuxerBox,
    dns, gossipsub, identify, identity,
    kad::record::store::MemoryStore,
    kad::{Kademlia, KademliaConfig},
    memory_connection_limits,
    multiaddr::{Multiaddr, Protocol},
    quic, relay,
    swarm::{NetworkBehaviour, Swarm, SwarmBuilder, SwarmEvent},
    PeerId, StreamProtocol, Transport,
};
use libp2p_webrtc as webrtc;
use libp2p_webrtc::tokio::Certificate;
use log::{debug, error, info, warn};
use once_cell::sync::{Lazy, OnceCell};
use std::net::IpAddr;
use std::path::Path;
use std::sync::Arc;
use std::{
    collections::hash_map::DefaultHasher,
    env,
    hash::{Hash, Hasher},
    time::{Duration,Instant},
};
use tokio::fs;
use tokio::sync::mpsc;

use crate::event::WindowSize;
use crate::tty::unix::{new, Pty};
use crate::tty::{EventedReadWrite, Options};
use futures_util::SinkExt;
use rustix_openpty::openpty;
use std::io::{Read, Write};
use std::os::fd::AsRawFd;
use tauri::http::header::HeaderValue;
use tauri::{CustomMenuItem, Menu, State, Submenu};
use tokio::io::ErrorKind;
use tokio::net::TcpListener;
use tokio::sync::broadcast::{self, Sender};
use tokio::time::sleep;
use tokio_tungstenite::accept_hdr_async;
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};
use tokio_tungstenite::tungstenite::protocol::Message;

// Struct definitions

#[derive(Debug, Parser)]
#[clap(name = "universal connectivity rust peer")]
struct Opt {
    #[clap(long, default_value = "0.0.0.0")]
    listen_address: IpAddr,

    #[clap(long, env)]
    external_address: Option<IpAddr>,

    #[clap(long)]
    connect: Vec<Multiaddr>,
}

struct MessageStore {
    messages: Vec<String>,
}

struct MessageTx(mpsc::Sender<String>);

// struct AppState {
//     pty: Arc<Mutex<Pty>>,
//     ptx: Arc<Sender<String>>,
//     prompt: Arc<Mutex<String>>,  // Add this line
// }
struct AppState {
    pty: std::sync::Mutex<Pty>
}

#[derive(serde::Serialize)]
struct FileItem {
    name: String,
    is_dir: bool,
    children: Option<Vec<FileItem>>,
}

// Constants

const TICK_INTERVAL: Duration = Duration::from_secs(15);
const KADEMLIA_PROTOCOL_NAME: StreamProtocol = StreamProtocol::new("/ipfs/kad/1.0.0");
const PORT_WEBRTC: u16 = 9090;
const PORT_QUIC: u16 = 9091;
const LOCAL_KEY_PATH: &str = "./local_key";
const LOCAL_CERT_PATH: &str = "./cert.pem";
const GOSSIPSUB_CHAT_TOPIC: &str = "cortexcode";

// Static variables

static MESSAGE_STORE: OnceCell<Arc<Mutex<MessageStore>>> = OnceCell::new();
// static SWARM: OnceCell<Arc<Mutex<Swarm<Behaviour>>>> = OnceCell::new();
static CHAT_TOPIC_HASH: Lazy<Mutex<Option<gossipsub::TopicHash>>> = Lazy::new(|| Mutex::new(None));

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    MESSAGE_STORE.get_or_init(|| {
        Arc::new(Mutex::new(MessageStore {
            messages: Vec::new(),
        }))
    });

    // Menu setup
    let menu = Menu::new().add_submenu(Submenu::new(
        "File",
        Menu::new()
            .add_item(CustomMenuItem::new("open", "Open"))
            .add_item(CustomMenuItem::new("save", "Save"))
            .add_item(CustomMenuItem::new("save_as", "Save As"))
            .add_item(CustomMenuItem::new("new", "New File")),
    ));

    // PTY setup
    let config = Options {
        shell: None,
        working_directory: Some(std::env::var("HOME").unwrap_or_default().into()),
        env: Default::default(),
        hold: false,
    };
    let window_size = WindowSize {
        num_lines: 24,
        num_cols: 80,
        cell_width: 8,
        cell_height: 16,
    };
    let window_id: u64 = 1;
    let pty = new(&config, window_size, window_id)?;
    let pty_fd = pty.file().as_raw_fd();
    println!("New PTY instance : {} created", pty_fd);

    let output_file = pty.file().try_clone()?;

    // libp2p setup
    let opt = Opt::parse();
    let local_key = read_or_create_identity(Path::new(LOCAL_KEY_PATH))
        .await
        .context("Failed to read identity")?;
    let webrtc_cert = read_or_create_certificate(Path::new(LOCAL_CERT_PATH))
        .await
        .context("Failed to read certificate")?;

    let (tx, rx) = mpsc::channel::<String>(100);

    let mut swarm = create_swarm(local_key, webrtc_cert).context("Failed to create swarm")?;

    let chat_topic_hash = gossipsub::IdentTopic::new(GOSSIPSUB_CHAT_TOPIC).hash();
    *CHAT_TOPIC_HASH.lock().await = Some(chat_topic_hash.clone());
    println!("Topic hash: {chat_topic_hash}");

    let address_webrtc = Multiaddr::from(opt.listen_address)
        .with(Protocol::Udp(PORT_WEBRTC))
        .with(Protocol::WebRTCDirect);

    let address_quic = Multiaddr::from(opt.listen_address)
        .with(Protocol::Udp(PORT_QUIC))
        .with(Protocol::QuicV1);

    swarm
        .listen_on(address_webrtc.clone())
        .context("Failed to listen on WebRTC address")?;
    swarm
        .listen_on(address_quic.clone())
        .context("Failed to listen on QUIC address")?;

    let spawn_handle = tokio::spawn({
        let arc_swarm = Arc::new(Mutex::new(swarm));
        let arc_swarm_clone1 = arc_swarm.clone();
    
        async move {
            let swarm_handle = tokio::spawn({
                async move {
                    if let Err(e) = run_swarm_operations(&arc_swarm_clone1, rx).await {
                        eprintln!("Error in swarm operations: {:?}", e);
                    }
                }
            });
    
            tokio::select! {
                _ = swarm_handle => {},
            }
        }
    });
    

    // // Setup broadcast channel for PTY output
    // let (ptytx, _ptyrx) = broadcast::channel(16);
    // let ptx = Arc::new(ptytx);
    // let pty = Arc::new(Mutex::new(pty));
    // let prompt = Arc::new(Mutex::new(String::new()));

    // // Clone TX for WebSocket server
    // let tx_clone = ptx.clone();
    // let pty_clone = Arc::clone(&pty);
    // let pty_clone_for_ws = pty_clone.clone();

    // // Spawn WebSocket server
    // tokio::spawn(async move {
    //     let listener = TcpListener::bind("127.0.0.1:8081").await.unwrap();
    //     println!("WebSocket server started on 127.0.0.1:8081");
    //     while let Ok((stream, _)) = listener.accept().await {
    //         let tx = tx_clone.clone();
    //         let pty_inner_clone = Arc::clone(&pty_clone_for_ws); // Rename this to avoid confusion
    //         let callback = |req: &Request, mut response: Response| {
    //             println!("Incoming connection from: {}", req.uri());
    //             let headers = response.headers_mut();
    //             headers.insert("Access-Control-Allow-Origin", HeaderValue::from_static("*"));
    //             Ok(response)
    //         };
    //         tokio::spawn(async move {
    //             match tokio_tungstenite::accept_hdr_async(stream, callback).await {
    //                 Ok(ws_stream) => {
    //                     let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    //                     let mut rx = tx.subscribe();
    
    //                     let pty_writer = pty_inner_clone.clone(); // Use the cloned value here
    
    //                     let to_pty = tokio::spawn(async move {
    //                         while let Some(msg) = ws_receiver.next().await {
    //                             if let Ok(Message::Text(text)) = msg {
    //                                 let mut pty = pty_writer.lock().await;
    //                                 if let Err(e) = pty.writer().write_all(text.as_bytes()) {
    //                                     eprintln!("Failed to write to PTY: {}", e);
    //                                 }
    //                             }
    //                         }
    //                     });
    
    //                     let from_pty = tokio::spawn(async move {
    //                         while let Ok(msg) = rx.recv().await {
    //                             if let Err(e) = ws_sender.send(Message::Text(msg)).await {
    //                                 eprintln!("Failed to send message over WebSocket: {}", e);
    //                                 break;
    //                             }
    //                         }
    //                     });
    
    //                     tokio::select! {
    //                         _ = to_pty => {},
    //                         _ = from_pty => {},
    //                     }
    //                 },
    //                 Err(e) => eprintln!("WebSocket handshake error: {}", e),
    //             }
    //         });
    //     }
    // });
    
    // // Clone TX for PTY reader
    // let tx_clone = tx.clone();
    // // Clone the PTY for the PTY reader task
    // let pty_reader_clone = Arc::clone(&pty_clone);
    // // Spawn PTY reader
    // let prompt_clone = Arc::clone(&prompt);
    // // PTY reader task
    // tokio::spawn(async move {
    //     loop {
    //         let mut buffer = [0; 1024];
    //         let n = {
    //             let mut binding = pty_reader_clone.lock().await;
    //             match binding.reader().read(&mut buffer) {
    //                 Ok(n) => n,
    //                 Err(e) if e.kind() == ErrorKind::WouldBlock => {
    //                     tokio::time::sleep(Duration::from_millis(10)).await;
    //                     continue;
    //                 }
    //                 Err(e) => {
    //                     eprintln!("Error reading from PTY: {}", e);
    //                     tokio::time::sleep(Duration::from_millis(100)).await;
    //                     continue;
    //                 }
    //             }
    //         };

    //         if n == 0 {
    //             break; // End of file
    //         }

    //         let output = String::from_utf8_lossy(&buffer[..n]).to_string();
            
    //         // Send the full output
    //         if let Err(_) = tx_clone.send(output).await {
    //             eprintln!("Failed to send PTY output");
    //         }
    //     }
    // });


    // Run Tauri application
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);
            Ok(())
        })
        .menu(menu)
        .on_menu_event(|event| match event.menu_item_id() {
            "new" => {
                event.window().emit("new-file-trigger", {}).unwrap();
            }
            "save" => {
                event.window().emit("save-trigger", {}).unwrap();
            }
            "save_as" => {
                event.window().emit("save-as-trigger", {}).unwrap();
            }
            "open" => {
                event.window().emit("open-trigger", {}).unwrap();
            }
            _ => {}
        })
        // .manage(AppState {
        //     pty: Arc::clone(&pty),
        //     ptx,
        //     prompt: Arc::clone(&prompt),
        // })
        .manage(AppState {
            pty: std::sync::Mutex::new(pty),
        })
        .manage(MessageTx(tx))
        .invoke_handler(tauri::generate_handler![
            send_command_to_terminal,
            save_file,
            read_file,
            get_file_extension,
            read_dir,
            set_window_title,
            get_messages,
            send_message,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    spawn_handle.await.context("Error in spawn handle")?;

    Ok(())
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_file_extension(path: String) -> String {
    std::path::Path::new(&path)
        .extension()
        .and_then(|os_str| os_str.to_str())
        .unwrap_or("")
        .to_string()
}

#[tauri::command]
fn save_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_window_title(window: tauri::Window, title: String) {
    window.set_title(&title).unwrap();
}

#[tauri::command]
fn read_dir(path: String) -> Result<Vec<FileItem>, String> {
    let dir = std::fs::read_dir(path).map_err(|e| e.to_string())?;
    let mut items = Vec::new();

    for entry in dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = path.file_name().unwrap().to_string_lossy().into_owned();
        let is_dir = path.is_dir();

        items.push(FileItem {
            name,
            is_dir,
            children: None,
        });
    }

    items.sort_by(|a, b| {
        if a.is_dir == b.is_dir {
            a.name.cmp(&b.name)
        } else {
            b.is_dir.cmp(&a.is_dir)
        }
    });

    Ok(items)
}

// #[tauri::command]
// async fn send_command_to_terminal(
//     command: String,
//     state: State<'_, AppState>,
// ) -> Result<String, String> {
//     let mut pty = state.pty.lock().await;
//     println!("command received: {}", command.clone());

//     // Write the command to the PTY
//     let command_with_newline = format!("{}\n", command);
//     pty.writer()
//         .write_all(command_with_newline.as_bytes())
//         .map_err(|e| e.to_string())?;
//     pty.writer().flush().map_err(|e| e.to_string())?;

//     // Get the current prompt
//     // let prompt = state.prompt.lock().await.clone();

//     // Ok(prompt) // Return the current prompt
//     // Read the output from the PTY with a timeout
//     let mut output = String::new();
//     let start_time = Instant::now();
//     let timeout = Duration::from_secs(5); // 5 second timeout

//     while start_time.elapsed() < timeout {
//         let mut buffer = [0; 1024];
//         match pty.reader().read(&mut buffer) {
//             Ok(0) => break, // End of input
//             Ok(n) => {
//                 output.push_str(&String::from_utf8_lossy(&buffer[..n]));
//                 if output.contains(&command) && output.contains('\n') {
//                     break; // We've likely received the full output
//                 }
//             },
//             Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
//                 // No data available right now, wait a bit
//                 std::thread::sleep(Duration::from_millis(100));
//                 continue;
//             },
//             Err(e) => return Err(e.to_string()),
//         }
//     }

//     if output.is_empty() {
//         return Err("Timeout or no output received".to_string());
//     }

//     Ok(output)
// }
#[tauri::command]
fn send_command_to_terminal(command: String, state: State<AppState>) -> Result<String, String> {
    let mut pty = state.pty.lock().unwrap();

    // Write the command to the PTY
    let command_with_newline = format!("{}\n", command);
    pty.writer().write_all(command_with_newline.as_bytes()).map_err(|e| e.to_string())?;
    pty.writer().flush().map_err(|e| e.to_string())?;

    // Read the output from the PTY with a timeout
    let mut output = String::new();
    let start_time = Instant::now();
    let timeout = Duration::from_secs(5); // 5 second timeout

    while start_time.elapsed() < timeout {
        let mut buffer = [0; 1024];
        match pty.reader().read(&mut buffer) {
            Ok(0) => break, // End of input
            Ok(n) => {
                output.push_str(&String::from_utf8_lossy(&buffer[..n]));
                if output.contains(&command) && output.contains('\n') {
                    break; // We've likely received the full output
                }
            },
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                // No data available right now, wait a bit
                std::thread::sleep(Duration::from_millis(100));
                continue;
            },
            Err(e) => return Err(e.to_string()),
        }
    }

    if output.is_empty() {
        return Err("Timeout or no output received".to_string());
    }

    Ok(output)
}


async fn run_swarm_operations(
    swarm: &Arc<Mutex<Swarm<Behaviour>>>,
    mut rx: mpsc::Receiver<String>,
) -> Result<()> {
    // let mut swarm = swarm2.lock().await;
    // for addr in opt.connect {
    //     if let Err(e) = swarm.dial(addr.clone()) {
    //         debug!("Failed to dial {addr}: {e}");
    //     }
    // }

    // for peer in &BOOTSTRAP_NODES {
    //     match swarm.try_lock() {
    //         Some(mut swarm) => {
    //             let multiaddr: Multiaddr = peer.parse().expect("Failed to parse Multiaddr");
    //             if let Err(e) = swarm.dial(multiaddr) {
    //                 debug!("Failed to dial {peer}: {e}");
    //             }
    //         },
    //         None => {
    //             error!("Failed to acquire swarm lock for dialing peers");
    //             tokio::time::sleep(Duration::from_millis(100)).await;
    //             continue;
    //         }
    //     }
    // }
    dotenv().ok();
    let env_address = env::var("EXTERNAL_ADDRESS").expect("EXTERNAL_ADDRESS must be set");
    let opt = Opt::parse();

    let chat_topic_hash = CHAT_TOPIC_HASH
        .lock()
        .await
        .clone()
        .ok_or_else(|| anyhow::anyhow!("CHAT_TOPIC_HASH is not set"))?;

    let mut tick = futures_timer::Delay::new(TICK_INTERVAL);
    loop {
        match swarm.try_lock() {
            Some(mut swarm) => {
                tokio::select! {
                    event = swarm.select_next_some() => {
                        match event {
                            SwarmEvent::Behaviour(BehaviourEvent::Gossipsub(
                                libp2p::gossipsub::Event::Subscribed { peer_id, topic },
                            )) => {
                                println!("{peer_id} subscribed to {topic}");
                            }
                            SwarmEvent::Behaviour(BehaviourEvent::Gossipsub(
                                libp2p::gossipsub::Event::Message {message, ..
                                },
                            )) => {
                                println!("Message topic: {:?}", &message.topic);
                                if message.topic == chat_topic_hash {
                                    println!(
                                        "Received chat message data: {}",
                                        String::from_utf8_lossy(&message.data)
                                    );
                                    info!(
                                        "Received message from {:?}: {}",
                                        message.source,
                                        String::from_utf8_lossy(&message.data)
                                    );
                                    let mut store = MESSAGE_STORE.get().unwrap().lock().await;
                                    store.messages.push(String::from_utf8(message.data).unwrap());
                                    continue;
                                }
                                error!("Unexpected gossipsub topic hash: {:?}", &message.topic);
                            }
                            SwarmEvent::NewListenAddr { address, .. } => {
                                if let Some(external_ip) = opt.external_address {
                                    let external_address = address
                                        .replace(0, |_| Some(external_ip.into()))
                                        .expect("address.len > 1 and we always return `Some`");

                                    swarm.add_external_address(external_address);
                                }
                                else if let Ok(external_ip) = env_address.parse::<IpAddr>() {
                                    let external_address = address
                                        .replace(0, |_| Some(Protocol::from(external_ip)))
                                        .expect("address.len > 1 and we always return `Some`");

                                    swarm.add_external_address(external_address);
                                }
                                let p2p_address = address.with(Protocol::P2p(*swarm.local_peer_id()));
                                info!("Listening on {p2p_address}");
                            }
                            SwarmEvent::ConnectionEstablished { peer_id, .. } => {
                                info!("Connected to {peer_id}");
                            }
                            SwarmEvent::OutgoingConnectionError { peer_id, error, .. } => {
                                warn!("Failed to dial {peer_id:?}: {error}");
                            }
                            SwarmEvent::IncomingConnectionError { error, .. } => {
                                warn!("{:#}", anyhow::Error::from(error))
                            }
                            SwarmEvent::ConnectionClosed { peer_id, cause, .. } => {
                                warn!("Connection to {peer_id} closed: {cause:?}");
                                swarm.behaviour_mut().kademlia.remove_peer(&peer_id);
                                info!("Removed {peer_id} from the routing table (if it was in there).");
                            }
                            // SwarmEvent::Behaviour(BehaviourEvent::Relay(e)) => {
                            //     debug!("{:?}", e);
                            // }
                            SwarmEvent::Behaviour(BehaviourEvent::Identify(e)) => {
                                info!("BehaviourEvent::Identify {:?}", e);

                                if let identify::Event::Error { peer_id, error } = e {
                                    match error {
                                        libp2p::swarm::StreamUpgradeError::Timeout => {
                                            // When a browser tab closes, we don't get a swarm event
                                            // maybe there's a way to get this with TransportEvent
                                            // but for now remove the peer from routing table if there's an Identify timeout
                                            swarm.behaviour_mut().kademlia.remove_peer(&peer_id);
                                            info!("Removed {peer_id} from the routing table (if it was in there).");
                                        }
                                        _ => {
                                            debug!("{error}");
                                        }
                                    }
                                } else if let identify::Event::Received {
                                    peer_id,
                                    info:
                                        identify::Info {
                                            listen_addrs,
                                            protocols,
                                            observed_addr,
                                            ..
                                        },
                                } = e
                                {
                                    debug!("identify::Event::Received observed_addr: {}", observed_addr);

                                    // Disable to see if it's the cause of the wrong multiaddrs getting announced
                                    // swarm.add_external_address(observed_addr);

                                    // TODO: The following should no longer be necessary after https://github.com/libp2p/rust-libp2p/pull/4371.
                                    if protocols.iter().any(|p| p == &KADEMLIA_PROTOCOL_NAME) {
                                        for addr in listen_addrs {
                                            debug!("identify::Event::Received listen addr: {}", addr);
                                            // TODO (fixme): the below doesn't work because the address is still missing /webrtc/p2p even after https://github.com/libp2p/js-libp2p-webrtc/pull/121
                                            // swarm.behaviour_mut().kademlia.add_address(&peer_id, addr);

                                            let webrtc_address = addr
                                                .with(Protocol::WebRTCDirect)
                                                .with(Protocol::P2p(peer_id));

                                            swarm
                                                .behaviour_mut()
                                                .kademlia
                                                .add_address(&peer_id, webrtc_address.clone());
                                            info!("Added {webrtc_address} to the routing table.");
                                        }
                                    }
                                }
                            }
                            SwarmEvent::Behaviour(BehaviourEvent::Kademlia(e)) => {
                                debug!("Kademlia event: {:?}", e);
                            }
                            // SwarmEvent::Behaviour(BehaviourEvent::RequestResponse(
                            //     request_response::Event::Message { message, .. },
                            // )) => match message {
                            //     request_response::Message::Request { request, .. } => {
                            //         //TODO: support ProtocolSupport::Full
                            //         debug!(
                            //             "umimplemented: request_response::Message::Request: {:?}",
                            //             request
                            //         );
                            //     }
                            //     request_response::Message::Response { response, .. } => {
                            //         info!(
                            //             "request_response::Message::Response: size:{}",
                            //             response.file_body.len()
                            //         );
                            //         // TODO: store this file (in memory or disk) and provider it via Kademlia
                            //     }
                            // },
                            // SwarmEvent::Behaviour(BehaviourEvent::RequestResponse(
                            //     request_response::Event::OutboundFailure {
                            //         request_id, error, ..
                            //     },
                            // )) => {
                            //     error!(
                            //         "request_response::Event::OutboundFailure for request {:?}: {:?}",
                            //         request_id, error
                            //     );
                            // }
                            event => {
                                debug!("Other type of event: {:?}", event);
                            }
                        }
                    }
                    msg = rx.recv() => {
                        if let Some(message) = msg {
                            match swarm.behaviour_mut().gossipsub.publish(chat_topic_hash.clone(), message.as_bytes()) {
                                Ok(_) => {
                                    println!("Message published: {:?}", message);
                                }
                                Err(e) => {
                                    error!("Failed to publish message: {:?}", e);
                                }
                            }
                        }
                    }
                    _ = &mut tick => {
                        tick.reset(TICK_INTERVAL);
                        debug!(
                            "external addrs: {:?}",
                            swarm.external_addresses().collect::<Vec<&Multiaddr>>()
                        );
                        if let Err(e) = swarm.behaviour_mut().kademlia.bootstrap() {
                            debug!("Failed to run Kademlia bootstrap: {e:?}");
                        }
                    }
                }
            }
            None => {
                error!("Failed to acquire swarm lock in main loop");
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        }
    }
}

#[derive(NetworkBehaviour)]
struct Behaviour {
    gossipsub: gossipsub::Behaviour,
    identify: identify::Behaviour,
    kademlia: Kademlia<MemoryStore>,
    // relay: relay::Behaviour,
    // request_response: request_response::Behaviour<FileExchangeCodec>,
    connection_limits: memory_connection_limits::Behaviour,
}

fn create_swarm(
    local_key: identity::Keypair,
    certificate: Certificate,
) -> Result<Swarm<Behaviour>> {
    let local_peer_id = PeerId::from(local_key.public());
    debug!("Local peer id: {local_peer_id}");

    // To content-address message, we can take the hash of message and use it as an ID.
    // let message_id_fn = |message: &gossipsub::Message| {
    //     let mut s = DefaultHasher::new();
    //     message.data.hash(&mut s);
    //     gossipsub::MessageId::from(s.finish().to_string())
    // };

    // Set a custom gossipsub configuration
    let gossipsub_config = gossipsub::Config::default();
    // let gossipsub_config = gossipsub::ConfigBuilder::default()
    //     .validation_mode(gossipsub::ValidationMode::Permissive) // This sets the kind of message validation. The default is Strict (enforce message signing)
    //     .message_id_fn(message_id_fn) // content-address messages. No two messages of the same content will be propagated.
    //     // .mesh_outbound_min(1)
    //     // .mesh_n_low(1)
    //     .flood_publish(true)
    //     .build()
    //     .expect("Valid config");

    // build a gossipsub network behaviour
    let mut gossipsub = gossipsub::Behaviour::new(
        gossipsub::MessageAuthenticity::Signed(local_key.clone()),
        gossipsub_config,
    )
    .expect("Correct configuration");

    // Create/subscribe Gossipsub topics
    gossipsub.subscribe(&gossipsub::IdentTopic::new(GOSSIPSUB_CHAT_TOPIC))?;
    // gossipsub.subscribe(&gossipsub::IdentTopic::new(GOSSIPSUB_CHAT_FILE_TOPIC))?;

    let transport = {
        let webrtc = webrtc::tokio::Transport::new(local_key.clone(), certificate);
        let quic = quic::tokio::Transport::new(quic::Config::new(&local_key));

        let mapped = webrtc.or_transport(quic).map(|fut, _| match fut {
            Either::Right((local_peer_id, conn)) => (local_peer_id, StreamMuxerBox::new(conn)),
            Either::Left((local_peer_id, conn)) => (local_peer_id, StreamMuxerBox::new(conn)),
        });

        dns::TokioDnsConfig::system(mapped)?.boxed()
    };

    let identify_config = identify::Behaviour::new(
        identify::Config::new("/ipfs/0.1.0".into(), local_key.public())
            .with_interval(Duration::from_secs(60)), // do this so we can get timeouts for dropped WebRTC connections
    );

    // Create a Kademlia behaviour.
    let mut cfg = KademliaConfig::default();
    cfg.set_protocol_names(vec![KADEMLIA_PROTOCOL_NAME]);
    let store = MemoryStore::new(local_peer_id);
    let kad_behaviour = Kademlia::with_config(local_peer_id, store, cfg);

    let behaviour = Behaviour {
        gossipsub,
        identify: identify_config,
        kademlia: kad_behaviour,
        // relay: relay::Behaviour::new(
        //     local_peer_id,
        //     relay::Config {
        //         max_reservations: usize::MAX,
        //         max_reservations_per_peer: 100,
        //         reservation_rate_limiters: Vec::default(),
        //         circuit_src_rate_limiters: Vec::default(),
        //         max_circuits: usize::MAX,
        //         max_circuits_per_peer: 100,
        //         ..Default::default()
        //     },
        // ),
        // request_response: request_response::Behaviour::new(
        //     // TODO: support ProtocolSupport::Full
        //     iter::once((FILE_EXCHANGE_PROTOCOL, ProtocolSupport::Outbound)),
        //     Default::default(),
        // ),
        connection_limits: memory_connection_limits::Behaviour::with_max_percentage(0.9),
    };
    Ok(
        SwarmBuilder::with_tokio_executor(transport, behaviour, local_peer_id)
            .idle_connection_timeout(Duration::from_secs(60))
            .build(),
    )
}

async fn read_or_create_certificate(path: &Path) -> Result<Certificate> {
    if path.exists() {
        let pem = fs::read_to_string(&path).await?;

        info!("Using existing certificate from {}", path.display());

        return Ok(Certificate::from_pem(&pem)?);
    }

    let cert = Certificate::generate(&mut rand::thread_rng())?;
    fs::write(&path, &cert.serialize_pem().as_bytes()).await?;

    info!(
        "Generated new certificate and wrote it to {}",
        path.display()
    );

    Ok(cert)
}

async fn read_or_create_identity(path: &Path) -> Result<identity::Keypair> {
    if path.exists() {
        let bytes = fs::read(&path).await?;

        info!("Using existing identity from {}", path.display());

        return Ok(identity::Keypair::from_protobuf_encoding(&bytes)?); // This only works for ed25519 but that is what we are using.
    }

    let identity = identity::Keypair::generate_ed25519();

    fs::write(&path, &identity.to_protobuf_encoding()?).await?;

    info!("Generated new identity and wrote it to {}", path.display());

    Ok(identity)
}

#[tauri::command]
async fn send_message(state: tauri::State<'_, MessageTx>, message: String) -> Result<(), String> {
    let m2 = message.clone();
    let mut store = MESSAGE_STORE.get().unwrap().lock().await;
    store.messages.push(message);

    match state.0.try_send(m2.clone()) {
        Ok(_) => {
            println!("Message sent through channel: {}", m2);
            Ok(())
        }
        Err(e) => {
            eprintln!("Failed to send message through channel: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn get_messages() -> Result<Vec<String>, String> {
    let store = MESSAGE_STORE.get().unwrap().lock().await;

    Ok(store.messages.clone())
}
