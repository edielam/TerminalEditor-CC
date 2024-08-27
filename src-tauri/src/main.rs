// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod commands;
mod protocol;
mod network;
mod pty;
mod settings;
mod config;

extern crate serde_json;

use mt_logger::*;
use pty::ws_server::pty_serve;
use settings::settings::{check_settings_file, get_settings};
use config::config::configure;
use network::{create_swarm,read_or_create_certificate, 
    SharedState, read_or_create_identity, send_message, 
    get_messages, initialize_message_store, run_swarm_operations};

use anyhow::{Context, Result};
use clap::Parser;
use commands::*;
use futures::lock::Mutex;
use libp2p::{
    gossipsub,
    multiaddr::{Multiaddr, Protocol},
};

use once_cell::sync::{Lazy, OnceCell};
use std::net::IpAddr;
use std::path::Path;
use std::sync::Arc;
use std::{
    env,
    time::{Duration, Instant},
};
use tokio::sync::mpsc;
use tauri::{CustomMenuItem, Menu, Submenu};

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

// Constants

// const TICK_INTERVAL: Duration = Duration::from_secs(15);
// const KADEMLIA_PROTOCOL_NAME: StreamProtocol = StreamProtocol::new("/ipfs/kad/1.0.0");
const PORT_WEBRTC: u16 = 9092;
const PORT_QUIC: u16 = 9093;
const LOCAL_KEY_PATH: &str = "./local_key";
const LOCAL_CERT_PATH: &str = "./cert.pem";
const GOSSIPSUB_CHAT_TOPIC: &str = "cortexcode";

static CHAT_TOPIC_HASH: Lazy<Mutex<Option<gossipsub::TopicHash>>> = Lazy::new(|| Mutex::new(None));

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = fix_path_env::fix();
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    initialize_message_store().await?;
    // Tauri setup
    mt_new!(None, Level::Info, OutputStream::Both);
    configure();
    check_settings_file();

    let context = tauri::generate_context!();
    let menu = Menu::new().add_submenu(Submenu::new(
        "File",
        Menu::new()
            .add_item(CustomMenuItem::new("open", "Open"))
            .add_item(CustomMenuItem::new("save", "Save"))
            .add_item(CustomMenuItem::new("save_as", "Save As"))
            .add_item(CustomMenuItem::new("new", "New File")),
    ));

    // Libp2p setup
    let opt = Opt::parse();
    let local_key = read_or_create_identity(Path::new(LOCAL_KEY_PATH))
        .await
        .context("Failed to read identity")?;
    let webrtc_cert = read_or_create_certificate(Path::new(LOCAL_CERT_PATH))
        .await
        .context("Failed to read certificate")?;

    let (tx, rx) = mpsc::channel::<String>(100);
    let shared_state = Arc::new(Mutex::new(SharedState { tx }));


    let mut swarm = create_swarm(local_key, webrtc_cert).context("Failed to create swarm")?;

    

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

    let arc_swarm = Arc::new(Mutex::new(swarm));
    let swarm_ops_task = tokio::spawn(run_swarm_operations(arc_swarm.clone(), rx, shared_state.clone()));
    // let swarm_ops_task = tokio::spawn(async move {
    //     if let Err(e) = run_swarm_operations(arc_swarm.clone(), rx, shared_state.clone()).await {
    //         eprintln!("Error in swarm operations: {:?}", e);
    //     }
    // });

    // Run the pty_serve in a separate task
    let pty_task = tokio::spawn(async move {
        pty_serve().await;
    });

    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            #[cfg(target_os = "macos")]
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
        .manage(shared_state.clone())
        .invoke_handler(tauri::generate_handler![
            save_file,
            read_file,
            get_file_extension,
            read_dir,
            set_window_title,
            get_messages,
            send_message,
            get_current_dir,
            create_file,
            create_directory,
            rename_file,
            delete_file,
            get_settings,
        ])
        .run(context)
        .expect("error while running tauri application");

    swarm_ops_task.await?;
    pty_task.await?;

    Ok(())
}


