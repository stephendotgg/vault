"use client";

import { useEffect, useState } from "react";

type SectionKey = "notes" | "vault" | "memories" | "dreamJournal" | "voiceLog";
type SidebarVisibilityKey = SectionKey | "fileCleaner";

type SidebarVisibilityState = Record<SidebarVisibilityKey, boolean>;

const SIDEBAR_VISIBILITY_STORAGE_KEY = "sidebar-visible-sections";
const SIDEBAR_VISIBILITY_EVENT = "vault-sidebar-visibility-updated";
const AUTOCORRECT_ENABLED_STORAGE_KEY = "vault-setting-autocorrect-enabled";
const THEME_MODE_STORAGE_KEY = "vault-theme-mode";
const THEME_MODE_EVENT = "vault-theme-updated";
const QUICK_NOTE_SHORTCUT_STORAGE_KEY = "vault-shortcut-quick-note";
const QUICK_AI_SHORTCUT_STORAGE_KEY = "vault-shortcut-quick-ai";
const SHORTCUTS_UPDATED_EVENT = "vault-shortcuts-updated";
const OPENROUTER_API_KEY_STORAGE_KEY = "vault-openrouter-api-key";
const LEGACY_OPENROUTER_API_KEY_STORAGE_KEY = "mothership-openrouter-api-key";
const AZURE_SPEECH_KEY_STORAGE_KEY = "vault-azure-speech-key";
const LEGACY_AZURE_SPEECH_KEY_STORAGE_KEY = "mothership-azure-speech-key";
const AZURE_SPEECH_REGION_STORAGE_KEY = "vault-azure-speech-region";
const LEGACY_AZURE_SPEECH_REGION_STORAGE_KEY = "mothership-azure-speech-region";
const AZURE_SPEECH_LANGUAGE_STORAGE_KEY = "vault-azure-speech-language";
const LEGACY_AZURE_SPEECH_LANGUAGE_STORAGE_KEY = "mothership-azure-speech-language";

const DEFAULT_QUICK_NOTE_SHORTCUT = "Ctrl+Q";
const DEFAULT_QUICK_AI_SHORTCUT = "Ctrl+Space";

type ShortcutKeyboardEvent = Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

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
  vault: false,
  memories: false,
  dreamJournal: false,
  voiceLog: false,
  fileCleaner: true,
};

const sectionLabels: Record<SidebarVisibilityKey, string> = {
  notes: "Notes",
  vault: "Vault",
  memories: "Memories",
  dreamJournal: "Dream Journal",
  voiceLog: "Voice Log",
  fileCleaner: "File Cleaner",
};

export function SettingsView() {
  const [sidebarVisibility, setSidebarVisibility] = useState<SidebarVisibilityState>(defaultSidebarVisibility);
  const [autocorrectEnabled, setAutocorrectEnabled] = useState(true);
  const [themeMode, setThemeMode] = useState<"dark" | "light">("dark");
  const [quickNoteShortcut, setQuickNoteShortcut] = useState(DEFAULT_QUICK_NOTE_SHORTCUT);
  const [quickAiShortcut, setQuickAiShortcut] = useState(DEFAULT_QUICK_AI_SHORTCUT);
  const [openRouterApiKey, setOpenRouterApiKey] = useState("");
  const [azureSpeechKey, setAzureSpeechKey] = useState("");
  const [azureSpeechRegion, setAzureSpeechRegion] = useState("");
  const [azureSpeechLanguage, setAzureSpeechLanguage] = useState("en-US");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const savedSidebar = localStorage.getItem(SIDEBAR_VISIBILITY_STORAGE_KEY);
    if (savedSidebar) {
      try {
        const parsed = JSON.parse(savedSidebar) as Partial<SidebarVisibilityState>;
        setSidebarVisibility({ ...defaultSidebarVisibility, ...parsed });
      } catch {
        setSidebarVisibility(defaultSidebarVisibility);
      }
    }

    const savedAutocorrectEnabled = localStorage.getItem(AUTOCORRECT_ENABLED_STORAGE_KEY);
    setAutocorrectEnabled(savedAutocorrectEnabled !== "false");

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
    localStorage.setItem(AZURE_SPEECH_KEY_STORAGE_KEY, azureSpeechKey);
    localStorage.setItem(AZURE_SPEECH_REGION_STORAGE_KEY, azureSpeechRegion);
    localStorage.setItem(AZURE_SPEECH_LANGUAGE_STORAGE_KEY, azureSpeechLanguage || "en-US");
  }, [openRouterApiKey, azureSpeechKey, azureSpeechRegion, azureSpeechLanguage, hydrated]);

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
            <h2 className="text-lg text-[#e3e3e3] font-medium">Sidebar</h2>
            <p className="text-sm text-[#9b9b9b]">Choose which sections and actions appear in the sidebar.</p>
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
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg text-[#e3e3e3] font-medium">API Keys</h2>
            <p className="text-sm text-[#9b9b9b]">Manage credentials for AI chat and live transcription.</p>
            <div className="rounded border border-[#2f2f2f] bg-[#1e1e1e] p-4 space-y-4">
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
                  onKeyDown={(event) => {
                    event.preventDefault();
                    const shortcut = formatShortcutFromEvent(event);
                    if (shortcut) {
                      setQuickNoteShortcut(shortcut);
                    }
                  }}
                  className="w-full rounded border border-[#2f2f2f] bg-[#191919] px-3 py-2 text-sm text-[#d1d1d1] focus:outline-none focus:ring-1 focus:ring-[#7eb8f7]"
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
                  onKeyDown={(event) => {
                    event.preventDefault();
                    const shortcut = formatShortcutFromEvent(event);
                    if (shortcut) {
                      setQuickAiShortcut(shortcut);
                    }
                  }}
                  className="w-full rounded border border-[#2f2f2f] bg-[#191919] px-3 py-2 text-sm text-[#d1d1d1] focus:outline-none focus:ring-1 focus:ring-[#7eb8f7]"
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
        </div>
      </div>
    </div>
  );
}
