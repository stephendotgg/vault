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
    window.electronAPI.closeQuickNote();
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

  if (event.key === "Escape") {
    window.electronAPI.closeQuickNote();
  }
});

window.addEventListener("focus", () => {
  void applyThemeMode();
});

archiveBtn?.addEventListener("click", () => {
  void handleArchive();
});

saveBtn?.addEventListener("click", () => {
  void handleSave();
});

window.addEventListener("beforeunload", () => {
  // Intentionally no autosave.
});

input.focus();
void applyThemeMode();
