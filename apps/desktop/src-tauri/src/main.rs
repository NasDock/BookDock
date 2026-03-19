// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Book {
    pub id: String,
    pub title: String,
    pub author: String,
    pub cover_url: Option<String>,
    pub file_path: String,
    pub reading_progress: Option<f32>,
}

#[derive(Default)]
pub struct AppState {
    pub books: Mutex<Vec<Book>>,
}

#[tauri::command]
fn get_books(state: State<AppState>) -> Result<Vec<Book>, String> {
    let books = state.books.lock().map_err(|e| e.to_string())?;
    Ok(books.clone())
}

#[tauri::command]
fn add_book(state: State<AppState>, book: Book) -> Result<(), String> {
    let mut books = state.books.lock().map_err(|e| e.to_string())?;
    books.push(book);
    Ok(())
}

#[tauri::command]
fn update_reading_progress(
    state: State<AppState>,
    book_id: String,
    progress: f32,
) -> Result<(), String> {
    let mut books = state.books.lock().map_err(|e| e.to_string())?;
    if let Some(book) = books.iter_mut().find(|b| b.id == book_id) {
        book.reading_progress = Some(progress);
    }
    Ok(())
}

#[tauri::command]
fn open_settings() -> Result<(), String> {
    // Open settings window or dialog
    Ok(())
}

#[tauri::command]
fn open_book(book_id: String) -> Result<(), String> {
    println!("Opening book: {}", book_id);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_books,
            add_book,
            update_reading_progress,
            open_settings,
            open_book,
        ])
        .setup(|app| {
            // Set up the app
            println!("BookDock starting up...");

            // Initialize with some sample books for testing
            let state = app.state::<AppState>();
            let mut books = state.books.lock().unwrap();
            *books = vec![
                Book {
                    id: "1".to_string(),
                    title: "示例书籍".to_string(),
                    author: "示例作者".to_string(),
                    cover_url: None,
                    file_path: "/path/to/book.epub".to_string(),
                    reading_progress: Some(45.0),
                },
            ];

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
