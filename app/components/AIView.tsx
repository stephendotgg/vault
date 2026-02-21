"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { AISettingsModal } from "./AISettingsModal";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
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

// Storage keys
const API_KEY_STORAGE_KEY = "mothership-ai-api-key";
const AI_PROVIDER_STORAGE_KEY = "mothership-ai-provider";
const CHAT_SESSIONS_STORAGE_KEY = "mothership-ai-chat-sessions";
const CURRENT_SESSION_STORAGE_KEY = "mothership-ai-current-session";

// Generate title from first message
function generateTitle(content: string): string {
  const cleaned = content.slice(0, 50).trim();
  return cleaned.length < content.length ? cleaned + "..." : cleaned;
}

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
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Get current session
  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const messages = useMemo(() => currentSession?.messages || [], [currentSession?.messages]);

  // Get API key from localStorage
  const getApiKey = () => localStorage.getItem(API_KEY_STORAGE_KEY) || "";
  const getProvider = () => localStorage.getItem(AI_PROVIDER_STORAGE_KEY) as "openai" | "anthropic" || "openai";

  // Load sessions from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(CHAT_SESSIONS_STORAGE_KEY);
    const savedCurrentId = localStorage.getItem(CURRENT_SESSION_STORAGE_KEY);
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const restored: ChatSession[] = parsed.map((s: ChatSession & { createdAt: string; updatedAt: string; messages: (Message & { timestamp: string })[] }) => ({
          ...s,
          createdAt: new Date(s.createdAt),
          updatedAt: new Date(s.updatedAt),
          messages: s.messages.map((m) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          })),
        }));
        setSessions(restored);
        
        if (savedCurrentId && restored.some((s) => s.id === savedCurrentId)) {
          setCurrentSessionId(savedCurrentId);
        } else if (restored.length > 0) {
          setCurrentSessionId(restored[0].id);
        }
      } catch {
        // Invalid data, ignore
      }
    }
  }, []);

  // Save sessions whenever they change
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem(CHAT_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    } else {
      localStorage.removeItem(CHAT_SESSIONS_STORAGE_KEY);
    }
  }, [sessions]);

  // Save current session id
  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem(CURRENT_SESSION_STORAGE_KEY, currentSessionId);
    } else {
      localStorage.removeItem(CURRENT_SESSION_STORAGE_KEY);
    }
  }, [currentSessionId]);

  // Create new chat session
  const createNewSession = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: "New Chat",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setError(null);
  };

  // Delete a session
  const deleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (currentSessionId === id) {
      const remaining = sessions.filter((s) => s.id !== id);
      setCurrentSessionId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  // Update current session messages
  const updateCurrentSessionMessages = (newMessages: Message[], sessionId?: string) => {
    const targetId = sessionId || currentSessionId;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === targetId
          ? {
              ...s,
              messages: newMessages,
              updatedAt: new Date(),
              title: newMessages.length > 0 && s.title === "New Chat"
                ? generateTitle(newMessages[0].content)
                : s.title,
            }
          : s
      )
    );
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

    // Create session if none exists
    let targetSessionId = currentSessionId;
    if (!targetSessionId) {
      const newSession: ChatSession = {
        id: Date.now().toString(),
        title: "New Chat",
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setSessions((prev) => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
      targetSessionId = newSession.id;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMessage];
    updateCurrentSessionMessages(newMessages, targetSessionId);
    setInput("");
    setIsLoading(true);
    setError(null);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      // Build messages array for API
      const apiMessages = newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          apiKey,
          provider,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to get response");
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.message,
        timestamp: new Date(),
      };
      updateCurrentSessionMessages([...newMessages, assistantMessage], targetSessionId);
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

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      {showSidebar && (
        <div className="w-64 border-r border-[#2f2f2f] flex flex-col shrink-0">
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
            {sessions.length === 0 ? (
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
                  <span className="text-sm truncate">{session.title}</span>
                  <span className="text-xs text-[#6b6b6b] shrink-0">{formatRelativeTime(session.updatedAt)}</span>
                  <span className="flex-1" />
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
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between h-11 px-4 border-b border-[#2f2f2f] shrink-0">
          <div className="flex items-center gap-2 text-sm text-[#9b9b9b]">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-1 text-[#6b6b6b] hover:text-[#ebebeb] hover:bg-[#3f3f3f] rounded transition-colors"
              title={showSidebar ? "Hide sidebar" : "Show sidebar"}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span>{currentSession?.title || "AI Chat"}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-xs text-[#6b6b6b] hover:text-[#9b9b9b] flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
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
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 mb-4 rounded-full bg-[#2f2f2f] flex items-center justify-center">
                <svg className="w-8 h-8 text-[#6b6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-[#e3e3e3] mb-2">AI Assistant</h2>
              <p className="text-[#6b6b6b] text-sm max-w-md mb-4">
                Ask me anything! I can help you with your notes, vault items, and memories.
              </p>
              {!getApiKey() && (
                <button
                  onClick={() => setShowSettings(true)}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  Set up API key to get started →
                </button>
              )}
            </div>
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
                      {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
                placeholder="Type a message..."
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-[#6b6b6b] mt-2 text-center">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
