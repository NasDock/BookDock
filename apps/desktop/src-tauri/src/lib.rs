use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder,
};
use uuid::Uuid;

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Book {
    pub id: String,
    pub title: String,
    pub author: String,
    pub cover_url: Option<String>,
    pub file_path: String,
    pub file_type: String,
    pub reading_progress: Option<f32>,
    pub total_pages: Option<u32>,
    pub current_page: Option<u32>,
    pub added_at: String,
    pub last_read_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalFile {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TtsState {
    pub is_playing: bool,
    pub is_paused: bool,
    pub book_id: Option<String>,
    pub current_text: Option<String>,
    pub progress: f32,
}

#[derive(Default)]
pub struct AppState {
    pub books: Mutex<Vec<Book>>,
    pub window_states: Mutex<HashMap<String, WindowState>>,
    pub tts_state: Mutex<TtsState>,
    pub current_view: Mutex<String>,
}

// ============================================================================
// Utility Functions
// ============================================================================

fn get_data_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("BookDock")
}

fn get_config_path() -> PathBuf {
    get_data_dir().join("config.json")
}

fn ensure_data_dir() -> std::io::Result<()> {
    let dir = get_data_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    Ok(())
}

fn get_file_type(path: &str) -> String {
    let path_lower = path.to_lowercase();
    if path_lower.ends_with(".epub") {
        "epub".to_string()
    } else if path_lower.ends_with(".pdf") {
        "pdf".to_string()
    } else if path_lower.ends_with(".mobi") {
        "mobi".to_string()
    } else if path_lower.ends_with(".txt") {
        "txt".to_string()
    } else {
        "unknown".to_string()
    }
}

fn extract_text_from_file(file_path: &str) -> Result<String, String> {
    let path_lower = file_path.to_lowercase();
    let content = fs::read(file_path).map_err(|e| e.to_string())?;

    if path_lower.ends_with(".txt") {
        String::from_utf8(content).map_err(|e| e.to_string())
    } else if path_lower.ends_with(".epub") {
        extract_epub_text(&content)
    } else if path_lower.ends_with(".pdf") {
        extract_pdf_text(&content)
    } else {
        Err("Unsupported file format".to_string())
    }
}

fn extract_epub_text(content: &[u8]) -> Result<String, String> {
    let cursor = std::io::Cursor::new(content);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;

    let mut text_parts = Vec::new();

    for i in 0..archive.len() {
        if let Ok(mut file) = archive.by_index(i) {
            let name = file.name().to_string();
            if name.ends_with(".html") || name.ends_with(".xhtml") || name.ends_with(".htm") {
                let mut buf = String::new();
                if file.read_to_string(&mut buf).is_ok() {
                    // Simple HTML tag stripping
                    let text = strip_html_tags(&buf);
                    if !text.trim().is_empty() {
                        text_parts.push(text);
                    }
                }
            }
        }
    }

    Ok(text_parts.join("\n\n"))
}

fn strip_html_tags(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    let mut in_script = false;
    let mut in_style = false;

    for chars in html.chars().collect::<Vec<_>>().windows(2) {
        let c = chars[0];
        let next = chars[1];

        if c == '<' {
            let tag_start = html.find('<').map(|i| &html[i..]).unwrap_or("");
            let tag_lower = tag_start.to_lowercase();
            if tag_lower.starts_with("<script") {
                in_script = true;
            } else if tag_lower.starts_with("<style") {
                in_style = true;
            }
            in_tag = true;
        }

        if !in_tag && !in_script && !in_style {
            if c == '\n' || c == '\r' {
                result.push(' ');
            } else {
                result.push(c);
            }
        }

        if c == '>' {
            in_tag = false;
            in_script = false;
            in_style = false;
        }
    }

    // Clean up whitespace
    let mut cleaned = String::new();
    let mut last_was_space = false;
    for c in result.chars() {
        if c.is_whitespace() {
            if !last_was_space {
                cleaned.push(' ');
                last_was_space = true;
            }
        } else {
            cleaned.push(c);
            last_was_space = false;
        }
    }

    cleaned.trim().to_string()
}

fn extract_pdf_text(content: &[u8]) -> Result<String, String> {
    // Simple PDF text extraction - for full PDF support,
    // you'd want to use a proper PDF crate
    let text = String::from_utf8_lossy(content);
    // Extract visible ASCII text from PDF
    let mut result = String::new();
    let mut in_text_obj = false;

    for line in text.lines() {
        let line_trimmed = line.trim();
        // Look for text content markers
        if line_trimmed.starts_with("BT") {
            in_text_obj = true;
        } else if line_trimmed.starts_with("ET") {
            in_text_obj = false;
        } else if in_text_obj && line_trimmed.contains("(") && line_trimmed.contains("Tj") {
            // Extract text from Tj commands
            if let Some(start) = line_trimmed.find("(") {
                if let Some(end) = line_trimmed.find(")", start) {
                    let txt = &line_trimmed[start + 1..end];
                    result.push_str(txt);
                    result.push(' ');
                }
            }
        }
    }

    if result.trim().is_empty() {
        Ok("PDF text extraction not available in this version. Please use EPUb format for best experience.".to_string())
    } else {
        Ok(result)
    }
}

// ============================================================================
// Tauri Commands - File System
// ============================================================================

#[tauri::command]
async fn read_directory(path: String) -> Result<Vec<LocalFile>, String> {
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;

    let mut files: Vec<LocalFile> = Vec::new();

    for entry in entries {
        if let Ok(entry) = entry {
            let metadata = entry.metadata().ok();
            let name = entry.file_name().to_string_lossy().to_string();

            // Skip hidden files
            if name.starts_with('.') {
                continue;
            }

            let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
            let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
            let modified = metadata
                .and_then(|m| m.modified().ok())
                .map(|t| {
                    let datetime: chrono::DateTime<chrono::Local> = t.into();
                    datetime.format("%Y-%m-%d %H:%M").to_string()
                });

            let file_type = if is_dir {
                "directory".to_string()
            } else {
                get_file_type(&name)
            };

            // Only include directories and supported ebook files
            if is_dir || file_type != "unknown" {
                files.push(LocalFile {
                    path: entry.path().to_string_lossy().to_string(),
                    name,
                    is_dir,
                    size,
                    modified,
                });
            }
        }
    }

    // Sort: directories first, then by name
    files.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(files)
}

#[tauri::command]
async fn read_file_content(file_path: String) -> Result<Vec<u8>, String> {
    fs::read(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn read_file_text(file_path: String) -> Result<String, String> {
    extract_text_from_file(&file_path)
}

#[tauri::command]
async fn get_home_directory() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Cannot find home directory".to_string())
}

#[tauri::command]
async fn get_file_metadata(file_path: String) -> Result<LocalFile, String> {
    let path = PathBuf::from(&file_path);
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(LocalFile {
        path: file_path,
        name,
        is_dir: metadata.is_dir(),
        size: metadata.len(),
        modified: metadata
            .modified()
            .ok()
            .map(|t| {
                let datetime: chrono::DateTime<chrono::Local> = t.into();
                datetime.format("%Y-%m-%d %H:%M").to_string()
            }),
    })
}

// ============================================================================
// Tauri Commands - Book Management
// ============================================================================

#[tauri::command]
fn get_books(state: State<'_, AppState>) -> Result<Vec<Book>, String> {
    let books = state.books.lock().map_err(|e| e.to_string())?;
    Ok(books.clone())
}

#[tauri::command]
fn add_book(state: State<'_, AppState>, book: Book) -> Result<(), String> {
    let mut books = state.books.lock().map_err(|e| e.to_string())?;
    books.push(book);
    Ok(())
}

#[tauri::command]
fn update_reading_progress(
    state: State<'_, AppState>,
    book_id: String,
    progress: f32,
    current_page: Option<u32>,
) -> Result<(), String> {
    let mut books = state.books.lock().map_err(|e| e.to_string())?;
    if let Some(book) = books.iter_mut().find(|b| b.id == book_id) {
        book.reading_progress = Some(progress);
        book.current_page = current_page;
        book.last_read_at = Some(
            chrono::Local::now()
                .format("%Y-%m-%d %H:%M:%S")
                .to_string(),
        );
    }
    Ok(())
}

#[tauri::command]
async fn import_local_book(file_path: String) -> Result<Book, String> {
    let path = PathBuf::from(&file_path);
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    // Extract title from filename (remove extension)
    let title = name
        .rsplit('.')
        .nth(1)
        .map(|s| s.to_string())
        .unwrap_or_else(|| name.clone());

    let book = Book {
        id: Uuid::new_v4().to_string(),
        title,
        author: "Unknown".to_string(),
        cover_url: None,
        file_path: file_path.clone(),
        file_type: get_file_type(&file_path),
        reading_progress: Some(0.0),
        total_pages: None,
        current_page: Some(1),
        added_at: chrono::Local::now()
            .format("%Y-%m-%d %H:%M:%S")
            .to_string(),
        last_read_at: None,
    };

    Ok(book)
}

// ============================================================================
// Tauri Commands - Window Management
// ============================================================================

#[tauri::command]
async fn save_window_state(
    app: AppHandle,
    label: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        let position = window.outer_position().map_err(|e| e.to_string())?;
        let size = window.outer_size().map_err(|e| e.to_string())?;
        let maximized = window.is_maximized().unwrap_or(false);

        let window_state = WindowState {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
            maximized,
        };

        let mut states = state.window_states.lock().map_err(|e| e.to_string())?;
        states.insert(label, window_state);

        // Persist to disk
        ensure_data_dir()?;
        let config_path = get_config_path();
        let states_clone: HashMap<String, WindowState> = states.clone();
        let config_json =
            serde_json::to_string_pretty(&states_clone).map_err(|e| e.to_string())?;
        fs::write(config_path, config_json).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn restore_window_state(
    app: AppHandle,
    label: String,
    state: State<'_, AppState>,
) -> Result<Option<WindowState>, String> {
    // Try to load from disk first
    if let Ok(config_path) = get_config_path() {
        if config_path.exists() {
            if let Ok(content) = fs::read_to_string(&config_path) {
                if let Ok(states) = serde_json::from_str::<HashMap<String, WindowState>>(&content)
                {
                    if let Some(window_state) = states.get(&label) {
                        let mut states_lock =
                            state.window_states.lock().map_err(|e| e.to_string())?;
                        states_lock.insert(label.clone(), window_state.clone());

                        // Apply window state
                        if let Some(window) = app.get_webview_window(&label) {
                            let _ = window.set_position(tauri::PhysicalPosition::new(
                                window_state.x,
                                window_state.y,
                            ));
                            let _ = window.set_size(tauri::PhysicalSize::new(
                                window_state.width,
                                window_state.height,
                            ));
                            if window_state.maximized {
                                let _ = window.maximize();
                            }
                        }
                        return Ok(Some(window_state.clone()));
                    }
                }
            }
        }
    }

    // Return in-memory state if available
    let states = state.window_states.lock().map_err(|e| e.to_string())?;
    Ok(states.get(&label).cloned())
}

#[tauri::command]
async fn open_reader_window(
    app: AppHandle,
    book_id: String,
    book_title: String,
) -> Result<(), String> {
    let window_label = format!("reader-{}", book_id);

    // Check if window already exists
    if let Some(window) = app.get_webview_window(&window_label) {
        let _ = window.set_focus();
        return Ok(());
    }

    // Create new reader window
    let url = format!("/reader/{}", book_id);
    let reader_window = WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::App(url.into()),
    )
    .title(format!("{} - BookDock", book_title))
    .inner_size(1000.0, 800.0)
    .min_inner_size(600.0, 400.0)
    .center()
    .decorations(true)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;

    let _ = reader_window.set_focus();

    Ok(())
}

#[tauri::command]
async fn minimize_to_tray(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn show_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ============================================================================
// Tauri Commands - TTS
// ============================================================================

#[tauri::command]
fn update_tts_state(
    state: State<'_, AppState>,
    is_playing: bool,
    is_paused: bool,
    book_id: Option<String>,
    current_text: Option<String>,
    progress: f32,
) -> Result<(), String> {
    let mut tts = state.tts_state.lock().map_err(|e| e.to_string())?;
    tts.is_playing = is_playing;
    tts.is_paused = is_paused;
    tts.book_id = book_id;
    tts.current_text = current_text;
    tts.progress = progress;
    Ok(())
}

#[tauri::command]
fn get_tts_state(state: State<'_, AppState>) -> Result<TtsState, String> {
    let tts = state.tts_state.lock().map_err(|e| e.to_string())?;
    Ok(tts.clone())
}

#[tauri::command]
async fn get_system_voices() -> Result<Vec<serde_json::Value>, String> {
    // Return a list of common system voices
    // In a real implementation, this would query the OS for available voices
    let voices = vec![
        serde_json::json!({
            "id": "zh-CNfemale",
            "name": "Chinese Female",
            "lang": "zh-CN",
            "local": true
        }),
        serde_json::json!({
            "id": "zh-CN-male",
            "name": "Chinese Male",
            "lang": "zh-CN",
            "local": true
        }),
        serde_json::json!({
            "id": "en-US-female",
            "name": "English US Female",
            "lang": "en-US",
            "local": true
        }),
        serde_json::json!({
            "id": "en-US-male",
            "name": "English US Male",
            "lang": "en-US",
            "local": true
        }),
    ];
    Ok(voices)
}

// ============================================================================
// Tauri Commands - Settings
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub nas_paths: Vec<String>,
    pub last_opened_path: Option<String>,
    pub theme: String,
    pub font_size: u32,
    pub auto_play_tts: bool,
    pub tts_voice_id: Option<String>,
    pub tts_rate: f32,
    pub tts_volume: f32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            nas_paths: Vec::new(),
            last_opened_path: dirs::home_dir().map(|p| p.to_string_lossy().to_string()),
            theme: "system".to_string(),
            font_size: 16,
            auto_play_tts: false,
            tts_voice_id: None,
            tts_rate: 1.0,
            tts_volume: 1.0,
        }
    }
}

