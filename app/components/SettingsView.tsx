"use client";

import { useEffect, useState } from "react";

type SectionKey = "notes" | "vault" | "memories" | "dreamJournal" | "voiceLog";
type SidebarVisibilityKey = SectionKey | "fileCleaner";

type SidebarVisibilityState = Record<SidebarVisibilityKey, boolean>;

const SIDEBAR_VISIBILITY_STORAGE_KEY = "sidebar-visible-sections";
const SIDEBAR_VISIBILITY_EVENT = "vault-sidebar-visibility-updated";
const AUTOCORRECT_ENABLED_STORAGE_KEY = "vault-setting-autocorrect-enabled";

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
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_VISIBILITY_STORAGE_KEY, JSON.stringify(sidebarVisibility));
    window.dispatchEvent(new CustomEvent(SIDEBAR_VISIBILITY_EVENT, { detail: sidebarVisibility }));
  }, [sidebarVisibility]);

  useEffect(() => {
    localStorage.setItem(AUTOCORRECT_ENABLED_STORAGE_KEY, String(autocorrectEnabled));
  }, [autocorrectEnabled]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center h-11 px-4 border-b border-[#2f2f2f] shrink-0">
        <span className="text-sm text-[#9b9b9b]">Settings</span>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-10 py-8 space-y-8">
          <div className="border-b border-[#2f2f2f] pb-3">
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded bg-[#2a2a2a] text-[#e3e3e3] border border-[#3a3a3a]"
            >
              Notes
            </button>
          </div>

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
        </div>
      </div>
    </div>
  );
}
