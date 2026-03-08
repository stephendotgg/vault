"use client";

import { useEffect, useState } from "react";

type SectionKey = "notes" | "lists" | "memories" | "dreamJournal" | "voiceLog";
type SidebarVisibilityKey = SectionKey | "fileCleaner";

type SidebarVisibilityState = Record<SidebarVisibilityKey, boolean>;

const SIDEBAR_VISIBILITY_STORAGE_KEY = "sidebar-visible-sections";
const SIDEBAR_VISIBILITY_EVENT = "vault-sidebar-visibility-updated";
const AUTOCORRECT_ENABLED_STORAGE_KEY = "vault-setting-autocorrect-enabled";
const TEAMS_CALL_TRANSCRIPTION_ENABLED_STORAGE_KEY = "vault-setting-teams-call-transcription-enabled";
const TEAMS_CALL_TRANSCRIPTION_EVENT = "vault-teams-call-transcription-updated";
const QUICK_NOTE_ENABLED_STORAGE_KEY = "vault-setting-quick-note-enabled";
const QUICK_AI_ENABLED_STORAGE_KEY = "vault-setting-quick-ai-enabled";
const QUICK_ACCESS_UPDATED_EVENT = "vault-quick-access-updated";
const ARCHIVE_AUTO_DELETE_STORAGE_KEY = "vault-setting-archive-auto-delete-days";
const ARCHIVE_AUTO_DELETE_EVENT = "vault-archive-auto-delete-updated";
const THEME_MODE_STORAGE_KEY = "vault-theme-mode";
const THEME_MODE_EVENT = "vault-theme-updated";
const QUICK_NOTE_SHORTCUT_STORAGE_KEY = "vault-shortcut-quick-note";
const QUICK_AI_SHORTCUT_STORAGE_KEY = "vault-shortcut-quick-ai";
const SHORTCUTS_UPDATED_EVENT = "vault-shortcuts-updated";
const OPENROUTER_API_KEY_STORAGE_KEY = "vault-openrouter-api-key";
const LEGACY_OPENROUTER_API_KEY_STORAGE_KEY = "mothership-openrouter-api-key";
const AZURE_FOUNDRY_API_KEY_STORAGE_KEY = "vault-azure-foundry-api-key";
const AZURE_FOUNDRY_ENDPOINT_STORAGE_KEY = "vault-azure-foundry-endpoint";
const AZURE_SPEECH_KEY_STORAGE_KEY = "vault-azure-speech-key";
const LEGACY_AZURE_SPEECH_KEY_STORAGE_KEY = "mothership-azure-speech-key";
const AZURE_SPEECH_REGION_STORAGE_KEY = "vault-azure-speech-region";
const LEGACY_AZURE_SPEECH_REGION_STORAGE_KEY = "mothership-azure-speech-region";
const AZURE_SPEECH_LANGUAGE_STORAGE_KEY = "vault-azure-speech-language";
const LEGACY_AZURE_SPEECH_LANGUAGE_STORAGE_KEY = "mothership-azure-speech-language";

const DEFAULT_QUICK_NOTE_SHORTCUT = "Ctrl+Q";
const DEFAULT_QUICK_AI_SHORTCUT = "Ctrl+Space";

type ShortcutKeyboardEvent = Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;
type ArchiveAutoDeleteDays = "never" | "1" | "3" | "7" | "30" | "90";

function formatShortcutFromEvent(event: ShortcutKeyboardEvent): string | null {
  const isModifierKey = ["Control", "Shift", "Alt", "Meta"].includes(event.key);
  if (isModifierKey) {
    return null;
  }

  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");

  const normalizedKey = event.key === " " ? "Space" : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  parts.push(normalizedKey);

  return parts.join("+");
}

const defaultSidebarVisibility: SidebarVisibilityState = {
  notes: true,
  lists: false,
  memories: false,
  dreamJournal: false,
  voiceLog: false,
  fileCleaner: true,
};

