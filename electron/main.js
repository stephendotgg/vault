const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut, desktopCapturer, Notification } = require("electron");
const path = require("path");
const { execFile } = require("child_process");
const fs = require("fs");

// Set NODE_ENV early to prevent TypeScript installation attempts
const isDev = !app.isPackaged;
if (!isDev) {
  process.env.NODE_ENV = "production";
  process.env.MOTHERSHIP_DATA_DIR = path.join(app.getPath("appData"), "Vault");
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
const quickNoteParentByWindowId = new Map();
let warmQuickNoteWindow = null;
let warmQuickAiWindow = null;
let warmQuickNoteLoading = false;
let warmQuickAiLoading = false;
let warmQuickNoteRequested = false;
let warmQuickAiRequested = false;
let quickNotesCategoryIdPromise = null;
let callsCategoryIdPromise = null;
let callsMonitorInterval = null;
let callsMonitorRunning = false;
let callsAbsentPollCount = 0;
let callsTranscriberWindow = null;
let callsLiveNoteId = null;
let callsLiveContent = "";
let callsChunkQueue = Promise.resolve();
let callsChunkCounter = 0;
const CALLS_CHUNK_MS = 3000;
const CALLS_POLL_MS = 5000;
const CALLS_ABSENT_POLLS_TO_STOP = 1;
let debugLogFilePath = null;

function ensureDebugLogFile() {
  if (debugLogFilePath) {
    return debugLogFilePath;
  }

  const baseDir = process.env.MOTHERSHIP_DATA_DIR || path.join(app.getPath("appData"), "Vault");
  fs.mkdirSync(baseDir, { recursive: true });
  debugLogFilePath = path.join(baseDir, "calls-debug.log");
  return debugLogFilePath;
}

function appendDebugLog(line) {
  try {
    const filePath = ensureDebugLogFile();
    fs.appendFileSync(filePath, `${line}\n`, "utf8");
  } catch {
    // Ignore logging write failures
  }
}

function callsLog(...args) {
  const stamp = new Date().toISOString();
  const textArgs = args
    .map((value) => {
      if (typeof value === "string") {
        return value;
      }
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    })
    .join(" ");

  const line = `[CALLS ${stamp}] ${textArgs}`;
  console.log(line);
  appendDebugLog(line);
}

function notifyQuickNotesChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("quick-notes-changed");
  }
}

function notifyQuickAiSessionsChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("quick-ai-sessions-changed");
  }
}

