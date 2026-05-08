import { app as d, BrowserWindow as w, ipcMain as t, dialog as g } from "electron";
import l from "fs";
import r from "path";
import { fileURLToPath as b } from "url";
const D = b(import.meta.url), u = r.dirname(D);
process.env.DIST_ELECTRON = r.join(u, "../dist-electron");
process.env.DIST = r.join(u, "../dist");
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL ? r.join(u, "../public") : process.env.DIST;
let s = null;
const _ = r.join(u, "preload.mjs"), p = process.env.VITE_DEV_SERVER_URL, h = r.join(process.env.DIST, "index.html");
let c = [], S = {}, m = {
  theme: "system",
  fontSize: 16,
  autoPlayTts: !1,
  ttsRate: 1,
  ttsVolume: 1,
  nasPaths: []
};
function f() {
  console.log("Main process using preload script at:", _), s = new w({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "BookDock - 书仓",
    webPreferences: {
      preload: _,
      nodeIntegration: !1,
      contextIsolation: !0,
      sandbox: !1
    }
  }), p ? (console.log("Main process loading URL:", p), s.loadURL(p), s.webContents.openDevTools()) : (console.log("Main process loading file:", h), s.loadFile(h));
}
d.whenReady().then(() => {
  f(), d.on("activate", () => {
    w.getAllWindows().length === 0 && f();
  });
});
d.on("window-all-closed", () => {
  s = null, process.platform !== "darwin" && d.quit();
});
t.handle("read_directory", async (i, e) => {
  try {
    return l.readdirSync(e, { withFileTypes: !0 }).filter((n) => n.isDirectory() || /\.(epub|pdf|mobi|txt)$/i.test(n.name)).map((n) => ({
      name: n.name,
      path: r.join(e, n.name),
      is_dir: n.isDirectory(),
      size: n.isFile() ? l.statSync(r.join(e, n.name)).size : 0,
      modified: l.statSync(r.join(e, n.name)).mtime.toISOString()
    }));
  } catch (o) {
    throw new Error(o.message);
  }
});
t.handle("add_book", async (i, e) => {
  const { book: o } = e;
  return c.find((n) => n.id === o.id) || c.push(o), { success: !0 };
});
t.handle("get_home_directory", () => d.getPath("home"));
t.handle("read_file_text", async (i, e) => {
  try {
    return l.readFileSync(e, "utf-8");
  } catch (o) {
    throw new Error(o.message);
  }
});
t.handle("open_file_dialog", async () => (await g.showOpenDialog({
  properties: ["openFile"],
  filters: [
    { name: "E-books", extensions: ["epub", "pdf", "mobi", "txt"] }
  ]
})).filePaths[0] || null);
t.handle("open_folder_dialog", async () => (await g.showOpenDialog({
  properties: ["openDirectory"]
})).filePaths[0] || null);
t.handle("load_settings", () => m);
t.handle("save_settings", (i, e) => (m = { ...m, ...e }, { success: !0 }));
t.handle("save_window_state", (i, { label: e }) => {
  if (s) {
    const o = s.getBounds();
    S[e] = {
      ...o,
      maximized: s.isMaximized()
    };
  }
  return { success: !0 };
});
t.handle("restore_window_state", (i, { label: e }) => S[e] || null);
t.handle("open_reader_window", async (i, { bookId: e, bookTitle: o }) => (console.log("Open reader for:", e, o), { success: !0 }));
t.handle("minimize_to_tray", () => (s && s.hide(), { success: !0 }));
t.handle("show_main_window", () => (s && s.show(), { success: !0 }));
t.handle("import_local_book", async (i, { filePath: e }) => {
  const o = r.basename(e), n = {
    id: Math.random().toString(36).substring(7),
    title: o.replace(/\.[^/.]+$/, ""),
    author: "本地书籍",
    cover: null,
    path: e,
    format: r.extname(e).slice(1).toLowerCase(),
    fileSize: l.statSync(e).size,
    lastRead: (/* @__PURE__ */ new Date()).toISOString(),
    progress: 0
  };
  return c.find((a) => a.path === e) || c.push(n), n;
});
t.handle("update_reading_progress", async (i, { bookId: e, progress: o, currentPage: n }) => {
  const a = c.find((y) => y.id === e);
  return a && (a.progress = o, n !== void 0 && (a.currentPage = n), a.lastRead = (/* @__PURE__ */ new Date()).toISOString()), { success: !0 };
});
