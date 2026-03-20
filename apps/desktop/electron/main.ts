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
const preload = path.join(__dirname, 'preload.js');
const url = process.env.VITE_DEV_SERVER_URL;
const indexHtml = path.join(process.env.DIST, 'index.html');

// Simple state management
let books: any[] = [];
let settings = {
  theme: 'system',
  fontSize: 16,
  autoPlayTts: false,
  ttsRate: 1.0,
  ttsVolume: 1.0,
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

ipcMain.handle('get_books', async () => {
  return books;
});

ipcMain.handle('add_book', async (_, book: any) => {
  books.push(book);
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

ipcMain.handle('load_settings', () => {
  return settings;
});

ipcMain.handle('save_settings', (_, newSettings: any) => {
  settings = { ...settings, ...newSettings };
  return { success: true };
});
