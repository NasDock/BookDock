import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Built-in environment variables from vite-plugin-electron
process.env.DIST_ELECTRON = path.join(__dirname, '../dist-electron');
process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(__dirname, '../public')
  : process.env.DIST;

let win: BrowserWindow | null = null;
const preload = path.join(__dirname, 'preload.mjs');
const url = process.env.VITE_DEV_SERVER_URL;
const indexHtml = path.join(process.env.DIST, 'index.html');

// Simple state management for demo
let books: any[] = [];
let windowStates: Record<string, any> = {};
let settings = {
  theme: 'system',
  fontSize: 16,
  autoPlayTts: false,
  ttsRate: 1.0,
  ttsVolume: 1.0,
  nasPaths: [],
};

function createWindow() {
  console.log('Main process using preload script at:', preload);
  
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'BookDock - 书仓',
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  if (url) {
    console.log('Main process loading URL:', url);
    win.loadURL(url);
    win.webContents.openDevTools();
  } else {
    console.log('Main process loading file:', indexHtml);
    win.loadFile(indexHtml);
  }
}


app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  win = null;
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ============================================================================
// IPC Handlers
// ============================================================================

ipcMain.handle('read_directory', async (_, dirPath: string) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() || /\.(epub|pdf|mobi|txt)$/i.test(entry.name))
      .map(entry => ({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        is_dir: entry.isDirectory(),
        size: entry.isFile() ? fs.statSync(path.join(dirPath, entry.name)).size : 0,
        modified: fs.statSync(path.join(dirPath, entry.name)).mtime.toISOString(),
      }));
  } catch (error: any) {
    throw new Error(error.message);
  }
});

ipcMain.handle('add_book', async (_, payload: { book: any }) => {
  const { book } = payload;
  if (!books.find(b => b.id === book.id)) {
    books.push(book);
  }
  return { success: true };
});

ipcMain.handle('get_home_directory', () => {
  return app.getPath('home');
});

ipcMain.handle('read_file_text', async (_, filePath: string) => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error: any) {
    throw new Error(error.message);
  }
});

ipcMain.handle('open_file_dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'E-books', extensions: ['epub', 'pdf', 'mobi', 'txt'] }
    ]
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('open_folder_dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('load_settings', () => {
  return settings;
});

ipcMain.handle('save_settings', (_, newSettings: any) => {
  settings = { ...settings, ...newSettings };
  return { success: true };
});

ipcMain.handle('save_window_state', (_, { label }: { label: string }) => {
  if (win) {
    const bounds = win.getBounds();
    windowStates[label] = {
      ...bounds,
      maximized: win.isMaximized()
    };
  }
  return { success: true };
});

ipcMain.handle('restore_window_state', (_, { label }: { label: string }) => {
  return windowStates[label] || null;
});

ipcMain.handle('open_reader_window', async (_, { bookId, bookTitle }) => {
  console.log('Open reader for:', bookId, bookTitle);
  return { success: true };
});

ipcMain.handle('minimize_to_tray', () => {
  if (win) win.hide();
  return { success: true };
});

ipcMain.handle('show_main_window', () => {
  if (win) win.show();
  return { success: true };
});

ipcMain.handle('import_local_book', async (_, { filePath }) => {
  const fileName = path.basename(filePath);
  const book = {
    id: Math.random().toString(36).substring(7),
    title: fileName.replace(/\.[^/.]+$/, ""),
    author: '本地书籍',
    cover: null,
    path: filePath,
    format: path.extname(filePath).slice(1).toLowerCase(),
    fileSize: fs.statSync(filePath).size,
    lastRead: new Date().toISOString(),
    progress: 0,
  };
  if (!books.find(b => b.path === filePath)) {
    books.push(book);
  }
  return book;
});

ipcMain.handle('update_reading_progress', async (_, { bookId, progress, currentPage }) => {
  const book = books.find(b => b.id === bookId);
  if (book) {
    book.progress = progress;
    if (currentPage !== undefined) book.currentPage = currentPage;
    book.lastRead = new Date().toISOString();
  }
  return { success: true };
});

