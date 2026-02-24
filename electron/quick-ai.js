const messagesEl = document.getElementById("messages");
const messagesInnerEl = document.getElementById("messagesInner");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const saveBtn = document.getElementById("saveBtn");
const trashBtn = document.getElementById("trashBtn");
const errorEl = document.getElementById("error");

const state = {
  messages: [],
  loading: false,
  copiedMessageId: null,
  savedSessionId: null,
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setError(message) {
  errorEl.textContent = message || "";
}

function setLoading(loading) {
  state.loading = loading;
  sendBtn.disabled = loading || !inputEl.value.trim();
  saveBtn.disabled = loading;
  trashBtn.disabled = loading;
}

function autoResizeInput() {
  inputEl.style.height = "auto";
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 180)}px`;
}

function render() {
  const html = [];

  for (let index = 0; index < state.messages.length; index += 1) {
    const message = state.messages[index];
    if (message.role === "user") {
      html.push(`
        <div class="row-user">
          <div class="bubble-user">${escapeHtml(message.content)}</div>
        </div>
      `);
      continue;
    }

    const hasLaterAssistant = state.messages.slice(index + 1).some((item) => item.role === "assistant");
    const showActions = !hasLaterAssistant;

    html.push(`
      <div class="assistant-wrap">
        <div class="assistant-text">${escapeHtml(message.content)}</div>
        ${showActions ? `
          <div class="assistant-actions">
            <button class="assistant-action ${state.copiedMessageId === message.id ? "copied" : ""}" data-action="copy" data-id="${message.id}" title="Copy" aria-label="Copy">
              ${state.copiedMessageId === message.id
                ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
                : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>'}
            </button>
            <button class="assistant-action" data-action="redo" data-id="${message.id}" title="Regenerate" aria-label="Regenerate">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 4v6h6"/>
                <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
              </svg>
            </button>
          </div>
        ` : ""}
      </div>
    `);
  }

  if (state.loading) {
    html.push('<div class="typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>');
  }

  messagesInnerEl.innerHTML = html.join("");
  messagesEl.scrollTop = messagesEl.scrollHeight;
  sendBtn.disabled = state.loading || !inputEl.value.trim();
}

async function generateAssistantReply(sourceMessages) {
  setLoading(true);
  setError("");

  try {
    const payload = sourceMessages.map((message) => ({ role: message.role, content: message.content }));
    const response = await window.electronAPI.quickAiChat(payload);
    const content = (response?.content || "").trim();
    if (!content) {
      throw new Error("No response generated");
    }

    state.messages.push({ id: makeId(), role: "assistant", content });
    render();
  } catch (error) {
    setError(error instanceof Error ? error.message : "Failed to get AI response");
  } finally {
    setLoading(false);
  }
}

async function sendMessage() {
  if (state.loading) return;

  const content = inputEl.value.trim();
  if (!content) return;

  state.messages.push({ id: makeId(), role: "user", content });
  inputEl.value = "";
  autoResizeInput();
  render();
  await generateAssistantReply(state.messages);
}

async function redoAssistant(messageId) {
  if (state.loading) return;

  const index = state.messages.findIndex((message) => message.id === messageId && message.role === "assistant");
  if (index === -1) return;

  state.messages = state.messages.slice(0, index);
  render();
  await generateAssistantReply(state.messages);
}

async function saveConversation() {
  if (state.loading) return;

  const messagesToSave = state.messages
    .filter((message) => message.content.trim())
    .map((message) => ({ role: message.role, content: message.content }));

  if (messagesToSave.length === 0) {
    window.electronAPI.closeQuickAi();
    return;
  }

  setLoading(true);
  setError("");

  try {
    const result = await window.electronAPI.quickAiSave(messagesToSave);
    state.savedSessionId = result?.sessionId || null;
    window.electronAPI.closeQuickAi();
  } catch (error) {
    setError(error instanceof Error ? error.message : "Failed to save chat");
    setLoading(false);
  }
}

function trashConversation() {
  if (state.loading) return;
  window.electronAPI.quickAiTrash(state.savedSessionId || undefined);
}

messagesInnerEl.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-action]");
  if (!target) return;

  const action = target.getAttribute("data-action");
  const id = target.getAttribute("data-id");

  if (action === "copy" && id) {
    const message = state.messages.find((item) => item.id === id);
    if (!message) return;

    navigator.clipboard.writeText(message.content);
    state.copiedMessageId = id;
    render();
    setTimeout(() => {
      state.copiedMessageId = null;
      render();
    }, 400);
    return;
  }

  if (action === "redo" && id) {
    void redoAssistant(id);
  }
});

inputEl.addEventListener("input", () => {
  autoResizeInput();
  sendBtn.disabled = state.loading || !inputEl.value.trim();
});

inputEl.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    void saveConversation();
    return;
  }

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void sendMessage();
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void saveConversation();
  }

  if (event.key === "Escape") {
    window.electronAPI.closeQuickAi();
  }
});

sendBtn.addEventListener("click", () => {
  void sendMessage();
});

saveBtn.addEventListener("click", () => {
  void saveConversation();
});

trashBtn.addEventListener("click", () => {
  trashConversation();
});

setLoading(false);
render();
autoResizeInput();
inputEl.focus();
