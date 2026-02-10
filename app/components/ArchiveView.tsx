"use client";

import { Note } from "@/types/models";

interface ArchiveViewProps {
  notes: Note[];
  onRestoreNote: (id: string) => void;
  onDeletePermanently: (id: string) => void;
  onGoBack: () => void;
}

export function ArchiveView({ notes, onRestoreNote, onDeletePermanently, onGoBack }: ArchiveViewProps) {
  const archivedNotes = notes.filter((n) => n.archived);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between h-11 px-4 border-b border-[#2f2f2f] shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onGoBack}
            className="p-1 hover:bg-[#2f2f2f] rounded transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4 text-[#9b9b9b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm text-[#9b9b9b]">Archive</span>
        </div>
      </div>

      {/* Archive content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-16 py-12">
          <div className="flex items-center gap-3 mb-8">
            <svg className="w-8 h-8 text-[#9b9b9b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <h1 className="text-3xl font-bold text-[#e3e3e3]">Archive</h1>
          </div>

          {archivedNotes.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-[#4a4a4a] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <p className="text-[#6b6b6b] text-lg">No archived notes</p>
              <p className="text-[#4a4a4a] text-sm mt-1">Notes you archive will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {archivedNotes.map((note) => (
                <div
                  key={note.id}
                  className="flex items-center justify-between p-3 bg-[#252525] rounded-lg border border-[#2f2f2f] hover:border-[#3f3f3f] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <svg className="w-4 h-4 shrink-0 text-[#6b6b6b]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                      <polyline points="14,2 14,8 20,8"/>
                    </svg>
                    <span className="text-[#e3e3e3] truncate">{note.title || "Untitled"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onRestoreNote(note.id)}
                      className="px-3 py-1 text-sm text-[#9b9b9b] hover:text-[#e3e3e3] hover:bg-[#2f2f2f] rounded transition-colors cursor-pointer"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Delete this note permanently? This cannot be undone.")) {
                          onDeletePermanently(note.id);
                        }
                      }}
                      className="px-3 py-1 text-sm text-red-400 hover:text-red-300 hover:bg-[#2f2f2f] rounded transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
