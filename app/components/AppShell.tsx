"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Sidebar } from "./Sidebar";
import { NoteEditor, ChatMessage } from "./NoteEditor";
import { ListsView } from "./ListsView";
import { ListsAddModal } from "./ListsAddModal";
import { MemoriesView } from "./MemoriesView";
import { MemoryAddModal } from "./MemoryAddModal";
import { ArchiveView } from "./ArchiveView";
import { FileCleanerView } from "./FileCleanerView";
import { AIView } from "./AIView";
import { SearchModal } from "./SearchModal";
import { SettingsView } from "./SettingsView";
import { Note, ListItem, Occasion } from "@/types/models";
import { runStartupMigrations } from "@/lib/startupMigrations";

type ViewType = "home" | "note" | "lists" | "memories" | "archive" | "fileCleaner" | "ai" | "settings";

const THEME_MODE_STORAGE_KEY = "vault-theme-mode";
const THEME_MODE_EVENT = "vault-theme-updated";
const QUICK_NOTE_SHORTCUT_STORAGE_KEY = "vault-shortcut-quick-note";
const QUICK_AI_SHORTCUT_STORAGE_KEY = "vault-shortcut-quick-ai";
const SHORTCUTS_UPDATED_EVENT = "vault-shortcuts-updated";
const QUICK_NOTE_ENABLED_STORAGE_KEY = "vault-setting-quick-note-enabled";
const QUICK_AI_ENABLED_STORAGE_KEY = "vault-setting-quick-ai-enabled";
const QUICK_ACCESS_UPDATED_EVENT = "vault-quick-access-updated";
const ARCHIVE_AUTO_DELETE_STORAGE_KEY = "vault-setting-archive-auto-delete-days";
const ARCHIVE_AUTO_DELETE_EVENT = "vault-archive-auto-delete-updated";
const SPREADSHEET_CONTENT_PREFIX = "vault:sheet:v1:";
const DEFAULT_QUICK_NOTE_SHORTCUT = "Ctrl+Q";
const DEFAULT_QUICK_AI_SHORTCUT = "Ctrl+Space";
const ARCHIVE_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

type ArchiveAutoDeleteDays = "never" | "1" | "3" | "7" | "30" | "90";

type ShortcutBinding = {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
};

function applyThemeMode(mode: "dark" | "light") {
  document.documentElement.setAttribute("data-theme", mode);
}

function normalizeShortcutKey(key: string): string {
  if (key === " ") return "space";
  if (key.length === 1) return key.toLowerCase();
  return key.toLowerCase();
}

function parseShortcut(shortcut: string): ShortcutBinding | null {
  const pieces = shortcut
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);

  if (pieces.length === 0) {
    return null;
  }

  const binding: ShortcutBinding = {
    key: "",
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  };

  for (const piece of pieces) {
    const token = piece.toLowerCase();
    if (token === "ctrl" || token === "control") {
      binding.ctrl = true;
      continue;
    }
    if (token === "alt" || token === "option") {
      binding.alt = true;
      continue;
    }
    if (token === "shift") {
      binding.shift = true;
      continue;
    }
    if (token === "meta" || token === "cmd" || token === "command") {
      binding.meta = true;
      continue;
    }

    binding.key = normalizeShortcutKey(token === "spacebar" ? "space" : token);
  }

  if (!binding.key) {
    return null;
  }

  return binding;
}

function matchesShortcut(event: KeyboardEvent, binding: ShortcutBinding | null): boolean {
  if (!binding) {
    return false;
  }

  return (
    normalizeShortcutKey(event.key) === binding.key &&
    event.ctrlKey === binding.ctrl &&
    event.altKey === binding.alt &&
    event.shiftKey === binding.shift &&
    event.metaKey === binding.meta
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || Boolean(element?.isContentEditable);
}

function isSpreadsheetNoteLike(noteLike: Pick<Note, "icon" | "content">): boolean {
  return noteLike.icon === "sheet" || noteLike.icon === "📊" || noteLike.content.startsWith(SPREADSHEET_CONTENT_PREFIX);
}

function HomeNoteIcon({ icon, hasContent, content = "" }: { icon: string; hasContent: boolean; content?: string }) {
  if (icon.startsWith("icon:")) {
    const filename = icon.substring(5);
    return <img src={`/api/icons/${filename}`} alt="" className="w-4 h-4 shrink-0 rounded-sm object-cover" />;
  }

  const isSpreadsheetIcon = isSpreadsheetNoteLike({ icon, content });
  if (isSpreadsheetIcon) {
    if (hasContent) {
      return (
        <svg className="w-4 h-4 shrink-0 text-[#9b9b9b]" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="3" width="18" height="18" rx="2.5" ry="2.5" />
        </svg>
      );
    }

    return (
      <svg className="w-4 h-4 shrink-0 text-[#6b6b6b]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2.5" ry="2.5" />
      </svg>
    );
  }

  if (icon && icon !== "📄" && icon !== "sheet" && icon !== "📊") {
    return (
      <span
        className="w-4 h-4 shrink-0 text-sm leading-none flex items-center justify-center text-[#ebebeb]"
        style={{ fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif' }}
      >
        {icon}
      </span>
    );
  }

  if (hasContent) {
    return (
      <svg className="w-4 h-4 shrink-0 text-[#9b9b9b]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
      </svg>
    );
  }

  return (
    <svg className="w-4 h-4 shrink-0 text-[#6b6b6b]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
      <polyline points="14,2 14,8 20,8" />
    </svg>
  );
}

function getDescendantNoteIds(notes: Note[], rootId: string): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const note of notes) {
    if (!note.parentId) continue;
    const existing = childrenByParent.get(note.parentId) ?? [];
    existing.push(note.id);
    childrenByParent.set(note.parentId, existing);
  }

  const ids = new Set<string>();
  const queue = [rootId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || ids.has(current)) continue;
    ids.add(current);

    const children = childrenByParent.get(current) ?? [];
    queue.push(...children);
  }

  return [...ids];
}