function notifyCallsChanged() {
  notifyQuickNotesChanged();
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

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
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

async function ensureCallsCategory() {
  if (callsCategoryIdPromise) {
    return callsCategoryIdPromise;
  }

  callsCategoryIdPromise = (async () => {
    const notes = await apiRequest("/api/notes?includeArchived=true", {
      method: "GET",
    });

    const existing = Array.isArray(notes)
      ? notes.find((note) => note && note.parentId === null && note.title === "Calls")
      : null;

    if (existing?.id) {
      callsLog("Using existing Calls category", existing.id);
      if (existing.icon !== "📞") {
        await apiRequest(`/api/notes/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ icon: "📞" }),
        });
        notifyCallsChanged();
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
        title: "Calls",
        icon: "📞",
        order: -99999,
      }),
    });

    callsLog("Created Calls category", updated.id);

    return updated.id;
  })();

  try {
    return await callsCategoryIdPromise;
  } catch (error) {
    callsCategoryIdPromise = null;
    throw error;
  }
}

function formatCallTitle(startedAt) {
  const yyyy = startedAt.getFullYear();
  const mm = String(startedAt.getMonth() + 1).padStart(2, "0");
  const dd = String(startedAt.getDate()).padStart(2, "0");
  const hh = String(startedAt.getHours()).padStart(2, "0");
  const min = String(startedAt.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

async function createLiveCallNote(startedAt) {
  const callsParentId = await ensureCallsCategory();
  const created = await apiRequest("/api/notes", {
    method: "POST",
    body: JSON.stringify({ parentId: callsParentId }),
  });

  const noteId = created.id;
  const title = formatCallTitle(startedAt);
  const initialContent = "<p>Live transcription started…</p>";

  const updated = await apiRequest(`/api/notes/${noteId}`, {
    method: "PATCH",
    body: JSON.stringify({
      title,
      content: initialContent,
      icon: "🔴",
      order: -Date.now(),
      archived: false,
    }),
  });

  callsLiveContent = initialContent;
  callsLog("Created live call note", { noteId, title, parentId: callsParentId });
  notifyCallsChanged();
  return updated;
}

async function appendLiveCallTranscript(text) {
  if (!callsLiveNoteId || !text.trim()) {
    callsLog("Skipping append: missing note id or empty text", {
      hasNoteId: Boolean(callsLiveNoteId),
      textLength: text?.length || 0,
    });
    return;
  }

  const textToAppend = text.trim();

  const nextChunk = toNoteHtml(textToAppend);
  const merged = `${callsLiveContent || ""}${nextChunk}`;

  const updated = await apiRequest(`/api/notes/${callsLiveNoteId}`, {
    method: "PATCH",
    body: JSON.stringify({
      content: merged,
    }),
  });

  callsLiveContent = updated?.content || merged;
  callsLog("Appended transcript chunk", {
    noteId: callsLiveNoteId,
    chunkLength: textToAppend.length,
    totalContentLength: callsLiveContent.length,
  });
  notifyCallsChanged();
}

function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      { windowsHide: true },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(String(stdout || "").trim());
      }
    );
  });
}

async function isTeamsLikelyInCall() {
  try {
    const output = await runPowerShell("$procs = Get-Process -Name 'ms-teams','Teams' -ErrorAction SilentlyContinue; if (-not $procs) { '0'; exit }; $inCall = $false; foreach ($p in $procs) { if ($p.MainWindowTitle -match '(?i)(meeting|call)') { $inCall = $true; break } }; if ($inCall) { '1' } else { '0' }");
    callsLog("Teams call probe output", output);
    return output === "1";
  } catch {
    callsLog("Teams call probe failed");
    return false;
  }
}

async function createCallsTranscriberWindow() {
  if (callsTranscriberWindow && !callsTranscriberWindow.isDestroyed()) {
    return callsTranscriberWindow;
  }

  const window = new BrowserWindow({
    width: 420,
    height: 320,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
  });

  window.webContents.session.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ["screen"] });
        const source = sources[0];
        if (!source) {
          callsLog("Display media handler: no screen source available");
          callback(null);
          return;
        }

        callsLog("Display media handler selected source", source.id);
        callback({
          video: source,
          audio: "loopback",
        });
      } catch {
        callsLog("Display media handler failed");
        callback(null);
      }
    },
    { useSystemPicker: false }
  );

  callsTranscriberWindow = window;
  callsLog("Created hidden calls transcriber window");
  window.loadFile(path.join(__dirname, "call-transcriber.html"));
  window.on("closed", () => {
    callsLog("Calls transcriber window closed");
    callsTranscriberWindow = null;
  });

  await new Promise((resolve) => {
    if (window.webContents.isLoadingMainFrame()) {
      window.webContents.once("did-finish-load", resolve);
    } else {
      resolve();
    }
  });

  return window;
}

async function startLiveCallTranscription() {
  if (callsLiveNoteId) {
    callsLog("Start ignored: live note already active", callsLiveNoteId);
    return;
  }

  const startedAt = new Date();
  const note = await createLiveCallNote(startedAt);
  callsLiveNoteId = note.id;
  callsChunkQueue = Promise.resolve();
  callsChunkCounter = 0;
  callsLog("Starting live call transcription", { noteId: callsLiveNoteId });

  if (Notification.isSupported()) {
    try {
      const notification = new Notification({
        title: "Teams call detected",
        body: "Click to open Quick Note for this call.",
      });

      notification.on("click", () => {
        void createQuickNoteWindow({ parentNoteId: note.id });
      });

      notification.show();
      callsLog("Displayed Teams call detected notification", { noteId: note.id });
    } catch (error) {
      callsLog("Failed to show Teams call detected notification", {
        noteId: note.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const window = await createCallsTranscriberWindow();
  window.webContents.send("calls-transcriber-start", {
    chunkMs: CALLS_CHUNK_MS,
  });
  callsLog("Sent calls-transcriber-start");
}

function stopLiveCallTranscription() {
  const noteIdToReset = callsLiveNoteId;
  callsLog("Stopping live call transcription", { noteId: noteIdToReset, chunksProcessed: callsChunkCounter });
  if (callsTranscriberWindow && !callsTranscriberWindow.isDestroyed()) {
    callsTranscriberWindow.webContents.send("calls-transcriber-stop");
  }

  if (noteIdToReset) {
    void apiRequest(`/api/notes/${noteIdToReset}`, {
      method: "PATCH",
      body: JSON.stringify({ icon: "📄" }),
    })
      .then(() => {
        callsLog("Reset live call note icon to default", { noteId: noteIdToReset });
        notifyCallsChanged();
      })
      .catch((error) => {
        callsLog("Failed to reset live call note icon", {
          noteId: noteIdToReset,
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }

  callsLiveNoteId = null;
  callsLiveContent = "";
  callsChunkQueue = Promise.resolve();
}

async function transcribeWavChunk(base64Wav) {
  callsLog("Transcribe chunk request", { payloadBytes: base64Wav.length });
  const config = await getAzureSpeechConfigFromMainWindow();

  if (!config.key || !config.region) {
    throw new Error("Azure Speech key/region missing. Configure them in Settings > API Keys.");
  }

  const response = await fetch(`http://localhost:${PORT}/api/transcribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vault-azure-speech-key": config.key,
      "x-vault-azure-speech-region": config.region,
      "x-vault-azure-speech-language": config.language,
    },
    body: JSON.stringify({
      wavBase64: base64Wav,
      source: "calls-transcriber",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `Transcription failed (${response.status})`);
  }

  const payload = await response.json().catch(() => ({}));
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  callsLog("Transcribe chunk response", { textLength: text.length, preview: text.slice(0, 80) });
  return text;
}

async function pollTeamsCallState() {
  if (callsMonitorRunning) {
    return;
  }

  callsMonitorRunning = true;

  try {
    const isActive = await isTeamsLikelyInCall();
    callsLog("Poll teams state", { isActive, hasLiveNote: Boolean(callsLiveNoteId), absentCount: callsAbsentPollCount });

    if (isActive) {
      callsAbsentPollCount = 0;
      if (!callsLiveNoteId) {
        await startLiveCallTranscription();
      }
      return;
    }

    if (!callsLiveNoteId) {
      return;
    }

    callsAbsentPollCount += 1;
    if (callsAbsentPollCount >= CALLS_ABSENT_POLLS_TO_STOP) {
      stopLiveCallTranscription();
      callsAbsentPollCount = 0;
    }
  } catch {
    callsLog("Poll teams state failed");
  } finally {
    callsMonitorRunning = false;
  }
}

function startCallsMonitor() {
  if (callsMonitorInterval) {
    return;
  }

  void ensureCallsCategory();
  void pollTeamsCallState();
  callsLog("Calls monitor started");

  callsMonitorInterval = setInterval(() => {
    void pollTeamsCallState();
  }, CALLS_POLL_MS);
}

function stopCallsMonitor() {
  if (callsMonitorInterval) {
    clearInterval(callsMonitorInterval);
    callsMonitorInterval = null;
  }
  stopLiveCallTranscription();
  callsLog("Calls monitor stopped");
}

async function getOpenRouterApiKeyFromMainWindow() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return "";
    }

    const key = await mainWindow.webContents.executeJavaScript(
      "localStorage.getItem('vault-openrouter-api-key') || localStorage.getItem('mothership-openrouter-api-key') || ''",
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
      "localStorage.getItem('vault-ai-model') || localStorage.getItem('mothership-ai-model') || 'openai/gpt-4o-mini'",
      true
    );

    return typeof model === "string" && model.trim() ? model : "openai/gpt-4o-mini";
  } catch {
    return "openai/gpt-4o-mini";
  }
}

async function getAzureSpeechConfigFromMainWindow() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { key: "", region: "", language: "en-US" };
    }

    const [key, region, language] = await mainWindow.webContents.executeJavaScript(
      `[
        localStorage.getItem('vault-azure-speech-key') || localStorage.getItem('mothership-azure-speech-key') || '',
        localStorage.getItem('vault-azure-speech-region') || localStorage.getItem('mothership-azure-speech-region') || '',
        localStorage.getItem('vault-azure-speech-language') || localStorage.getItem('mothership-azure-speech-language') || 'en-US'
      ]`,
      true
    );

    return {
      key: typeof key === "string" ? key : "",
      region: typeof region === "string" ? region : "",
      language: typeof language === "string" && language.trim() ? language : "en-US",
    };
  } catch {
    return { key: "", region: "", language: "en-US" };
  }
}

