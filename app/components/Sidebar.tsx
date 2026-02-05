"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Note } from "@/types/models";

type SectionKey = "notes" | "vault" | "memories" | "dreamJournal" | "voiceLog";

interface NoteWithChildren extends Note {
  children: NoteWithChildren[];
}

interface ContextMenuState {
  x: number;
  y: number;
  noteId: string;
}

interface SidebarProps {
  selectedNoteId?: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: (parentId?: string) => void;
  onArchiveNote: (id: string) => void;
  onRenameNote: (id: string, newTitle: string) => void;
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
  editingNoteId: string | null;
  onToggleExpand: (id: string) => void;
  onExpandNote: (id: string) => void;
  onSelectNote: (id: string) => void;
  onCreateNote: (parentId?: string) => void;
  onArchiveNote: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, noteId: string) => void;
  onStartRename: (id: string) => void;
  onFinishRename: (id: string, newTitle: string) => void;
  onCancelRename: () => void;
}

// Document icon - filled if has content, outline if empty
function NoteIcon({ hasContent }: { hasContent: boolean }) {
  if (hasContent) {
    // Filled document icon with lines
    return (
      <svg className="w-4 h-4 shrink-0 text-[#9b9b9b]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
        <path d="M14 2v6h6" fill="none" stroke="currentColor" strokeWidth="1"/>
        <line x1="8" y1="13" x2="16" y2="13" stroke="#202020" strokeWidth="1.5"/>
        <line x1="8" y1="17" x2="14" y2="17" stroke="#202020" strokeWidth="1.5"/>
      </svg>
    );
  }
  // Outline document icon
  return (
    <svg className="w-4 h-4 shrink-0 text-[#6b6b6b]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
      <polyline points="14,2 14,8 20,8"/>
    </svg>
  );
}

