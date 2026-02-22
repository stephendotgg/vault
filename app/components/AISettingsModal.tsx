"use client";

import { useState, useEffect, useRef } from "react";

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Storage key for API key only (kept in localStorage for security)
const OPENROUTER_API_KEY_STORAGE_KEY = "mothership-openrouter-api-key";

export function AISettingsModal({ isOpen, onClose }: AISettingsModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [instructions, setInstructions] = useState<string[]>([]);
  const [newInstruction, setNewInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const newInstructionRef = useRef<HTMLInputElement>(null);

  // Load settings
  useEffect(() => {
    if (isOpen) {
      setApiKey(localStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY) || "");
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
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSave = async () => {
    setLoading(true);
    localStorage.setItem(OPENROUTER_API_KEY_STORAGE_KEY, apiKey);
    
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
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
      onClick={onClose}
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
            onClick={onClose}
            className="p-1 text-[#6b6b6b] hover:text-[#ebebeb] hover:bg-[#3f3f3f] rounded transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-5">
          {/* API Key */}
          <div>
            <label className="block text-xs text-[#9b9b9b] mb-1.5">OpenRouter API Key</label>
            <input
              ref={inputRef}
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="sk-or-..."
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              className="w-full bg-[#1a1a1a] text-[#ebebeb] text-sm px-3 py-2 rounded-md outline-none border border-[#3f3f3f] focus:border-[#5f5f5f] placeholder-[#6b6b6b]"
            />
            <p className="text-xs text-[#6b6b6b] mt-1.5">
              Get your API key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-[#7eb8f7] hover:underline">openrouter.ai/keys</a>
            </p>
          </div>

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