async function getAiInstructions() {
  try {
    const settings = await apiRequest("/api/ai/settings", {
      method: "GET",
    });

    return Array.isArray(settings?.instructions) ? settings.instructions : [];
  } catch {
    return [];
  }
}

async function generateQuickNoteTitle(noteId, text) {
  const apiKey = await getOpenRouterApiKeyFromMainWindow();
  if (!apiKey) {
    return;
  }

  const prompt = `You are generating a title for a quick note captured in a personal notes app.\n\nRules:\n- 3 to 6 words\n- describe what the note says\n- do not guess missing context\n- use sentence case (not title case)\n- keep proper nouns and acronyms correctly capitalised (example: John, API, London)\n- no quotes, no trailing punctuation\n\nQuick note content:\n${text.slice(0, 2500)}`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://vault.app",
      "X-Title": "Vault",
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

function isWindowUsable(window) {
  return Boolean(window) && !window.isDestroyed();
}

function focusQuickWindow(window) {
  if (!isWindowUsable(window)) {
    return;
  }

  if (window.isMinimized()) {
    window.restore();
  }

  const showAndFocus = () => {
    if (!isWindowUsable(window)) {
      return;
    }
    window.show();
    window.focus();
  };

  if (window.webContents.isLoadingMainFrame()) {
    window.once("ready-to-show", showAndFocus);
    return;
  }

  showAndFocus();
}

function buildQuickNoteWindow() {
  const window = new BrowserWindow({
    width: 380,
    height: 420,
    minWidth: 320,
    minHeight: 260,
    backgroundColor: "#191919",
    title: "Quick Note",
    autoHideMenuBar: true,
    alwaysOnTop: false,
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
  });

  quickNoteWindows.add(window);
  window.setBackgroundColor("#191919");

  window.on("closed", () => {
    quickNoteWindows.delete(window);
    quickNoteParentByWindowId.delete(window.id);
    if (warmQuickNoteWindow === window) {
      warmQuickNoteWindow = null;
    }
  });

  return window;
}

function setQuickNoteParentForWindow(window, parentNoteId) {
  if (!window || window.isDestroyed()) {
    return;
  }

  if (typeof parentNoteId === "string" && parentNoteId.trim()) {
    quickNoteParentByWindowId.set(window.id, parentNoteId.trim());
    return;
  }

  quickNoteParentByWindowId.delete(window.id);
}

function buildQuickAiWindow() {
  const window = new BrowserWindow({
    width: 520,
    height: 640,
    minWidth: 420,
    minHeight: 420,
    backgroundColor: "#191919",
    title: "Quick AI Chat",
    autoHideMenuBar: true,
    alwaysOnTop: false,
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
  });

  quickAiWindows.add(window);
  window.setBackgroundColor("#191919");

  window.on("closed", () => {
    quickAiWindows.delete(window);
    if (warmQuickAiWindow === window) {
      warmQuickAiWindow = null;
    }
  });

  return window;
}

async function ensureWarmQuickNoteWindow() {
  if (isWindowUsable(warmQuickNoteWindow)) {
    return;
  }

  if (warmQuickNoteLoading) {
    warmQuickNoteRequested = true;
    return;
  }

  warmQuickNoteLoading = true;
  const window = buildQuickNoteWindow();
  warmQuickNoteWindow = window;

  try {
    await window.loadFile(path.join(__dirname, "quick-note.html"));
  } catch {
    if (!window.isDestroyed()) {
      window.destroy();
    }
    if (warmQuickNoteWindow === window) {
      warmQuickNoteWindow = null;
    }
  } finally {
    warmQuickNoteLoading = false;
    if (warmQuickNoteRequested) {
      warmQuickNoteRequested = false;
      void ensureWarmQuickNoteWindow();
    }
  }
}

async function ensureWarmQuickAiWindow() {
  if (isWindowUsable(warmQuickAiWindow)) {
    return;
  }

  if (warmQuickAiLoading) {
    warmQuickAiRequested = true;
    return;
  }

  warmQuickAiLoading = true;
  const window = buildQuickAiWindow();
  warmQuickAiWindow = window;

  try {
    await window.loadFile(path.join(__dirname, "quick-ai.html"));
  } catch {
    if (!window.isDestroyed()) {
      window.destroy();
    }
    if (warmQuickAiWindow === window) {
      warmQuickAiWindow = null;
    }
  } finally {
    warmQuickAiLoading = false;
    if (warmQuickAiRequested) {
      warmQuickAiRequested = false;
      void ensureWarmQuickAiWindow();
    }
  }
}

async function createQuickNoteWindow(options = {}) {
  const parentNoteId = typeof options?.parentNoteId === "string" ? options.parentNoteId : "";

  if (isWindowUsable(warmQuickNoteWindow)) {
    const window = warmQuickNoteWindow;
    warmQuickNoteWindow = null;
    setQuickNoteParentForWindow(window, parentNoteId);
    focusQuickWindow(window);
    void ensureWarmQuickNoteWindow();
    return;
  }

  const window = buildQuickNoteWindow();
  try {
    await window.loadFile(path.join(__dirname, "quick-note.html"));
    setQuickNoteParentForWindow(window, parentNoteId);
    focusQuickWindow(window);
  } catch {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  } finally {
    void ensureWarmQuickNoteWindow();
  }
}

async function createQuickAiWindow() {
  if (isWindowUsable(warmQuickAiWindow)) {
    const window = warmQuickAiWindow;
    warmQuickAiWindow = null;
    focusQuickWindow(window);
    void ensureWarmQuickAiWindow();
    return;
  }

  const window = buildQuickAiWindow();
  try {
    await window.loadFile(path.join(__dirname, "quick-ai.html"));
    focusQuickWindow(window);
  } catch {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  } finally {
    void ensureWarmQuickAiWindow();
  }
}

async function createOrUpdateQuickNote(text, options = {}) {
  const parentOverride = typeof options.parentId === "string" ? options.parentId.trim() : "";
  const quickNotesParentId = parentOverride || await ensureQuickNotesCategory();
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

  const senderWindow = BrowserWindow.fromWebContents(_event.sender);
  const parentId = senderWindow ? quickNoteParentByWindowId.get(senderWindow.id) : undefined;
  const note = await createOrUpdateQuickNote(text, { archived: false, generateTitle: true, parentId });
  return { saved: true, noteId: note.id };
});

