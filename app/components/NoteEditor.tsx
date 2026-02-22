"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import ReactMarkdown from "react-markdown";
import { AutoCorrect } from "@/app/extensions/AutoCorrect";
import { Note } from "@/types/models";

// Storage keys
const OPENROUTER_API_KEY_STORAGE_KEY = "mothership-openrouter-api-key";

// Strip HTML for plain text
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

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

  // AI Chat state - local per-render state
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
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
      Link.configure({
        openOnClick: true,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: "text-blue-400 underline cursor-pointer",
        },
      }),
      AutoCorrect,
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
            title: title || "Untitled",
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
                    <span className="truncate">{crumb.id === note.id ? (title || "Untitled") : (crumb.title || "Untitled")}</span>
                  </div>
                ) : (
                  <button
                    onClick={() => onSelectNote(crumb.id)}
                    className="flex items-center gap-1.5 hover:text-[#e3e3e3] transition-colors min-w-0 cursor-pointer"
                  >
                    <NoteIcon icon={crumb.icon} hasContent={crumb.content.length > 0 && crumb.content !== "<p></p>"} />
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
          <div className="max-w-3xl mx-auto px-16 py-12">
            {/* Title */}
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  editor?.chain().focus().setTextSelection(0).run();
                }
              }}
              placeholder="Untitled"
              className="w-full text-4xl font-bold text-[#e3e3e3] bg-transparent border-none outline-none placeholder-[#4a4a4a] mb-4"
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
                      {child.title || "Untitled"}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Rich Text Editor */}
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {/* Right side - AI Chat Panel (full height) */}
      {showAIChat && (
        <div className="w-80 border-l border-[#2f2f2f] flex flex-col shrink-0">
          {/* Chat header - same level as top bar */}
          <div className="h-11 px-3 flex items-center justify-between border-b border-[#2f2f2f] shrink-0">
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
          <div className="flex-1 overflow-auto p-3 space-y-4">
            {chatError && (
              <div className="bg-red-500/10 text-red-400 text-xs px-3 py-2 rounded-lg">
                {chatError}
              </div>
            )}
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={msg.role === "user" ? "flex justify-end" : ""}
              >
                {msg.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl px-3 py-2 bg-[#3f3f3f] text-[#e3e3e3] text-sm break-words">
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                ) : (
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
                )}
              </div>
            ))}
            <div ref={chatMessagesEndRef} />
          </div>

          {/* Chat input */}
          <div className="px-3 py-3 shrink-0">
            <div className="flex gap-2 items-end bg-[#252525] rounded-lg border border-[#3f3f3f] p-2">
              <textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={handleChatInputChange}
                onKeyDown={handleChatKeyDown}
                placeholder="Ask about this note..."
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
