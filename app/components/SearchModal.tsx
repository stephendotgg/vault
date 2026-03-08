"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { SearchResult } from "@/app/api/search/route";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectNote: (id: string) => void;
  onSelectLists: () => void;
  onSelectMemories: () => void;
}

export function SearchModal({ isOpen, onClose, onSelectNote, onSelectLists, onSelectMemories }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Search with debounce
  const search = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results);
        setSelectedIndex(0);
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      search(query);
    }, 200);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, search]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      selectResult(results[selectedIndex]);
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    const container = resultsRef.current;
    if (!container) return;
    
    const selectedEl = container.children[selectedIndex] as HTMLElement;
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Handle result selection
  const selectResult = (result: SearchResult) => {
    onClose();
    
    if (result.type === "note") {
      onSelectNote(result.id);
    } else if (result.type === "list") {
      onSelectLists();
    } else if (result.type === "memory") {
      onSelectMemories();
    }
  };

  // Get label for result type
  const getTypeLabel = (result: SearchResult) => {
    if (result.type === "note" && result.noteKind === "sheet") {
      return "Sheet";
    }

    const type = result.type;
    switch (type) {
      case "note": return "Note";
      case "list": return "List";
      case "memory": return "Memory";
    }
  };

  if (!isOpen) return null;

  const hasResults = results.length > 0;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
      
      {/* Modal */}
      <div 
        className="relative w-full max-w-xl bg-[#202020] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] border border-[#2f2f2f] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className={`flex items-center gap-3 px-5 py-4 ${hasResults ? "border-b border-[#2f2f2f]" : ""}`}>
          <svg className="w-5 h-5 text-[#6b6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search across the app..."
            className="flex-1 bg-transparent text-[#e3e3e3] placeholder-[#6b6b6b] outline-none text-base"
          />
          {isLoading && (
            <div className="w-4 h-4 border-2 border-[#6b6b6b] border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        {hasResults && (
          <>
            <div
              ref={resultsRef}
              className="max-h-[60vh] overflow-auto p-2"
            >
              {results.map((result, index) => (
                <div
                  key={`${result.type}-${result.id}`}
                  className={`px-3 py-2.5 cursor-pointer rounded-lg transition-colors ${
                    index === selectedIndex ? "bg-[#2f2f2f]" : "hover:bg-[#262626]"
                  }`}
                  onClick={() => selectResult(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[#e3e3e3] truncate">
                          {result.title}
                        </span>
                        <span className="text-xs text-[#6b6b6b] bg-[#2f2f2f] px-1.5 py-0.5 rounded">
                          {getTypeLabel(result)}
                        </span>
                      </div>
                      <p className="text-sm text-[#9b9b9b] mt-1 line-clamp-1">
                        {result.snippet}
                      </p>
                      {result.parentTitle && result.type === "memory" && (
                        <p className="text-xs text-[#6b6b6b] mt-1">
                          in {result.parentTitle}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-4 py-2.5 border-t border-[#2f2f2f] bg-[#1c1c1c] text-xs text-[#6b6b6b] flex items-center justify-between leading-none">
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded">↑↓</kbd>navigate</span>
                <span className="inline-flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded">Enter</kbd>open</span>
                <span className="inline-flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded">Esc</kbd>close</span>
              </div>
              <span className="inline-flex items-center">{results.length} result{results.length !== 1 ? "s" : ""}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