ipcMain.handle("quick-note-archive", async (_event, payload) => {
  const text = typeof payload?.text === "string" ? payload.text : "";
  if (!text.trim()) {
    return { archived: false };
  }

  const senderWindow = BrowserWindow.fromWebContents(_event.sender);
  const parentId = senderWindow ? quickNoteParentByWindowId.get(senderWindow.id) : undefined;
  const note = await createOrUpdateQuickNote(text, { archived: true, generateTitle: false, parentId });
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
    throw new Error("Please set your OpenRouter API key in Settings > API Keys.");
  }

  const model = await getSelectedModelFromMainWindow();
  const instructions = await getAiInstructions();

  const response = await fetch(`http://localhost:${PORT}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
      apiKey,
      model,
      instructions,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `AI request failed (${response.status})`);
  }

  const content = await response.text();
  return { content: content.trim() };
});

ipcMain.on("quick-ai-chat-stream", async (event, payload) => {
  const requestId = typeof payload?.requestId === "string" ? payload.requestId : "";
  const incomingMessages = Array.isArray(payload?.messages) ? payload.messages : [];

  if (!requestId) {
    event.sender.send("quick-ai-stream", {
      requestId,
      type: "error",
      message: "Missing request id",
    });
    return;
  }

  const messages = incomingMessages
    .map((message) => ({
      role: message?.role === "assistant" ? "assistant" : "user",
      content: typeof message?.content === "string" ? message.content : "",
    }))
    .filter((message) => message.content.trim().length > 0);

  if (messages.length === 0) {
    event.sender.send("quick-ai-stream", {
      requestId,
      type: "error",
      message: "No messages provided",
    });
    return;
  }

  try {
    const apiKey = await getOpenRouterApiKeyFromMainWindow();
    if (!apiKey) {
      throw new Error("Please set your OpenRouter API key in Settings > API Keys.");
    }

    const model = await getSelectedModelFromMainWindow();
    const instructions = await getAiInstructions();
    const response = await fetch(`http://localhost:${PORT}/api/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages,
        apiKey,
        model,
        instructions,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(body || `AI request failed (${response.status})`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("No response stream available");
    }

    let fullContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      if (!chunk) {
        continue;
      }

      fullContent += chunk;
      event.sender.send("quick-ai-stream", {
        requestId,
        type: "chunk",
        chunk,
      });
    }

    event.sender.send("quick-ai-stream", {
      requestId,
      type: "end",
      content: fullContent.trim(),
    });
  } catch (error) {
    event.sender.send("quick-ai-stream", {
      requestId,
      type: "error",
      message: error instanceof Error ? error.message : "Failed to stream AI response",
    });
  }
});

