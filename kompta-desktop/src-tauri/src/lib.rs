use tauri::Manager;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_shell::ShellExt;

// ── Tauri commands (callable from the React frontend via invoke) ────────────

/// Send a native OS notification
#[tauri::command]
fn notify(title: String, body: String, app: tauri::AppHandle) {
    let _ = app.notification().builder()
        .title(&title)
        .body(&body)
        .show();
}

/// Write a string to the system clipboard
#[tauri::command]
fn write_clipboard(text: String, app: tauri::AppHandle) {
    let _ = app.clipboard().write_text(text);
}

/// Open external URL in the default browser
#[tauri::command]
async fn open_url(url: String, app: tauri::AppHandle) {
    let _ = app.shell().open(&url, None);
}

// ── App entry point ────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Core plugins
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // Register commands
        .invoke_handler(tauri::generate_handler![
            notify,
            write_clipboard,
            open_url,
        ])
        // App lifecycle
        .setup(|app| {
            // Window setup on desktop
            #[cfg(desktop)]
            {
                let win = app.get_webview_window("main")
                    .expect("main window not found");

                // Centre on first launch
                let _ = win.center();

                // Custom window title with version
                let _ = win.set_title("KOMPTA v1.0");

                // System tray menu
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::TrayIconBuilder;

                let show = MenuItem::with_id(app, "show",   "Afficher KOMPTA", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit",   "Quitter",         true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show, &quit])?;

                let _tray = TrayIconBuilder::new()
                    .menu(&menu)
                    .on_menu_event(move |app, event| match event.id().as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .build(app)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de KOMPTA Desktop");
}
