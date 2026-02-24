const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut } = require("electron");
const path = require("path");

// Set NODE_ENV early to prevent TypeScript installation attempts
const isDev = !app.isPackaged;
if (!isDev) {
  process.env.NODE_ENV = "production";
  process.env.MOTHERSHIP_DATA_DIR = path.join(app.getPath("appData"), "Mothership");
  // Prevent Next.js from trying to compile TypeScript config
  process.env.NEXT_PRIVATE_STANDALONE = "1";
  // Disable telemetry
  process.env.NEXT_TELEMETRY_DISABLED = "1";
  // Skip type checking
  process.env.NEXT_DISABLE_SWC_WASM = "1";
}

// Hide console window on Windows in production
if (!isDev && process.platform === "win32") {
  // This prevents child processes from showing console windows
  require("child_process").spawn = ((originalSpawn) => {
    return function spawn(command, args, options) {
      options = options || {};
      options.windowsHide = true;
      return originalSpawn.call(this, command, args, options);
    };
  })(require("child_process").spawn);
}

let mainWindow;
const quickNoteWindows = new Set();
const quickAiWindows = new Set();
let quickNotesCategoryIdPromise = null;

function notifyQuickNotesChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("quick-notes-changed");
  }
}
let server;

const PORT = isDev ? 3000 : 51333;

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderInlineMarkdown(value) {
  let result = escapeHtml(value);
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
  result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
  return result;
}

function toNoteHtml(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  const blocks = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      blocks.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      blocks.push("</ol>");
      inOl = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      closeLists();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      closeLists();
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (inOl) {
        blocks.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        blocks.push("<ul>");
        inUl = true;
      }
      blocks.push(`<li><p>${renderInlineMarkdown(ulMatch[1])}</p></li>`);
      continue;
    }

    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (inUl) {
        blocks.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        blocks.push("<ol>");
        inOl = true;
      }
      blocks.push(`<li><p>${renderInlineMarkdown(olMatch[1])}</p></li>`);
      continue;
    }

    closeLists();
    blocks.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
  }

  closeLists();

  return blocks.join("") || "<p><br></p>";
}

function toNoteTitle(text) {
  const firstLine = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return "";
  }

  const cleaned = firstLine
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .trim();

  return (cleaned || firstLine).slice(0, 120);
}

function toSentenceCaseTitle(value) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "";
  }

  const lower = trimmed.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

async function apiRequest(pathname, options = {}) {
  const response = await fetch(`http://localhost:${PORT}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`API ${response.status}: ${body || response.statusText}`);
  }

  return response.json();
}

async function ensureQuickNotesCategory() {
  if (quickNotesCategoryIdPromise) {
    return quickNotesCategoryIdPromise;
  }

  quickNotesCategoryIdPromise = (async () => {
  const notes = await apiRequest("/api/notes?includeArchived=true", {
    method: "GET",
  });

  const existing = Array.isArray(notes)
    ? notes.find((note) => note && note.parentId === null && note.title === "Quick Notes")
    : null;

  if (existing?.id) {
    if (existing.icon !== "🗂️") {
      await apiRequest(`/api/notes/${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ icon: "🗂️" }),
      });
      notifyQuickNotesChanged();
    }
    return existing.id;
  }

  const created = await apiRequest("/api/notes", {
    method: "POST",
    body: JSON.stringify({ parentId: null }),
  });

  const updated = await apiRequest(`/api/notes/${created.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: "Quick Notes",
      icon: "🗂️",
      order: -100000,
    }),
  });

  return updated.id;
  })();

  try {
    return await quickNotesCategoryIdPromise;
  } catch (error) {
    quickNotesCategoryIdPromise = null;
    throw error;
  }
}

async function getOpenRouterApiKeyFromMainWindow() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return "";
    }

    const key = await mainWindow.webContents.executeJavaScript(
      "localStorage.getItem('mothership-openrouter-api-key') || ''",
      true
    );

    return typeof key === "string" ? key : "";
  } catch {
    return "";
  }
}

async function getSelectedModelFromMainWindow() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return "openai/gpt-4o-mini";
    }

    const model = await mainWindow.webContents.executeJavaScript(
      "localStorage.getItem('mothership-ai-model') || 'openai/gpt-4o-mini'",
      true
    );

    return typeof model === "string" && model.trim() ? model : "openai/gpt-4o-mini";
  } catch {
    return "openai/gpt-4o-mini";
  }
}

async function generateQuickNoteTitle(noteId, text) {
  const apiKey = await getOpenRouterApiKeyFromMainWindow();
  if (!apiKey) {
    return;
  }

  const prompt = `You are generating a title for a quick note captured in a personal notes app.\n\nRules:\n- 3 to 6 words\n- describe what the note says\n- do not guess missing context\n- use sentence case only (only the first letter uppercase, not title case)\n- no quotes, no trailing punctuation\n\nQuick note content:\n${text.slice(0, 2500)}`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://mothership.app",
      "X-Title": "Mothership",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 24,
    }),
  });

  if (!response.ok) {
    return;
  }

  const data = await response.json();
  const rawTitle = data?.choices?.[0]?.message?.content?.trim()?.replace(/^['\"]|['\"]$/g, "")?.slice(0, 60) || "";
  const title = toSentenceCaseTitle(rawTitle);
  if (!title) {
    return;
  }

  await apiRequest(`/api/notes/${noteId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });

  notifyQuickNotesChanged();
}