async function saveQuickAiConversation(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
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

  notifyQuickAiSessionsChanged();
  return { saved: true, sessionId };
}

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

  return saveQuickAiConversation(messages);
});

ipcMain.on("quick-ai-save-and-close", (event, payload) => {
  const incomingMessages = Array.isArray(payload?.messages) ? payload.messages : [];
  const messages = incomingMessages
    .map((message) => ({
      role: message?.role === "assistant" ? "assistant" : "user",
      content: typeof message?.content === "string" ? message.content : "",
    }))
    .filter((message) => message.content.trim().length > 0);

  const window = BrowserWindow.fromWebContents(event.sender);
  window?.close();

  if (messages.length === 0) {
    return;
  }

  void saveQuickAiConversation(messages).catch(() => {});
});

ipcMain.on("quick-ai-trash", (event, payload) => {
  const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : "";

  if (sessionId) {
    void apiRequest(`/api/ai/sessions/${sessionId}`, {
      method: "DELETE",
    })
      .then(() => notifyQuickAiSessionsChanged())
      .catch(() => {});
  }

  const window = BrowserWindow.fromWebContents(event.sender);
  window?.close();
});

ipcMain.on("quick-ai-close", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  window?.close();
});

ipcMain.on("calls-transcriber-audio-chunk", (event, payload) => {
  const base64Wav = typeof payload?.wavBase64 === "string" ? payload.wavBase64 : "";

  if (!callsLiveNoteId || !base64Wav) {
    callsLog("Dropped incoming chunk", {
      hasLiveNote: Boolean(callsLiveNoteId),
      hasChunk: Boolean(base64Wav),
    });
    return;
  }

  callsChunkCounter += 1;
  const chunkId = callsChunkCounter;
  callsLog("Received transcriber chunk", { chunkId, base64Length: base64Wav.length, noteId: callsLiveNoteId });

  callsChunkQueue = callsChunkQueue
    .then(async () => {
      callsLog("Processing chunk", { chunkId });
      const text = await transcribeWavChunk(base64Wav);
      if (text) {
        await appendLiveCallTranscript(text);
      } else {
        callsLog("Chunk produced empty transcript", { chunkId });
      }
    })
    .catch((error) => {
      callsLog("Chunk processing failed", {
        chunkId,
        message: error instanceof Error ? error.message : String(error),
      });
    });

  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (senderWindow && !senderWindow.isDestroyed()) {
    callsLog("Chunk sender window alive", senderWindow.id);
  }
});

ipcMain.on("calls-transcriber-error", (_event, payload) => {
  const message = typeof payload?.message === "string" ? payload.message : "Unknown calls transcriber error";
  callsLog("Calls transcriber error", { message });
});

ipcMain.on("calls-transcriber-log", (_event, payload) => {
  const message = typeof payload?.message === "string" ? payload.message : "";
  const data = payload?.data;
  callsLog(`Renderer: ${message}`, data);
});

ipcMain.on("renderer-runtime-error", (_event, payload) => {
  callsLog("Renderer runtime error", payload);
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
  startCallsMonitor();
  callsLog("App ready and calls monitoring initialized");

  setTimeout(() => {
    void ensureWarmQuickNoteWindow();
    void ensureWarmQuickAiWindow();
  }, 1200);

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
  stopCallsMonitor();
  if (server) {
    server.close();
  }
});
