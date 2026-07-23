#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use futures_util::StreamExt;
use serde::Serialize;
use serde_json::Value;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, State};

const JSON_URL: &str = "https://raw.githubusercontent.com/857seif/RuntimeX/main/input.json";

struct AppState {
    data: Mutex<Option<Value>>,
}

#[derive(Serialize)]
struct AppsResponse {
    common: Vec<String>,
    x32: Vec<String>,
    x64: Vec<String>,
}

fn keys_of(json: &Value, key: &str) -> Vec<String> {
    json.get(key)
        .and_then(|v| v.as_object())
        .map(|o| o.keys().cloned().collect())
        .unwrap_or_default()
}

#[tauri::command]
async fn fetch_apps(state: State<'_, AppState>) -> Result<AppsResponse, String> {
    let json: Value = reqwest::get(JSON_URL)
        .await
        .map_err(|e| format!("Connection failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse data: {e}"))?;

    let common = keys_of(&json, "common");
    let x32 = keys_of(&json, "x32");
    let x64 = keys_of(&json, "x64");

    *state.data.lock().unwrap() = Some(json);

    Ok(AppsResponse { common, x32, x64 })
}

#[tauri::command]
async fn download_item(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    category: String,
    name: String,
) -> Result<String, String> {
    let url = {
        let guard = state.data.lock().unwrap();
        let json = guard.as_ref().ok_or("Data not loaded yet")?;
        json.get(&category)
            .and_then(|c| c.get(&name))
            .and_then(|u| u.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| format!("Could not find {name}"))?
    };

    let temp_dir = std::env::temp_dir().join("RuntimeX");
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let file_path = temp_dir.join(&name);

    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let total = resp.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut stream = resp.bytes_stream();
    let mut file = std::fs::File::create(&file_path).map_err(|e| e.to_string())?;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        let percent = if total > 0 {
            (downloaded * 100 / total) as u32
        } else {
            0
        };
        let _ = app.emit(
            "download-progress",
            serde_json::json!({ "name": name, "percent": percent }),
        );
    }
    drop(file);

    run_installer(&file_path)?;

    Ok("done".to_string())
}

fn run_installer(path: &PathBuf) -> Result<(), String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "exe" => {
            std::process::Command::new(path)
                .spawn()
                .map_err(|e| format!("Failed to launch installer: {e}"))?;
        }
        "msi" => {
            std::process::Command::new("msiexec")
                .arg("/i")
                .arg(path)
                .spawn()
                .map_err(|e| format!("Failed to launch msiexec: {e}"))?;
        }
        "ps1" => {
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                std::process::Command::new("cmd")
                    .args([
                        "/C",
                        "powershell",
                        "-NoProfile",
                        "-ExecutionPolicy",
                        "Bypass",
                        "-File",
                    ])
                    .arg(path)
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn()
                    .map_err(|e| format!("Failed to launch script: {e}"))?;
            }
            #[cfg(not(target_os = "windows"))]
            {
                return Err("PowerShell scripts only run on Windows".to_string());
            }
        }
        _ => {
            return Err(format!("Unsupported extension: {ext}"));
        }
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            data: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![fetch_apps, download_item])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
