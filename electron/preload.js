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
  quickNoteSave: (text) => ipcRenderer.invoke("quick-note-save", { text }),
  quickNoteArchive: (text) => ipcRenderer.invoke("quick-note-archive", { text }),
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

  // Quick AI window
  openQuickAi: () => ipcRenderer.send("quick-ai-open"),
  quickAiChat: (messages) => ipcRenderer.invoke("quick-ai-chat", { messages }),
  quickAiChatStream: (requestId, messages) => ipcRenderer.send("quick-ai-chat-stream", { requestId, messages }),
  quickAiSave: (messages) => ipcRenderer.invoke("quick-ai-save", { messages }),
  quickAiTrash: (sessionId) => ipcRenderer.send("quick-ai-trash", { sessionId }),
  closeQuickAi: () => ipcRenderer.send("quick-ai-close"),
  onQuickAiStream: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("quick-ai-stream", listener);

    return () => {
      ipcRenderer.removeListener("quick-ai-stream", listener);
    };
  },
  onQuickAiSessionsChanged: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = () => callback();
    ipcRenderer.on("quick-ai-sessions-changed", listener);

    return () => {
      ipcRenderer.removeListener("quick-ai-sessions-changed", listener);
    };
  },
  
  // Add more IPC methods here as needed
});
