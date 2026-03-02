#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use tauri::{
  CustomMenuItem, SystemTray, SystemTrayMenu, SystemTrayMenuItem,
  SystemTrayEvent, Manager
};

/// 실제 디스크 여유 공간을 GB 단위로 반환
/// navigator.storage.estimate() 대신 Tauri 네이티브 코맨드로 호출
#[tauri::command]
fn get_disk_free_gb() -> u64 {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        use std::process::Command;
        // `df -k /` → 1024-byte blocks, Available column (index 3)
        if let Ok(output) = Command::new("df").args(["-k", "/"]).output() {
            let s = String::from_utf8_lossy(&output.stdout);
            for line in s.lines().skip(1) {
                let cols: Vec<&str> = line.split_whitespace().collect();
                // df -k output: Filesystem 1024-blocks Used Available Capacity Mounted
                // available is at index 3
                if cols.len() >= 4 {
                    if let Ok(avail_kb) = cols[3].parse::<u64>() {
                        return avail_kb / (1024 * 1024); // KB → GB
                    }
                }
            }
        }
        100 // fallback
    }
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        extern "system" {
            fn GetDiskFreeSpaceExW(
                lpDirectoryName: *const u16,
                lpFreeBytesAvailableToCaller: *mut u64,
                lpTotalNumberOfBytes: *mut u64,
                lpTotalNumberOfFreeBytes: *mut u64,
            ) -> i32;
        }
        unsafe {
            let path: Vec<u16> = OsStr::new("C:\\").encode_wide().chain(std::iter::once(0)).collect();
            let mut free: u64 = 0;
            let mut _total: u64 = 0;
            let mut _total_free: u64 = 0;
            if GetDiskFreeSpaceExW(path.as_ptr(), &mut free, &mut _total, &mut _total_free) != 0 {
                return free / (1024 * 1024 * 1024);
            }
        }
        100
    }
}

fn main() {
  // System tray items
  let show  = CustomMenuItem::new("show".to_string(),  "Open Dashboard");
  let start = CustomMenuItem::new("start".to_string(), "▶ Start Node");
  let stop  = CustomMenuItem::new("stop".to_string(),  "■ Stop Node");
  let sep   = SystemTrayMenuItem::Separator;
  let quit  = CustomMenuItem::new("quit".to_string(),  "Quit");

  let tray_menu = SystemTrayMenu::new()
    .add_item(show)
    .add_native_item(sep.clone())
    .add_item(start)
    .add_item(stop)
    .add_native_item(sep)
    .add_item(quit);

  let system_tray = SystemTray::new()
    .with_menu(tray_menu)
    .with_tooltip("WORM Node — Mining Client");

  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![get_disk_free_gb])
    .system_tray(system_tray)
    .on_system_tray_event(|app, event| match event {
      SystemTrayEvent::LeftClick { .. } => {
        let window = app.get_window("main").unwrap();
        window.show().unwrap();
        window.set_focus().unwrap();
      }
      SystemTrayEvent::MenuItemClick { id, .. } => {
        match id.as_str() {
          "show" | "start" | "stop" => {
            let window = app.get_window("main").unwrap();
            window.show().unwrap();
            window.set_focus().unwrap();
            // Emit event to frontend to trigger start/stop
            if id == "start" {
              window.emit("tray-start-node", {}).unwrap_or(());
            } else if id == "stop" {
              window.emit("tray-stop-node", {}).unwrap_or(());
            }
          }
          "quit" => std::process::exit(0),
          _ => {}
        }
      }
      _ => {}
    })
    .on_window_event(|event| match event.event() {
      tauri::WindowEvent::CloseRequested { api, .. } => {
        // Hide to tray instead of closing
        event.window().hide().unwrap();
        api.prevent_close();
      }
      _ => {}
    })
    .run(tauri::generate_context!())
    .expect("error while running WORM Node application");
}
