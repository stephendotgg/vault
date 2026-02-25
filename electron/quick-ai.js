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
  streamRequestId: null,
  streamCleanup: null,
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

function renderInlineMarkdown(value) {
  let result = escapeHtml(value);
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
  result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
  return result;
}

function renderMarkdown(value) {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeLines = [];

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

    if (trimmed.startsWith("```")) {
      if (inCode) {
        blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        closeLists();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      closeLists();
      continue;
    }

    const blockquoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (blockquoteMatch) {
      closeLists();
      blocks.push(`<blockquote>${renderInlineMarkdown(blockquoteMatch[1])}</blockquote>`);
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
      blocks.push(`<li>${renderInlineMarkdown(ulMatch[1])}</li>`);
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
      blocks.push(`<li>${renderInlineMarkdown(olMatch[1])}</li>`);
      continue;
    }

    closeLists();
    blocks.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
  }

  if (inCode) {
    blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }

  closeLists();
  return blocks.join("");
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
        <div class="assistant-text">${message.content
          ? renderMarkdown(message.content)
          : '<div class="typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>'}</div>
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

  messagesInnerEl.innerHTML = html.join("");
  messagesEl.scrollTop = messagesEl.scrollHeight;
  sendBtn.disabled = state.loading || !inputEl.value.trim();
}

async function generateAssistantReply(sourceMessages) {
  if (state.streamCleanup) {
    state.streamCleanup();
    state.streamCleanup = null;
  }

  setLoading(true);
  setError("");

  try {
    const payload = sourceMessages.map((message) => ({ role: message.role, content: message.content }));
    const tempAssistantId = makeId();
    state.messages.push({ id: tempAssistantId, role: "assistant", content: "" });
    render();

    const requestId = makeId();
    state.streamRequestId = requestId;

    const streamDone = new Promise((resolve, reject) => {
      const unsubscribe = window.electronAPI.onQuickAiStream((eventPayload) => {
        if (!eventPayload || eventPayload.requestId !== requestId) {
          return;
        }

        if (eventPayload.type === "chunk") {
          const chunk = eventPayload.chunk || "";
          state.messages = state.messages.map((message) =>
            message.id === tempAssistantId
              ? { ...message, content: `${message.content}${chunk}` }
              : message
          );
          render();
          return;
        }

        if (eventPayload.type === "end") {
          const finalContent = (eventPayload.content || "").trim();
          state.messages = state.messages.map((message) =>
            message.id === tempAssistantId
              ? { ...message, content: finalContent }
              : message
          );
          setLoading(false);
          render();
          unsubscribe();
          resolve(undefined);
          return;
        }

        if (eventPayload.type === "error") {
          state.messages = state.messages.filter((message) => message.id !== tempAssistantId);
          setLoading(false);
          render();
          unsubscribe();
          reject(new Error(eventPayload.message || "Failed to stream AI response"));
        }
      });

      state.streamCleanup = () => {
        unsubscribe();
      };
    });

    window.electronAPI.quickAiChatStream(requestId, payload);
    await streamDone;
  } catch (error) {
    setError(error instanceof Error ? error.message : "Failed to get AI response");
  } finally {
    state.streamRequestId = null;
    if (state.streamCleanup) {
      state.streamCleanup();
      state.streamCleanup = null;
    }
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

  window.electronAPI.quickAiSaveAndClose(messagesToSave);
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

window.addEventListener("keydown", (event) => {
  const target = event.target;
  const isInput = target === inputEl;

  if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !isInput) {
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
