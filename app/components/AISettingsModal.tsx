"use client";

import { useState, useEffect, useRef } from "react";

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AISettingsModal({ isOpen, onClose }: AISettingsModalProps) {
  const [instructions, setInstructions] = useState<string[]>([]);
  const [newInstruction, setNewInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const newInstructionRef = useRef<HTMLInputElement>(null);

  // Load settings
  useEffect(() => {
    if (isOpen) {
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

  const handleSave = async () => {
    setLoading(true);

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
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
      
      {/* Modal */}
      <div 
        className="relative bg-[#202020] border border-[#2f2f2f] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-sm font-medium text-[#ebebeb]">Instructions</h2>
          <button
            onClick={handleSave}
            className="p-1.5 text-[#7b7b7b] hover:text-[#ebebeb] hover:bg-[#2b2b2b] rounded-md transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-4 space-y-5">
          {/* Instructions */}
          <div>
            <div className="space-y-2">
              {instructions.map((instruction, index) => (
                <div key={index} className="flex items-start gap-2 bg-[#171717] border border-[#2a2a2a] rounded-lg px-3 py-2.5 group">
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
                  className="flex-1 bg-[#171717] text-[#ebebeb] text-sm px-3 py-2.5 rounded-lg outline-none border border-[#2f2f2f] focus:border-[#5a5a5a] placeholder-[#6b6b6b]"
                />
                <button
                  onClick={addInstruction}
                  disabled={!newInstruction.trim()}
                  className="px-3 py-2.5 bg-[#3f3f3f] hover:bg-[#4c4c4c] disabled:opacity-50 disabled:hover:bg-[#3f3f3f] text-[#ebebeb] text-sm rounded-lg transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 pb-4">
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
            className="px-3 py-1.5 bg-[#4f4f4f] hover:bg-[#5c5c5c] disabled:opacity-50 text-sm text-[#ebebeb] rounded-lg transition-colors"
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
