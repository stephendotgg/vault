"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Note } from "@/types/models";

interface NoteEditorProps {
  note: Note;
  allNotes: Note[];
  onUpdate: (note: Note) => void;
  onDelete: (id: string) => void;
  onSelectNote: (id: string) => void;
}

export function NoteEditor({ note, allNotes, onUpdate, onDelete, onSelectNote }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Build breadcrumb trail from current note to root
  const breadcrumbs = useMemo(() => {
    const trail: Note[] = [];
    let current: Note | undefined = note;
    
    while (current) {
      trail.unshift(current);
      current = current.parentId 
        ? allNotes.find(n => n.id === current!.parentId) 
        : undefined;
    }
    
    return trail;
  }, [note, allNotes]);

  // Auto-save function
  const saveNote = useCallback(async (newTitle: string, newContent: string) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, content: newContent }),
      });

      if (res.ok) {
        const updatedNote = await res.json();
        setLastSaved(new Date());
        onUpdate(updatedNote);
      }
    } catch (error) {
      console.error("Failed to save note:", error);
    } finally {
      setIsSaving(false);
    }
  }, [note.id, onUpdate]);

  // TipTap editor
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        bulletList: {
          HTMLAttributes: {
            class: "list-disc pl-6 space-y-1",
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: "list-decimal pl-6 space-y-1",
          },
        },
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Placeholder.configure({
        placeholder: "Start typing...",
      }),
    ],
    content: note.content,
    editorProps: {
      attributes: {
        class: "prose prose-invert max-w-none focus:outline-none min-h-[calc(100vh-250px)] text-[#e3e3e3] text-base leading-relaxed",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new timeout for auto-save (500ms debounce)
      saveTimeoutRef.current = setTimeout(() => {
        saveNote(title, html);
      }, 500);
    },
  });

  // Update editor content when note changes
  useEffect(() => {
    if (editor && note.content !== editor.getHTML()) {
      editor.commands.setContent(note.content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id, editor]);

  // Update title ref for save function
  const titleRef = useRef(title);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  // Debounced auto-save on title change
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);

    // Optimistically update the note in parent state for instant sidebar update
    onUpdate({ ...note, title: newTitle });

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for auto-save (500ms debounce)
    saveTimeoutRef.current = setTimeout(() => {
      saveNote(newTitle, editor?.getHTML() || note.content);
    }, 500);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Handle delete
  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this note?")) return;

    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        onDelete(note.id);
      }
    } catch (error) {
      console.error("Failed to delete note:", error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between h-11 px-4 border-b border-[#2f2f2f] shrink-0">
        <div className="flex items-center gap-1 text-sm text-[#9b9b9b] overflow-hidden">
          {breadcrumbs.map((crumb, index) => (
            <div key={crumb.id} className="flex items-center gap-1 min-w-0">
              {index > 0 && (
                <svg className="w-3 h-3 text-[#6b6b6b] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              )}
              {index === breadcrumbs.length - 1 ? (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="shrink-0">{crumb.icon}</span>
                  <span className="truncate">{crumb.id === note.id ? (title || "Untitled") : (crumb.title || "Untitled")}</span>
                </div>
              ) : (
                <button
                  onClick={() => onSelectNote(crumb.id)}
                  className="flex items-center gap-1.5 hover:text-[#e3e3e3] transition-colors min-w-0 cursor-pointer"
                >
                  <span className="shrink-0">{crumb.icon}</span>
                  <span className="truncate max-w-[120px]">{crumb.title || "Untitled"}</span>
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {isSaving && (
            <span className="text-xs text-[#6b6b6b]">Saving...</span>
          )}
          {!isSaving && lastSaved && (
            <span className="text-xs text-[#6b6b6b]">Saved</span>
          )}
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-16 py-12">
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            placeholder="Untitled"
            className="w-full text-4xl font-bold text-[#e3e3e3] bg-transparent border-none outline-none placeholder-[#4a4a4a] mb-4"
          />

          {/* Rich Text Editor */}
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
