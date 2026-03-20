import { contextBridge, ipcRenderer } from 'electron';

console.log('Preload script loading...');

// Expose Electron API to the frontend
contextBridge.exposeInMainWorld('electron', {
  // IPC methods
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  
  // Custom listeners
  on: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  
  // Metadata or Env
  isElectron: true,
  platform: process.platform,
});
