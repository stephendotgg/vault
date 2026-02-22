"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { AISettingsModal, getEnabledModelIds } from "./AISettingsModal";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  images?: string[]; // Base64 images (client-side only, not persisted)
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
const OPENROUTER_API_KEY_STORAGE_KEY = "mothership-openrouter-api-key";
const SELECTED_MODEL_STORAGE_KEY = "mothership-ai-model";
const CURRENT_SESSION_STORAGE_KEY = "mothership-ai-current-session";

// Model info from OpenRouter
interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  vision?: boolean;
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
  const [pendingImages, setPendingImages] = useState<string[]>([]); // Base64 encoded images
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [cachedInstructions, setCachedInstructions] = useState<string[]>([]);
  const [blurTitles, setBlurTitles] = useState<boolean>(() =>
    typeof window !== "undefined" ? localStorage.getItem("mothership-blur-titles") === "true" : false
  );
  const [selectedModelId, setSelectedModelId] = useState<string>(() => 
    typeof window !== "undefined" ? localStorage.getItem(SELECTED_MODEL_STORAGE_KEY) || "openai/gpt-4o-mini" : "openai/gpt-4o-mini"
  );
  const [enabledModels, setEnabledModels] = useState<ModelInfo[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelSelectorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get current session
  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const messages = useMemo(() => currentSession?.messages || [], [currentSession?.messages]);

  // Get API key from localStorage
  const getApiKey = () => localStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY) || "";

  // Fetch enabled models from API
  const fetchEnabledModels = useCallback(async () => {
    const modelIds = getEnabledModelIds();
    try {
      const res = await fetch("/api/ai/models");
      const data = await res.json();
      const allModels = data.models || [];
      // Filter to only enabled models, maintaining order from settings
      const enabled = modelIds
        .map((id: string) => allModels.find((m: ModelInfo) => m.id === id))
        .filter(Boolean) as ModelInfo[];
      setEnabledModels(enabled.length > 0 ? enabled : allModels.slice(0, 5));
    } catch (err) {
      console.error("Failed to fetch models:", err);
      // Fallback to basic model info
      setEnabledModels(modelIds.map((id: string) => ({
        id,
        name: id.split("/")[1] || id,
        provider: id.split("/")[0] || "Unknown",
      })));
    }
  }, []);

  // Fetch AI instructions from API
  const fetchInstructions = async () => {
    try {
      const res = await fetch("/api/ai/settings");
      const data = await res.json();
      setCachedInstructions(data.instructions || []);
    } catch (err) {
      console.error("Failed to fetch AI instructions:", err);
    }
  };

  // Get currently selected model
  const selectedModel = enabledModels.find(m => m.id === selectedModelId) || enabledModels[0] || { id: selectedModelId, name: selectedModelId.split("/")[1] || selectedModelId, provider: selectedModelId.split("/")[0] || "Unknown" };

  // Handle model selection - switch to a new chat
  const handleSelectModel = (modelId: string) => {
    setSelectedModelId(modelId);
    localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, modelId);
    setShowModelSelector(false);
    // Start fresh with a new chat
    setCurrentSessionId(null);
    localStorage.removeItem(CURRENT_SESSION_STORAGE_KEY);
  };

  // Close model selector on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelSelectorRef.current && !modelSelectorRef.current.contains(e.target as Node)) {
        setShowModelSelector(false);
      }
    };
    if (showModelSelector) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showModelSelector]);

  // Fetch instructions and models on mount
  useEffect(() => {
    fetchInstructions();
    fetchEnabledModels();
  }, [fetchEnabledModels]);

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

  // Handle file to base64 conversion
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Handle paste event for images
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const base64 = await fileToBase64(file);
          setPendingImages(prev => [...prev, base64]);
        }
        break;
      }
    }
  };

  // Handle file input change
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of files) {
      if (file.type.startsWith("image/")) {
        const base64 = await fileToBase64(file);
        setPendingImages(prev => [...prev, base64]);
      }
    }
    // Reset input so same file can be selected again
    e.target.value = "";
    // Focus back on text input
    inputRef.current?.focus();
  };

  // Remove pending image
  const removePendingImage = (index: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if ((!input.trim() && pendingImages.length === 0) || isLoading) return;

    // Check for API key
    const apiKey = getApiKey();
    if (!apiKey) {
      setError("Please set your OpenRouter API key in settings.");
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

      // Capture images before clearing
      const imagesToSend = [...pendingImages];
      setPendingImages([]); // Clear pending images after capturing them

      // Update local state with user message (include images for display)
      const userMsg: Message = {
        ...userMessage,
        createdAt: new Date(userMessage.createdAt),
        images: imagesToSend.length > 0 ? imagesToSend : undefined,
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
      
      // Format messages for API - handle images for user messages
      const apiMessages = currentMessages.map((m) => {
        // If message has images, format as multimodal
        if (m.role === "user" && m.images && m.images.length > 0) {
          const content: Array<{type: string; text?: string; image_url?: {url: string}}> = [];
          
          // Add images first
          for (const imgBase64 of m.images) {
            content.push({
              type: "image_url",
              image_url: { url: imgBase64 }
            });
          }
          
          // Add text
          if (m.content) {
            content.push({ type: "text", text: m.content });
          }
          
          return { role: m.role, content };
        }
        return { role: m.role, content: m.content };
      });

      // Call AI API with streaming
      const aiResponse = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          apiKey,
          model: selectedModel.id,
          instructions: cachedInstructions,
        }),
      });

      if (!aiResponse.ok) {
        const aiData = await aiResponse.json();
        throw new Error(aiData.message || aiData.error || "Failed to get response");
      }

      // Create a temporary message for streaming
      const tempAssistantId = `temp-${Date.now()}`;
      let streamedContent = "";

      // Add empty assistant message to UI
      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? {
                ...s,
                messages: [...s.messages, {
                  id: tempAssistantId,
                  role: "assistant" as const,
                  content: "",
                  sessionId: targetSessionId,
                  createdAt: new Date(),
                }],
                updatedAt: new Date(),
              }
            : s
        )
      );

      // Read the stream
      const reader = aiResponse.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          streamedContent += chunk;

          // Update UI with streamed content
          setSessions((prev) =>
            prev.map((s) =>
              s.id === targetSessionId
                ? {
                    ...s,
                    messages: s.messages.map((m) =>
                      m.id === tempAssistantId
                        ? { ...m, content: streamedContent }
                        : m
                    ),
                  }
                : s
            )
          );
        }
      }

      // Save final assistant message to database
      const assistantMsgResponse = await fetch(`/api/ai/sessions/${targetSessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", content: streamedContent }),
      });
      
      if (!assistantMsgResponse.ok) throw new Error("Failed to save assistant message");
      const assistantMessage = await assistantMsgResponse.json();

      // Replace temp message with real one
      const assistantMsg: Message = {
        ...assistantMessage,
        createdAt: new Date(assistantMessage.createdAt),
      };
      
      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === tempAssistantId ? assistantMsg : m
                ),
                updatedAt: new Date(),
              }
            : s
        )
      );

      // Generate AI title in background if this is the first exchange
      const currentSession = sessions.find(s => s.id === targetSessionId);
      if (currentSession?.title === "New Chat" || !currentSession) {
        fetch(`/api/ai/sessions/${targetSessionId}/generate-title`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey }),
        }).then(() => loadSessions()).catch(() => {});
      } else {
        loadSessions();
      }
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

  // Regenerate an assistant response
  const handleRedo = async (messageId: string) => {
    if (isLoading || !currentSessionId) return;

    const apiKey = getApiKey();
    if (!apiKey) {
      setError("Please set your OpenRouter API key in settings.");
      return;
    }

    // Find the message index and get messages up to (but not including) this assistant message
    const msgIndex = messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    // Get messages before this one (for context)
    const messagesBeforeRedo = messages.slice(0, msgIndex);
    
    setIsLoading(true);
    setError(null);

    try {
      // Delete the message from DB
      await fetch(`/api/ai/sessions/${currentSessionId}/messages/${messageId}`, {
        method: "DELETE",
      });

      // Update local state - remove this message
      setSessions(prev =>
        prev.map(s =>
          s.id === currentSessionId
            ? { ...s, messages: messagesBeforeRedo }
            : s
        )
      );

      // Call AI API with the conversation up to this point
      const apiMessages = messagesBeforeRedo.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const aiResponse = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, apiKey, model: selectedModel.id, instructions: cachedInstructions }),
      });

      if (!aiResponse.ok) {
        const aiData = await aiResponse.json();
        throw new Error(aiData.message || aiData.error || "Failed to get response");
      }

      // Create a temporary message for streaming
      const tempAssistantId = `temp-${Date.now()}`;
      let streamedContent = "";

      // Add empty assistant message to UI
      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? {
                ...s,
                messages: [...messagesBeforeRedo, {
                  id: tempAssistantId,
                  role: "assistant" as const,
                  content: "",
                  sessionId: currentSessionId,
                  createdAt: new Date(),
                }],
              }
            : s
        )
      );

      // Read the stream
      const reader = aiResponse.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          streamedContent += chunk;

          // Update UI with streamed content
          setSessions((prev) =>
            prev.map((s) =>
              s.id === currentSessionId
                ? {
                    ...s,
                    messages: s.messages.map((m) =>
                      m.id === tempAssistantId
                        ? { ...m, content: streamedContent }
                        : m
                    ),
                  }
                : s
            )
          );
        }
      }

      // Add new assistant message to DB
      const assistantMsgResponse = await fetch(`/api/ai/sessions/${currentSessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", content: streamedContent }),
      });

      if (!assistantMsgResponse.ok) throw new Error("Failed to save message");
      const assistantMessage = await assistantMsgResponse.json();

      const newMsg: Message = {
        ...assistantMessage,
        createdAt: new Date(assistantMessage.createdAt),
      };

      // Replace temp message with real one
      setSessions(prev =>
        prev.map(s =>
          s.id === currentSessionId
            ? {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === tempAssistantId ? newMsg : m
                ),
              }
            : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate");
      loadSessions(); // Reload to get correct state
    } finally {
      setIsLoading(false);
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
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const newValue = !blurTitles;
                  setBlurTitles(newValue);
                  localStorage.setItem("mothership-blur-titles", String(newValue));
                }}
                className={`p-1 rounded transition-colors ${blurTitles ? "text-[#7eb8f7] bg-[#3f3f3f]" : "text-[#6b6b6b] hover:text-[#ebebeb] hover:bg-[#3f3f3f]"}`}
                title={blurTitles ? "Show titles" : "Hide titles"}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {blurTitles ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  )}
                </svg>
              </button>
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
                  <span className="text-sm truncate flex-1">
                    {blurTitles ? (
                      <span className="tracking-[0.15em] text-[#6b6b6b]">
                        {"●".repeat(Math.min(Math.max(Math.round(session.title.length * 0.75), 3), 15))}
                      </span>
                    ) : (
                      session.title
                    )}
                  </span>
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
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#9b9b9b]">
              {currentSession?.title || "AI Chat"}
            </span>
            {/* Model selector */}
            <div className="relative" ref={modelSelectorRef}>
              <button
                onClick={() => setShowModelSelector(!showModelSelector)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-[#7eb8f7] hover:bg-[#3f3f3f] rounded transition-colors"
                title="Select model"
              >
                {selectedModel.name}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showModelSelector && (
                <div className="absolute top-full left-0 mt-1 bg-[#252525] border border-[#3f3f3f] rounded-lg shadow-xl py-1 w-max z-50">
                  {enabledModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => handleSelectModel(model.id)}
                      className={`w-full px-3 py-1.5 text-left text-sm hover:bg-[#3f3f3f] transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                        model.id === selectedModelId ? "text-[#7eb8f7]" : "text-[#e3e3e3]"
                      }`}
                    >
                      {model.name}
                      {model.vision && (
                        <span title="Supports image input">
                          <svg className="w-3.5 h-3.5 text-[#6b6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
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

        {/* Settings Modal */}
        <AISettingsModal
          isOpen={showSettings}
          onClose={() => {
            setShowSettings(false);
            fetchInstructions(); // Refresh instructions after settings change
            fetchEnabledModels(); // Refresh models after settings change
          }}
        />

        {/* Error message */}
        {error && (
          <div className="mx-4 mt-2 p-3 bg-red-900/20 border border-red-800/50 rounded-md text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-auto">
          {messages.length === 0 ? (
            <div />
          ) : (
            <div className="max-w-3xl mx-auto px-6 py-9 space-y-6">
              {messages.map((message, index) => {
                // Check if this is the last assistant message
                const isLastAssistantMessage = message.role === "assistant" && 
                  !messages.slice(index + 1).some(m => m.role === "assistant");
                
                return (
                <div
                  key={message.id}
                  className={message.role === "user" ? "flex justify-end" : ""}
                >
                  {message.role === "user" ? (
                    <div className="max-w-[80%] rounded-2xl px-4 py-2.5 bg-[#3f3f3f] text-[#e3e3e3]">
                      {message.images && message.images.length > 0 && (
                        <div className="flex gap-2 mb-2 flex-wrap">
                          {message.images.map((img, imgIndex) => (
                            <img
                              key={imgIndex}
                              src={img}
                              alt={`Attachment ${imgIndex + 1}`}
                              className="max-h-48 max-w-full rounded-lg object-contain"
                            />
                          ))}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  ) : (
                    <div>
                      <div className="prose prose-invert prose-base max-w-none text-[#e3e3e3] leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_code]:bg-[#2a2a2a] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[#7eb8f7] [&_pre]:bg-[#2a2a2a] [&_pre]:p-3 [&_pre]:rounded-lg [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:text-[#fff] [&_a]:text-[#7eb8f7]">
                        <ReactMarkdown
                          components={{
                            img: ({ src, alt, ...props }) => {
                              if (!src) return null;
                              return <img src={src} alt={alt || "Image"} className="max-w-full rounded-lg" {...props} />;
                            }
                          }}
                        >{message.content}</ReactMarkdown>
                      </div>
                      {isLastAssistantMessage && (
                      <div className="flex gap-3 mt-3">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(message.content);
                            setCopiedMessageId(message.id);
                            setTimeout(() => setCopiedMessageId(null), 400);
                          }}
                          className={`transition-colors ${copiedMessageId === message.id ? "text-green-400" : "text-[#6b6b6b] hover:text-[#ebebeb]"}`}
                          title="Copy"
                        >
                          {copiedMessageId === message.id ? (
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
                          onClick={() => handleRedo(message.id)}
                          className="text-[#6b6b6b] hover:text-[#ebebeb] transition-colors"
                          title="Regenerate"
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
              {isLoading && !messages.some(m => m.id.startsWith("temp-")) && (
                <div className="flex gap-1.5 py-2">
                  <span className="w-2 h-2 bg-[#6b6b6b] rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                  <span className="w-2 h-2 bg-[#6b6b6b] rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                  <span className="w-2 h-2 bg-[#6b6b6b] rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div>
          <div className="max-w-3xl mx-auto px-4 py-9">
            {/* Image preview */}
            {pendingImages.length > 0 && (
              <div className="flex gap-2 mb-2 flex-wrap">
                {pendingImages.map((img, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={img}
                      alt={`Upload ${index + 1}`}
                      className="h-16 w-auto object-contain rounded-md border border-[#3f3f3f]"
                    />
                    <button
                      onClick={() => removePendingImage(index)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#dc2626] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove image"
                    >
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 items-end bg-[#252525] rounded-lg border border-[#3f3f3f] p-2">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              {/* Image upload button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded-md text-[#6b6b6b] hover:text-[#ebebeb] hover:bg-[#3f3f3f] transition-colors"
                title="Add image (or Ctrl+V to paste)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 15l-5-5L5 21"/>
                </svg>
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Ask anything..."
                rows={1}
                className="flex-1 bg-transparent text-[#e3e3e3] placeholder-[#6b6b6b] resize-none outline-none text-sm px-2 py-1"
                style={{ maxHeight: "200px" }}
              />
              <button
                onClick={handleSend}
                disabled={(!input.trim() && pendingImages.length === 0) || isLoading}
                className="p-2 rounded-md bg-[#4f4f4f] hover:bg-[#5f5f5f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4 text-[#e3e3e3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-[#6b6b6b] mt-4 text-center">
              <kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[#9b9b9b]">Enter</kbd> send, <kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[#9b9b9b]">Shift+Enter</kbd> new line, <kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[#9b9b9b]">Ctrl+N</kbd> new chat, <kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[#9b9b9b]">Ctrl+V</kbd> paste image
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Keep formatRelativeTime available for future use
void formatRelativeTime;
