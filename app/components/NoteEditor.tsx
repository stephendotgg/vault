"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import ReactMarkdown from "react-markdown";
import { AutoCorrect } from "@/app/extensions/AutoCorrect";
import { Note } from "@/types/models";

// Storage keys
const OPENROUTER_API_KEY_STORAGE_KEY = "mothership-openrouter-api-key";

// Strip HTML for plain text
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function isImageUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function parseImageWidth(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const width = parseInt(value, 10);
    return Number.isFinite(width) ? width : null;
  }

  return null;
}

function buildUploadFilename(file: Blob & { name?: string }, prefix: string): string {
  const rawName = typeof file.name === "string" ? file.name.trim() : "";
  if (rawName.length > 0) {
    return rawName;
  }

  const mime = typeof file.type === "string" ? file.type.toLowerCase() : "";
  let ext = "png";
  if (mime === "image/jpeg") ext = "jpg";
  else if (mime === "image/gif") ext = "gif";
  else if (mime === "image/webp") ext = "webp";
  else if (mime === "image/svg+xml") ext = "svg";
  else if (mime === "image/bmp") ext = "bmp";
  else if (mime === "image/avif") ext = "avif";

  return `${prefix}-${Date.now()}.${ext}`;
}

const NoteImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const dataWidth = element.getAttribute("data-width");
          if (dataWidth) {
            const parsed = parseInt(dataWidth, 10);
            if (Number.isFinite(parsed)) {
              return parsed;
            }
          }

          const styleWidth = element.style.width;
          if (styleWidth?.endsWith("px")) {
            const parsed = parseInt(styleWidth.replace("px", ""), 10);
            if (Number.isFinite(parsed)) {
              return parsed;
            }
          }

          return null;
        },
        renderHTML: (attributes: { width?: unknown }) => {
          const width = parseImageWidth(attributes.width);
          if (!width) {
            return {};
          }

          return {
            "data-width": String(width),
            style: `width:${width}px;height:auto;`,
          };
        },
      },
    };
  },
});

