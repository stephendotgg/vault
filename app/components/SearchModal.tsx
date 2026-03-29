"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { SearchResult } from "@/app/api/search/route";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectNote: (id: string) => void;
  onSelectLists: () => void;
}

export function SearchModal({ isOpen, onClose, onSelectNote, onSelectLists }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filterNotes, setFilterNotes] = useState(true);
  const [filterLists, setFilterLists] = useState(true);
  const [filterArchived, setFilterArchived] = useState(false);
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

    const types: string[] = [];
    if (filterNotes) types.push("note");
    if (filterLists) types.push("list");
    if (types.length === 0) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        q: searchQuery,
        limit: "20",
        types: types.join(","),
      });
      if (filterArchived) params.set("includeArchived", "true");

      const res = await fetch(`/api/search?${params}`);
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
  }, [filterNotes, filterLists, filterArchived]);

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
    }
  };

  if (!isOpen) return null;

  const hasResults = results.length > 0;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset.backdropMousedown = "true"; }}
      onMouseUp={(e) => { if (e.target === e.currentTarget && (e.currentTarget as HTMLElement).dataset.backdropMousedown === "true") onClose(); delete (e.currentTarget as HTMLElement).dataset.backdropMousedown; }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onMouseDown={(e) => { const parent = e.currentTarget.parentElement as HTMLElement; if (parent) parent.dataset.backdropMousedown = "true"; }}
        onMouseUp={(e) => { const parent = e.currentTarget.parentElement as HTMLElement; if (parent?.dataset.backdropMousedown === "true") onClose(); if (parent) delete parent.dataset.backdropMousedown; }}
      />
      
      {/* Modal */}
      <div 
        className="relative w-full max-w-xl bg-[#202020] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] border border-[#2f2f2f] overflow-hidden"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4">
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

        {/* Filters */}
        <div className="flex items-center gap-2 px-5 pb-3">
          <button
            onClick={() => setFilterNotes((p) => !p)}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${filterNotes ? "bg-[#3f3f3f] text-[#e3e3e3]" : "bg-transparent text-[#6b6b6b] hover:text-[#9b9b9b]"}`}
          >
            Notes
          </button>
          <button
            onClick={() => setFilterLists((p) => !p)}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${filterLists ? "bg-[#3f3f3f] text-[#e3e3e3]" : "bg-transparent text-[#6b6b6b] hover:text-[#9b9b9b]"}`}
          >
            Lists
          </button>
          <div className="w-px h-3.5 bg-[#2f2f2f] mx-0.5" />
          <button
            onClick={() => setFilterArchived((p) => !p)}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${filterArchived ? "bg-[#3f3f3f] text-[#e3e3e3]" : "bg-transparent text-[#6b6b6b] hover:text-[#9b9b9b]"}`}
          >
            Include archived
          </button>
        </div>

        {hasResults && (
          <>
            <div className="border-t border-[#2f2f2f]" />
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
                        {result.archived && (
                          <span className="text-xs text-[#9b7b5b] bg-[#2f2a24] px-1.5 py-0.5 rounded">
                            Archived
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[#9b9b9b] mt-1 line-clamp-1">
                        {result.snippet}
                      </p>
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
