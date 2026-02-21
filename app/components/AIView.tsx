"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { AISettingsModal } from "./AISettingsModal";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

interface AIViewProps {
  onBack: () => void;
}

// Storage keys (only for API key, not chat history)
const API_KEY_STORAGE_KEY = "mothership-ai-api-key";
const AI_PROVIDER_STORAGE_KEY = "mothership-ai-provider";
const CURRENT_SESSION_STORAGE_KEY = "mothership-ai-current-session";

// Format relative time
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function AIView({ onBack: _onBack }: AIViewProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Get current session
  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const messages = useMemo(() => currentSession?.messages || [], [currentSession?.messages]);

  // Get API key from localStorage
  const getApiKey = () => localStorage.getItem(API_KEY_STORAGE_KEY) || "";
  const getProvider = () => localStorage.getItem(AI_PROVIDER_STORAGE_KEY) as "openai" | "anthropic" || "openai";

  // Load sessions from database
  const loadSessions = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/sessions");
      if (!response.ok) throw new Error("Failed to load sessions");
      
      const data = await response.json();
      const restored: ChatSession[] = data.map((s: ChatSession & { createdAt: string; updatedAt: string; messages: (Message & { createdAt: string })[] }) => ({
        ...s,
        createdAt: new Date(s.createdAt),
        updatedAt: new Date(s.updatedAt),
        messages: s.messages.map((m) => ({
          ...m,
          createdAt: new Date(m.createdAt),
        })),
      }));
      
      setSessions(restored);
      
      // Restore last selected session from localStorage
      const savedCurrentId = localStorage.getItem(CURRENT_SESSION_STORAGE_KEY);
      if (savedCurrentId && restored.some((s) => s.id === savedCurrentId)) {
        setCurrentSessionId(savedCurrentId);
      } else if (restored.length > 0) {
        setCurrentSessionId(restored[0].id);
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Save current session id to localStorage (just for remembering selection)
  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem(CURRENT_SESSION_STORAGE_KEY, currentSessionId);
    } else {
      localStorage.removeItem(CURRENT_SESSION_STORAGE_KEY);
    }
  }, [currentSessionId]);

  // Create new chat session
  const createNewSession = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/sessions", { method: "POST" });
      if (!response.ok) throw new Error("Failed to create session");
      
      const newSession = await response.json();
      const session: ChatSession = {
        ...newSession,
        createdAt: new Date(newSession.createdAt),
        updatedAt: new Date(newSession.updatedAt),
        messages: [],
      };
      
      setSessions((prev) => [session, ...prev]);
      setCurrentSessionId(session.id);
      setError(null);
    } catch (err) {
      setError("Failed to create new chat");
      console.error(err);
    }
  }, []);

  // Delete a session
  const deleteSession = async (id: string) => {
    try {
      const response = await fetch(`/api/ai/sessions/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete session");
      
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (currentSessionId === id) {
        const remaining = sessions.filter((s) => s.id !== id);
        setCurrentSessionId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) {
      setError("Failed to delete chat");
      console.error(err);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [currentSessionId]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    // Check for API key
    const apiKey = getApiKey();
    const provider = getProvider();
    if (!apiKey) {
      setError("Please set your API key in settings to use AI Chat.");
      setShowSettings(true);
      return;
    }

    let targetSessionId = currentSessionId;

    // Create session if none exists
    if (!targetSessionId) {
      try {
        const response = await fetch("/api/ai/sessions", { method: "POST" });
        if (!response.ok) throw new Error("Failed to create session");
        
        const newSession = await response.json();
        const session: ChatSession = {
          ...newSession,
          createdAt: new Date(newSession.createdAt),
          updatedAt: new Date(newSession.updatedAt),
          messages: [],
        };
        
        setSessions((prev) => [session, ...prev]);
        setCurrentSessionId(session.id);
        targetSessionId = session.id;
      } catch (err) {
        setError("Failed to create chat session");
        console.error(err);
        return;
      }
    }

    const userContent = input.trim();
    setInput("");
    setIsLoading(true);
    setError(null);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      // Add user message to database
      const userMsgResponse = await fetch(`/api/ai/sessions/${targetSessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: userContent }),
      });
      
      if (!userMsgResponse.ok) throw new Error("Failed to save message");
      const userMessage = await userMsgResponse.json();

      // Update local state with user message
      const userMsg: Message = {
        ...userMessage,
        createdAt: new Date(userMessage.createdAt),
      };
      
      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? { ...s, messages: [...s.messages, userMsg], updatedAt: new Date() }
            : s
        )
      );

      // Build messages array for AI API
      const currentMessages = [...messages, userMsg];
      const apiMessages = currentMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Call AI API
      const aiResponse = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          apiKey,
          provider,
        }),
      });

      const aiData = await aiResponse.json();

      if (!aiResponse.ok) {
        throw new Error(aiData.message || aiData.error || "Failed to get response");
      }

      // Add assistant message to database
      const assistantMsgResponse = await fetch(`/api/ai/sessions/${targetSessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", content: aiData.message }),
      });
      
      if (!assistantMsgResponse.ok) throw new Error("Failed to save assistant message");
      const assistantMessage = await assistantMsgResponse.json();

      // Update local state with assistant message
      const assistantMsg: Message = {
        ...assistantMessage,
        createdAt: new Date(assistantMessage.createdAt),
      };
      
      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? { ...s, messages: [...s.messages, assistantMsg], updatedAt: new Date() }
            : s
        )
      );

      // Reload sessions to get updated title if needed
      loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get AI response");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        createNewSession();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [createNewSession]);

  return (
    <div className="flex flex-row-reverse h-full">
      {/* Sidebar */}
      <div className="w-64 border-l border-[#2f2f2f] flex flex-col shrink-0">
          {/* Sidebar header */}
          <div className="h-11 px-3 flex items-center justify-between border-b border-[#2f2f2f]">
            <span className="text-xs text-[#9b9b9b] font-medium">Chat History</span>
            <button
              onClick={createNewSession}
              className="p-1 text-[#6b6b6b] hover:text-[#ebebeb] hover:bg-[#3f3f3f] rounded transition-colors"
              title="New chat"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
          
          {/* Session list */}
          <div className="flex-1 overflow-auto py-2">
            {isLoadingSessions ? (
              <div className="px-3 py-4 text-center text-xs text-[#6b6b6b]">
                Loading...
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-[#6b6b6b]">
                No conversations yet
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => setCurrentSessionId(session.id)}
                  className={`group flex items-center gap-2 px-3 py-2 mx-2 rounded cursor-pointer ${
                    session.id === currentSessionId
                      ? "bg-[#3f3f3f] text-[#ebebeb]"
                      : "text-[#9b9b9b] hover:bg-[#2f2f2f]"
                  }`}
                >
                  <span className="text-sm truncate flex-1">{session.title}</span>
                  {/* <span className="text-xs text-[#6b6b6b] shrink-0">{formatRelativeTime(session.updatedAt)}</span> */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(session.id);
                    }}
                    className="p-1 opacity-0 group-hover:opacity-100 text-[#6b6b6b] hover:text-red-400 rounded transition-all"
                    title="Delete"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between h-11 px-4 border-b border-[#2f2f2f] shrink-0">
          <div className="flex items-center gap-2 text-sm text-[#9b9b9b]">
            <span>{currentSession?.title || "AI Chat"}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1 text-[#6b6b6b] hover:text-[#ebebeb] hover:bg-[#3f3f3f] rounded transition-colors"
              title="Settings"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Settings Modal */}
        <AISettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
        />

        {/* Error message */}
        {error && (
          <div className="mx-4 mt-2 p-3 bg-red-900/20 border border-red-800/50 rounded-md text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-auto p-4">
          {messages.length === 0 ? (
            <div />
          ) : (
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      message.role === "user"
                        ? "bg-[#3f3f3f] text-[#e3e3e3]"
                        : "bg-[#252525] text-[#e3e3e3] border border-[#3f3f3f]"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    <p className="text-xs text-[#6b6b6b] mt-1">
                      {message.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-[#252525] border border-[#3f3f3f] rounded-lg px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-[#6b6b6b] rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                      <span className="w-2 h-2 bg-[#6b6b6b] rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                      <span className="w-2 h-2 bg-[#6b6b6b] rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-[#2f2f2f] p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2 items-end bg-[#252525] rounded-lg border border-[#3f3f3f] p-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything..."
                rows={1}
                className="flex-1 bg-transparent text-[#e3e3e3] placeholder-[#6b6b6b] resize-none outline-none text-sm px-2 py-1"
                style={{ maxHeight: "200px" }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="p-2 rounded-md bg-[#4f4f4f] hover:bg-[#5f5f5f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4 text-[#e3e3e3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-[#6b6b6b] mt-2 text-center">
              <kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[#9b9b9b]">Enter</kbd> send, <kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[#9b9b9b]">Shift+Enter</kbd> new line, <kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[#9b9b9b]">Ctrl+N</kbd> new chat
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Keep formatRelativeTime available for future use
void formatRelativeTime;
