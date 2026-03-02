"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./Sidebar";
import { NoteEditor, ChatMessage } from "./NoteEditor";
import { VaultView } from "./VaultView";
import { VaultAddModal } from "./VaultAddModal";
import { MemoriesView } from "./MemoriesView";
import { MemoryAddModal } from "./MemoryAddModal";
import { ArchiveView } from "./ArchiveView";
import { FileCleanerView } from "./FileCleanerView";
import { AIView } from "./AIView";
import { SearchModal } from "./SearchModal";
import { SettingsView } from "./SettingsView";
import { Note, VaultItem, Occasion } from "@/types/models";

type ViewType = "home" | "note" | "vault" | "memories" | "archive" | "fileCleaner" | "ai" | "settings";

const THEME_MODE_STORAGE_KEY = "vault-theme-mode";
const THEME_MODE_EVENT = "vault-theme-updated";

function applyThemeMode(mode: "dark" | "light") {
  document.documentElement.setAttribute("data-theme", mode);
}

export function AppShell() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>("home");
  const [selectedOccasionId, setSelectedOccasionId] = useState<string | null>(null);
  const [selectedArchivedNoteId, setSelectedArchivedNoteId] = useState<string | null>(null);
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // AI Chat state - persisted across note switches
  const [chatOpenStates, setChatOpenStates] = useState<Map<string, boolean>>(new Map());
  const [allChatMessages, setAllChatMessages] = useState<Map<string, ChatMessage[]>>(new Map());

  // Load saved state from localStorage after hydration
  useEffect(() => {
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
    return () => {
      window.removeEventListener(THEME_MODE_EVENT, handleThemeUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    const savedNoteId = localStorage.getItem("selected-note-id");
    const savedView = localStorage.getItem("current-view") as ViewType | null;
    const savedOccasionId = localStorage.getItem("selected-occasion-id");
    
    if (savedView) {
      setCurrentView(savedView);
    }
    if (savedNoteId) {
      setSelectedNoteId(savedNoteId);
    }
    if (savedOccasionId) {
      setSelectedOccasionId(savedOccasionId);
    }
    setHydrated(true);
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

  // Fetch all vault items
  const fetchVaultItems = useCallback(async () => {
    try {
      const res = await fetch("/api/vault");
      if (res.ok) {
        const data = await res.json();
        setVaultItems(data);
      }
    } catch (error) {
      console.error("Failed to fetch vault items:", error);
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
    fetchVaultItems();
    fetchOccasions();
  }, [fetchNotes, fetchVaultItems, fetchOccasions]);

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
    if (window.electronAPI) {
      return;
    }

    const handleWebShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isTypingTarget) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "q") {
        event.preventDefault();
        void handleCreateNote();
      }
    };

    window.addEventListener("keydown", handleWebShortcut);
    return () => window.removeEventListener("keydown", handleWebShortcut);
  }, [handleCreateNote]);

  // Select note
  const handleSelectNote = (id: string) => {
    setSelectedNoteId(id);
    setCurrentView("note");
  };

  // Open vault view
  const handleOpenVault = () => {
    setSelectedNoteId(null);
    setCurrentView("vault");
  };

  // Compute available tags for vault (priority tags first, then others by usage count)
  const priorityTags = ["shows", "music", "topics", "food", "youtube", "work"];
  const availableVaultTags = (() => {
    const tagCounts = new Map<string, number>();
    vaultItems.forEach((item) => {
      if (item.tags) {
        item.tags.split(",").forEach((t) => {
          const trimmed = t.trim().toLowerCase();
          if (trimmed) {
            tagCounts.set(trimmed, (tagCounts.get(trimmed) || 0) + 1);
          }
        });
      }
    });
    const existingPriority = priorityTags.filter((t) => tagCounts.has(t));
    const remainingTags = [...tagCounts.keys()]
      .filter((t) => !priorityTags.includes(t))
      .sort((a, b) => (tagCounts.get(b) || 0) - (tagCounts.get(a) || 0));
    return [...existingPriority, ...remainingTags];
  })();

  // Open vault add modal
  const [vaultModalInitialTag, setVaultModalInitialTag] = useState<string | undefined>(undefined);
  const handleOpenVaultAddModal = (tag?: string) => {
    setVaultModalInitialTag(tag);
    setIsVaultModalOpen(true);
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
    const isEmpty = note && 
      (note.title === "" || note.title === "Untitled") && 
      (note.content === "" || note.content === "<p></p>");
    
    if (isEmpty) {
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
      const res = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });

      if (res.ok) {
        const updatedNote = await res.json();
        setNotes((prev) => prev.map((n) => (n.id === id ? updatedNote : n)));
        if (selectedNoteId === id) {
          setSelectedNoteId(null);
          setCurrentView("home");
        }
      }
    } catch (error) {
      console.error("Failed to archive note:", error);
    }
  };

  // Restore note from archive
  const handleRestoreNote = async (id: string) => {
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false }),
      });

      if (res.ok) {
        const updatedNote = await res.json();
        setNotes((prev) => prev.map((n) => (n.id === id ? updatedNote : n)));
      }
    } catch (error) {
      console.error("Failed to restore note:", error);
    }
  };

  // Delete note permanently
  const handleDeletePermanently = async (id: string) => {
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== id));
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
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isTypingTarget) {
        return;
      }

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

  // Create vault item
  const handleCreateVaultItem = async (key: string, value: string, tags?: string) => {
    try {
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value, tags: tags || "" }),
      });

      if (res.ok) {
        const newItem = await res.json();
        setVaultItems((prev) => [newItem, ...prev]);
        return newItem;
      }
    } catch (error) {
      console.error("Failed to create vault item:", error);
    }
  };

  // Delete vault item
  const handleDeleteVaultItem = async (id: string) => {
    try {
      const res = await fetch(`/api/vault/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setVaultItems((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (error) {
      console.error("Failed to delete vault item:", error);
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
  if (!hydrated) {
    return (
      <div className="flex flex-1 overflow-hidden bg-[#191919]">
        <div className="w-64 border-r border-[#2f2f2f] bg-[#1e1e1e]" />
        <main className="flex-1" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <Sidebar
        notes={notes}
        selectedNoteId={selectedNoteId}
        onSelectNote={handleSelectNote}
        onCreateNote={handleCreateNote}
        onArchiveNote={handleArchiveNote}
        onRenameNote={handleRenameNote}
        onMoveNote={handleMoveNote}
        onOpenVault={handleOpenVault}
        onOpenVaultAddModal={handleOpenVaultAddModal}
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
        ) : currentView === "vault" ? (
          <VaultView
            vaultItems={vaultItems}
            onDeleteVaultItem={handleDeleteVaultItem}
            onOpenAddModal={handleOpenVaultAddModal}
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
        ) : currentView === "archive" ? (
          <ArchiveView
            notes={notes}
            selectedNoteId={selectedArchivedNoteId}
            onSelectNote={setSelectedArchivedNoteId}
            onUpdateNote={handleUpdateNote}
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
              <div className="max-w-3xl mx-auto px-24 py-20">
                <h1 className="text-4xl font-bold text-[#e3e3e3] mb-4">Welcome to <span className="text-[#7eb8f7]">Vault</span></h1>
                <p className="text-[#9b9b9b] text-lg">
                  {isLoading ? "Loading..." : notes.length === 0 
                    ? "Create your first note using the + button in the sidebar."
                    : "Select a note from the sidebar or create a new one."
                  }
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
      
      {/* Vault Add Modal */}
      <VaultAddModal
        isOpen={isVaultModalOpen}
        onClose={() => { setIsVaultModalOpen(false); setVaultModalInitialTag(undefined); }}
        onAdd={async (key, value, tags) => {
          await handleCreateVaultItem(key, value, tags);
        }}
        initialTag={vaultModalInitialTag}
        availableTags={availableVaultTags}
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
        onSelectVault={() => {
          setIsSearchModalOpen(false);
          setCurrentView("vault");
        }}
        onSelectMemories={() => {
          setIsSearchModalOpen(false);
          setCurrentView("memories");
        }}
      />
    </div>
  );
}