function NoteItem({ 
  note, 
  depth, 
  selectedNoteId, 
  expandedNotes,
  editingNoteId,
  onToggleExpand,
  onExpandNote, 
  onSelectNote,
  onCreateNote,
  onArchiveNote,
  onContextMenu,
  onStartRename,
  onFinishRename,
  onCancelRename
}: NoteItemProps) {
  const hasChildren = note.children.length > 0;
  const isExpanded = expandedNotes.has(note.id);
  const isSelected = selectedNoteId === note.id;
  const isEditing = editingNoteId === note.id;
  const inputRef = useRef<HTMLInputElement>(null);
  const [editValue, setEditValue] = useState(note.title);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      setEditValue(note.title);
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing, note.title]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onFinishRename(note.id, editValue);
    } else if (e.key === "Escape") {
      setEditValue(note.title);
      onCancelRename();
    }
  };

  return (
    <div>
      <div
        className={`group flex items-center gap-1 pr-2 py-[3px] rounded-[6px] cursor-pointer text-sm transition-all ${
          isSelected
            ? "text-[#ebebeb] bg-[rgba(255,255,255,0.055)]"
            : "text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb]"
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => !isEditing && onSelectNote(note.id)}
        onContextMenu={(e) => onContextMenu(e, note.id)}
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
        <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
          <NoteIcon hasContent={note.content.length > 0 && note.content !== "<p></p>"} />
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => onFinishRename(note.id, editValue)}
              className="bg-transparent text-[#ebebeb] text-sm outline-none border-none p-0 m-0 w-full min-w-0"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate">{note.title || "Untitled"}</span>
          )}
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
              editingNoteId={editingNoteId}
              onToggleExpand={onToggleExpand}
              onExpandNote={onExpandNote}
              onSelectNote={onSelectNote}
              onCreateNote={onCreateNote}
              onArchiveNote={onArchiveNote}
              onContextMenu={onContextMenu}
              onStartRename={onStartRename}
              onFinishRename={onFinishRename}
              onCancelRename={onCancelRename}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CreateMenuState {
  x: number;
  y: number;
}

export function Sidebar({ selectedNoteId, onSelectNote, onCreateNote, onArchiveNote, onRenameNote, onGoHome, notes }: SidebarProps) {
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    notes: true,
    vault: true,
    memories: false,
    dreamJournal: false,
    voiceLog: false,
  });
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [createMenu, setCreateMenu] = useState<CreateMenuState | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

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

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [contextMenu]);

  // Close create menu on click outside
  useEffect(() => {
    const handleClick = () => setCreateMenu(null);
    if (createMenu) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [createMenu]);

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

  const handleContextMenu = (e: React.MouseEvent, noteId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, noteId });
  };

  const handleFinishRename = (id: string, newTitle: string) => {
    onRenameNote(id, newTitle);
    setEditingNoteId(null);
  };

  return (
    <aside className="flex flex-col w-60 h-full bg-[#202020] border-r border-[#2f2f2f] shrink-0 select-none">
      {/* Workspace header */}
      <div className="px-2 py-2">
        <div 
          className="flex items-center gap-2 px-2 py-1.5 hover:bg-[rgba(255,255,255,0.055)] rounded-[6px] cursor-pointer"
          onClick={onGoHome}
        >
          <div className="w-5 h-5 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xs font-medium text-white shrink-0">
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
          onClick={(e) => {
            setCreateMenu({ x: e.clientX, y: e.clientY });
          }}
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
                  editingNoteId={editingNoteId}
                  onToggleExpand={toggleNoteExpand}
                  onExpandNote={expandNote}
                  onSelectNote={onSelectNote}
                  onCreateNote={onCreateNote}
                  onArchiveNote={onArchiveNote}
                  onContextMenu={handleContextMenu}
                  onStartRename={(id) => setEditingNoteId(id)}
                  onFinishRename={handleFinishRename}
                  onCancelRename={() => setEditingNoteId(null)}
                />
              ))
            )}
          </div>
        )}

        {/* VAULT Section */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[#91918e] uppercase tracking-wider cursor-pointer hover:text-[#aeaeae] rounded transition-colors mt-4"
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
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[#91918e] uppercase tracking-wider cursor-pointer hover:text-[#aeaeae] rounded transition-colors mt-4"
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

        {/* DREAM JOURNAL Section */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[#91918e] uppercase tracking-wider cursor-pointer hover:text-[#aeaeae] rounded transition-colors mt-4"
          onClick={() => toggleSection("dreamJournal")}
        >
          <svg
            className={`w-3 h-3 transition-transform duration-150 ${openSections.dreamJournal ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          <span>Dream Journal</span>
        </div>
        {openSections.dreamJournal && (
          <div className="ml-1 mt-0.5 flex flex-col gap-[1px]">
            <div className="px-2 py-2 text-[#6b6b6b] text-sm italic">
              No dreams yet
            </div>
          </div>
        )}

        {/* VOICE LOG Section */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[#91918e] uppercase tracking-wider cursor-pointer hover:text-[#aeaeae] rounded transition-colors mt-4"
          onClick={() => toggleSection("voiceLog")}
        >
          <svg
            className={`w-3 h-3 transition-transform duration-150 ${openSections.voiceLog ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          <span>Voice Log</span>
        </div>
        {openSections.voiceLog && (
          <div className="ml-1 mt-0.5 flex flex-col gap-[1px]">
            <div className="px-2 py-2 text-[#6b6b6b] text-sm italic">
              No recordings yet
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-[#2f2f2f] mx-2 my-1" />

      {/* Bottom section */}
      <div className="px-2 py-2">
        <div className="flex items-center gap-2 px-2 py-1.5 text-[#9b9b9b] hover:bg-[#2f2f2f] rounded cursor-pointer text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          <span>Archive</span>
        </div>
        <div className="flex items-center gap-2 px-2 py-1.5 text-[#9b9b9b] hover:bg-[#2f2f2f] rounded cursor-pointer text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>Settings</span>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-[#252525] border border-[#2f2f2f] rounded-lg shadow-xl p-1 min-w-[160px] z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full flex items-center gap-2 px-2 py-[3px] text-sm text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] transition-all text-left cursor-pointer"
            onClick={() => {
              setEditingNoteId(contextMenu.noteId);
              setContextMenu(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Rename
          </button>
          <button
            className="w-full flex items-center gap-2 px-2 py-[3px] text-sm text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] transition-all text-left cursor-pointer"
            onClick={() => {
              onArchiveNote(contextMenu.noteId);
              setContextMenu(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            Archive
          </button>
        </div>
      )}

      {/* Create Menu */}
      {createMenu && (
        <div
          className="fixed bg-[#252525] border border-[#2f2f2f] rounded-lg shadow-xl p-1 min-w-[160px] z-50"
          style={{ left: createMenu.x, top: createMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full flex items-center gap-2 px-2 py-[3px] text-sm text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] transition-all text-left cursor-pointer"
            onClick={() => {
              onCreateNote();
              setCreateMenu(null);
            }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
              <polyline points="14,2 14,8 20,8"/>
            </svg>
            Note
          </button>
          <button
            className="w-full flex items-center gap-2 px-2 py-[3px] text-sm text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] transition-all text-left cursor-pointer"
            onClick={() => {
              setCreateMenu(null);
            }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
            Dream Journal
          </button>
          <button
            className="w-full flex items-center gap-2 px-2 py-[3px] text-sm text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] transition-all text-left cursor-pointer"
            onClick={() => {
              setCreateMenu(null);
            }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            Voice Log
          </button>
          <button
            className="w-full flex items-center gap-2 px-2 py-[3px] text-sm text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] transition-all text-left cursor-pointer"
            onClick={() => {
              setCreateMenu(null);
            }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            Memory
          </button>
        </div>
      )}
    </aside>
  );
}
