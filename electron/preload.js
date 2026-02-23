const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  // Window controls
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  
  // Platform info
  platform: process.platform,
  
  // File system dialogs
  selectFolder: () => ipcRenderer.invoke("select-folder"),

  // Global shortcuts
  onGlobalNewNote: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = () => callback();
    ipcRenderer.on("global-create-note", listener);

    return () => {
      ipcRenderer.removeListener("global-create-note", listener);
    };
  },
  
  // Add more IPC methods here as needed
});
