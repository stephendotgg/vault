const input = document.getElementById("quickInput");
const archiveBtn = document.getElementById("archiveBtn");
const saveBtn = document.getElementById("saveBtn");

let actionInFlight = false;

async function applyThemeMode() {
  try {
    const mode = await window.electronAPI?.getThemeMode?.();
    const nextMode = mode === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", nextMode);
  } catch {
    document.documentElement.setAttribute("data-theme", "dark");
  }
}

function setBusyState(busy) {
  actionInFlight = busy;
  if (archiveBtn) archiveBtn.disabled = busy;
  if (saveBtn) saveBtn.disabled = busy;
}

async function handleSave() {
  if (actionInFlight) return;

  const text = input.value;
  if (!text.trim()) {
    window.electronAPI.closeQuickNote();
    return;
  }

  setBusyState(true);
  try {
    await window.electronAPI.quickNoteSave(text);
    window.electronAPI.closeQuickNote();
  } catch (error) {
    console.error("[quick-note] save failed", error);
    setBusyState(false);
  }
}

async function handleArchive() {
  if (actionInFlight) return;

  const text = input.value;
  if (!text.trim()) {
    window.electronAPI.closeQuickNote();
    return;
  }

  setBusyState(true);
  try {
    await window.electronAPI.quickNoteArchive(text);
    window.electronAPI.closeQuickNote();
  } catch (error) {
    console.error("[quick-note] archive failed", error);
    setBusyState(false);
  }
}

input.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    void handleSave();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    void handleSave();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void handleSave();
  }
});

window.addEventListener("keydown", (event) => {
  const target = event.target;
  const isInput = target === input;

  if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !isInput) {
    event.preventDefault();
    void handleSave();
  }

  if (event.key === "Escape" && !isInput) {
    event.preventDefault();
    void handleSave();
  }
});

window.addEventListener("focus", () => {
  void applyThemeMode();
});

// Track Ctrl key for archive → delete swap
let isCtrlPressed = false;
const archiveSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14"/><path d="M5 8a2 2 0 1 1 0-4h14a2 2 0 1 1 0 4"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>';
const trashSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

function updateArchiveBtn() {
  if (!archiveBtn) return;
  if (isCtrlPressed) {
    archiveBtn.innerHTML = trashSvg;
    archiveBtn.title = "Discard";
    archiveBtn.setAttribute("aria-label", "Discard");
    archiveBtn.style.color = "#f87171";
  } else {
    archiveBtn.innerHTML = archiveSvg;
    archiveBtn.title = "Archive";
    archiveBtn.setAttribute("aria-label", "Archive");
    archiveBtn.style.color = "";
  }
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Control" && !isCtrlPressed) {
    isCtrlPressed = true;
    updateArchiveBtn();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "Control" && isCtrlPressed) {
    isCtrlPressed = false;
    updateArchiveBtn();
  }
});

window.addEventListener("blur", () => {
  if (isCtrlPressed) {
    isCtrlPressed = false;
    updateArchiveBtn();
  }
});

archiveBtn?.addEventListener("click", () => {
  if (isCtrlPressed) {
    // Discard — just close without saving
    window.electronAPI.closeQuickNote();
  } else {
    void handleArchive();
  }
});

saveBtn?.addEventListener("click", () => {
  void handleSave();
});

window.addEventListener("beforeunload", () => {
  // Intentionally no autosave.
});

input.focus();
void applyThemeMode();