export function AppShell() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [listItems, setListItems] = useState<ListItem[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>("home");
  const [selectedOccasionId, setSelectedOccasionId] = useState<string | null>(null);
  const [selectedArchivedNoteId, setSelectedArchivedNoteId] = useState<string | null>(null);
  const [isListsModalOpen, setIsListsModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [migrationsReady, setMigrationsReady] = useState(false);
  const [quickNoteShortcut, setQuickNoteShortcut] = useState(DEFAULT_QUICK_NOTE_SHORTCUT);
  const [quickAiShortcut, setQuickAiShortcut] = useState(DEFAULT_QUICK_AI_SHORTCUT);
  const [quickNoteEnabled, setQuickNoteEnabled] = useState(true);
  const [quickAiEnabled, setQuickAiEnabled] = useState(true);
  const [archiveAutoDeleteDays, setArchiveAutoDeleteDays] = useState<ArchiveAutoDeleteDays>("never");
  const archiveCleanupInProgressRef = useRef(false);

  // AI Chat state - persisted across note switches
  const [chatOpenStates, setChatOpenStates] = useState<Map<string, boolean>>(new Map());
  const [allChatMessages, setAllChatMessages] = useState<Map<string, ChatMessage[]>>(new Map());

  // Load saved state from localStorage after hydration
  useEffect(() => {
    const { appliedMigrations } = runStartupMigrations();
    if (appliedMigrations.length > 0) {
      console.info("[startup-migrations] applied", appliedMigrations);
    }

    const savedThemeMode = localStorage.getItem(THEME_MODE_STORAGE_KEY);
    if (savedThemeMode === "light" || savedThemeMode === "dark") {
      applyThemeMode(savedThemeMode);
    } else {
      applyThemeMode("dark");
    }

    const handleThemeUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ mode?: "dark" | "light" }>;
      const mode = customEvent.detail?.mode;
      if (mode === "light" || mode === "dark") {
        applyThemeMode(mode);
      }
    };

    window.addEventListener(THEME_MODE_EVENT, handleThemeUpdated as EventListener);
    setMigrationsReady(true);

    return () => {
      window.removeEventListener(THEME_MODE_EVENT, handleThemeUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    const savedNoteId = localStorage.getItem("selected-note-id");
    const savedView = localStorage.getItem("current-view") as ViewType | null;
    const savedOccasionId = localStorage.getItem("selected-occasion-id");
    const savedQuickNoteShortcut = localStorage.getItem(QUICK_NOTE_SHORTCUT_STORAGE_KEY);
    const savedQuickAiShortcut = localStorage.getItem(QUICK_AI_SHORTCUT_STORAGE_KEY);
    const savedQuickNoteEnabled = localStorage.getItem(QUICK_NOTE_ENABLED_STORAGE_KEY);
    const savedQuickAiEnabled = localStorage.getItem(QUICK_AI_ENABLED_STORAGE_KEY);
    const savedArchiveAutoDeleteDays = localStorage.getItem(ARCHIVE_AUTO_DELETE_STORAGE_KEY);
    
    if (savedView) {
      setCurrentView(savedView);
    }
    if (savedNoteId) {
      setSelectedNoteId(savedNoteId);
    }
    if (savedOccasionId) {
      setSelectedOccasionId(savedOccasionId);
    }
    if (savedQuickNoteShortcut?.trim()) {
      setQuickNoteShortcut(savedQuickNoteShortcut);
    }
    if (savedQuickAiShortcut?.trim()) {
      setQuickAiShortcut(savedQuickAiShortcut);
    }
    setQuickNoteEnabled(savedQuickNoteEnabled !== "false");
    setQuickAiEnabled(savedQuickAiEnabled !== "false");
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
    setHydrated(true);
  }, []);

  useEffect(() => {
    const handleShortcutsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ quickNoteShortcut?: string; quickAiShortcut?: string }>;
      const nextQuickNoteShortcut = customEvent.detail?.quickNoteShortcut;
      const nextQuickAiShortcut = customEvent.detail?.quickAiShortcut;

      if (nextQuickNoteShortcut?.trim()) {
        setQuickNoteShortcut(nextQuickNoteShortcut);
      }
      if (nextQuickAiShortcut?.trim()) {
        setQuickAiShortcut(nextQuickAiShortcut);
      }
    };

    window.addEventListener(SHORTCUTS_UPDATED_EVENT, handleShortcutsUpdated as EventListener);
    return () => {
      window.removeEventListener(SHORTCUTS_UPDATED_EVENT, handleShortcutsUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleArchiveAutoDeleteUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ days?: ArchiveAutoDeleteDays }>;
      const nextDays = customEvent.detail?.days;
      if (
        nextDays === "never" ||
        nextDays === "1" ||
        nextDays === "3" ||
        nextDays === "7" ||
        nextDays === "30" ||
        nextDays === "90"
      ) {
        setArchiveAutoDeleteDays(nextDays);
      }
    };

    window.addEventListener(ARCHIVE_AUTO_DELETE_EVENT, handleArchiveAutoDeleteUpdated as EventListener);
    return () => {
      window.removeEventListener(ARCHIVE_AUTO_DELETE_EVENT, handleArchiveAutoDeleteUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleQuickAccessUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ quickNoteEnabled?: boolean; quickAiEnabled?: boolean }>;
      const nextQuickNoteEnabled = customEvent.detail?.quickNoteEnabled;
      const nextQuickAiEnabled = customEvent.detail?.quickAiEnabled;

      if (typeof nextQuickNoteEnabled === "boolean") {
        setQuickNoteEnabled(nextQuickNoteEnabled);
      }
      if (typeof nextQuickAiEnabled === "boolean") {
        setQuickAiEnabled(nextQuickAiEnabled);
      }
    };

    window.addEventListener(QUICK_ACCESS_UPDATED_EVENT, handleQuickAccessUpdated as EventListener);
    return () => {
      window.removeEventListener(QUICK_ACCESS_UPDATED_EVENT, handleQuickAccessUpdated as EventListener);
    };
  }, []);

  // Persist state to localStorage
  useEffect(() => {
    if (hydrated) {
      localStorage.setItem("current-view", currentView);
      
      if (selectedNoteId) {
        localStorage.setItem("selected-note-id", selectedNoteId);
      } else {
        localStorage.removeItem("selected-note-id");
      }
      
      if (selectedOccasionId) {
        localStorage.setItem("selected-occasion-id", selectedOccasionId);
      } else {
        localStorage.removeItem("selected-occasion-id");
      }
    }
  }, [currentView, selectedNoteId, selectedOccasionId, hydrated]);

  // Fetch all notes (including archived)
  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch("/api/notes?includeArchived=true");
      if (res.ok) {
        const data = await res.json();
        setNotes(data);
      }
    } catch (error) {
      console.error("Failed to fetch notes:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const runArchiveAutoDeleteCleanup = useCallback(async () => {
    if (archiveAutoDeleteDays === "never" || archiveCleanupInProgressRef.current) {
      return;
    }

    const days = Number(archiveAutoDeleteDays);
    if (!Number.isFinite(days) || days <= 0) {
      return;
    }

    archiveCleanupInProgressRef.current = true;

    try {
      const notesResponse = await fetch("/api/notes?includeArchived=true");
      if (!notesResponse.ok) {
        return;
      }

      const allNotes = (await notesResponse.json()) as Note[];
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

      const eligible = allNotes.filter((note) => {
        if (!note.archived) {
          return false;
        }

        const updatedAt = new Date(note.updatedAt).getTime();
        return Number.isFinite(updatedAt) && updatedAt <= cutoff;
      });

      if (eligible.length === 0) {
        return;
      }

      const eligibleIds = new Set(eligible.map((note) => note.id));
      const rootIds = eligible
        .filter((note) => !note.parentId || !eligibleIds.has(note.parentId))
        .map((note) => note.id);

      if (rootIds.length === 0) {
        return;
      }

      await Promise.all(
        rootIds.map((id) =>
          fetch(`/api/notes/${id}`, {
            method: "DELETE",
          })
        )
      );

      if (selectedArchivedNoteId && eligibleIds.has(selectedArchivedNoteId)) {
        setSelectedArchivedNoteId(null);
      }

      await fetchNotes();
    } catch (error) {
      console.error("Failed to run archive auto-delete cleanup:", error);
    } finally {
      archiveCleanupInProgressRef.current = false;
    }
  }, [archiveAutoDeleteDays, fetchNotes, selectedArchivedNoteId]);

  // Fetch all list items
  const fetchListItems = useCallback(async () => {
    try {
      const res = await fetch("/api/lists");
      if (res.ok) {
        const data = await res.json();
        setListItems(data);
      }
    } catch (error) {
      console.error("Failed to fetch list items:", error);
    }
  }, []);

  // Fetch all occasions with memories
  const fetchOccasions = useCallback(async () => {
    try {
      const res = await fetch("/api/occasions");
      if (res.ok) {
        const data = await res.json();
        setOccasions(data);
      }
    } catch (error) {
      console.error("Failed to fetch occasions:", error);
    }
  }, []);

  useEffect(() => {
    fetchNotes();
    fetchListItems();
    fetchOccasions();
  }, [fetchNotes, fetchListItems, fetchOccasions]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    void runArchiveAutoDeleteCleanup();

    const intervalId = window.setInterval(() => {
      void runArchiveAutoDeleteCleanup();
    }, ARCHIVE_CLEANUP_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hydrated, runArchiveAutoDeleteCleanup]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const payload = {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        error: event.error,
      };

      console.error("[RENDERER ERROR]", payload);
      window.electronAPI?.reportRendererRuntimeError?.({ type: "error", payload });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("[RENDERER UNHANDLED REJECTION]", event.reason);
      window.electronAPI?.reportRendererRuntimeError?.({
        type: "unhandledrejection",
        reason: event.reason,
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  // Create new note (optionally as a child)
  const handleCreateNote = useCallback(async (parentId?: string, kind: "note" | "spreadsheet" = "note") => {
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: parentId || null, kind }),
      });

      if (res.ok) {
        const newNote = await res.json();
        setNotes((prev) => [...prev, newNote]);
        setSelectedNoteId(newNote.id);
        setCurrentView("note");
      }
    } catch (error) {
      console.error("Failed to create note:", error);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onGlobalNewNote?.(() => {
      void handleCreateNote();
    });

    return () => {
      unsubscribe?.();
    };
  }, [handleCreateNote]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onQuickNotesChanged?.(() => {
      void fetchNotes();
    });

    return () => {
      unsubscribe?.();
    };
  }, [fetchNotes]);

  useEffect(() => {
    const quickNoteBinding = parseShortcut(quickNoteShortcut);
    const quickAiBinding = parseShortcut(quickAiShortcut);

    const handleShortcut = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (matchesShortcut(event, quickNoteBinding)) {
        if (!quickNoteEnabled) {
          return;
        }
        event.preventDefault();
        if (window.electronAPI?.openQuickNote) {
          window.electronAPI.openQuickNote();
        } else {
          void handleCreateNote();
        }
        return;
      }

      if (matchesShortcut(event, quickAiBinding)) {
        if (!quickAiEnabled) {
          return;
        }
        event.preventDefault();
        if (window.electronAPI?.openQuickAi) {
          window.electronAPI.openQuickAi();
        } else {
          setCurrentView("ai");
        }
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [handleCreateNote, quickAiEnabled, quickAiShortcut, quickNoteEnabled, quickNoteShortcut]);

  // Select note
  const handleSelectNote = async (id: string) => {
    setSelectedNoteId(id);
    setCurrentView("note");

    try {
      const res = await fetch(`/api/notes/${id}`);
      if (!res.ok) {
        return;
      }

      const refreshed = await res.json();
      setNotes((prev) => prev.map((note) => (note.id === id ? refreshed : note)));
    } catch (error) {
      console.error("Failed to refresh selected note:", error);
    }
  };

  // Open lists view
  const handleOpenLists = () => {
    setSelectedNoteId(null);
    setCurrentView("lists");
  };

  // Compute available tags for lists by usage count
  const availableListTags = (() => {
    const tagCounts = new Map<string, number>();
    listItems.forEach((item) => {
      if (item.tags) {
        item.tags.split(",").forEach((t) => {
          const trimmed = t.trim().toLowerCase();
          if (trimmed) {
            tagCounts.set(trimmed, (tagCounts.get(trimmed) || 0) + 1);
          }
        });
      }
    });

    return [...tagCounts.keys()].sort((a, b) => {
      const countDiff = (tagCounts.get(b) || 0) - (tagCounts.get(a) || 0);
      if (countDiff !== 0) {
        return countDiff;
      }

      return a.localeCompare(b);
    });
  })();

  // Open lists add modal
  const [listsModalMode, setListsModalMode] = useState<"add" | "edit">("add");
  const [listsModalEditingItemId, setListsModalEditingItemId] = useState<string | null>(null);
  const [listsModalInitialKey, setListsModalInitialKey] = useState<string | undefined>(undefined);
  const [listsModalInitialValue, setListsModalInitialValue] = useState<string | undefined>(undefined);
  const [listsModalInitialTags, setListsModalInitialTags] = useState<string | undefined>(undefined);
  const [listsModalInitialTag, setListsModalInitialTag] = useState<string | undefined>(undefined);
  const handleOpenListsAddModal = (tag?: string) => {
    setListsModalMode("add");
    setListsModalEditingItemId(null);
    setListsModalInitialKey(undefined);
    setListsModalInitialValue(undefined);
    setListsModalInitialTags(undefined);
    setListsModalInitialTag(tag);
    setIsListsModalOpen(true);
  };

  const handleOpenListsEditModal = (item: ListItem) => {
    setListsModalMode("edit");
    setListsModalEditingItemId(item.id);
    setListsModalInitialKey(item.key);
    setListsModalInitialValue(item.value || "");
    setListsModalInitialTags(item.tags || "");
    setListsModalInitialTag(undefined);
    setIsListsModalOpen(true);
  };

  // Update note in list
  const handleUpdateNote = (updatedNote: Note) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === updatedNote.id ? updatedNote : n))
    );
  };

  // Archive note (hide without deleting) - if note is empty, delete instead
  const handleArchiveNote = async (id: string) => {
    const note = notes.find((n) => n.id === id);
    const descendantIds = getDescendantNoteIds(notes, id);
    const descendantIdSet = new Set(descendantIds);
    const hasChildren = descendantIds.length > 1;
    const isEmpty = note && 
      (note.title === "" || note.title === "Untitled") && 
      (note.content === "" || note.content === "<p></p>");
    
    if (isEmpty && !hasChildren) {
      // Delete empty notes instead of archiving
      try {
        const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
        if (res.ok) {
          setNotes((prev) => prev.filter((n) => n.id !== id));
          if (selectedNoteId === id) {
            setSelectedNoteId(null);
            setCurrentView("home");
          }
        }
      } catch (error) {
        console.error("Failed to delete empty note:", error);
      }
      return;
    }

    try {
      const archivedRootOrders = notes
        .filter((n) => n.archived && n.parentId === null && !descendantIdSet.has(n.id))
        .map((n) => n.order);
      let nextArchiveRootOrder = archivedRootOrders.length > 0 ? Math.min(...archivedRootOrders) - 1 : 0;

      const archivePatchById = new Map<
        string,
        { archived: true; parentId?: null; order?: number }
      >();

      for (const noteId of descendantIds) {
        const current = notes.find((entry) => entry.id === noteId);
        const willBeOrphaned = Boolean(current?.parentId && !descendantIdSet.has(current.parentId));

        if (willBeOrphaned) {
          archivePatchById.set(noteId, {
            archived: true,
            parentId: null,
            order: nextArchiveRootOrder++,
          });
        } else {
          archivePatchById.set(noteId, { archived: true });
        }
      }

      await Promise.all(
        descendantIds.map((noteId) =>
          fetch(`/api/notes/${noteId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(archivePatchById.get(noteId) ?? { archived: true }),
          })
        )
      );

      setNotes((prev) =>
        prev.map((n) => {
          const patch = archivePatchById.get(n.id);
          if (!patch) {
            return n;
          }

          return {
            ...n,
            archived: true,
            ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}),
            ...(patch.order !== undefined ? { order: patch.order } : {}),
          };
        })
      );

      if (selectedNoteId && descendantIds.includes(selectedNoteId)) {
        setSelectedNoteId(null);
        setCurrentView("home");
      }

      void fetchNotes();
    } catch (error) {
      console.error("Failed to archive note:", error);
    }
  };

  // Restore note from archive
  const handleRestoreNote = async (id: string) => {
    const descendantIds = getDescendantNoteIds(notes, id);

    try {
      const activeRootOrders = notes
        .filter((entry) => !entry.archived && entry.parentId === null && !descendantIds.includes(entry.id))
        .map((entry) => entry.order);
      const rootRestoreIds = descendantIds.filter((noteId) => {
        const current = notes.find((entry) => entry.id === noteId);
        return Boolean(current && current.parentId === null);
      });

      let nextRestoreRootOrder =
        activeRootOrders.length > 0 ? Math.min(...activeRootOrders) - rootRestoreIds.length : 0;

      const restorePatchById = new Map<string, { archived: false; order?: number }>();
      for (const noteId of descendantIds) {
        const current = notes.find((entry) => entry.id === noteId);
        if (current?.parentId === null) {
          restorePatchById.set(noteId, { archived: false, order: nextRestoreRootOrder++ });
        } else {
          restorePatchById.set(noteId, { archived: false });
        }
      }

      await Promise.all(
        descendantIds.map((noteId) =>
          fetch(`/api/notes/${noteId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(restorePatchById.get(noteId) ?? { archived: false }),
          })
        )
      );

      setNotes((prev) =>
        prev.map((n) => {
          const patch = restorePatchById.get(n.id);
          if (!patch) {
            return n;
          }

          return {
            ...n,
            archived: false,
            ...(patch.order !== undefined ? { order: patch.order } : {}),
          };
        })
      );

      if (selectedArchivedNoteId && descendantIds.includes(selectedArchivedNoteId)) {
        setSelectedArchivedNoteId(null);
      }

      void fetchNotes();
    } catch (error) {
      console.error("Failed to restore note:", error);
    }
  };

  // Delete note permanently
  const handleDeletePermanently = async (id: string) => {
    const descendantIds = getDescendantNoteIds(notes, id);

    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setNotes((prev) => prev.filter((n) => !descendantIds.includes(n.id)));
      }
    } catch (error) {
      console.error("Failed to delete note:", error);
    }
  };

  // Open archive view
  const handleOpenArchive = () => {
    setSelectedNoteId(null);
    setSelectedArchivedNoteId(null);
    setCurrentView("archive");
  };

  // Open file cleaner view
  const handleOpenFileCleaner = () => {
    setSelectedNoteId(null);
    setCurrentView("fileCleaner");
  };

  // Open AI chat view
  const handleOpenAI = () => {
    setSelectedNoteId(null);
    setCurrentView("ai");
  };

  // Open search modal
  const handleOpenSearch = () => {
    setIsSearchModalOpen(true);
  };

  // Open settings view
  const handleOpenSettings = () => {
    setSelectedNoteId(null);
    setCurrentView("settings");
  };

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setIsSearchModalOpen(true);
      }
    };

    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  // Rename note (optimistic update)
  const handleRenameNote = async (id: string, newTitle: string) => {
    // Optimistic update - update immediately
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, title: newTitle } : n))
    );

    try {
      await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
    } catch (error) {
      console.error("Failed to rename note:", error);
    }
  };

  // Create list item
  const handleCreateListItem = async (key: string, value: string, tags?: string) => {
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value, tags: tags || "" }),
      });

      if (res.ok) {
        const newItem = await res.json();
        setListItems((prev) => [newItem, ...prev]);
        return newItem;
      }
    } catch (error) {
      console.error("Failed to create list item:", error);
    }
  };

  // Delete list item
  const handleDeleteListItem = async (id: string) => {
    try {
      const res = await fetch(`/api/lists/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setListItems((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (error) {
      console.error("Failed to delete list item:", error);
    }
  };

  // Update list item
  const handleUpdateListItem = async (id: string, key: string, value: string, tags: string) => {
    try {
      const res = await fetch(`/api/lists/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          value,
          tags,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setListItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
      }
    } catch (error) {
      console.error("Failed to update list item:", error);
    }
  };

  // Move note (drag and drop)
  const handleMoveNote = async (noteId: string, newParentId: string | null, newOrder: number) => {
    // Optimistic update
    setNotes((prev) => {
      const updated = prev.map((n) => {
        if (n.id === noteId) {
          return { ...n, parentId: newParentId, order: newOrder };
        }
        // Adjust order of siblings if needed
        if ((n.parentId || null) === newParentId && n.id !== noteId && n.order >= newOrder) {
          return { ...n, order: n.order + 1 };
        }
        return n;
      });
      return updated;
    });

    try {
      // First update the moved note
      await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: newParentId, order: newOrder }),
      });

      // Then reorder siblings
      const siblings = notes.filter((n) => (n.parentId || null) === newParentId && n.id !== noteId);
      for (const sibling of siblings) {
        if (sibling.order >= newOrder) {
          await fetch(`/api/notes/${sibling.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order: sibling.order + 1 }),
          });
        }
      }
    } catch (error) {
      console.error("Failed to move note:", error);
    }
  };

  // Open memories view
  const handleOpenMemories = () => {
    setSelectedNoteId(null);
    setCurrentView("memories");
  };

  // Memory add modal state (global, like Vault)
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);

  const handleOpenMemoryAddModal = () => {
    setIsMemoryModalOpen(true);
  };

  // Create occasion and memory together
  const handleCreateOccasionAndMemory = async (title: string, memoryContent: string) => {
    try {
      // First create the occasion
      const occasionRes = await fetch("/api/occasions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (occasionRes.ok) {
        const newOccasion = await occasionRes.json();
        // Then add the memory
        const memoryRes = await fetch(`/api/occasions/${newOccasion.id}/memories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: memoryContent }),
        });
        if (memoryRes.ok) {
          const newMemory = await memoryRes.json();
          setOccasions((prev) => [...prev, { ...newOccasion, memories: [newMemory] }]);
        }
      }
    } catch (error) {
      console.error("Failed to create occasion and memory:", error);
    }
  };

  // Update occasion
  const handleUpdateOccasion = async (id: string, title: string) => {
    try {
      const res = await fetch(`/api/occasions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        const updated = await res.json();
        setOccasions((prev) => prev.map((o) => (o.id === id ? updated : o)));
      }
    } catch (error) {
      console.error("Failed to update occasion:", error);
    }
  };

  // Delete occasion
  const handleDeleteOccasion = async (id: string) => {
    try {
      const res = await fetch(`/api/occasions/${id}`, { method: "DELETE" });
      if (res.ok) {
        setOccasions((prev) => prev.filter((o) => o.id !== id));
      }
    } catch (error) {
      console.error("Failed to delete occasion:", error);
    }
  };

  // Create memory
  const handleCreateMemory = async (occasionId: string, content: string) => {
    try {
      const res = await fetch(`/api/occasions/${occasionId}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        const newMemory = await res.json();
        setOccasions((prev) =>
          prev.map((o) =>
            o.id === occasionId
              ? { ...o, memories: [...(o.memories || []), newMemory] }
              : o
          )
        );
      }
    } catch (error) {
      console.error("Failed to create memory:", error);
    }
  };

  // Update memory
  const handleUpdateMemory = async (occasionId: string, memoryId: string, content: string) => {
    try {
      const res = await fetch(`/api/occasions/${occasionId}/memories/${memoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        const updated = await res.json();
        setOccasions((prev) =>
          prev.map((o) =>
            o.id === occasionId
              ? { ...o, memories: (o.memories || []).map((m) => (m.id === memoryId ? updated : m)) }
              : o
          )
        );
      }
    } catch (error) {
      console.error("Failed to update memory:", error);
    }
  };

  // Delete memory
  const handleDeleteMemory = async (occasionId: string, memoryId: string) => {
    try {
      const res = await fetch(`/api/occasions/${occasionId}/memories/${memoryId}`, { method: "DELETE" });
      if (res.ok) {
        setOccasions((prev) =>
          prev.map((o) =>
            o.id === occasionId
              ? { ...o, memories: (o.memories || []).filter((m) => m.id !== memoryId) }
              : o
          )
        );
      }
    } catch (error) {
      console.error("Failed to delete memory:", error);
    }
  };

  // Upload images to occasion
  const handleUploadImages = async (occasionId: string, files: File[]) => {
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("images", file));
      
      const res = await fetch(`/api/occasions/${occasionId}/images`, {
        method: "POST",
        body: formData,
      });
      
      if (res.ok) {
        const newImages = await res.json();
        setOccasions((prev) =>
          prev.map((o) =>
            o.id === occasionId
              ? { ...o, images: [...(o.images || []), ...newImages] }
              : o
          )
        );
      }
    } catch (error) {
      console.error("Failed to upload images:", error);
    }
  };

  // Delete image from occasion
  const handleDeleteImage = async (occasionId: string, imageId: string) => {
    try {
      const res = await fetch(`/api/occasions/${occasionId}/images/${imageId}`, { method: "DELETE" });
      if (res.ok) {
        setOccasions((prev) =>
          prev.map((o) =>
            o.id === occasionId
              ? { ...o, images: (o.images || []).filter((img) => img.id !== imageId) }
              : o
          )
        );
      }
    } catch (error) {
      console.error("Failed to delete image:", error);
    }
  };

  // Don't render until hydrated to prevent flash of wrong content
  if (!hydrated || !migrationsReady) {
    return (
      <div className="flex flex-1 overflow-hidden bg-[#191919]">
        <div className="w-64 border-r border-[#2f2f2f] bg-[#1e1e1e]" />
        <main className="flex-1" />
      </div>
    );
  }

  const activeNotes = notes.filter((note) => !note.archived);
  const recentNotes = [...activeNotes]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);
  const selectedArchivedNote = selectedArchivedNoteId
    ? notes.find((note) => note.id === selectedArchivedNoteId && note.archived)
    : null;

  return (
    <div className="flex flex-1 overflow-hidden">
      <Sidebar
        currentView={currentView}
        notes={notes}
        selectedNoteId={selectedNoteId}
        onSelectNote={handleSelectNote}
        onCreateNote={handleCreateNote}
        onArchiveNote={handleArchiveNote}
        onDeletePermanently={handleDeletePermanently}
        onRenameNote={handleRenameNote}
        onMoveNote={handleMoveNote}
        onOpenLists={handleOpenLists}
        onOpenListsAddModal={handleOpenListsAddModal}
        onOpenMemories={handleOpenMemories}
        onOpenMemoryAddModal={handleOpenMemoryAddModal}
        onOpenArchive={handleOpenArchive}
        onOpenFileCleaner={handleOpenFileCleaner}
        onOpenAI={handleOpenAI}
        onOpenSearch={handleOpenSearch}
        onOpenSettings={handleOpenSettings}
        onUpdateNote={handleUpdateNote}
      />
      <main className="flex-1 overflow-auto bg-[#191919]">
        {currentView === "note" && selectedNoteId && notes.find(n => n.id === selectedNoteId) ? (
          <NoteEditor
            key={selectedNoteId}
            note={notes.find(n => n.id === selectedNoteId)!}
            allNotes={notes}
            onUpdate={handleUpdateNote}
            onSelectNote={handleSelectNote}
            chatOpenStates={chatOpenStates}
            setChatOpenStates={setChatOpenStates}
            allChatMessages={allChatMessages}
            setAllChatMessages={setAllChatMessages}
          />
        ) : currentView === "lists" ? (
          <ListsView
            listItems={listItems}
            onDeleteListItem={handleDeleteListItem}
            onOpenAddModal={handleOpenListsAddModal}
            onOpenEditModal={handleOpenListsEditModal}
          />
        ) : currentView === "memories" ? (
          <MemoriesView
            occasions={occasions}
            selectedOccasionId={selectedOccasionId}
            onSelectOccasion={setSelectedOccasionId}
            onCreateOccasionAndMemory={handleCreateOccasionAndMemory}
            onCreateMemory={handleCreateMemory}
            onUpdateOccasion={handleUpdateOccasion}
            onDeleteOccasion={handleDeleteOccasion}
            onUpdateMemory={handleUpdateMemory}
            onDeleteMemory={handleDeleteMemory}
            onUploadImages={handleUploadImages}
            onDeleteImage={handleDeleteImage}
          />
        ) : currentView === "archive" && selectedArchivedNote ? (
          <NoteEditor
            key={selectedArchivedNote.id}
            note={selectedArchivedNote}
            allNotes={notes}
            onUpdate={handleUpdateNote}
            allowAIChat={false}
            breadcrumbPrefixLabel="Archive"
            onBreadcrumbPrefixClick={() => setSelectedArchivedNoteId(null)}
            headerActions={(
              <>
                <button
                  onClick={() => {
                    handleRestoreNote(selectedArchivedNote.id);
                    setSelectedArchivedNoteId(null);
                  }}
                  className="px-2 py-1 text-xs text-[#9b9b9b] hover:text-[#e3e3e3] hover:bg-[#2f2f2f] rounded transition-colors cursor-pointer"
                >
                  Restore
                </button>
                <button
                  onClick={() => {
                    handleDeletePermanently(selectedArchivedNote.id);
                    setSelectedArchivedNoteId(null);
                  }}
                  className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-[#2f2f2f] rounded transition-colors cursor-pointer"
                >
                  Delete
                </button>
              </>
            )}
            onSelectNote={(noteId) => {
              const targetNote = notes.find((note) => note.id === noteId);
              if (!targetNote) return;
              if (targetNote.archived) {
                setSelectedArchivedNoteId(noteId);
                return;
              }
              handleSelectNote(noteId);
            }}
            chatOpenStates={chatOpenStates}
            setChatOpenStates={setChatOpenStates}
            allChatMessages={allChatMessages}
            setAllChatMessages={setAllChatMessages}
          />
        ) : currentView === "archive" ? (
          <ArchiveView
            notes={notes}
            selectedNoteId={selectedArchivedNoteId}
            onSelectNote={setSelectedArchivedNoteId}
            onRestoreNote={handleRestoreNote}
            onDeletePermanently={handleDeletePermanently}
          />
        ) : currentView === "fileCleaner" ? (
          <FileCleanerView
            onBack={() => setCurrentView("home")}
          />
        ) : currentView === "ai" ? (
          <AIView
            onBack={() => setCurrentView("home")}
          />
        ) : currentView === "settings" ? (
          <SettingsView />
        ) : (
          <div className="flex flex-col h-full">
            {/* Top bar */}
            <div className="flex items-center h-11 px-4 border-b border-[#2f2f2f] shrink-0">
              <div className="flex items-center gap-2 text-sm text-[#9b9b9b]">
                <span className="hover:bg-[#2f2f2f] px-1.5 py-0.5 rounded cursor-pointer">Home</span>
              </div>
            </div>
            
            {/* Welcome content */}
            <div className="flex-1 overflow-auto">
              <div className="max-w-3xl mx-auto px-16 py-14">
                <article className="space-y-6">
                  <header className="space-y-3">
                    <h1 className="text-4xl font-bold text-[#e3e3e3]">Welcome to Vault</h1>
                    <p className="text-[#9b9b9b] text-lg leading-relaxed">
                      {isLoading
                        ? "Loading your workspace..."
                        : activeNotes.length === 0
                          ? "This page works like a starting note. Create your first page and begin building your space."
                          : "A local-first desktop workspace for notes, quick capture, and AI-assisted thinking, with nested pages, call summaries, and smarter search."}
                    </p>
                  </header>

                  <section className="space-y-2">
                    <h2 className="text-sm uppercase tracking-wider text-[#7a7a7a]">Quick Actions</h2>
                    <div className="flex flex-wrap gap-3 text-sm">
                      <button onClick={() => handleCreateNote()} className="text-[#7eb8f7] hover:underline cursor-pointer">
                        New note
                      </button>
                      <button onClick={() => handleCreateNote(undefined, "spreadsheet")} className="text-[#7eb8f7] hover:underline cursor-pointer">
                        New spreadsheet
                      </button>
                      <button onClick={handleOpenSearch} className="text-[#7eb8f7] hover:underline cursor-pointer">
                        Search workspace
                      </button>
                      <button onClick={handleOpenAI} className="text-[#7eb8f7] hover:underline cursor-pointer">
                        New AI chat
                      </button>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h2 className="text-sm uppercase tracking-wider text-[#7a7a7a]">Controls</h2>
                    <p className="text-xs text-[#6b6b6b] leading-relaxed flex flex-wrap gap-x-2 gap-y-1 items-center">
                      <kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[#9b9b9b]">Ctrl+F</kbd>
                      <span>search</span>
                      <span>•</span>
                      <kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[#9b9b9b]">{quickNoteShortcut}</kbd>
                      <span>quick note</span>
                      <span>•</span>
                      <kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[#9b9b9b]">{quickAiShortcut}</kbd>
                      <span>quick AI</span>
                    </p>
                  </section>

                  <section className="space-y-3">
                    <h2 className="text-sm uppercase tracking-wider text-[#7a7a7a]">Recent Notes</h2>
                    {isLoading ? (
                      <p className="text-sm text-[#7a7a7a]">Loading notes...</p>
                    ) : recentNotes.length === 0 ? (
                      <p className="text-sm text-[#7a7a7a]">No notes yet.</p>
                    ) : (
                      <ul className="-mx-2">
                        {recentNotes.map((note) => (
                          <li key={note.id}>
                            <button
                              onClick={() => handleSelectNote(note.id)}
                              className="w-full flex items-center gap-2 px-2 py-1 hover:bg-[#2a2a2a] rounded transition-colors cursor-pointer text-left"
                            >
                              <HomeNoteIcon icon={note.icon} hasContent={note.content.length > 0 && note.content !== "<p></p>"} content={note.content} />
                              <span className="note-title-text text-[#9b9b9b] text-sm truncate">{note.title || "Untitled"}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </article>
              </div>
            </div>
          </div>
        )}
      </main>
      
      {/* Lists Add Modal */}
      <ListsAddModal
        isOpen={isListsModalOpen}
        onClose={() => {
          setIsListsModalOpen(false);
          setListsModalInitialTag(undefined);
          setListsModalEditingItemId(null);
          setListsModalInitialKey(undefined);
          setListsModalInitialValue(undefined);
          setListsModalInitialTags(undefined);
          setListsModalMode("add");
        }}
        onSubmit={async (key, value, tags) => {
          if (listsModalMode === "edit" && listsModalEditingItemId) {
            await handleUpdateListItem(listsModalEditingItemId, key, value, tags || "");
            return;
          }

          await handleCreateListItem(key, value, tags);
        }}
        mode={listsModalMode}
        initialKey={listsModalInitialKey}
        initialValue={listsModalInitialValue}
        initialTags={listsModalInitialTags}
        initialTag={listsModalInitialTag}
        availableTags={availableListTags}
      />

      {/* Memory Add Modal */}
      <MemoryAddModal
        isOpen={isMemoryModalOpen}
        onClose={() => setIsMemoryModalOpen(false)}
        occasions={occasions}
        onCreateOccasionAndMemory={handleCreateOccasionAndMemory}
        onCreateMemory={handleCreateMemory}
      />

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectNote={(id) => {
          setIsSearchModalOpen(false);
          setSelectedNoteId(id);
          setCurrentView("note");
        }}
        onSelectLists={() => {
          setIsSearchModalOpen(false);
          setCurrentView("lists");
        }}
        onSelectMemories={() => {
          setIsSearchModalOpen(false);
          setCurrentView("memories");
        }}
      />
    </div>
  );
}
