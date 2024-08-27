use std::fs;
use std::path::Path;
use std::env;

#[derive(serde::Serialize)]
pub struct FileItem {
    name: String,
    is_dir: bool,
    children: Option<Vec<FileItem>>,
}

#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    fs::File::create(path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir(path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(old_path, new_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    let path = Path::new(&path);
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_current_dir() -> Result<String, String> {
    env::current_dir()
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_file_extension(path: String) -> String {
    std::path::Path::new(&path)
        .extension()
        .and_then(|os_str| os_str.to_str())
        .unwrap_or("")
        .to_string()
}

#[tauri::command]
pub fn save_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_window_title(window: tauri::Window, title: String) {
    window.set_title(&title).unwrap();
}

#[tauri::command]
pub fn read_dir(path: String) -> Result<Vec<FileItem>, String> {
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