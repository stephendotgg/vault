"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./Sidebar";
import { NoteEditor } from "./NoteEditor";
import { Note } from "@/types/models";

export function AppShell() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  // Create new note
  const handleCreateNote = async () => {
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
      });

      if (res.ok) {
        const newNote = await res.json();
        setNotes((prev) => [newNote, ...prev]);
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

  return (
    <div className="flex flex-1 overflow-hidden">
      <Sidebar
        notes={notes}
        selectedNoteId={selectedNoteId}
        onSelectNote={handleSelectNote}
        onCreateNote={handleCreateNote}
      />
      <main className="flex-1 overflow-auto bg-[#191919]">
        {selectedNoteId ? (
          <NoteEditor
            key={selectedNoteId}
            noteId={selectedNoteId}
            onUpdate={handleUpdateNote}
            onDelete={handleDeleteNote}
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
                <p className="text-[#9b9b9b] text-lg mb-8">
                  {isLoading ? "Loading..." : notes.length === 0 
                    ? "Create your first note to get started!"
                    : "Select a note from the sidebar or create a new one."
                  }
                </p>
                <button
                  onClick={handleCreateNote}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[rgba(255,255,255,0.055)] hover:bg-[rgba(255,255,255,0.1)] text-[#e3e3e3] rounded-lg transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Create a note
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
