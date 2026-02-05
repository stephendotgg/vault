"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./Sidebar";
import { NoteEditor } from "./NoteEditor";
import { Note } from "@/types/models";

export function AppShell() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
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

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

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
      }
    } catch (error) {
      console.error("Failed to create note:", error);
    }
  };

  // Select note
  const handleSelectNote = (id: string) => {
    setSelectedNoteId(id);
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

  return (
    <div className="flex flex-1 overflow-hidden">
      <Sidebar
        notes={notes}
        selectedNoteId={selectedNoteId}
        onSelectNote={handleSelectNote}
        onCreateNote={handleCreateNote}
        onArchiveNote={handleArchiveNote}
        onGoHome={() => setSelectedNoteId(null)}
      />
      <main className="flex-1 overflow-auto bg-[#191919]">
        {selectedNoteId && notes.find(n => n.id === selectedNoteId) ? (
          <NoteEditor
            key={selectedNoteId}
            note={notes.find(n => n.id === selectedNoteId)!}
            allNotes={notes}
            onUpdate={handleUpdateNote}
            onDelete={handleDeleteNote}
            onSelectNote={handleSelectNote}
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
    </div>
  );
}