const sectionLabels: Record<SidebarVisibilityKey, string> = {
  notes: "Notes",
  lists: "Lists",
  memories: "Memories (WIP)",
  dreamJournal: "Dream Journal (WIP)",
  voiceLog: "Voice Log (WIP)",
  fileCleaner: "File Cleaner",
};

export function SettingsView() {
  const [sidebarVisibility, setSidebarVisibility] = useState<SidebarVisibilityState>(defaultSidebarVisibility);
  const [autocorrectEnabled, setAutocorrectEnabled] = useState(true);
  const [teamsCallTranscriptionEnabled, setTeamsCallTranscriptionEnabled] = useState(false);
  const [quickNoteEnabled, setQuickNoteEnabled] = useState(true);
  const [quickAiEnabled, setQuickAiEnabled] = useState(true);
  const [archiveAutoDeleteDays, setArchiveAutoDeleteDays] = useState<ArchiveAutoDeleteDays>("never");
  const [openAtStartupEnabled, setOpenAtStartupEnabled] = useState(false);
  const [isUpdatingOpenAtStartup, setIsUpdatingOpenAtStartup] = useState(false);
  const [themeMode, setThemeMode] = useState<"dark" | "light">("dark");
  const [quickNoteShortcut, setQuickNoteShortcut] = useState(DEFAULT_QUICK_NOTE_SHORTCUT);
  const [quickAiShortcut, setQuickAiShortcut] = useState(DEFAULT_QUICK_AI_SHORTCUT);
  const [openRouterApiKey, setOpenRouterApiKey] = useState("");
  const [azureFoundryApiKey, setAzureFoundryApiKey] = useState("");
  const [azureFoundryEndpoint, setAzureFoundryEndpoint] = useState("");
  const [azureSpeechKey, setAzureSpeechKey] = useState("");
  const [azureSpeechRegion, setAzureSpeechRegion] = useState("");
  const [azureSpeechLanguage, setAzureSpeechLanguage] = useState("en-US");
  const [appVersion, setAppVersion] = useState("-");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadVersion = async () => {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { version?: string };
        if (!cancelled && data.version) {
          setAppVersion(`v${data.version}`);
        }
      } catch {
        // Ignore version read failures
      }
    };

    void loadVersion();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const savedSidebar = localStorage.getItem(SIDEBAR_VISIBILITY_STORAGE_KEY);
    if (savedSidebar) {
      try {
        const parsedRaw = JSON.parse(savedSidebar) as Record<string, boolean>;
        const migrated: Partial<SidebarVisibilityState> = {
          ...parsedRaw,
          lists: parsedRaw.lists ?? parsedRaw.vault,
        };
        setSidebarVisibility({ ...defaultSidebarVisibility, ...migrated });
      } catch {
        setSidebarVisibility(defaultSidebarVisibility);
      }
    }

    const savedAutocorrectEnabled = localStorage.getItem(AUTOCORRECT_ENABLED_STORAGE_KEY);
    setAutocorrectEnabled(savedAutocorrectEnabled !== "false");

    const savedTeamsCallTranscriptionEnabled = localStorage.getItem(TEAMS_CALL_TRANSCRIPTION_ENABLED_STORAGE_KEY);
    setTeamsCallTranscriptionEnabled(savedTeamsCallTranscriptionEnabled === "true");

    const savedQuickNoteEnabled = localStorage.getItem(QUICK_NOTE_ENABLED_STORAGE_KEY);
    setQuickNoteEnabled(savedQuickNoteEnabled !== "false");

    const savedQuickAiEnabled = localStorage.getItem(QUICK_AI_ENABLED_STORAGE_KEY);
    setQuickAiEnabled(savedQuickAiEnabled !== "false");

    const savedArchiveAutoDeleteDays = localStorage.getItem(ARCHIVE_AUTO_DELETE_STORAGE_KEY);
    if (
      savedArchiveAutoDeleteDays === "1" ||
      savedArchiveAutoDeleteDays === "3" ||
      savedArchiveAutoDeleteDays === "7" ||
      savedArchiveAutoDeleteDays === "30" ||
      savedArchiveAutoDeleteDays === "90" ||
      savedArchiveAutoDeleteDays === "never"
    ) {
      setArchiveAutoDeleteDays(savedArchiveAutoDeleteDays);
    }

    const savedThemeMode = localStorage.getItem(THEME_MODE_STORAGE_KEY);
    if (savedThemeMode === "light" || savedThemeMode === "dark") {
      setThemeMode(savedThemeMode);
    }

    const savedQuickNoteShortcut = localStorage.getItem(QUICK_NOTE_SHORTCUT_STORAGE_KEY);
    if (savedQuickNoteShortcut?.trim()) {
      setQuickNoteShortcut(savedQuickNoteShortcut);
    }

    const savedQuickAiShortcut = localStorage.getItem(QUICK_AI_SHORTCUT_STORAGE_KEY);
    if (savedQuickAiShortcut?.trim()) {
      setQuickAiShortcut(savedQuickAiShortcut);
    }

    const savedOpenRouterApiKey =
      localStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_OPENROUTER_API_KEY_STORAGE_KEY) ||
      "";
    setOpenRouterApiKey(savedOpenRouterApiKey);

    const savedAzureFoundryApiKey = localStorage.getItem(AZURE_FOUNDRY_API_KEY_STORAGE_KEY) || "";
    setAzureFoundryApiKey(savedAzureFoundryApiKey);

    const savedAzureFoundryEndpoint = localStorage.getItem(AZURE_FOUNDRY_ENDPOINT_STORAGE_KEY) || "";
    setAzureFoundryEndpoint(savedAzureFoundryEndpoint);

    const savedAzureSpeechKey =
      localStorage.getItem(AZURE_SPEECH_KEY_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_AZURE_SPEECH_KEY_STORAGE_KEY) ||
      "";
    setAzureSpeechKey(savedAzureSpeechKey);

    const savedAzureSpeechRegion =
      localStorage.getItem(AZURE_SPEECH_REGION_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_AZURE_SPEECH_REGION_STORAGE_KEY) ||
      "";
    setAzureSpeechRegion(savedAzureSpeechRegion);

    const savedAzureSpeechLanguage =
      localStorage.getItem(AZURE_SPEECH_LANGUAGE_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_AZURE_SPEECH_LANGUAGE_STORAGE_KEY) ||
      "en-US";
    setAzureSpeechLanguage(savedAzureSpeechLanguage || "en-US");

    setHydrated(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadOpenAtStartup = async () => {
      if (window.electronAPI?.platform !== "win32" || !window.electronAPI?.getOpenAtStartup) {
        return;
      }

      try {
        const enabled = await window.electronAPI.getOpenAtStartup();
        if (!cancelled) {
          setOpenAtStartupEnabled(Boolean(enabled));
        }
      } catch {
        // Ignore startup preference read failures
      }
    };

    void loadOpenAtStartup();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleOpenAtStartup = async () => {
    if (isUpdatingOpenAtStartup || window.electronAPI?.platform !== "win32" || !window.electronAPI?.setOpenAtStartup) {
      return;
    }

    const previous = openAtStartupEnabled;
    const next = !previous;
    setOpenAtStartupEnabled(next);
    setIsUpdatingOpenAtStartup(true);

    try {
      const applied = await window.electronAPI.setOpenAtStartup(next);
      setOpenAtStartupEnabled(Boolean(applied));
    } catch {
      setOpenAtStartupEnabled(previous);
    } finally {
      setIsUpdatingOpenAtStartup(false);
    }
  };

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    localStorage.setItem(SIDEBAR_VISIBILITY_STORAGE_KEY, JSON.stringify(sidebarVisibility));
    window.dispatchEvent(new CustomEvent(SIDEBAR_VISIBILITY_EVENT, { detail: sidebarVisibility }));
  }, [sidebarVisibility, hydrated]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    localStorage.setItem(AUTOCORRECT_ENABLED_STORAGE_KEY, String(autocorrectEnabled));
  }, [autocorrectEnabled, hydrated]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    localStorage.setItem(
      TEAMS_CALL_TRANSCRIPTION_ENABLED_STORAGE_KEY,
      String(teamsCallTranscriptionEnabled)
    );
    window.dispatchEvent(
      new CustomEvent(TEAMS_CALL_TRANSCRIPTION_EVENT, {
        detail: { enabled: teamsCallTranscriptionEnabled },
      })
    );
  }, [teamsCallTranscriptionEnabled, hydrated]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    localStorage.setItem(QUICK_NOTE_ENABLED_STORAGE_KEY, String(quickNoteEnabled));
    localStorage.setItem(QUICK_AI_ENABLED_STORAGE_KEY, String(quickAiEnabled));

    window.dispatchEvent(
      new CustomEvent(QUICK_ACCESS_UPDATED_EVENT, {
        detail: {
          quickNoteEnabled,
          quickAiEnabled,
        },
      })
    );
  }, [quickNoteEnabled, quickAiEnabled, hydrated]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    localStorage.setItem(ARCHIVE_AUTO_DELETE_STORAGE_KEY, archiveAutoDeleteDays);
    window.dispatchEvent(
      new CustomEvent(ARCHIVE_AUTO_DELETE_EVENT, {
        detail: { days: archiveAutoDeleteDays },
      })
    );
  }, [archiveAutoDeleteDays, hydrated]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    localStorage.setItem(THEME_MODE_STORAGE_KEY, themeMode);
    window.dispatchEvent(new CustomEvent(THEME_MODE_EVENT, { detail: { mode: themeMode } }));
  }, [themeMode, hydrated]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    localStorage.setItem(QUICK_NOTE_SHORTCUT_STORAGE_KEY, quickNoteShortcut);
    localStorage.setItem(QUICK_AI_SHORTCUT_STORAGE_KEY, quickAiShortcut);
    window.dispatchEvent(
      new CustomEvent(SHORTCUTS_UPDATED_EVENT, {
        detail: {
          quickNoteShortcut,
          quickAiShortcut,
        },
      })
    );
  }, [quickNoteShortcut, quickAiShortcut, hydrated]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    localStorage.setItem(OPENROUTER_API_KEY_STORAGE_KEY, openRouterApiKey);
    localStorage.setItem(AZURE_FOUNDRY_API_KEY_STORAGE_KEY, azureFoundryApiKey);
    localStorage.setItem(AZURE_FOUNDRY_ENDPOINT_STORAGE_KEY, azureFoundryEndpoint);
    localStorage.setItem(AZURE_SPEECH_KEY_STORAGE_KEY, azureSpeechKey);
    localStorage.setItem(AZURE_SPEECH_REGION_STORAGE_KEY, azureSpeechRegion);
    localStorage.setItem(AZURE_SPEECH_LANGUAGE_STORAGE_KEY, azureSpeechLanguage || "en-US");
  }, [
    openRouterApiKey,
    azureFoundryApiKey,
    azureFoundryEndpoint,
    azureSpeechKey,
    azureSpeechRegion,
    azureSpeechLanguage,
    hydrated,
  ]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center h-11 px-4 border-b border-[#2f2f2f] shrink-0">
        <span className="text-sm text-[#9b9b9b]">Settings</span>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-10 py-8 space-y-8">
          <section className="space-y-3">
            <h2 className="text-lg text-[#e3e3e3] font-medium">Appearance</h2>
            <p className="text-sm text-[#9b9b9b]">Choose app theme.</p>
            <div className="rounded border border-[#2f2f2f] bg-[#1e1e1e] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[#d1d1d1]">Theme</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={themeMode === "light"}
                  aria-label="Toggle light mode"
                  onClick={() => setThemeMode((prev) => (prev === "light" ? "dark" : "light"))}
                  className="inline-flex items-center gap-2 bg-transparent px-0 py-0 text-xs text-[#d1d1d1]"
                >
                  <span className={`${themeMode === "dark" ? "text-[#e3e3e3]" : "text-[#9b9b9b]"}`}>Dark</span>
                  <span className={`h-4 w-8 rounded-full transition-colors ${themeMode === "light" ? "bg-[#7eb8f7]" : "bg-[#3a3a3a]"}`}>
                    <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${themeMode === "light" ? "translate-x-4" : "translate-x-0"}`} />
                  </span>
                  <span className={`${themeMode === "light" ? "text-[#e3e3e3]" : "text-[#9b9b9b]"}`}>Light</span>
                </button>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg text-[#e3e3e3] font-medium">Modules</h2>
            <p className="text-sm text-[#9b9b9b]">Enable or disable modules and sidebar actions.</p>
            <div className="rounded border border-[#2f2f2f] bg-[#1e1e1e] p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(Object.keys(sectionLabels) as SidebarVisibilityKey[]).map((section) => (
                <label key={section} className="flex items-center gap-2 text-sm text-[#d1d1d1] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sidebarVisibility[section]}
                    onChange={() =>
                      setSidebarVisibility((prev) => ({
                        ...prev,
                        [section]: !prev[section],
                      }))
                    }
                    className="h-4 w-4 accent-[#7eb8f7]"
                  />
                  <span>{sectionLabels[section]}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg text-[#e3e3e3] font-medium">Notes</h2>
            <p className="text-sm text-[#9b9b9b]">Note editor preferences.</p>
            <div className="rounded border border-[#2f2f2f] bg-[#1e1e1e] p-4 space-y-3">
              <label className="flex items-center gap-2 text-sm text-[#d1d1d1] cursor-pointer">
                <input
                  type="checkbox"
                  checked={autocorrectEnabled}
                  onChange={() => setAutocorrectEnabled((prev) => !prev)}
                  className="h-4 w-4 accent-[#7eb8f7]"
                />
                <span>Enable autocorrect</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-[#d1d1d1] cursor-pointer">
                <input
                  type="checkbox"
                  checked={teamsCallTranscriptionEnabled}
                  onChange={() => setTeamsCallTranscriptionEnabled((prev) => !prev)}
                  className="h-4 w-4 accent-[#7eb8f7]"
                />
                <span>Enable Teams call transcription & summaries</span>
              </label>

              <div className="space-y-1">
                <label htmlFor="archive-auto-delete" className="text-sm text-[#d1d1d1]">
                  Archive auto-delete
                </label>
                <select
                  id="archive-auto-delete"
                  value={archiveAutoDeleteDays}
                  onChange={(event) => setArchiveAutoDeleteDays(event.target.value as ArchiveAutoDeleteDays)}
                  className="w-full rounded border border-[#2f2f2f] bg-[#191919] px-3 py-2 text-sm text-[#d1d1d1] focus:outline-none focus:ring-1 focus:ring-[#7eb8f7]"
                >
                  <option value="never">Never</option>
                  <option value="1">After 1 day</option>
                  <option value="3">After 3 days</option>
                  <option value="7">After 7 days</option>
                  <option value="30">After 30 days</option>
                  <option value="90">After 90 days</option>
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg text-[#e3e3e3] font-medium">Quick Access</h2>
            <p className="text-sm text-[#9b9b9b]">Control quick windows and their shortcuts.</p>
            <div className="rounded border border-[#2f2f2f] bg-[#1e1e1e] p-4 space-y-3">
              <label className="flex items-center gap-2 text-sm text-[#d1d1d1] cursor-pointer">
                <input
                  type="checkbox"
                  checked={quickNoteEnabled}
                  onChange={() => setQuickNoteEnabled((prev) => !prev)}
                  className="h-4 w-4 accent-[#7eb8f7]"
                />
                <span>Enable Quick Note</span>
              </label>

              <label className="flex items-center gap-2 text-sm text-[#d1d1d1] cursor-pointer">
                <input
                  type="checkbox"
                  checked={quickAiEnabled}
                  onChange={() => setQuickAiEnabled((prev) => !prev)}
                  className="h-4 w-4 accent-[#7eb8f7]"
                />
                <span>Enable Quick AI Chat</span>
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg text-[#e3e3e3] font-medium">System</h2>
            <p className="text-sm text-[#9b9b9b]">System-level behavior and startup preferences.</p>
            <div className="rounded border border-[#2f2f2f] bg-[#1e1e1e] p-4 space-y-3">
              {window.electronAPI?.platform === "win32" && (
                <label className={`flex items-center gap-2 text-sm text-[#d1d1d1] ${isUpdatingOpenAtStartup ? "opacity-70 cursor-wait" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    checked={openAtStartupEnabled}
                    disabled={isUpdatingOpenAtStartup}
                    onChange={() => {
                      void handleToggleOpenAtStartup();
                    }}
                    className="h-4 w-4 accent-[#7eb8f7]"
                  />
                  <span>Open Vault on Windows startup</span>
                </label>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg text-[#e3e3e3] font-medium">API Keys</h2>
            <p className="text-sm text-[#9b9b9b]">Manage credentials for AI chat and live transcription.</p>
            <div className="rounded border border-[#2f2f2f] bg-[#1e1e1e] p-4 space-y-4">
              <p className="text-xs text-[#8b8b8b]">
                AI Chats use either Azure Foundry or OpenRouter — only one needs to be configured. Live transcription requires Azure Speech.
              </p>

              <div className="space-y-1">
                <label htmlFor="openrouter-api-key" className="text-sm text-[#d1d1d1]">
                  OpenRouter API key
                </label>
                <input
                  id="openrouter-api-key"
                  type="password"
                  autoComplete="off"
                  value={openRouterApiKey}
                  onChange={(event) => setOpenRouterApiKey(event.target.value)}
                  placeholder="sk-or-..."
                  className="w-full rounded border border-[#2f2f2f] bg-[#191919] px-3 py-2 text-sm text-[#d1d1d1] focus:outline-none focus:ring-1 focus:ring-[#7eb8f7]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="azure-foundry-api-key" className="text-sm text-[#d1d1d1]">
                    Azure Foundry API key
                  </label>
                  <input
                    id="azure-foundry-api-key"
                    type="password"
                    autoComplete="off"
                    value={azureFoundryApiKey}
                    onChange={(event) => setAzureFoundryApiKey(event.target.value)}
                    placeholder="Azure Foundry key"
                    className="w-full rounded border border-[#2f2f2f] bg-[#191919] px-3 py-2 text-sm text-[#d1d1d1] focus:outline-none focus:ring-1 focus:ring-[#7eb8f7]"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="azure-foundry-endpoint" className="text-sm text-[#d1d1d1]">
                    Azure Foundry endpoint
                  </label>
                  <input
                    id="azure-foundry-endpoint"
                    type="text"
                    value={azureFoundryEndpoint}
                    onChange={(event) => setAzureFoundryEndpoint(event.target.value)}
                    placeholder="https://your-endpoint.models.ai.azure.com"
                    className="w-full rounded border border-[#2f2f2f] bg-[#191919] px-3 py-2 text-sm text-[#d1d1d1] focus:outline-none focus:ring-1 focus:ring-[#7eb8f7]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="azure-speech-key" className="text-sm text-[#d1d1d1]">
                  Azure Speech key
                </label>
                <input
                  id="azure-speech-key"
                  type="password"
                  autoComplete="off"
                  value={azureSpeechKey}
                  onChange={(event) => setAzureSpeechKey(event.target.value)}
                  placeholder="Azure Speech key"
                  className="w-full rounded border border-[#2f2f2f] bg-[#191919] px-3 py-2 text-sm text-[#d1d1d1] focus:outline-none focus:ring-1 focus:ring-[#7eb8f7]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="azure-speech-region" className="text-sm text-[#d1d1d1]">
                    Azure Speech region
                  </label>
                  <input
                    id="azure-speech-region"
                    type="text"
                    value={azureSpeechRegion}
                    onChange={(event) => setAzureSpeechRegion(event.target.value)}
                    placeholder="eastus"
                    className="w-full rounded border border-[#2f2f2f] bg-[#191919] px-3 py-2 text-sm text-[#d1d1d1] focus:outline-none focus:ring-1 focus:ring-[#7eb8f7]"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="azure-speech-language" className="text-sm text-[#d1d1d1]">
                    Transcription language
                  </label>
                  <input
                    id="azure-speech-language"
                    type="text"
                    value={azureSpeechLanguage}
                    onChange={(event) => setAzureSpeechLanguage(event.target.value || "en-US")}
                    placeholder="en-US"
                    className="w-full rounded border border-[#2f2f2f] bg-[#191919] px-3 py-2 text-sm text-[#d1d1d1] focus:outline-none focus:ring-1 focus:ring-[#7eb8f7]"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg text-[#e3e3e3] font-medium">Keyboard Shortcuts</h2>
            <p className="text-sm text-[#9b9b9b]">Click a field and press the key combo you want to use.</p>
            <div className="rounded border border-[#2f2f2f] bg-[#1e1e1e] p-4 space-y-4">
              <div className="space-y-1">
                <label htmlFor="quick-note-shortcut" className="text-sm text-[#d1d1d1]">
                  Quick Note
                </label>
                <input
                  id="quick-note-shortcut"
                  type="text"
                  readOnly
                  value={quickNoteShortcut}
                  disabled={!quickNoteEnabled}
                  onKeyDown={(event) => {
                    event.preventDefault();
                    const shortcut = formatShortcutFromEvent(event);
                    if (shortcut) {
                      setQuickNoteShortcut(shortcut);
                    }
                  }}
                  className="w-full rounded border border-[#2f2f2f] bg-[#191919] px-3 py-2 text-sm text-[#d1d1d1] focus:outline-none focus:ring-1 focus:ring-[#7eb8f7] disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="quick-ai-shortcut" className="text-sm text-[#d1d1d1]">
                  Quick AI Chat
                </label>
                <input
                  id="quick-ai-shortcut"
                  type="text"
                  readOnly
                  value={quickAiShortcut}
                  disabled={!quickAiEnabled}
                  onKeyDown={(event) => {
                    event.preventDefault();
                    const shortcut = formatShortcutFromEvent(event);
                    if (shortcut) {
                      setQuickAiShortcut(shortcut);
                    }
                  }}
                  className="w-full rounded border border-[#2f2f2f] bg-[#191919] px-3 py-2 text-sm text-[#d1d1d1] focus:outline-none focus:ring-1 focus:ring-[#7eb8f7] disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setQuickNoteShortcut(DEFAULT_QUICK_NOTE_SHORTCUT);
                    setQuickAiShortcut(DEFAULT_QUICK_AI_SHORTCUT);
                  }}
                  className="rounded border border-[#2f2f2f] bg-[#222] px-3 py-1.5 text-xs text-[#d1d1d1] hover:bg-[#2a2a2a]"
                >
                  Reset to defaults
                </button>
              </div>
            </div>
          </section>

          <p className="text-sm text-[#9b9b9b]">Vault {appVersion}</p>
        </div>
      </div>
    </div>
  );
}
