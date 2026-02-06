"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./Sidebar";
import { NoteEditor } from "./NoteEditor";
import { VaultView } from "./VaultView";
import { VaultAddModal } from "./VaultAddModal";
import { MemoriesView } from "./MemoriesView";
import { MemoryAddModal } from "./MemoryAddModal";
import { Note, VaultItem, Occasion } from "@/types/models";

type ViewType = "home" | "note" | "vault" | "memories";

export function AppShell() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>("home");
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // Load selected note from localStorage after hydration
  useEffect(() => {
    const saved = localStorage.getItem("selected-note-id");
    if (saved) {
      setSelectedNoteId(saved);
    }
    setHydrated(true);
  }, []);

  // Persist selected note to localStorage
  useEffect(() => {
    if (hydrated) {
      if (selectedNoteId) {
        localStorage.setItem("selected-note-id", selectedNoteId);
      } else {
        localStorage.removeItem("selected-note-id");
      }
    }
  }, [selectedNoteId, hydrated]);

  // Fetch all notes
  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch("/api/notes");
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

  // Create new note (optionally as a child)
  const handleCreateNote = async (parentId?: string) => {
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: parentId || null }),
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
  };

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

  // Delete note
  const handleDeleteNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedNoteId === id) {
      setSelectedNoteId(null);
    }
  };

  // Archive note (hide without deleting)
  const handleArchiveNote = async (id: string) => {
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });

      if (res.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== id));
        if (selectedNoteId === id) {
          setSelectedNoteId(null);
        }
      }
    } catch (error) {
      console.error("Failed to archive note:", error);
    }
  };

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

  // Selected occasion state for memories view
  const [selectedOccasionId, setSelectedOccasionId] = useState<string | null>(null);

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
        onGoHome={() => { setSelectedNoteId(null); setCurrentView("home"); }}
      />
      <main className="flex-1 overflow-auto bg-[#191919]">
        {currentView === "note" && selectedNoteId && notes.find(n => n.id === selectedNoteId) ? (
          <NoteEditor
            key={selectedNoteId}
            note={notes.find(n => n.id === selectedNoteId)!}
            allNotes={notes}
            onUpdate={handleUpdateNote}
            onDelete={handleDeleteNote}
            onSelectNote={handleSelectNote}
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
          />
        ) : (
          <div className="flex flex-col h-full">
            {/* Top bar */}
            <div className="flex items-center h-11 px-3 border-b border-[#2f2f2f] shrink-0">
              <div className="flex items-center gap-2 text-sm text-[#9b9b9b]">
                <span className="hover:bg-[#2f2f2f] px-1.5 py-0.5 rounded cursor-pointer">Home</span>
              </div>
            </div>
            
            {/* Welcome content */}
            <div className="flex-1 overflow-auto">
              <div className="max-w-3xl mx-auto px-24 py-20">
                <h1 className="text-4xl font-bold text-[#e3e3e3] mb-4">Welcome to Mothership</h1>
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
    </div>
  );
}
