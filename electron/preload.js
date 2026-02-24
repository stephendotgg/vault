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

  // Quick note window
  openQuickNote: () => ipcRenderer.send("quick-note-open"),
  quickNoteCreate: (text, force = false) => ipcRenderer.invoke("quick-note-create", { text, force }),
  quickNoteUpdate: (noteId, text) => ipcRenderer.invoke("quick-note-update", { noteId, text }),
  quickNoteFinalize: (noteId, text) => ipcRenderer.send("quick-note-finalize", { noteId, text }),
  closeQuickNote: (noteId, text) => ipcRenderer.send("quick-note-close", { noteId, text }),
  onQuickNotesChanged: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = () => callback();
    ipcRenderer.on("quick-notes-changed", listener);

    return () => {
      ipcRenderer.removeListener("quick-notes-changed", listener);
    };
  },
  
  // Add more IPC methods here as needed
});