async function createQuickNoteWindow() {
  const window = new BrowserWindow({
    width: 380,
    height: 420,
    minWidth: 320,
    minHeight: 260,
    backgroundColor: "#202020",
    title: "Quick Note",
    autoHideMenuBar: true,
    alwaysOnTop: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
  });

  quickNoteWindows.add(window);

  window.loadFile(path.join(__dirname, "quick-note.html"));

  window.on("closed", () => {
    quickNoteWindows.delete(window);
  });
}

async function createQuickAiWindow() {
  const window = new BrowserWindow({
    width: 560,
    height: 640,
    minWidth: 420,
    minHeight: 420,
    backgroundColor: "#191919",
    title: "Quick AI Chat",
    autoHideMenuBar: true,
    alwaysOnTop: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
  });

  quickAiWindows.add(window);
  window.loadFile(path.join(__dirname, "quick-ai.html"));

  window.on("closed", () => {
    quickAiWindows.delete(window);
  });
}

async function createOrUpdateQuickNote(text, options = {}) {
  const quickNotesParentId = await ensureQuickNotesCategory();
  const created = await apiRequest("/api/notes", {
    method: "POST",
    body: JSON.stringify({ parentId: quickNotesParentId }),
  });

  const noteId = created.id;
  const updated = await apiRequest(`/api/notes/${noteId}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: toNoteTitle(text),
      content: toNoteHtml(text),
      order: -Date.now(),
      archived: Boolean(options.archived),
    }),
  });

  notifyQuickNotesChanged();

  if (options.generateTitle) {
    void generateQuickNoteTitle(noteId, text);
  }

  return updated;
}

ipcMain.handle("quick-note-create", async (_event, payload) => {
  const text = typeof payload?.text === "string" ? payload.text : "";
  const force = Boolean(payload?.force);

  if (!force && !text.trim()) {
    throw new Error("Cannot create empty quick note");
  }

  return createOrUpdateQuickNote(text, { archived: false, generateTitle: false });
});

ipcMain.handle("quick-note-update", async (_event, payload) => {
  const noteId = typeof payload?.noteId === "string" ? payload.noteId : "";
  const text = typeof payload?.text === "string" ? payload.text : "";

  if (!noteId) {
    throw new Error("Missing note id");
  }

  const updated = await apiRequest(`/api/notes/${noteId}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: toNoteTitle(text),
      content: toNoteHtml(text),
    }),
  });

  notifyQuickNotesChanged();

  return updated;
});

ipcMain.on("quick-note-finalize", (_event, payload) => {
  const noteId = typeof payload?.noteId === "string" ? payload.noteId : "";
  const text = typeof payload?.text === "string" ? payload.text : "";

  if (!noteId || !text.trim()) {
    return;
  }

  void generateQuickNoteTitle(noteId, text);
});

ipcMain.on("quick-note-close", (event, payload) => {
  const noteId = typeof payload?.noteId === "string" ? payload.noteId : "";
  const text = typeof payload?.text === "string" ? payload.text : "";

  if (noteId && !text.trim()) {
    void apiRequest(`/api/notes/${noteId}`, {
      method: "DELETE",
    })
      .then(() => notifyQuickNotesChanged())
      .catch(() => {});
  }

  const window = BrowserWindow.fromWebContents(event.sender);
  window?.close();
});

ipcMain.on("quick-note-open", () => {
  void ensureQuickNotesCategory();
  void createQuickNoteWindow();
});

ipcMain.handle("quick-note-save", async (_event, payload) => {
  const text = typeof payload?.text === "string" ? payload.text : "";
  if (!text.trim()) {
    return { saved: false };
  }

  const note = await createOrUpdateQuickNote(text, { archived: false, generateTitle: true });
  return { saved: true, noteId: note.id };
});

ipcMain.handle("quick-note-archive", async (_event, payload) => {
  const text = typeof payload?.text === "string" ? payload.text : "";
  if (!text.trim()) {
    return { archived: false };
  }

  const note = await createOrUpdateQuickNote(text, { archived: true, generateTitle: false });
  return { archived: true, noteId: note.id };
});

