"use client";

import { Note } from "@/types/models";
import { NoteEditor } from "./NoteEditor";

interface ArchiveViewProps {
  notes: Note[];
  selectedNoteId: string | null;
  onSelectNote: (id: string | null) => void;
  onUpdateNote: (note: Note) => void;
  onRestoreNote: (id: string) => void;
  onDeletePermanently: (id: string) => void;
}

// Note icon - can be emoji, custom image, or default document icon
function NoteIcon({ icon, hasContent }: { icon: string; hasContent: boolean }) {
  // Custom image icon (stored as "icon:filename.ext")
  if (icon.startsWith("icon:")) {
    const filename = icon.substring(5);
    return (
      <img 
        src={`/api/icons/${filename}`} 
        alt="" 
        className="w-4 h-4 shrink-0 rounded-sm object-cover"
      />
    );
  }
  
  // Emoji icon (any non-default value that's not an image)
  if (icon && icon !== "📄") {
    return (
      <span className="w-4 h-4 shrink-0 text-sm leading-none flex items-center justify-center">
        {icon}
      </span>
    );
  }
  
  // Default document icon
  if (hasContent) {
    return (
      <svg className="w-4 h-4 shrink-0 text-[#9b9b9b]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
        <path d="M14 2v6h6" fill="none" stroke="currentColor" strokeWidth="1"/>
        <line x1="8" y1="13" x2="16" y2="13" stroke="#202020" strokeWidth="1.5"/>
        <line x1="8" y1="17" x2="14" y2="17" stroke="#202020" strokeWidth="1.5"/>
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 shrink-0 text-[#6b6b6b]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
      <polyline points="14,2 14,8 20,8"/>
    </svg>
  );
}

export function ArchiveView({ notes, selectedNoteId, onSelectNote, onUpdateNote, onRestoreNote, onDeletePermanently }: ArchiveViewProps) {
  const archivedNotes = notes.filter((n) => n.archived);
  const selectedNote = selectedNoteId ? notes.find((n) => n.id === selectedNoteId) : null;

  // If a note is selected, show the NoteEditor
  if (selectedNote) {
    return (
      <div className="flex flex-col h-full">
        {/* Top bar with breadcrumbs - same style as NoteEditor */}
        <div className="flex items-center justify-between h-11 px-4 border-b border-[#2f2f2f] shrink-0">
          <div className="flex items-center gap-1 text-sm text-[#9b9b9b] overflow-hidden">
            {/* Archive breadcrumb */}
            <button
              onClick={() => onSelectNote(null)}
              className="hover:text-[#e3e3e3] transition-colors cursor-pointer"
            >
              <span className="truncate">Archive</span>
            </button>
            {/* Separator */}
            <svg className="w-3 h-3 text-[#6b6b6b] shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            {/* Note breadcrumb */}
            <div className="flex items-center gap-1.5 min-w-0">
              <NoteIcon icon={selectedNote.icon} hasContent={selectedNote.content.length > 0 && selectedNote.content !== "<p></p>"} />
              <span className="truncate">{selectedNote.title || "Untitled"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onRestoreNote(selectedNote.id);
                onSelectNote(null);
              }}
              className="px-2 py-1 text-xs text-[#9b9b9b] hover:text-[#e3e3e3] hover:bg-[#2f2f2f] rounded transition-colors cursor-pointer"
            >
              Restore
            </button>
            <button
              onClick={() => {
                if (confirm("Delete this note permanently? This cannot be undone.")) {
                  onDeletePermanently(selectedNote.id);
                  onSelectNote(null);
                }
              }}
              className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-[#2f2f2f] rounded transition-colors cursor-pointer"
            >
              Delete
            </button>
          </div>
        </div>
        
        {/* Note editor area - reuse the content portion */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto px-16 py-12">
            <h1 className="text-4xl font-bold text-[#e3e3e3] mb-4">{selectedNote.title || "Untitled"}</h1>
            <div 
              className="prose prose-invert max-w-none text-[#e3e3e3] text-base leading-relaxed"
              dangerouslySetInnerHTML={{ __html: selectedNote.content || "<p class='text-[#4a4a4a]'>No content</p>" }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between h-11 px-4 border-b border-[#2f2f2f] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#9b9b9b]">Archive</span>
        </div>
      </div>

      {/* Archive content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-16 py-12">
          <h1 className="text-4xl font-bold text-[#e3e3e3] mb-4">Archive</h1>

          {archivedNotes.length === 0 ? (
            <div className="text-[#6b6b6b] text-base">
              No archived notes
            </div>
          ) : (
            <div className="-mx-2">
              {archivedNotes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => onSelectNote(note.id)}
                  className="group w-full flex items-center gap-2 px-2 py-1 hover:bg-[#2a2a2a] rounded transition-colors text-left cursor-pointer"
                >
                  <NoteIcon icon={note.icon} hasContent={note.content.length > 0 && note.content !== "<p></p>"} />
                  <span className="text-[#9b9b9b] text-sm truncate flex-1">
                    {note.title || "Untitled"}
                  </span>
                  
                  {/* Action buttons - same style as sidebar */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                    {/* Restore button */}
                    <button
                      onClick={() => onRestoreNote(note.id)}
                      className="p-0.5 text-[#6b6b6b] hover:text-[#aeaeae] hover:bg-[rgba(255,255,255,0.1)] rounded transition-all cursor-pointer"
                      title="Restore note"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                    </button>
                    {/* Delete button */}
                    <button
                      onClick={() => {
                        if (confirm("Delete this note permanently? This cannot be undone.")) {
                          onDeletePermanently(note.id);
                        }
                      }}
                      className="p-0.5 text-[#6b6b6b] hover:text-red-400 hover:bg-[rgba(255,255,255,0.1)] rounded transition-all cursor-pointer"
                      title="Delete permanently"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
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
