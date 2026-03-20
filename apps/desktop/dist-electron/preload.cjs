var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
import { contextBridge, ipcRenderer } from "electron";
var require_preload = __commonJS({
  "preload.cjs"() {
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
  }
});
export default require_preload();
