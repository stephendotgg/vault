"use client";

import { useState, useMemo, useEffect } from "react";
import { Note } from "@/types/models";

type SectionKey = "notes" | "vault" | "memories";

interface NoteWithChildren extends Note {
  children: NoteWithChildren[];
}

interface SidebarProps {
  selectedNoteId?: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: (parentId?: string) => void;
  onArchiveNote: (id: string) => void;
  onGoHome: () => void;
  notes: Note[];
}

// Build tree structure from flat notes array
function buildNoteTree(notes: Note[]): NoteWithChildren[] {
  const noteMap = new Map<string, NoteWithChildren>();
  const roots: NoteWithChildren[] = [];

  // First pass: create all nodes with empty children
  notes.forEach((note) => {
    noteMap.set(note.id, { ...note, children: [] });
  });

  // Second pass: build the tree
  notes.forEach((note) => {
    const node = noteMap.get(note.id)!;
    if (note.parentId && noteMap.has(note.parentId)) {
      noteMap.get(note.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Sort children by order
  const sortByOrder = (nodes: NoteWithChildren[]) => {
    nodes.sort((a, b) => a.order - b.order);
    nodes.forEach((node) => sortByOrder(node.children));
  };
  sortByOrder(roots);

  return roots;
}

interface NoteItemProps {
  note: NoteWithChildren;
  depth: number;
  selectedNoteId?: string | null;
  expandedNotes: Set<string>;
  onToggleExpand: (id: string) => void;
  onExpandNote: (id: string) => void;
  onSelectNote: (id: string) => void;
  onCreateNote: (parentId?: string) => void;
  onArchiveNote: (id: string) => void;
}

function NoteItem({ 
  note, 
  depth, 
  selectedNoteId, 
  expandedNotes, 
  onToggleExpand,
  onExpandNote, 
  onSelectNote,
  onCreateNote,
  onArchiveNote
}: NoteItemProps) {
  const hasChildren = note.children.length > 0;
  const isExpanded = expandedNotes.has(note.id);
  const isSelected = selectedNoteId === note.id;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 pr-2 py-[3px] rounded-[6px] cursor-pointer text-sm transition-all ${
          isSelected
            ? "text-[#ebebeb] bg-[rgba(255,255,255,0.055)]"
            : "text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb]"
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onSelectNote(note.id)}
      >
        {/* Expand/collapse toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(note.id);
          }}
          className={`w-4 h-4 flex items-center justify-center rounded hover:bg-[rgba(255,255,255,0.1)] cursor-pointer ${
            hasChildren ? "visible" : "invisible"
          }`}
        >
          <svg
            className={`w-3 h-3 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Note content */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[15px] shrink-0">{note.icon}</span>
          <span className="truncate">{note.title || "Untitled"}</span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
          {/* Archive button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onArchiveNote(note.id);
            }}
            className="p-0.5 text-[#6b6b6b] hover:text-[#aeaeae] hover:bg-[rgba(255,255,255,0.1)] rounded transition-all cursor-pointer"
            title="Archive note"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </button>
          {/* Add sub-note button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExpandNote(note.id);
              onCreateNote(note.id);
            }}
            className="p-0.5 text-[#6b6b6b] hover:text-[#aeaeae] hover:bg-[rgba(255,255,255,0.1)] rounded transition-all cursor-pointer"
            title="Add sub-note"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div className="flex flex-col gap-[1px] mt-[1px]">
          {note.children.map((child) => (
            <NoteItem
              key={child.id}
              note={child}
              depth={depth + 1}
              selectedNoteId={selectedNoteId}
              expandedNotes={expandedNotes}
              onToggleExpand={onToggleExpand}
              onExpandNote={onExpandNote}
              onSelectNote={onSelectNote}
              onCreateNote={onCreateNote}
              onArchiveNote={onArchiveNote}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ selectedNoteId, onSelectNote, onCreateNote, onArchiveNote, onGoHome, notes }: SidebarProps) {
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    notes: true,
    vault: true,
    memories: false,
  });
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage after hydration
  useEffect(() => {
    const savedSections = localStorage.getItem("sidebar-sections");
    if (savedSections) {
      setOpenSections(JSON.parse(savedSections));
    }
    const savedExpanded = localStorage.getItem("expanded-notes");
    if (savedExpanded) {
      setExpandedNotes(new Set(JSON.parse(savedExpanded)));
    }
    setHydrated(true);
  }, []);

  // Persist open sections to localStorage
  useEffect(() => {
    if (hydrated) {
      localStorage.setItem("sidebar-sections", JSON.stringify(openSections));
    }
  }, [openSections, hydrated]);

  // Persist expanded notes to localStorage
  useEffect(() => {
    if (hydrated) {
      localStorage.setItem("expanded-notes", JSON.stringify([...expandedNotes]));
    }
  }, [expandedNotes, hydrated]);

  const noteTree = useMemo(() => buildNoteTree(notes), [notes]);

  const toggleSection = (section: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleNoteExpand = (id: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandNote = (id: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  return (
    <aside className="flex flex-col w-60 h-full bg-[#202020] border-r border-[#2f2f2f] shrink-0 select-none">
      {/* Workspace header */}
      <div 
        className="flex items-center h-11 px-3 hover:bg-[#2f2f2f] cursor-pointer"
        onClick={onGoHome}
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xs font-medium text-white">
            M
          </div>
          <span className="text-sm font-medium text-[#e3e3e3] truncate">Mothership</span>
        </div>
      </div>

      {/* Search and quick actions */}
      <div className="px-2 py-1">
        <div className="flex items-center gap-2 px-2 py-1.5 text-[#9b9b9b] hover:bg-[#2f2f2f] rounded cursor-pointer text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span>Search</span>
        </div>
        <div 
          className="flex items-center gap-2 px-2 py-1.5 text-[#9b9b9b] hover:bg-[#2f2f2f] rounded cursor-pointer text-sm"
          onClick={() => onCreateNote()}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span>Create</span>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#2f2f2f] mx-2 my-1" />

      {/* Sections */}
      <div className="flex-1 overflow-auto px-2 py-2">
        {/* NOTES Section */}
        <div className="flex items-center justify-between">
          <div
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[#91918e] uppercase tracking-wider cursor-pointer hover:text-[#aeaeae] rounded transition-colors"
            onClick={() => toggleSection("notes")}
          >
            <svg
              className={`w-3 h-3 transition-transform duration-150 ${openSections.notes ? "rotate-90" : ""}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            <span>Notes</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateNote();
            }}
            className="p-1 text-[#6b6b6b] hover:text-[#aeaeae] hover:bg-[rgba(255,255,255,0.055)] rounded transition-all"
            title="Create new note"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>
        </div>
        {openSections.notes && (
          <div className="ml-1 mt-0.5 flex flex-col gap-[1px]">
            {noteTree.length === 0 ? (
              <div className="px-2 py-2 text-[#6b6b6b] text-sm italic">
                No notes yet
              </div>
            ) : (
              noteTree.map((note) => (
                <NoteItem
                  key={note.id}
                  note={note}
                  depth={0}
                  selectedNoteId={selectedNoteId}
                  expandedNotes={expandedNotes}
                  onToggleExpand={toggleNoteExpand}
                  onExpandNote={expandNote}
                  onSelectNote={onSelectNote}
                  onCreateNote={onCreateNote}
                  onArchiveNote={onArchiveNote}
                />
              ))
            )}
          </div>
        )}

        {/* VAULT Section */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[#91918e] uppercase tracking-wider cursor-pointer hover:text-[#aeaeae] rounded transition-colors mt-6"
          onClick={() => toggleSection("vault")}
        >
          <svg
            className={`w-3 h-3 transition-transform duration-150 ${openSections.vault ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          <span>Vault</span>
        </div>
        {openSections.vault && (
          <div className="ml-1 mt-0.5 flex flex-col gap-[1px]">
            <div className="flex items-center gap-2.5 px-2 py-[3px] text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] cursor-pointer text-sm transition-all">
              <span className="text-[15px]">🔐</span>
              <span className="truncate">Passwords</span>
            </div>
            <div className="flex items-center gap-2.5 px-2 py-[3px] text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] cursor-pointer text-sm transition-all">
              <span className="text-[15px]">🔑</span>
              <span className="truncate">API Keys</span>
            </div>
            <div className="flex items-center gap-2.5 px-2 py-[3px] text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] cursor-pointer text-sm transition-all">
              <span className="text-[15px]">📁</span>
              <span className="truncate">Secure Documents</span>
            </div>
          </div>
        )}

        {/* MEMORIES Section */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[#91918e] uppercase tracking-wider cursor-pointer hover:text-[#aeaeae] rounded transition-colors mt-6"
          onClick={() => toggleSection("memories")}
        >
          <svg
            className={`w-3 h-3 transition-transform duration-150 ${openSections.memories ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          <span>Memories</span>
        </div>
        {openSections.memories && (
          <div className="ml-1 mt-0.5 flex flex-col gap-[1px]">
            <div className="flex items-center gap-2.5 px-2 py-[3px] text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] cursor-pointer text-sm transition-all">
              <span className="text-[15px]">📸</span>
              <span className="truncate">Photos</span>
            </div>
            <div className="flex items-center gap-2.5 px-2 py-[3px] text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] cursor-pointer text-sm transition-all">
              <span className="text-[15px]">🎥</span>
              <span className="truncate">Videos</span>
            </div>
            <div className="flex items-center gap-2.5 px-2 py-[3px] text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] cursor-pointer text-sm transition-all">
              <span className="text-[15px]">📅</span>
              <span className="truncate">Journal</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom section */}
      <div className="px-2 py-2 border-t border-[#2f2f2f]">
        <div className="flex items-center gap-2.5 px-2 py-[3px] text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] cursor-pointer text-sm transition-all">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>Settings</span>
        </div>
      </div>
    </aside>
  );
}
