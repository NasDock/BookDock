import { contextBridge, ipcRenderer } from "electron";
console.log("Preload script loading...");
contextBridge.exposeInMainWorld("electron", {
  // IPC methods
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  // Custom listeners
  on: (channel, callback) => {
    const subscription = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  // Metadata or Env
  isElectron: true,
  platform: process.platform
});
