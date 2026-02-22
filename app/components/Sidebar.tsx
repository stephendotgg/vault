"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Note } from "@/types/models";
import { IconPicker } from "./IconPicker";

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
  onMoveNote: (noteId: string, newParentId: string | null, newOrder: number) => void;
  onGoHome: () => void;
  onOpenVault: () => void;
  onOpenVaultAddModal: (tag?: string) => void;
  onOpenMemories: () => void;
  onOpenMemoryAddModal: () => void;
  onOpenArchive: () => void;
  onOpenFileCleaner: () => void;
  onOpenAI: () => void;
  onOpenSearch: () => void;
  onUpdateNote: (note: Note) => void;
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

type DropPosition = "before" | "after" | "inside";

interface DragState {
  draggedId: string | null;
  targetId: string | null;
  position: DropPosition | null;
}

interface NoteItemProps {
  note: NoteWithChildren;
  depth: number;
  selectedNoteId?: string | null;
  expandedNotes: Set<string>;
  editingNoteId: string | null;
  dragState: DragState;
  hiddenNoteNames: Set<string>;
  obfuscateTitle: (title: string) => string;
  onToggleExpand: (id: string) => void;
  onExpandNote: (id: string) => void;
  onSelectNote: (id: string) => void;
  onCreateNote: (parentId?: string) => void;
  onArchiveNote: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, noteId: string) => void;
  onStartRename: (id: string) => void;
  onFinishRename: (id: string, newTitle: string) => void;
  onCancelRename: () => void;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragLeave: () => void;
  onDrop: (targetId: string) => void;
  onDragEnd: () => void;
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
  dragState,
  hiddenNoteNames,
  obfuscateTitle,
  onToggleExpand,
  onExpandNote, 
  onSelectNote,
  onCreateNote,
  onArchiveNote,
  onContextMenu,
  onStartRename,
  onFinishRename,
  onCancelRename,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd
}: NoteItemProps) {
  const hasChildren = note.children.length > 0;
  const isExpanded = expandedNotes.has(note.id);
  const isSelected = selectedNoteId === note.id;
  const isEditing = editingNoteId === note.id;
  const isDragging = dragState.draggedId === note.id;
  const isDropTarget = dragState.targetId === note.id;
  const dropPosition = isDropTarget ? dragState.position : null;
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
    <div className="relative">
      {/* Drop indicator - before */}
      {dropPosition === "before" && (
        <div className="absolute left-2 right-2 top-0 h-0.5 bg-blue-500 rounded-full z-10" />
      )}
      
      <div
        className={`group flex items-center gap-1 pr-2 py-[3px] rounded-[6px] cursor-pointer text-sm transition-all ${
          isSelected
            ? "text-[#ebebeb] bg-[rgba(255,255,255,0.055)]"
            : "text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb]"
        } ${isDragging ? "opacity-50" : ""} ${dropPosition === "inside" ? "ring-2 ring-blue-500 ring-inset" : ""}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        draggable={!isEditing}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", note.id);
          onDragStart(note.id);
        }}
        onDragOver={(e) => onDragOver(e, note.id)}
        onDragLeave={onDragLeave}
        onDrop={(e) => {
          e.preventDefault();
          onDrop(note.id);
        }}
        onDragEnd={onDragEnd}
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
          <NoteIcon icon={note.icon} hasContent={note.content.length > 0 && note.content !== "<p></p>"} />
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
            <span 
              className={`truncate ${hiddenNoteNames.has(note.id) ? "tracking-[0.15em] text-[#6b6b6b]" : ""}`}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onStartRename(note.id);
              }}
            >{hiddenNoteNames.has(note.id) ? obfuscateTitle(note.title || "Untitled") : (note.title || "Untitled")}</span>
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
              hiddenNoteNames={hiddenNoteNames}
              obfuscateTitle={obfuscateTitle}
              onToggleExpand={onToggleExpand}
              onExpandNote={onExpandNote}
              onSelectNote={onSelectNote}
              onCreateNote={onCreateNote}
              onArchiveNote={onArchiveNote}
              onContextMenu={onContextMenu}
              onStartRename={onStartRename}
              onFinishRename={onFinishRename}
              onCancelRename={onCancelRename}
              dragState={dragState}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
      
      {/* Drop indicator - after */}
      {dropPosition === "after" && (
        <div className="absolute left-2 right-2 bottom-0 h-0.5 bg-blue-500 rounded-full z-10" />
      )}
    </div>
  );
}

interface CreateMenuState {
  x: number;
  y: number;
}

export function Sidebar({ selectedNoteId, onSelectNote, onCreateNote, onArchiveNote, onRenameNote, onMoveNote, onGoHome, onOpenVault, onOpenVaultAddModal, onOpenMemories, onOpenMemoryAddModal, onOpenArchive, onOpenFileCleaner, onOpenAI, onOpenSearch, onUpdateNote, notes }: SidebarProps) {
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
  const [isExporting, setIsExporting] = useState(false);
  const [iconPickerNoteId, setIconPickerNoteId] = useState<string | null>(null);
  const [iconPickerPosition, setIconPickerPosition] = useState<{ x: number; y: number } | null>(null);
  const [hiddenNoteNames, setHiddenNoteNames] = useState<Set<string>>(new Set());
  
  // Drag and drop state
  const [dragState, setDragState] = useState<DragState>({
    draggedId: null,
    targetId: null,
    position: null,
  });

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
    const savedHiddenNames = localStorage.getItem("hidden-note-names");
    if (savedHiddenNames) {
      setHiddenNoteNames(new Set(JSON.parse(savedHiddenNames)));
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

  // Persist hidden note names to localStorage
  useEffect(() => {
    if (hydrated) {
      localStorage.setItem("hidden-note-names", JSON.stringify([...hiddenNoteNames]));
    }
  }, [hiddenNoteNames, hydrated]);

  // Toggle hidden name for a note
  const toggleHiddenName = (noteId: string) => {
    setHiddenNoteNames((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  };

  // Obfuscate a title with bullets (same formula as AI chat)
  const obfuscateTitle = (title: string): string => {
    const bulletCount = Math.min(Math.max(Math.round(title.length * 0.75), 3), 15);
    return "●".repeat(bulletCount);
  };

  // Filter out archived notes before building tree
  const activeNotes = useMemo(() => notes.filter(n => !n.archived), [notes]);
  const noteTree = useMemo(() => buildNoteTree(activeNotes), [activeNotes]);

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

  // Drag and drop handlers
  const handleDragStart = (id: string) => {
    setDragState({ draggedId: id, targetId: null, position: null });
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragState.draggedId || dragState.draggedId === targetId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    let position: DropPosition;
    if (y < height * 0.25) {
      position = "before";
    } else if (y > height * 0.75) {
      position = "after";
    } else {
      position = "inside";
    }

    if (dragState.targetId !== targetId || dragState.position !== position) {
      setDragState((prev) => ({ ...prev, targetId, position }));
    }
  };

  const handleDragLeave = () => {
    // Don't clear immediately - let dragOver of next element handle it
  };

  const handleDrop = (targetId: string) => {
    if (!dragState.draggedId || dragState.draggedId === targetId || !dragState.position) {
      setDragState({ draggedId: null, targetId: null, position: null });
      return;
    }

    const draggedNote = notes.find((n) => n.id === dragState.draggedId);
    const targetNote = notes.find((n) => n.id === targetId);
    if (!draggedNote || !targetNote) return;

    // Prevent dropping a note into its own children
    const isDescendant = (parentId: string, childId: string): boolean => {
      const children = notes.filter((n) => n.parentId === parentId);
      for (const child of children) {
        if (child.id === childId) return true;
        if (isDescendant(child.id, childId)) return true;
      }
      return false;
    };

    if (isDescendant(dragState.draggedId, targetId)) {
      setDragState({ draggedId: null, targetId: null, position: null });
      return;
    }

    let newParentId: string | null;
    let newOrder: number;

    if (dragState.position === "inside") {
      // Make it a child of target
      newParentId = targetId;
      const siblings = notes.filter((n) => n.parentId === targetId);
      newOrder = siblings.length > 0 ? Math.max(...siblings.map((n) => n.order)) + 1 : 0;
      // Expand the target so user can see the dropped note
      expandNote(targetId);
    } else {
      // Same parent as target
      newParentId = targetNote.parentId || null;
      
      if (dragState.position === "before") {
        newOrder = targetNote.order;
      } else {
        newOrder = targetNote.order + 1;
      }
    }

    onMoveNote(dragState.draggedId, newParentId, newOrder);
    setDragState({ draggedId: null, targetId: null, position: null });
  };

  const handleDragEnd = () => {
    setDragState({ draggedId: null, targetId: null, position: null });
  };

  return (
    <aside className="flex flex-col w-60 h-full bg-[#202020] border-r border-[#2f2f2f] shrink-0 select-none">
      {/* Workspace header */}
      <div className="px-2 py-2">
        <div 
          className="flex items-center gap-2 px-2 py-1.5 hover:bg-[rgba(255,255,255,0.055)] rounded-[6px] cursor-pointer"
          onClick={onGoHome}
        >
          <div className="w-5 h-5 rounded bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-xs font-medium text-white shrink-0">
            M
          </div>
          <span className="text-sm font-medium text-[#7eb8f7] truncate">Mothership</span>
        </div>
      </div>

      {/* Search and quick actions */}
      <div className="px-2 py-1">
        <div 
          className="flex items-center gap-2 px-2 py-1.5 text-[#9b9b9b] hover:bg-[#2f2f2f] rounded cursor-pointer text-sm"
          onClick={onOpenSearch}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span>Search</span>
        </div>
        <div
          className="flex items-center gap-2 px-2 py-1.5 text-[#9b9b9b] hover:bg-[#2f2f2f] rounded cursor-pointer text-sm"
          onClick={onOpenAI}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H8l-4 4V6a1 1 0 011-1z" />
          </svg>
          <span>AI Chat</span>
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
          <span>New</span>
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
                  dragState={dragState}
                  hiddenNoteNames={hiddenNoteNames}
                  obfuscateTitle={obfuscateTitle}
                  onToggleExpand={toggleNoteExpand}
                  onExpandNote={expandNote}
                  onSelectNote={onSelectNote}
                  onCreateNote={onCreateNote}
                  onArchiveNote={onArchiveNote}
                  onContextMenu={handleContextMenu}
                  onStartRename={(id) => setEditingNoteId(id)}
                  onFinishRename={handleFinishRename}
                  onCancelRename={() => setEditingNoteId(null)}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                />
              ))
            )}
          </div>
        )}

        {/* VAULT Section */}
        <div className="flex items-center justify-between mt-5">
          <div
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[#91918e] uppercase tracking-wider cursor-pointer hover:text-[#aeaeae] rounded transition-colors"
            onClick={() => onOpenVault()}
          >
            <span>Vault</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenVaultAddModal();
            }}
            className="p-1 text-[#6b6b6b] hover:text-[#aeaeae] hover:bg-[rgba(255,255,255,0.055)] rounded transition-all"
            title="Add to vault"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>
        </div>

        {/* MEMORIES Section */}
        <div className="flex items-center justify-between mt-5">
          <div
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[#91918e] uppercase tracking-wider cursor-pointer hover:text-[#aeaeae] rounded transition-colors"
            onClick={() => onOpenMemories()}
          >
            <span>Memories</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenMemoryAddModal();
            }}
            className="p-1 text-[#6b6b6b] hover:text-[#aeaeae] hover:bg-[rgba(255,255,255,0.055)] rounded transition-all"
            title="Add memory"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>
        </div>

        {/* DREAM JOURNAL Section */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[#91918e] uppercase tracking-wider cursor-pointer hover:text-[#aeaeae] rounded transition-colors mt-5"
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
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[#91918e] uppercase tracking-wider cursor-pointer hover:text-[#aeaeae] rounded transition-colors mt-5"
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
      <div className="px-2 pt-1 pb-2">
        <button
          onClick={onOpenFileCleaner}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-[#9b9b9b] hover:bg-[#2f2f2f] rounded cursor-pointer text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span>File Cleaner</span>
        </button>
        <button
          onClick={onOpenArchive}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-[#9b9b9b] hover:bg-[#2f2f2f] rounded cursor-pointer text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          <span>Archive</span>
        </button>
        <button
          disabled={isExporting}
          onClick={async () => {
            if (isExporting) return;
            setIsExporting(true);
            try {
              const response = await fetch("/api/export");
              if (!response.ok) throw new Error("Export failed");
              const blob = await response.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = response.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || "mothership-backup.zip";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            } catch (error) {
              console.error("Export failed:", error);
              alert("Failed to export data");
            } finally {
              setIsExporting(false);
            }
          }}
          className={`w-full flex items-center gap-2 px-2 py-1.5 text-[#9b9b9b] rounded text-sm ${isExporting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#2f2f2f] cursor-pointer'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span>{isExporting ? "Exporting..." : "Export"}</span>
        </button>
        {/* <div className="flex items-center gap-2 px-2 py-1.5 text-[#9b9b9b] hover:bg-[#2f2f2f] rounded cursor-pointer text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>Settings</span>
        </div> */}
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
              setIconPickerNoteId(contextMenu.noteId);
              setIconPickerPosition({ x: contextMenu.x, y: contextMenu.y });
              setContextMenu(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Change Icon
          </button>
          <button
            className="w-full flex items-center gap-2 px-2 py-[3px] text-sm text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] transition-all text-left cursor-pointer"
            onClick={() => {
              toggleHiddenName(contextMenu.noteId);
              setContextMenu(null);
            }}
          >
            {hiddenNoteNames.has(contextMenu.noteId) ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Unhide Name
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
                Hide Name
              </>
            )}
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
              onOpenVaultAddModal();
              setCreateMenu(null);
            }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <path d="M12 8v8"/>
              <path d="M8 12h8"/>
            </svg>
            Vault Item
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
        </div>
      )}

      {/* Icon Picker */}
      {iconPickerNoteId && iconPickerPosition && (
        <div
          className="fixed z-50"
          style={{ left: iconPickerPosition.x, top: iconPickerPosition.y }}
        >
          <IconPicker
            currentIcon={notes.find(n => n.id === iconPickerNoteId)?.icon || "📄"}
            noteId={iconPickerNoteId}
            onIconChange={(newIcon) => {
              const note = notes.find(n => n.id === iconPickerNoteId);
              if (note) {
                onUpdateNote({ ...note, icon: newIcon });
              }
            }}
            onClose={() => {
              setIconPickerNoteId(null);
              setIconPickerPosition(null);
            }}
          />
        </div>
      )}
    </aside>
  );
}
