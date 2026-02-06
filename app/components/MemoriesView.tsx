"use client";

import { useState } from "react";
import { Occasion } from "@/types/models";

interface MemoriesViewProps {
  occasions: Occasion[];
  selectedOccasionId: string | null;
  onSelectOccasion: (id: string | null) => void;
  onCreateOccasionAndMemory: (occasionTitle: string, memoryContent: string) => Promise<void>;
  onCreateMemory: (occasionId: string, content: string) => Promise<void>;
  onUpdateOccasion: (id: string, title: string) => Promise<void>;
  onDeleteOccasion: (id: string) => Promise<void>;
  onUpdateMemory: (occasionId: string, memoryId: string, content: string) => Promise<void>;
  onDeleteMemory: (occasionId: string, memoryId: string) => Promise<void>;
}

export function MemoriesView({
  occasions,
  selectedOccasionId,
  onSelectOccasion,
  onCreateOccasionAndMemory,
  onCreateMemory,
  onUpdateOccasion,
  onDeleteOccasion,
  onUpdateMemory,
  onDeleteMemory,
}: MemoriesViewProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newMemoryContent, setNewMemoryContent] = useState("");
  const [occasionInput, setOccasionInput] = useState("");
  const [selectedExistingOccasion, setSelectedExistingOccasion] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryContent, setEditingMemoryContent] = useState("");
  const [editingOccasionTitle, setEditingOccasionTitle] = useState("");
  const [isEditingOccasionTitle, setIsEditingOccasionTitle] = useState(false);

  const selectedOccasion = occasions.find((o) => o.id === selectedOccasionId);

  const handleOpenAddModal = (preselect?: string) => {
    setIsAddModalOpen(true);
    setNewMemoryContent("");
    setOccasionInput("");
    setSelectedExistingOccasion(preselect || null);
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    setNewMemoryContent("");
    setOccasionInput("");
    setSelectedExistingOccasion(null);
  };

  const handleSubmitMemory = async () => {
    if (!newMemoryContent.trim()) return;
    
    setIsSubmitting(true);
    try {
      if (selectedExistingOccasion) {
        await onCreateMemory(selectedExistingOccasion, newMemoryContent.trim());
      } else if (occasionInput.trim()) {
        const existing = occasions.find(
          (o) => o.title.toLowerCase() === occasionInput.trim().toLowerCase()
        );
        if (existing) {
          await onCreateMemory(existing.id, newMemoryContent.trim());
        } else {
          await onCreateOccasionAndMemory(occasionInput.trim(), newMemoryContent.trim());
        }
      }
      handleCloseAddModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateMemory = async (memoryId: string) => {
    if (!editingMemoryContent.trim() || !selectedOccasionId) return;
    await onUpdateMemory(selectedOccasionId, memoryId, editingMemoryContent.trim());
    setEditingMemoryId(null);
  };

  const handleSaveOccasionTitle = async () => {
    if (!editingOccasionTitle.trim() || !selectedOccasionId) return;
    await onUpdateOccasion(selectedOccasionId, editingOccasionTitle.trim());
    setIsEditingOccasionTitle(false);
  };

  const filteredOccasions = occasionInput
    ? occasions.filter((o) => o.title.toLowerCase().includes(occasionInput.toLowerCase()))
    : occasions;

  // Occasion detail view
  if (selectedOccasion) {
    const memories = selectedOccasion.memories || [];
    
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center h-11 px-3 border-b border-[#2f2f2f] shrink-0">
          <div className="flex items-center gap-2 text-sm text-[#9b9b9b]">
            <button
              onClick={() => onSelectOccasion(null)}
              className="hover:bg-[#2f2f2f] px-1.5 py-0.5 rounded cursor-pointer hover:text-[#ebebeb]"
            >
              Memories
            </button>
            <span>/</span>
            <span className="text-[#ebebeb] px-1.5 py-0.5">{selectedOccasion.title}</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto px-12 py-12">
            <div className="flex items-center justify-between mb-8">
              {isEditingOccasionTitle ? (
                <input
                  type="text"
                  value={editingOccasionTitle}
                  onChange={(e) => setEditingOccasionTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveOccasionTitle();
                    if (e.key === "Escape") setIsEditingOccasionTitle(false);
                  }}
                  onBlur={handleSaveOccasionTitle}
                  autoFocus
                  className="text-3xl font-bold text-[#e3e3e3] bg-transparent outline-none border-b border-[#4f4f4f]"
                />
              ) : (
                <h1
                  className="text-3xl font-bold text-[#e3e3e3] cursor-pointer hover:text-white"
                  onClick={() => {
                    setEditingOccasionTitle(selectedOccasion.title);
                    setIsEditingOccasionTitle(true);
                  }}
                >
                  {selectedOccasion.title}
                </h1>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenAddModal(selectedOccasion.id)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#2f2f2f] hover:bg-[#3f3f3f] text-[#ebebeb] text-sm rounded-md"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Memory
                </button>
              </div>
            </div>

            {memories.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[#6b6b6b]">No memories yet</p>
                <button onClick={() => handleOpenAddModal(selectedOccasion.id)} className="mt-4 text-sm text-[#9b9b9b] hover:text-[#ebebeb]">
                  Add your first memory →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {memories.map((memory) => (
                  <div key={memory.id} className="group p-4 bg-[#252525] rounded-lg border border-[#3f3f3f]">
                    {editingMemoryId === memory.id ? (
                      <textarea
                        value={editingMemoryContent}
                        onChange={(e) => setEditingMemoryContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleUpdateMemory(memory.id); }
                          if (e.key === "Escape") setEditingMemoryId(null);
                        }}
                        onBlur={() => handleUpdateMemory(memory.id)}
                        autoFocus
                        rows={3}
                        className="w-full bg-transparent text-[#ebebeb] text-sm outline-none resize-none"
                      />
                    ) : (
                      <div className="flex items-start justify-between gap-4">
                        <p className="flex-1 text-sm text-[#ebebeb] whitespace-pre-wrap">{memory.content}</p>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                          <button
                            onClick={() => { setEditingMemoryId(memory.id); setEditingMemoryContent(memory.content); }}
                            className="p-1.5 text-[#6b6b6b] hover:text-[#ebebeb] hover:bg-[#3f3f3f] rounded"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => onDeleteMemory(selectedOccasion.id, memory.id)}
                            className="p-1.5 text-[#6b6b6b] hover:text-red-400 hover:bg-[#3f3f3f] rounded"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="mt-2 text-xs text-[#6b6b6b]">{new Date(memory.createdAt).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {isAddModalOpen && (
          <AddMemoryModal
            occasions={occasions}
            occasionInput={occasionInput}
            setOccasionInput={setOccasionInput}
            selectedExistingOccasion={selectedExistingOccasion}
            setSelectedExistingOccasion={setSelectedExistingOccasion}
            newMemoryContent={newMemoryContent}
            setNewMemoryContent={setNewMemoryContent}
            filteredOccasions={filteredOccasions}
            isSubmitting={isSubmitting}
            onClose={handleCloseAddModal}
            onSubmit={handleSubmitMemory}
          />
        )}
      </div>
    );
  }

  // Occasions list view
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center h-11 px-3 border-b border-[#2f2f2f] shrink-0">
        <span className="text-sm text-[#9b9b9b] px-1.5 py-0.5">Memories</span>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-12 py-12">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-[#e3e3e3]">Memories</h1>
            <button
              onClick={() => handleOpenAddModal()}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#2f2f2f] hover:bg-[#3f3f3f] text-[#ebebeb] text-sm rounded-md"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Memory
            </button>
          </div>

          {occasions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[#6b6b6b]">No occasions yet</p>
              <button onClick={() => handleOpenAddModal()} className="mt-4 text-sm text-[#9b9b9b] hover:text-[#ebebeb]">
                Add your first memory →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {occasions.map((occasion) => (
                <div
                  key={occasion.id}
                  onClick={() => onSelectOccasion(occasion.id)}
                  className="p-6 bg-[#252525] rounded-lg border border-[#3f3f3f] hover:border-[#5f5f5f] cursor-pointer group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-medium text-[#ebebeb] group-hover:text-white">{occasion.title}</h3>
                  </div>
                  <p className="text-sm text-[#6b6b6b]">
                    {(occasion.memories?.length || 0)} {(occasion.memories?.length || 0) === 1 ? "memory" : "memories"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {isAddModalOpen && (
        <AddMemoryModal
          occasions={occasions}
          occasionInput={occasionInput}
          setOccasionInput={setOccasionInput}
          selectedExistingOccasion={selectedExistingOccasion}
          setSelectedExistingOccasion={setSelectedExistingOccasion}
          newMemoryContent={newMemoryContent}
          setNewMemoryContent={setNewMemoryContent}
          filteredOccasions={filteredOccasions}
          isSubmitting={isSubmitting}
          onClose={handleCloseAddModal}
          onSubmit={handleSubmitMemory}
        />
      )}
    </div>
  );
}

interface AddMemoryModalProps {
  occasions: Occasion[];
  occasionInput: string;
  setOccasionInput: (v: string) => void;
  selectedExistingOccasion: string | null;
  setSelectedExistingOccasion: (v: string | null) => void;
  newMemoryContent: string;
  setNewMemoryContent: (v: string) => void;
  filteredOccasions: Occasion[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

function AddMemoryModal({
  occasions,
  occasionInput,
  setOccasionInput,
  selectedExistingOccasion,
  setSelectedExistingOccasion,
  newMemoryContent,
  setNewMemoryContent,
  filteredOccasions,
  isSubmitting,
  onClose,
  onSubmit,
}: AddMemoryModalProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const selectedOccasion = occasions.find((o) => o.id === selectedExistingOccasion);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-[#252525] border border-[#3f3f3f] rounded-lg shadow-2xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3f3f3f]">
          <h2 className="text-sm font-medium text-[#ebebeb]">Add Memory</h2>
          <button onClick={onClose} className="p-1 text-[#6b6b6b] hover:text-[#ebebeb] hover:bg-[#3f3f3f] rounded">
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
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-[#9b9b9b] hover:text-[#ebebeb] rounded-md">Cancel</button>
          <button
            onClick={onSubmit}
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
