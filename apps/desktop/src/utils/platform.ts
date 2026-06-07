export const isWeb = () => {
  return typeof window !== 'undefined' && !(window as any).ipcRenderer;
};
