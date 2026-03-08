"use client";

import { useState } from "react";
import { Occasion } from "@/types/models";
import { VoiceRecorder } from "./VoiceRecorder";

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
  const [transcribedText, setTranscribedText] = useState("");
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
    setTranscribedText("");
    setOccasionInput("");
    setSelectedExistingOccasion(null);
    setShowSuggestions(false);
    onClose();
  };

  const handleTranscription = (text: string) => {
    setTranscribedText((prev) => prev ? `${prev}\n${text}` : text);
  };

  const handleSubmit = async () => {
    if (!transcribedText.trim()) return;
    if (!selectedExistingOccasion && !occasionInput.trim()) return;

    setIsSubmitting(true);
    try {
      if (selectedExistingOccasion) {
        await onCreateMemory(selectedExistingOccasion, transcribedText.trim());
      } else {
        await onCreateOccasionAndMemory(occasionInput.trim(), transcribedText.trim());
      }
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = transcribedText.trim() && (selectedExistingOccasion || occasionInput.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
      <div className="relative bg-[#202020] border border-[#2f2f2f] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-sm font-medium text-[#ebebeb]">Record Memory</h2>
          <button onClick={handleClose} className="p-1.5 text-[#7b7b7b] hover:text-[#ebebeb] hover:bg-[#2b2b2b] rounded-md transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 pb-4 space-y-4">
          {/* Occasion selector */}
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
                  className="w-full bg-[#171717] text-[#ebebeb] text-sm px-3 py-2.5 rounded-lg outline-none border border-[#2f2f2f] focus:border-[#5a5a5a] placeholder-[#6b6b6b]"
                />
                {showSuggestions && filteredOccasions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-[#232323] border border-[#2f2f2f] rounded-lg shadow-lg max-h-40 overflow-auto">
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

          {/* Voice recorder */}
          <div className="py-4">
            <VoiceRecorder onTranscription={handleTranscription} disabled={isSubmitting} />
          </div>

          {/* Transcribed text preview */}
          {transcribedText && (
            <div className="bg-[#171717] rounded-lg border border-[#2f2f2f] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#6b6b6b]">Transcribed:</span>
                <button 
                  onClick={() => setTranscribedText("")}
                  className="text-xs text-[#6b6b6b] hover:text-[#ebebeb]"
                >
                  Clear
                </button>
              </div>
              <p className="text-sm text-[#ebebeb] whitespace-pre-wrap">{transcribedText}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 pb-4">
          <button onClick={handleClose} className="px-3 py-1.5 text-sm text-[#9b9b9b] hover:text-[#ebebeb] rounded-md">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="px-3 py-1.5 text-sm bg-[#4f4f4f] hover:bg-[#5f5f5f] disabled:bg-[#3f3f3f] disabled:text-[#6b6b6b] text-[#ebebeb] rounded-lg"
          >
            {isSubmitting ? "Saving..." : "Save Memory"}
          </button>
        </div>
      </div>
    </div>
  );
}