#[tauri::command]
async fn load_settings() -> Result<AppSettings, String> {
    ensure_data_dir().ok();
    let config_path = get_config_path();

    if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(AppSettings::default())
    }
}

#[tauri::command]
async fn save_settings(settings: AppSettings) -> Result<(), String> {
    ensure_data_dir().ok();
    let config_path = get_config_path();
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(config_path, json).map_err(|e| e.to_string())
}

// ============================================================================
// Tray Setup
// ============================================================================

fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let open_item = MenuItemBuilder::with_id("open", "打开主窗口").build(app)?;
    let tts_item = MenuItemBuilder::with_id("tts", "听书模式").build(app)?;
    let separator1 = PredefinedMenuItem::separator(app)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&open_item)
        .item(&separator1)
        .item(&tts_item)
        .item(&separator2)
        .item(&quit_item)
        .build()?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("BookDock - 书仓")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "tts" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.emit("start-tts-mode", ());
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

// ============================================================================
// Global Shortcuts Setup
// ============================================================================

fn setup_global_shortcuts(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

    let ctrl_shift_b: Shortcut = "Ctrl+Shift+B".parse()?;
    let ctrl_shift_n: Shortcut = "Ctrl+Shift+N".parse()?;
    let ctrl_shift_p: Shortcut = "Ctrl+Shift+P".parse()?;

    app.global_shortcut().on_shortcuts(
        [ctrl_shift_b, ctrl_shift_n, ctrl_shift_p],
        move |app_handle, shortcut, event| {
            if event.state == ShortcutState::Pressed {
                let shortcut_str = shortcut.to_string();
                if shortcut_str.contains("Ctrl+Shift+B") {
                    // Quick TTS - play/pause
                    let _ = app_handle.emit("global-shortcut", "tts-toggle");
                } else if shortcut_str.contains("Ctrl+Shift+N") {
                    // Next track/segment
                    let _ = app_handle.emit("global-shortcut", "tts-next");
                } else if shortcut_str.contains("Ctrl+Shift+P") {
                    // Previous
                    let _ = app_handle.emit("global-shortcut", "tts-prev");
                }
            }
        },
    )?;

    Ok(())
}

