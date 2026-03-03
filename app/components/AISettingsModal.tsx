"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Storage keys
const ENABLED_MODELS_STORAGE_KEY = "vault-enabled-models";
const LEGACY_ENABLED_MODELS_STORAGE_KEY = "mothership-enabled-models";

interface OpenRouterModel {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextLength: number;
  vision: boolean;
  pricing: {
    prompt: number;
    completion: number;
  };
}

// Default models to show if user hasn't configured any
const DEFAULT_MODEL_IDS = [
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-3.5-haiku",
  "google/gemini-2.0-flash-001",
];

export function getEnabledModelIds(): string[] {
  if (typeof window === "undefined") return DEFAULT_MODEL_IDS;
  const stored = localStorage.getItem(ENABLED_MODELS_STORAGE_KEY) || localStorage.getItem(LEGACY_ENABLED_MODELS_STORAGE_KEY);
  if (!stored) return DEFAULT_MODEL_IDS;
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_MODEL_IDS;
  } catch {
    return DEFAULT_MODEL_IDS;
  }
}

export function AISettingsModal({ isOpen, onClose }: AISettingsModalProps) {
  const [instructions, setInstructions] = useState<string[]>([]);
  const [newInstruction, setNewInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const newInstructionRef = useRef<HTMLInputElement>(null);
  
  // Model management state
  const [allModels, setAllModels] = useState<OpenRouterModel[]>([]);
  const [enabledModelIds, setEnabledModelIds] = useState<string[]>([]);
  const [modelSearch, setModelSearch] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [showModelBrowser, setShowModelBrowser] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load settings
  useEffect(() => {
    if (isOpen) {
      setEnabledModelIds(getEnabledModelIds());
      // Fetch instructions from API
      fetch("/api/ai/settings")
        .then(res => res.json())
        .then(data => {
          setInstructions(data.instructions || []);
        })
        .catch(err => {
          console.error("Failed to load AI settings:", err);
          setInstructions([]);
        });
      setTimeout(() => newInstructionRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Fetch models from OpenRouter
  const fetchModels = useCallback(async (search: string = "") => {
    setModelsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/ai/models?${params}`);
      const data = await res.json();
      setAllModels(data.models || []);
    } catch (err) {
      console.error("Failed to fetch models:", err);
    }
    setModelsLoading(false);
  }, []);

  // Load models when browser opens
  useEffect(() => {
    if (showModelBrowser && allModels.length === 0) {
      fetchModels();
    }
  }, [showModelBrowser, allModels.length, fetchModels]);

  // Debounced search
  useEffect(() => {
    if (!showModelBrowser) return;
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      fetchModels(modelSearch);
    }, 300);
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [modelSearch, showModelBrowser, fetchModels]);

  const handleSave = async () => {
    setLoading(true);
    localStorage.setItem(ENABLED_MODELS_STORAGE_KEY, JSON.stringify(enabledModelIds));
    
    // Save instructions to API
    try {
      await fetch("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions }),
      });
    } catch (err) {
      console.error("Failed to save AI settings:", err);
    }
    
    setLoading(false);
    onClose();
  };

  const addInstruction = () => {
    if (newInstruction.trim()) {
      setInstructions([...instructions, newInstruction.trim()]);
      setNewInstruction("");
      newInstructionRef.current?.focus();
    }
  };

  const removeInstruction = (index: number) => {
    setInstructions(instructions.filter((_, i) => i !== index));
  };

  const handleNewInstructionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addInstruction();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleSave}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />
      
      {/* Modal */}
      <div 
        className="relative bg-[#252525] border border-[#3f3f3f] rounded-lg shadow-2xl w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3f3f3f]">
          <h2 className="text-sm font-medium text-[#ebebeb]">AI Settings</h2>
          <button
            onClick={handleSave}
            className="p-1 text-[#6b6b6b] hover:text-[#ebebeb] hover:bg-[#3f3f3f] rounded transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-5">
          {/* Instructions */}
          <div>
            <label className="block text-xs text-[#9b9b9b] mb-2">Instructions</label>
            <div className="space-y-2">
              {instructions.map((instruction, index) => (
                <div key={index} className="flex items-start gap-2 bg-[#1a1a1a] rounded-md px-3 py-2 group">
                  <span className="flex-1 text-sm text-[#e3e3e3]">{instruction}</span>
                  <button
                    onClick={() => removeInstruction(index)}
                    className="p-0.5 text-[#6b6b6b] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  ref={newInstructionRef}
                  type="text"
                  value={newInstruction}
                  onChange={(e) => setNewInstruction(e.target.value)}
                  onKeyDown={handleNewInstructionKeyDown}
                  placeholder="Add instruction..."
                  className="flex-1 bg-[#1a1a1a] text-[#ebebeb] text-sm px-3 py-2 rounded-md outline-none border border-[#3f3f3f] focus:border-[#5f5f5f] placeholder-[#6b6b6b]"
                />
                <button
                  onClick={addInstruction}
                  disabled={!newInstruction.trim()}
                  className="px-3 py-2 bg-[#3f3f3f] hover:bg-[#4f4f4f] disabled:opacity-50 disabled:hover:bg-[#3f3f3f] text-[#ebebeb] text-sm rounded-md transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Models */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs text-[#9b9b9b]">Enabled Models</label>
              <button
                onClick={() => setShowModelBrowser(!showModelBrowser)}
                className="text-xs text-[#7eb8f7] hover:underline"
              >
                {showModelBrowser ? "Close browser" : "Browse models"}
              </button>
            </div>
            
            {/* Currently enabled models */}
            <div className="space-y-1 mb-3">
              {enabledModelIds.length === 0 ? (
                <p className="text-xs text-[#6b6b6b] italic">No models enabled. Add some below.</p>
              ) : (
                enabledModelIds.map((modelId) => {
                  const model = allModels.find(m => m.id === modelId);
                  return (
                    <div key={modelId} className="flex items-center justify-between bg-[#1a1a1a] rounded-md px-3 py-2 group">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-sm text-[#e3e3e3] truncate">{model?.name || modelId} {model?.provider && <span className="text-[#6b6b6b]">({model.provider})</span>}</span>
                        {model?.vision && (
                          <span title="Supports images" className="text-[#6b6b6b]">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setEnabledModelIds(prev => prev.filter(id => id !== modelId))}
                        className="p-0.5 text-[#6b6b6b] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Model browser */}
            {showModelBrowser && (
              <div className="border border-[#3f3f3f] rounded-md overflow-hidden">
                <div className="p-2 border-b border-[#3f3f3f]">
                  <input
                    type="text"
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    placeholder="Search models..."
                    className="w-full bg-[#1a1a1a] text-[#ebebeb] text-sm px-3 py-1.5 rounded-md outline-none border border-[#3f3f3f] focus:border-[#5f5f5f] placeholder-[#6b6b6b]"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {modelsLoading ? (
                    <div className="p-4 text-center text-xs text-[#6b6b6b]">Loading models...</div>
                  ) : !modelSearch.trim() ? (
                    <div className="p-4 text-center text-xs text-[#6b6b6b]">Type to search models...</div>
                  ) : allModels.length === 0 ? (
                    <div className="p-4 text-center text-xs text-[#6b6b6b]">No models found</div>
                  ) : (
                    allModels.slice(0, 50).map((model) => {
                      const isEnabled = enabledModelIds.includes(model.id);
                      return (
                        <button
                          key={model.id}
                          onClick={() => {
                            if (isEnabled) {
                              setEnabledModelIds(prev => prev.filter(id => id !== model.id));
                            } else {
                              setEnabledModelIds(prev => [...prev, model.id]);
                            }
                          }}
                          className={`w-full px-3 py-2 text-left hover:bg-[#3f3f3f] transition-colors flex items-center gap-2 ${isEnabled ? "bg-[#2a2a2a]" : ""}`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center ${isEnabled ? "bg-[#7eb8f7] border-[#7eb8f7]" : "border-[#6b6b6b]"}`}>
                            {isEnabled && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm text-[#e3e3e3] truncate">{model.name} <span className="text-[#6b6b6b]">({model.provider})</span></span>
                              {model.vision && (
                                <span title="Supports image input" className="text-[#6b6b6b]">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#3f3f3f]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-[#9b9b9b] hover:text-[#ebebeb] transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-3 py-1.5 bg-[#4f4f4f] hover:bg-[#5f5f5f] disabled:opacity-50 text-sm text-[#ebebeb] rounded-md transition-colors"
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
