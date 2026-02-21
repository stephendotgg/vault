"use client";

import { useState, useEffect, useRef } from "react";

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Storage keys
const API_KEY_STORAGE_KEY = "mothership-ai-api-key";
const AI_PROVIDER_STORAGE_KEY = "mothership-ai-provider";

export function AISettingsModal({ isOpen, onClose }: AISettingsModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<"openai" | "anthropic">("openai");
  const inputRef = useRef<HTMLInputElement>(null);

  // Load settings from localStorage
  useEffect(() => {
    if (isOpen) {
      const savedKey = localStorage.getItem(API_KEY_STORAGE_KEY) || "";
      const savedProvider = localStorage.getItem(AI_PROVIDER_STORAGE_KEY) as "openai" | "anthropic" || "openai";
      setApiKey(savedKey);
      setProvider(savedProvider);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSave = () => {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    localStorage.setItem(AI_PROVIDER_STORAGE_KEY, provider);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      onClose();
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
        className="relative bg-[#252525] border border-[#3f3f3f] rounded-lg shadow-2xl w-full max-w-md mx-4"
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
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs text-[#9b9b9b] mb-1.5">AI Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as "openai" | "anthropic")}
              onKeyDown={handleKeyDown}
              className="w-full bg-[#1a1a1a] text-[#ebebeb] text-sm px-3 py-2 rounded-md outline-none border border-[#3f3f3f] focus:border-[#5f5f5f]"
            >
              <option value="openai">OpenAI (GPT-4o-mini)</option>
              <option value="anthropic">Anthropic (Claude Sonnet)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#9b9b9b] mb-1.5">API Key</label>
            <input
              ref={inputRef}
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={provider === "openai" ? "sk-..." : "sk-ant-..."}
              className="w-full bg-[#1a1a1a] text-[#ebebeb] text-sm px-3 py-2 rounded-md outline-none border border-[#3f3f3f] focus:border-[#5f5f5f] placeholder-[#6b6b6b]"
            />
          </div>
          <p className="text-xs text-[#6b6b6b]">
            Your API key is stored locally and never sent to our servers.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#3f3f3f]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-[#9b9b9b] hover:text-[#ebebeb] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 bg-[#4f4f4f] hover:bg-[#5f5f5f] text-sm text-[#ebebeb] rounded-md transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