// ============================================================================
// App Setup
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Handle file associations - when app is opened with a file
            if argv.len() > 1 {
                let file_path = &argv[1];
                if file_path.ends_with(".epub") || file_path.ends_with(".pdf") {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("open-file", file_path.clone());
                    }
                }
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            // File system
            read_directory,
            read_file_content,
            read_file_text,
            get_home_directory,
            get_file_metadata,
            // Books
            get_books,
            add_book,
            update_reading_progress,
            import_local_book,
            // Window management
            save_window_state,
            restore_window_state,
            open_reader_window,
            minimize_to_tray,
            show_main_window,
            // TTS
            update_tts_state,
            get_tts_state,
            get_system_voices,
            // Settings
            load_settings,
            save_settings,
        ])
        .setup(|app| {
            println!("BookDock desktop app starting...");

            // Setup system tray
            if let Err(e) = setup_tray(app.handle()) {
                eprintln!("Failed to setup tray: {}", e);
            }

            // Setup global shortcuts
            if let Err(e) = setup_global_shortcuts(app.handle()) {
                eprintln!("Failed to setup global shortcuts: {}", e);
            }

            // Initialize app state with default books for demo
            let state = app.state::<AppState>();
            let mut books = state.books.lock().unwrap();
            *books = vec![
                Book {
                    id: "local-1".to_string(),
                    title: "示例书籍".to_string(),
                    author: "示例作者".to_string(),
                    cover_url: None,
                    file_path: "".to_string(),
                    file_type: "epub".to_string(),
                    reading_progress: Some(45.0),
                    total_pages: Some(300),
                    current_page: Some(135),
                    added_at: "2024-01-15 10:30:00".to_string(),
                    last_read_at: Some("2024-01-20 15:45:00".to_string()),
                },
                Book {
                    id: "local-2".to_string(),
                    title: "技术文档".to_string(),
                    author: "BookDock".to_string(),
                    cover_url: None,
                    file_path: "".to_string(),
                    file_type: "pdf".to_string(),
                    reading_progress: Some(0.0),
                    total_pages: Some(120),
                    current_page: Some(1),
                    added_at: "2024-01-10 09:00:00".to_string(),
                    last_read_at: None,
                },
            ];

            // Register deep link handler for file associations
            #[cfg(desktop)]
            {
                let handle = app.handle().clone();
                app.listen("deep-link://new-url", move |event| {
                    println!("Deep link received: {:?}", event.payload());
                });
            }

            println!("BookDock desktop app initialized successfully");
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Minimize to tray instead of closing on main window
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
