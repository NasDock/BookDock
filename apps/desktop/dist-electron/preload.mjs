import { contextBridge as i, ipcRenderer as r } from "electron";
console.log("Preload script loading...");
i.exposeInMainWorld("electron", {
  // IPC methods
  invoke: (e, ...o) => r.invoke(e, ...o),
  // Custom listeners
  on: (e, o) => {
    const n = (s, ...t) => o(...t);
    return r.on(e, n), () => r.removeListener(e, n);
  },
  // Metadata or Env
  isElectron: !0,
  platform: process.platform
});
