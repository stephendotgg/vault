"use client";

import { useState } from "react";
import { VaultItem } from "@/types/models";

interface VaultViewProps {
  vaultItems: VaultItem[];
  onDeleteVaultItem: (id: string) => void;
  onOpenAddModal: (tag?: string) => void;
}

export function VaultView({ vaultItems, onDeleteVaultItem, onOpenAddModal }: VaultViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Priority tags that always show first (in this order)
  const priorityTags = ["shows", "music", "topics", "food", "youtube", "work"];
  
  // Compute all unique tags from vault items
  const allTags = (() => {
    const tagSet = new Set<string>();
    vaultItems.forEach((item) => {
      if (item.tags) {
        item.tags.split(",").forEach((t) => {
          const trimmed = t.trim().toLowerCase();
          if (trimmed) tagSet.add(trimmed);
        });
      }
    });
    
    // Priority tags first (only if they exist in items), then remaining tags alphabetically
    const existingPriority = priorityTags.filter((t) => tagSet.has(t));
    const remainingTags = [...tagSet].filter((t) => !priorityTags.includes(t)).sort();
    return [...existingPriority, ...remainingTags];
  })();

  const filteredItems = vaultItems.filter((item) => {
    // First filter by active tag if set
    if (activeTag) {
      const itemTags = item.tags.toLowerCase().split(",").map(t => t.trim());
      if (!itemTags.includes(activeTag.toLowerCase())) {
        return false;
      }
    }
    
    // Then filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        item.key.toLowerCase().includes(query) ||
        item.value.toLowerCase().includes(query) ||
        item.tags.toLowerCase().includes(query)
      );
    }
    
    return true;
  });

  const handleTagClick = (tag: string) => {
    if (activeTag === tag) {
      setActiveTag(null); // Toggle off
    } else {
      setActiveTag(tag);
      setSearchQuery(""); // Clear search when selecting tag
    }
  };

  const handleCopy = (id: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Check if a value is a URL
  const isUrl = (str: string): boolean => {
    try {
      const url = new URL(str);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center h-11 px-3 border-b border-[#2f2f2f] shrink-0">
        <div className="flex items-center gap-2 text-sm text-[#9b9b9b]">
          <span>Vault</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-12 py-12">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-[#e3e3e3]">Vault</h1>
            <button
              onClick={() => onOpenAddModal(activeTag || undefined)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#2f2f2f] hover:bg-[#3f3f3f] text-[#ebebeb] text-sm rounded-md transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Item
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search vault..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setActiveTag(null); }}
              className="w-full bg-[#2f2f2f] text-[#ebebeb] text-sm pl-10 pr-4 py-2 rounded-md outline-none border border-transparent focus:border-[#4f4f4f] placeholder-[#6b6b6b]"
            />
          </div>

          {/* Quick filter tags */}
          <div className="flex flex-wrap gap-2 mb-6">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  activeTag === tag
                    ? "bg-[#4f4f4f] text-[#ebebeb]"
                    : "bg-[#2f2f2f] text-[#9b9b9b] hover:bg-[#3f3f3f] hover:text-[#ebebeb]"
                }`}
              >
                {tag}
              </button>
            ))}
            {activeTag && (
              <button
                onClick={() => setActiveTag(null)}
                className="px-3 py-1 text-xs text-[#6b6b6b] hover:text-[#9b9b9b] transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* Vault items */}
          {filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[#6b6b6b]">
                {searchQuery || activeTag ? "No items match your search" : "No items in the vault yet"}
              </p>
              {!searchQuery && !activeTag && (
                <button
                  onClick={() => onOpenAddModal(activeTag || undefined)}
                  className="mt-4 text-sm text-[#9b9b9b] hover:text-[#ebebeb] transition-colors"
                >
                  Add your first item →
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="group bg-[#252525] border border-[#2f2f2f] hover:border-[#3f3f3f] rounded-lg p-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-[#ebebeb] truncate">{item.key}</span>
                      </div>
                      {item.value && (
                        <div className="flex items-center gap-2 mt-2">
                          {isUrl(item.value) ? (
                            <a
                              href={item.value}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 text-sm text-[#6b9fff] hover:text-[#8bb4ff] font-mono bg-[#1a1a1a] px-2 py-1 rounded truncate hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {item.value}
                            </a>
                          ) : (
                            <code className="flex-1 text-sm text-[#9b9b9b] font-mono bg-[#1a1a1a] px-2 py-1 rounded truncate">
                              {item.value}
                            </code>
                          )}
                        </div>
                      )}
                      {item.tags && !activeTag && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {item.tags.split(",").map((tag, i) => (
                            <span
                              key={i}
                              className="text-xs bg-[#2f2f2f] text-[#9b9b9b] px-2 py-0.5 rounded"
                            >
                              {tag.trim()}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleCopy(item.id, item.value)}
                        className="p-2 text-[#6b6b6b] hover:text-[#ebebeb] hover:bg-[#3f3f3f] rounded transition-colors"
                        title="Copy value"
                      >
                        {copiedId === item.id ? (
                          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => onDeleteVaultItem(item.id)}
                        className="p-2 text-[#6b6b6b] hover:text-[#ff6b6b] hover:bg-[#3f3f3f] rounded transition-colors"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Item count */}
          {filteredItems.length > 0 && (
            <p className="text-xs text-[#6b6b6b] mt-6 text-center">
              {filteredItems.length} {filteredItems.length === 1 ? "item" : "items"}
              {searchQuery && ` matching "${searchQuery}"`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
