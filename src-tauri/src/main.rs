// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod tty;
mod event;

use std::io::{Read, Write};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::http::header::HeaderValue;
use std::time::Duration;
use tokio::sync::broadcast::{self, Sender};
use tauri::{State, Menu, Submenu, CustomMenuItem};
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};
use rustix_openpty::openpty;
use tokio::io::ErrorKind;
use tokio::time::sleep;
use std::os::fd::AsRawFd;
use tokio_tungstenite::tungstenite::protocol::Message;
use tokio_tungstenite::accept_hdr_async;
use tokio::net::TcpListener;
use futures_util::{StreamExt, SinkExt};
use crate::tty::{Options, EventedReadWrite};
use crate::event::WindowSize;
use crate::tty::unix::{Pty,new};

struct AppState {
    pty: Arc<Mutex<Pty>>,
    tx: Arc<Sender<String>>,
    prompt: Arc<Mutex<String>>,  // Add this line
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let menu = Menu::new()
        .add_submenu(Submenu::new(
            "File",
            Menu::new()
                .add_item(CustomMenuItem::new("open", "Open"))
                .add_item(CustomMenuItem::new("save", "Save"))
                .add_item(CustomMenuItem::new("save_as", "Save As"))
                .add_item(CustomMenuItem::new("new", "New File")),
        ));

    let config = Options {
        shell: None,  // Use default shell
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

    // Setup broadcast channel for PTY output
    let (tx, _rx) = broadcast::channel(16);
    let tx = Arc::new(tx);
    let pty = Arc::new(Mutex::new(pty));
    let prompt = Arc::new(Mutex::new(String::new()));

    // Clone TX for WebSocket server
    let tx_clone = tx.clone();
    let pty_clone = Arc::clone(&pty);
    let pty_clone_for_ws = pty_clone.clone();

    // Spawn WebSocket server
    tokio::spawn(async move {
        let listener = TcpListener::bind("127.0.0.1:8081").await.unwrap();
        println!("WebSocket server started on 127.0.0.1:8081");
        while let Ok((stream, _)) = listener.accept().await {
            let tx = tx_clone.clone();
            let pty_inner_clone = Arc::clone(&pty_clone_for_ws); // Rename this to avoid confusion
            let callback = |req: &Request, mut response: Response| {
                println!("Incoming connection from: {}", req.uri());
                let headers = response.headers_mut();
                headers.insert("Access-Control-Allow-Origin", HeaderValue::from_static("*"));
                Ok(response)
            };
            tokio::spawn(async move {
                match tokio_tungstenite::accept_hdr_async(stream, callback).await {
                    Ok(ws_stream) => {
                        let (mut ws_sender, mut ws_receiver) = ws_stream.split();
                        let mut rx = tx.subscribe();
    
                        let pty_writer = pty_inner_clone.clone(); // Use the cloned value here
    
                        let to_pty = tokio::spawn(async move {
                            while let Some(msg) = ws_receiver.next().await {
                                if let Ok(Message::Text(text)) = msg {
                                    let mut pty = pty_writer.lock().await;
                                    if let Err(e) = pty.writer().write_all(text.as_bytes()) {
                                        eprintln!("Failed to write to PTY: {}", e);
                                    }
                                }
                            }
                        });
    
                        let from_pty = tokio::spawn(async move {
                            while let Ok(msg) = rx.recv().await {
                                if let Err(e) = ws_sender.send(Message::Text(msg)).await {
                                    eprintln!("Failed to send message over WebSocket: {}", e);
                                    break;
                                }
                            }
                        });
    
                        tokio::select! {
                            _ = to_pty => {},
                            _ = from_pty => {},
                        }
                    },
                    Err(e) => eprintln!("WebSocket handshake error: {}", e),
                }
            });
        }
    });
    
    // Clone TX for PTY reader
    let tx_clone = tx.clone();
    // Clone the PTY for the PTY reader task
    let pty_reader_clone = Arc::clone(&pty_clone);
    // Spawn PTY reader
    let prompt_clone = Arc::clone(&prompt);
    tokio::spawn(async move {
        loop {
            let mut buffer = [0; 1024];
            let n = {
                let mut binding = pty_reader_clone.lock().await;
                match binding.reader().read(&mut buffer) {
                    Ok(n) => n,
                    Err(e) if e.kind() == ErrorKind::WouldBlock => {
                        tokio::time::sleep(Duration::from_millis(10)).await;
                        continue;
                    }
                    Err(e) => {
                        eprintln!("Error reading from PTY: {}", e);
                        tokio::time::sleep(Duration::from_millis(100)).await;
                        continue;
                    }
                }
            };

            if n == 0 {
                break; // End of file
            }

            let output = String::from_utf8_lossy(&buffer[..n]).to_string();
            
            // Check if the output ends with a prompt-like pattern
            if output.trim().ends_with('$') || output.trim().ends_with('>') {
                let mut prompt = prompt_clone.lock().await;
                *prompt = output.trim().to_string();
            }

            // Send the full output, including the prompt
            if let Err(_) = tx_clone.send(output) {
                eprintln!("Failed to send PTY output");
            }
        }
    });
    

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
        .manage(AppState {
            pty: Arc::clone(&pty),
            tx,
            prompt: Arc::clone(&prompt),
        })
        .invoke_handler(tauri::generate_handler![
            send_command_to_terminal,
            save_file,
            read_file,
            get_file_extension,
            read_dir,
            set_window_title,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

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

#[derive(serde::Serialize)]
struct FileItem {
    name: String,
    is_dir: bool,
    children: Option<Vec<FileItem>>,
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

#[tauri::command]
async fn send_command_to_terminal(command: String, state: State<'_, AppState>) -> Result<String, String> {
    let mut pty = state.pty.lock().await;
    println!("command received: {}", command.clone());

    // Write the command to the PTY
    let command_with_newline = format!("{}\n", command);
    pty.writer().write_all(command_with_newline.as_bytes()).map_err(|e| e.to_string())?;
    pty.writer().flush().map_err(|e| e.to_string())?;

    // Get the current prompt
    let prompt = state.prompt.lock().await.clone();

    Ok(prompt) // Return the current prompt
}