// Note icon - can be emoji, custom image, or default document icon
function NoteIcon({ icon, hasContent, className = "" }: { 
  icon: string; 
  hasContent: boolean; 
  className?: string;
}) {
  // Custom image icon (stored as "icon:filename.ext")
  if (icon.startsWith("icon:")) {
    const filename = icon.substring(5);
    return (
      <img 
        src={`/api/icons/${filename}`} 
        alt="" 
        className={`w-4 h-4 shrink-0 rounded-sm object-cover ${className}`}
      />
    );
  }
  
  // Emoji icon (any non-default value that's not an image)
  if (icon && icon !== "📄") {
    return (
      <span className={`w-4 h-4 shrink-0 text-sm leading-none flex items-center justify-center ${className}`}>
        {icon}
      </span>
    );
  }
  
  // Default document icon
  if (hasContent) {
    return (
      <svg className={`w-4 h-4 shrink-0 text-[#9b9b9b] ${className}`} viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
        <path d="M14 2v6h6" fill="none" stroke="currentColor" strokeWidth="1"/>
        <line x1="8" y1="13" x2="16" y2="13" stroke="#202020" strokeWidth="1.5"/>
        <line x1="8" y1="17" x2="14" y2="17" stroke="#202020" strokeWidth="1.5"/>
      </svg>
    );
  }
  return (
    <svg className={`w-4 h-4 shrink-0 text-[#6b6b6b] ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
      <polyline points="14,2 14,8 20,8"/>
    </svg>
  );
}

// Chat message type
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface NoteEditorProps {
  note: Note;
  allNotes: Note[];
  onUpdate: (note: Note) => void;
  onDelete: (id: string) => void;
  onSelectNote: (id: string) => void;
  chatOpenStates: Map<string, boolean>;
  setChatOpenStates: React.Dispatch<React.SetStateAction<Map<string, boolean>>>;
  allChatMessages: Map<string, ChatMessage[]>;
  setAllChatMessages: React.Dispatch<React.SetStateAction<Map<string, ChatMessage[]>>>;
}

export function NoteEditor({ note, allNotes, onUpdate, onDelete, onSelectNote, chatOpenStates, setChatOpenStates, allChatMessages, setAllChatMessages }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const saveNoteRef = useRef<(newTitle: string, newContent: string) => Promise<void>>(async () => {});
  const uploadNoteImageRef = useRef<(file: File) => Promise<string | null>>(async () => null);

  // AI Chat state - local per-render state
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [copiedChatMessageId, setCopiedChatMessageId] = useState<string | null>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // Get current note's chat open state
  const showAIChat = chatOpenStates.get(note.id) || false;
  const setShowAIChat = (open: boolean) => {
    setChatOpenStates(prev => {
      const newMap = new Map(prev);
      newMap.set(note.id, open);
      return newMap;
    });
  };

  // Get current note's chat messages
  const chatMessages = allChatMessages.get(note.id) || [];
  const lastAssistantMessageId = useMemo(
    () => [...chatMessages].reverse().find((msg) => msg.role === "assistant")?.id ?? null,
    [chatMessages]
  );

  const setChatMessages = (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setAllChatMessages(prev => {
      const newMap = new Map(prev);
      const currentMessages = prev.get(note.id) || [];
      const newMessages = typeof updater === "function" ? updater(currentMessages) : updater;
      newMap.set(note.id, newMessages);
      return newMap;
    });
  };

  // Clear input when note changes
  useEffect(() => {
    setChatInput("");
    setChatError(null);
  }, [note.id]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Sync title when note changes externally (e.g., renamed from sidebar)
  useEffect(() => {
    setTitle(note.title);
  }, [note.title]);

  // Auto-focus title input when opening a new/empty note
  useEffect(() => {
    if (note.title === "" && note.content === "") {
      titleInputRef.current?.focus();
    }
  }, [note.id, note.title, note.content]);

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

  // Get child pages (sub-notes) for current note
  const childPages = useMemo(() => {
    return allNotes
      .filter(n => n.parentId === note.id && !n.archived)
      .sort((a, b) => a.order - b.order);
  }, [note.id, allNotes]);

  const uploadNoteImage = useCallback(async (file: File): Promise<string | null> => {
    try {
      console.log("[notes:image-upload][client] upload:start", {
        noteId: note.id,
        name: file.name,
        type: file.type,
        size: file.size,
      });

      const uploadFilename = buildUploadFilename(file, "note-image");
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      console.log("[notes:image-upload][client] upload:filename", {
        noteId: note.id,
        uploadFilename,
        mimeType: file.type,
        base64Length: base64.length,
      });

      const res = await fetch(`/api/notes/${note.id}/images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          base64,
          mimeType: file.type,
          ext: uploadFilename.split(".").pop()?.toLowerCase() ?? "png",
          originalName: uploadFilename,
        }),
      });

      if (!res.ok) {
        const responseText = await res.text().catch(() => "<failed to read response body>");
        console.error("[notes:image-upload][client] upload:failed", {
          noteId: note.id,
          status: res.status,
          statusText: res.statusText,
          responseText,
        });
        return null;
      }

      const data = await res.json();
      console.log("[notes:image-upload][client] upload:success", {
        noteId: note.id,
        url: data.url,
        filename: data.filename,
        requestId: data.requestId,
      });
      return data.url || null;
    } catch (error) {
      console.error("[notes:image-upload][client] upload:error", {
        noteId: note.id,
        error,
      });
      return null;
    }
  }, [note.id]);

  useEffect(() => {
    uploadNoteImageRef.current = uploadNoteImage;
  }, [uploadNoteImage]);

  const insertImageWithParagraph = useCallback((view: EditorView, src: string, alt?: string, atPos?: number) => {
    const imageType = view.state.schema.nodes.image;
    const paragraphType = view.state.schema.nodes.paragraph;
    if (!imageType) {
      return;
    }

    const editorContentEl = view.dom.closest(".max-w-3xl") as HTMLElement | null;
    const contentWidth = editorContentEl?.clientWidth ?? 700;
    const initialWidth = Math.max(240, Math.min(900, Math.floor(contentWidth * 0.85)));

    let tr = view.state.tr;

    if (typeof atPos === "number") {
      tr = tr.setSelection(TextSelection.create(tr.doc, atPos));
    }

    const imageNode = imageType.create({ src, alt, width: initialWidth });
    tr = tr.replaceSelectionWith(imageNode);

    const insertPos = tr.selection.from;

    if (paragraphType) {
      const paragraphNode = paragraphType.create();
      tr = tr.insert(insertPos, paragraphNode);
      tr = tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
    }

    view.dispatch(tr.scrollIntoView());
    view.focus();
  }, []);

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

  useEffect(() => {
    saveNoteRef.current = saveNote;
  }, [saveNote]);

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
      Link.configure({
        openOnClick: true,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: "text-blue-400 underline cursor-pointer",
        },
      }),
      NoteImage.configure({
        inline: false,
        HTMLAttributes: {
          class: "mothership-note-image",
        },
      }),
      AutoCorrect,
    ],
    content: note.content,
    editorProps: {
      attributes: {
        class: "prose prose-invert max-w-none focus:outline-none h-full min-h-[120px] text-[#e3e3e3] text-base leading-relaxed",
      },
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();

          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }

          void saveNoteRef.current(titleRef.current, editor?.getHTML() || note.content);
          return true;
        }

        return false;
      },
      handlePaste: (view, event) => {
        const clipboard = event.clipboardData;
        if (!clipboard) {
          return false;
        }

        const imageFiles = Array.from(clipboard.files).filter(file => file.type.startsWith("image/"));
        if (imageFiles.length > 0) {
          event.preventDefault();

          void (async () => {
            for (const file of imageFiles) {
              const imageUrl = await uploadNoteImageRef.current(file);
              if (imageUrl) {
                insertImageWithParagraph(view, imageUrl, file.name || "Pasted image");
              }
            }
          })();

          return true;
        }

        const plainText = clipboard.getData("text/plain").trim();
        if (isImageUrl(plainText)) {
          event.preventDefault();
          insertImageWithParagraph(view, plainText);

          return true;
        }

        return false;
      },
      handleDrop: (view, event) => {
        const dataTransfer = event.dataTransfer;
        if (!dataTransfer) {
          return false;
        }

        const imageFiles = Array.from(dataTransfer.files).filter(file => file.type.startsWith("image/"));
        if (imageFiles.length === 0) {
          return false;
        }

        event.preventDefault();

        const dropPosition = view.posAtCoords({ left: event.clientX, top: event.clientY });

        void (async () => {
          let insertPosition = dropPosition?.pos ?? view.state.selection.from;

          for (const file of imageFiles) {
            const imageUrl = await uploadNoteImageRef.current(file);
            if (imageUrl) {
              insertImageWithParagraph(view, imageUrl, file.name || "Dropped image", insertPosition);
              insertPosition = view.state.selection.from;
            }
          }
        })();

        return true;
      },
      handleDOMEvents: {
        mousedown: (view, event) => {
          if (!(event instanceof MouseEvent) || event.button !== 0) {
            return false;
          }

          const target = event.target as HTMLElement | null;
          if (!(target instanceof HTMLImageElement) || !target.classList.contains("mothership-note-image")) {
            return false;
          }

          event.preventDefault();

          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!coords) {
            return false;
          }

          const resolved = view.state.doc.resolve(coords.pos);
          const nodeAfter = resolved.nodeAfter;
          const nodeBefore = resolved.nodeBefore;

          let imagePos: number | null = null;
          if (nodeAfter?.type.name === "image") {
            imagePos = coords.pos;
          } else if (nodeBefore?.type.name === "image") {
            imagePos = coords.pos - nodeBefore.nodeSize;
          }

          if (imagePos === null) {
            return false;
          }

          view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, imagePos)));
          view.focus();

          const startX = event.clientX;
          const selectedNode = view.state.doc.nodeAt(imagePos);
          const startWidth = parseImageWidth(selectedNode?.attrs.width) ?? target.clientWidth;

          const onMouseMove = (moveEvent: MouseEvent) => {
            const currentNode = view.state.doc.nodeAt(imagePos!);
            if (!currentNode || currentNode.type.name !== "image") {
              return;
            }

            const deltaX = moveEvent.clientX - startX;
            const nextWidth = Math.max(140, Math.min(1800, Math.round(startWidth + deltaX)));

            view.dispatch(
              view.state.tr.setNodeMarkup(imagePos!, undefined, {
                ...currentNode.attrs,
                width: nextWidth,
              })
            );
          };

          const onMouseUp = () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
          };

          window.addEventListener("mousemove", onMouseMove);
          window.addEventListener("mouseup", onMouseUp);

          return true;
        },
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
        void saveNoteRef.current(titleRef.current, html);
      }, 500);
    },
  }, [insertImageWithParagraph, note.id]);

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

  // Send chat message with note as context
  const handleSendChat = async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const apiKey = localStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY);
    if (!apiKey) {
      setChatError("Please set your OpenRouter API key in AI Settings.");
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: chatInput.trim(),
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatInput("");
    setIsChatLoading(true);
    setChatError(null);

    // Reset textarea height
    if (chatInputRef.current) {
      chatInputRef.current.style.height = "auto";
    }

    // Add assistant message immediately to show loading dots
    const tempAssistantId = `assistant-${Date.now()}`;
    setChatMessages(prev => [...prev, {
      id: tempAssistantId,
      role: "assistant",
      content: "",
    }]);

    try {
      const apiMessages = [...chatMessages, userMessage].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const noteContent = stripHtml(editor?.getHTML() || note.content);

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          apiKey,
          model: "openai/gpt-4o-mini",
          noteContext: {
            title: title || "New page",
            content: noteContent,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || "Failed to get response");
      }

      // Stream the response
      let streamedContent = "";

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          streamedContent += chunk;

          setChatMessages(prev =>
            prev.map(m =>
              m.id === tempAssistantId ? { ...m, content: streamedContent } : m
            )
          );
        }
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Failed to get response");
      // Remove the empty assistant message on error
      setChatMessages(prev => prev.filter(m => m.id !== tempAssistantId));
    } finally {
      setIsChatLoading(false);
    }
  };

  // Handle chat input key down
  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  // Auto-resize chat textarea
  const handleChatInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
  };

  // Clear chat
  const handleClearChat = () => {
    setChatMessages([]);
    setChatError(null);
  };

  const handleRedoChat = async (messageId: string) => {
    if (isChatLoading) return;

    const apiKey = localStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY);
    if (!apiKey) {
      setChatError("Please set your OpenRouter API key in AI Settings.");
      return;
    }

    const messageIndex = chatMessages.findIndex((msg) => msg.id === messageId);
    if (messageIndex === -1) {
      return;
    }

    const messagesBeforeRedo = chatMessages.slice(0, messageIndex);

    setIsChatLoading(true);
    setChatError(null);

    const tempAssistantId = `assistant-redo-${Date.now()}`;
    setChatMessages([...messagesBeforeRedo, {
      id: tempAssistantId,
      role: "assistant",
      content: "",
    }]);

    try {
      const apiMessages = messagesBeforeRedo.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const noteContent = stripHtml(editor?.getHTML() || note.content);

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          apiKey,
          model: "openai/gpt-4o-mini",
          noteContext: {
            title: title || "New page",
            content: noteContent,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || "Failed to regenerate response");
      }

      let streamedContent = "";
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          streamedContent += chunk;

          setChatMessages((prev) =>
            prev.map((msg) =>
              msg.id === tempAssistantId ? { ...msg, content: streamedContent } : msg
            )
          );
        }
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Failed to regenerate response");
      setChatMessages(messagesBeforeRedo);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* Left side - Editor with header */}
      <div className="flex-1 flex flex-col min-w-0">
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
                    <NoteIcon icon={crumb.icon} hasContent={crumb.content.length > 0 && crumb.content !== "<p></p>"} />
                    <span className="truncate">{crumb.id === note.id ? (title || "New page") : (crumb.title || "New page")}</span>
                  </div>
                ) : (
                  <button
                    onClick={() => onSelectNote(crumb.id)}
                    className="flex items-center gap-1.5 hover:text-[#e3e3e3] transition-colors min-w-0 cursor-pointer"
                  >
                    <NoteIcon icon={crumb.icon} hasContent={crumb.content.length > 0 && crumb.content !== "<p></p>"} />
                    <span className="truncate max-w-[120px]">{crumb.title || "New page"}</span>
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
            <button
              onClick={() => {
                setShowAIChat(!showAIChat);
                if (!showAIChat) {
                  setTimeout(() => chatInputRef.current?.focus(), 100);
                }
              }}
              className={`p-1.5 rounded transition-colors ${showAIChat ? "bg-[#3f3f3f] text-[#e3e3e3]" : "text-[#6b6b6b] hover:text-[#e3e3e3] hover:bg-[#3f3f3f]"}`}
              title="AI Chat"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Editor content */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto px-16 py-12 h-full flex flex-col">
            {/* Title */}
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();

                  if (saveTimeoutRef.current) {
                    clearTimeout(saveTimeoutRef.current);
                  }

                  void saveNoteRef.current(titleRef.current, editor?.getHTML() || note.content);
                  return;
                }

                if (e.key === "Enter") {
                  e.preventDefault();
                  editor?.chain().focus().setTextSelection(0).run();
                }
              }}
              ref={titleInputRef}
              placeholder="New page"
              className="w-full text-4xl font-bold text-[#e3e3e3] bg-transparent border-none outline-none placeholder-[#4a4a4a] mb-4 leading-tight"
            />

            {/* Sub-pages list */}
            {childPages.length > 0 && (
              <div className="mb-6 -mx-2">
                {childPages.map((child) => (
                  <button
                    key={child.id}
                    onClick={() => onSelectNote(child.id)}
                    className="w-full flex items-center gap-2 px-2 py-1 hover:bg-[#2a2a2a] rounded transition-colors cursor-pointer text-left"
                  >
                    <NoteIcon icon={child.icon} hasContent={child.content.length > 0 && child.content !== "<p></p>"} />
                    <span className="text-[#9b9b9b] text-sm truncate">
                      {child.title || "New page"}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Rich Text Editor */}
            <EditorContent editor={editor} className="flex-1" />
          </div>
        </div>
      </div>

      {/* Right side - AI Chat Panel (full height) */}
      {showAIChat && (
        <div className="w-80 border-l border-[#2f2f2f] flex flex-col shrink-0">
          {/* Chat header - same level as top bar */}
          <div className="h-11 px-4 flex items-center justify-between border-b border-[#2f2f2f] shrink-0">
            <span className="text-xs text-[#9b9b9b] font-medium">Note AI Chat</span>
            {chatMessages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="p-1 text-[#6b6b6b] hover:text-[#ebebeb] hover:bg-[#3f3f3f] rounded transition-colors"
                title="Clear chat"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {chatError && (
              <div className="bg-red-500/10 text-red-400 text-xs px-3 py-2 rounded-lg">
                {chatError}
              </div>
            )}
            {chatMessages.map((msg) => {
              const isLastAssistantMessage = msg.role === "assistant" && msg.id === lastAssistantMessageId;

              return (
              <div
                key={msg.id}
                className={msg.role === "user" ? "flex justify-end" : ""}
              >
                {msg.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl px-3 py-2 bg-[#3f3f3f] text-[#e3e3e3] text-sm break-words">
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                ) : (
                  <div>
                    <div className="prose prose-invert prose-sm max-w-none text-[#e3e3e3] leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_code]:bg-[#2a2a2a] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[#7eb8f7] [&_pre]:bg-[#2a2a2a] [&_pre]:p-2 [&_pre]:rounded-lg [&_pre_code]:bg-transparent [&_pre_code]:p-0">
                      {msg.content ? (
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      ) : (
                        <div className="flex gap-1.5 py-1">
                          <span className="w-1.5 h-1.5 bg-[#6b6b6b] rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                          <span className="w-1.5 h-1.5 bg-[#6b6b6b] rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                          <span className="w-1.5 h-1.5 bg-[#6b6b6b] rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                        </div>
                      )}
                    </div>
                    {isLastAssistantMessage && msg.content && (
                      <div className="flex gap-3 mt-2.5">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(msg.content);
                            setCopiedChatMessageId(msg.id);
                            setTimeout(() => setCopiedChatMessageId(null), 400);
                          }}
                          className={`transition-colors ${copiedChatMessageId === msg.id ? "text-green-400" : "text-[#6b6b6b] hover:text-[#ebebeb]"}`}
                          title="Copy"
                        >
                          {copiedChatMessageId === msg.id ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => handleRedoChat(msg.id)}
                          className="text-[#6b6b6b] hover:text-[#ebebeb] transition-colors"
                          title="Regenerate"
                          disabled={isChatLoading}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 4v6h6"/>
                            <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );})}
            <div ref={chatMessagesEndRef} />
          </div>

          {/* Chat input */}
          <div className="p-4 shrink-0">
            <div className="flex gap-2 items-end bg-[#252525] rounded-lg border border-[#3f3f3f] p-2">
              <textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={handleChatInputChange}
                onKeyDown={handleChatKeyDown}
                placeholder="Chat about this note..."
                className="flex-1 bg-transparent text-[#e3e3e3] placeholder-[#6b6b6b] resize-none outline-none text-sm px-2 py-1"
                rows={1}
                style={{ maxHeight: "100px" }}
              />
              <button
                onClick={handleSendChat}
                disabled={!chatInput.trim() || isChatLoading}
                className="p-2 rounded-md bg-[#4f4f4f] hover:bg-[#5f5f5f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4 text-[#e3e3e3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
