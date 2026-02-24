const input = document.getElementById("quickInput");
const archiveBtn = document.getElementById("archiveBtn");
const saveBtn = document.getElementById("saveBtn");

let actionInFlight = false;

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

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void handleSave();
  }
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
