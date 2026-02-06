"use client";

import { useState } from "react";
import { Occasion } from "@/types/models";

interface MemoryAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  occasions: Occasion[];
  onCreateOccasionAndMemory: (occasionTitle: string, memoryContent: string) => Promise<void>;
  onCreateMemory: (occasionId: string, content: string) => Promise<void>;
}

export function MemoryAddModal({
  isOpen,
  onClose,
  occasions,
  onCreateOccasionAndMemory,
  onCreateMemory,
}: MemoryAddModalProps) {
  const [newMemoryContent, setNewMemoryContent] = useState("");
  const [occasionInput, setOccasionInput] = useState("");
  const [selectedExistingOccasion, setSelectedExistingOccasion] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  if (!isOpen) return null;

  const filteredOccasions = occasionInput
    ? occasions.filter((o) => o.title.toLowerCase().includes(occasionInput.toLowerCase()))
    : occasions;

  const selectedOccasion = occasions.find((o) => o.id === selectedExistingOccasion);

  const handleClose = () => {
    setNewMemoryContent("");
    setOccasionInput("");
    setSelectedExistingOccasion(null);
    setShowSuggestions(false);
    onClose();
  };

  const handleSubmit = async () => {
    if (!newMemoryContent.trim()) return;
    if (!selectedExistingOccasion && !occasionInput.trim()) return;

    setIsSubmitting(true);
    try {
      if (selectedExistingOccasion) {
        await onCreateMemory(selectedExistingOccasion, newMemoryContent.trim());
      } else {
        await onCreateOccasionAndMemory(occasionInput.trim(), newMemoryContent.trim());
      }
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-[#252525] border border-[#3f3f3f] rounded-lg shadow-2xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3f3f3f]">
          <h2 className="text-sm font-medium text-[#ebebeb]">Add Memory</h2>
          <button onClick={handleClose} className="p-1 text-[#6b6b6b] hover:text-[#ebebeb] hover:bg-[#3f3f3f] rounded">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="relative">
            <label className="block text-xs text-[#9b9b9b] mb-1.5">
              Occasion <span className="text-[#6b6b6b]">(select or type new)</span>
            </label>
            {selectedOccasion ? (
              <div className="flex items-center justify-between bg-[#1a1a1a] px-3 py-2 rounded-md border border-[#3f3f3f]">
                <span className="text-sm text-[#ebebeb]">{selectedOccasion.title}</span>
                <button onClick={() => { setSelectedExistingOccasion(null); setOccasionInput(""); }} className="text-[#6b6b6b] hover:text-[#ebebeb]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="e.g., Amsterdam 2025..."
                  value={occasionInput}
                  onChange={(e) => { setOccasionInput(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  className="w-full bg-[#1a1a1a] text-[#ebebeb] text-sm px-3 py-2 rounded-md outline-none border border-[#3f3f3f] focus:border-[#5f5f5f] placeholder-[#6b6b6b]"
                />
                {showSuggestions && filteredOccasions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-[#2a2a2a] border border-[#3f3f3f] rounded-md shadow-lg max-h-40 overflow-auto">
                    {filteredOccasions.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => { setSelectedExistingOccasion(o.id); setOccasionInput(""); setShowSuggestions(false); }}
                        className="w-full text-left px-3 py-2 text-sm text-[#ebebeb] hover:bg-[#3f3f3f]"
                      >
                        {o.title}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label className="block text-xs text-[#9b9b9b] mb-1.5">Memory</label>
            <textarea
              placeholder="What do you want to remember?"
              value={newMemoryContent}
              onChange={(e) => setNewMemoryContent(e.target.value)}
              rows={4}
              className="w-full bg-[#1a1a1a] text-[#ebebeb] text-sm px-3 py-2 rounded-md outline-none border border-[#3f3f3f] focus:border-[#5f5f5f] placeholder-[#6b6b6b] resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#3f3f3f]">
          <button onClick={handleClose} className="px-3 py-1.5 text-sm text-[#9b9b9b] hover:text-[#ebebeb] rounded-md">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!newMemoryContent.trim() || (!selectedExistingOccasion && !occasionInput.trim()) || isSubmitting}
            className="px-3 py-1.5 text-sm bg-[#4f4f4f] hover:bg-[#5f5f5f] disabled:bg-[#3f3f3f] disabled:text-[#6b6b6b] text-[#ebebeb] rounded-md"
          >
            {isSubmitting ? "Adding..." : "Add Memory"}
          </button>
        </div>
      </div>
    </div>
  );
}
