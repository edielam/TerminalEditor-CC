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
    time::{Duration, Instant},
};
use tokio::fs;
use tokio::sync::mpsc;
use config::{Config, File, FileFormat};
use serde::{Deserialize, Serialize};
use serde_json;

#[derive(Clone, Serialize, Deserialize)]
pub struct Message {
    pub sender: String,
    pub content: String,
}

#[derive(Debug, Parser)]
#[clap(name = "universal connectivity rust peer")]
pub struct Opt {
    #[clap(long, default_value = "0.0.0.0")]
    listen_address: IpAddr,

    #[clap(long, env)]
    external_address: Option<IpAddr>,

    #[clap(long)]
    connect: Vec<Multiaddr>,
}

pub struct MessageStore {
    messages: Vec<Message>,
}
pub struct SharedState {
    pub tx: mpsc::Sender<String>,
}

// pub struct MessageTx(mpsc::Sender<String>);

fn load_config() -> Result<Config> {
    let config_path = Path::new("config.toml");
    let mut config = Config::default();

    // Load from file
    config.merge(File::from(config_path).required(false))?;

    // Override with environment variables if present
    if let Ok(addr) = std::env::var("EXTERNAL_ADDRESS") {
        config.set("external_address", addr)?;
    }

    Ok(config)
}

// Constants

const TICK_INTERVAL: Duration = Duration::from_secs(15);
const KADEMLIA_PROTOCOL_NAME: StreamProtocol = StreamProtocol::new("/ipfs/kad/1.0.0");
const GOSSIPSUB_CHAT_TOPIC: &str = "cortexcode";
const BOOTSTRAP_NODES: [&str; 1] = [
    "/ip4/10.66.66.2/udp/9091/quic-v1/p2p/12D3KooWSE4qvKWLUqbCiNFqmeUS5LgYN8mmnPPrS85S6Hfiwf5j", // "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
                                                                                                 // "/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa",
                                                                                                 // "/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb",
                                                                                                 // "/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt",
];

// Static variables

pub static MESSAGE_STORE: OnceCell<Arc<Mutex<MessageStore>>> = OnceCell::new();
// static SWARM: OnceCell<Arc<Mutex<Swarm<Behaviour>>>> = OnceCell::new();
pub static CHAT_TOPIC_HASH: Lazy<Mutex<Option<gossipsub::TopicHash>>> = Lazy::new(|| Mutex::new(None));

pub async fn initialize_message_store() -> Result<(), Box<dyn std::error::Error>> {
    MESSAGE_STORE.set(Arc::new(Mutex::new(MessageStore {
        messages: Vec::new(),
    }))).expect("Failed to initialize MESSAGE_STORE");
    Ok(())
}


pub async fn run_swarm_operations(
    swarm: Arc<Mutex<Swarm<Behaviour>>>,
    mut rx: mpsc::Receiver<String>,
    shared_state: Arc<Mutex<SharedState>>,
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
    //         }
    //         None => {
    //             error!("Failed to acquire swarm lock for dialing peers");
    //             tokio::time::sleep(Duration::from_millis(100)).await;
    //             continue;
    //         }
    //     }
    // }
    dotenv().ok();
    // let env_address = env::var("EXTERNAL_ADDRESS").expect("EXTERNAL_ADDRESS must be set");
    let config = load_config()?;
    let env_address = config.get_string("external_address")?;
    let opt = Opt::parse();

    let chat_topic_hash = gossipsub::IdentTopic::new(GOSSIPSUB_CHAT_TOPIC).hash();
    *CHAT_TOPIC_HASH.lock().await = Some(chat_topic_hash.clone());
    println!("Topic hash: {chat_topic_hash}");

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
                                libp2p::gossipsub::Event::Message {message, ..},
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
                                    
                                    // Parse the incoming message
                                    let received_message: Message = match serde_json::from_slice(&message.data) {
                                        Ok(msg) => msg,
                                        Err(e) => {
                                            error!("Failed to parse incoming message: {}", e);
                                            continue;
                                        }
                                    };
                                    
                                    // Create a new Message struct
                                    let new_message = Message {
                                        sender: "peer".to_string(), // or you could use message.source.to_string() if you want to show the peer ID
                                        content: received_message.content,
                                    };
                            
                                    let mut store = MESSAGE_STORE.get().unwrap().lock().await;
                                    store.messages.push(new_message);
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
pub struct Behaviour {
    gossipsub: gossipsub::Behaviour,
    identify: identify::Behaviour,
    kademlia: Kademlia<MemoryStore>,
    // relay: relay::Behaviour,
    // request_response: request_response::Behaviour<FileExchangeCodec>,
    connection_limits: memory_connection_limits::Behaviour,
}

pub fn create_swarm(
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

pub async fn read_or_create_certificate(path: &Path) -> Result<Certificate> {
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

pub async fn read_or_create_identity(path: &Path) -> Result<identity::Keypair> {
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
pub async fn send_message(state: tauri::State<'_, Arc<Mutex<SharedState>>>, content: String) -> Result<(), String> {
    let message = Message {
        sender: "user".to_string(),
        content,
    };
    let message_json = serde_json::to_string(&message).map_err(|e| e.to_string())?;
    
    let state = state.lock().await;
    let mut store = MESSAGE_STORE.get().unwrap().lock().await;
    store.messages.push(message);

    match state.tx.send(message_json.clone()).await {
        Ok(_) => {
            println!("Message sent through channel: {}", message_json);
            Ok(())
        }
        Err(e) => {
            eprintln!("Failed to send message through channel: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn get_messages() -> Result<Vec<Message>, String> {
    let store = MESSAGE_STORE.get().unwrap().lock().await;
    Ok(store.messages.clone())
}