ipcMain.on("quick-ai-open", () => {
  void createQuickAiWindow();
});

ipcMain.handle("quick-ai-chat", async (_event, payload) => {
  const incomingMessages = Array.isArray(payload?.messages) ? payload.messages : [];
  const messages = incomingMessages
    .map((message) => ({
      role: message?.role === "assistant" ? "assistant" : "user",
      content: typeof message?.content === "string" ? message.content : "",
    }))
    .filter((message) => message.content.trim().length > 0);

  if (messages.length === 0) {
    throw new Error("No messages provided");
  }

  const apiKey = await getOpenRouterApiKeyFromMainWindow();
  if (!apiKey) {
    throw new Error("Please set your OpenRouter API key in AI Settings.");
  }

  const model = await getSelectedModelFromMainWindow();

  const response = await fetch(`http://localhost:${PORT}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
      apiKey,
      model,
      instructions: [],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `AI request failed (${response.status})`);
  }

  const content = await response.text();
  return { content: content.trim() };
});

ipcMain.handle("quick-ai-save", async (_event, payload) => {
  const incomingMessages = Array.isArray(payload?.messages) ? payload.messages : [];
  const messages = incomingMessages
    .map((message) => ({
      role: message?.role === "assistant" ? "assistant" : "user",
      content: typeof message?.content === "string" ? message.content : "",
    }))
    .filter((message) => message.content.trim().length > 0);

  if (messages.length === 0) {
    return { saved: false };
  }

  const session = await apiRequest("/api/ai/sessions", { method: "POST" });
  const sessionId = session.id;

  for (const message of messages) {
    await apiRequest(`/api/ai/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify(message),
    });
  }

  const apiKey = await getOpenRouterApiKeyFromMainWindow();
  if (apiKey) {
    try {
      await apiRequest(`/api/ai/sessions/${sessionId}/generate-title`, {
        method: "POST",
        body: JSON.stringify({ apiKey }),
      });
    } catch {
      // Leave default title if generation fails
    }
  }

  return { saved: true, sessionId };
});

ipcMain.on("quick-ai-trash", (event, payload) => {
  const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : "";

  if (sessionId) {
    void apiRequest(`/api/ai/sessions/${sessionId}`, {
      method: "DELETE",
    }).catch(() => {});
  }

  const window = BrowserWindow.fromWebContents(event.sender);
  window?.close();
});

ipcMain.on("quick-ai-close", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  window?.close();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#191919",
    titleBarStyle: "hiddenInset",
    frame: false,
    show: false, // Don't show until content is loaded
    icon: path.join(__dirname, "../public/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Show window when ready to avoid flash
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Handle window control IPC events
  ipcMain.on("window-minimize", () => {
    mainWindow?.minimize();
  });

  ipcMain.on("window-maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on("window-close", () => {
    mainWindow?.close();
  });

  // Handle folder selection dialog
  ipcMain.handle("select-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Select Folder to Clean",
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    
    return result.filePaths[0];
  });

  // Load the app
  const url = `http://localhost:${PORT}`;
  
  // Wait for Next.js server to be ready
  const checkServer = () => {
    fetch(url)
      .then(() => {
        mainWindow.loadURL(url);
      })
      .catch(() => {
        setTimeout(checkServer, 500);
      });
  };

  checkServer();

  // Open external links in the default browser, not in the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only open http/https URLs in external browser
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Also handle link clicks that try to navigate the window
  mainWindow.webContents.on("will-navigate", (event, url) => {
    // Allow navigation to our app's localhost URL
    if (url.startsWith(`http://localhost:${PORT}`)) {
      return;
    }
    // External URLs should open in browser
    if (url.startsWith("http://") || url.startsWith("https://")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Only open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function startNextServer() {
  if (isDev) {
    // In dev mode, assume Next.js dev server is already running externally
    console.log("Development mode - expecting external Next.js server");
    return;
  }

  // In production, start the embedded server
  console.log("Starting production Next.js server...");
  process.env.PORT = PORT.toString();
  
  const { startServer } = require("./server.js");
  server = await startServer();
}

app.whenReady().then(async () => {
  await startNextServer();
  createWindow();

  const registered = globalShortcut.register("CommandOrControl+Q", () => {
    void createQuickNoteWindow();
  });

  if (!registered) {
    console.error("Failed to register global shortcut: CommandOrControl+Q");
  }

  const quickAiRegistered = globalShortcut.register("CommandOrControl+Space", () => {
    void createQuickAiWindow();
  });

  if (!quickAiRegistered) {
    console.error("Failed to register global shortcut: CommandOrControl+Space");
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (server) {
    server.close();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  if (server) {
    server.close();
  }
});
