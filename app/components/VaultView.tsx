"use client";

import { useState, useRef, useEffect } from "react";
import { VaultItem } from "@/types/models";

interface VaultViewProps {
  vaultItems: VaultItem[];
  onCreateVaultItem: (key: string, value: string, tags?: string) => Promise<VaultItem | undefined>;
  onDeleteVaultItem: (id: string) => void;
  onUpdateVaultItem: (id: string, data: Partial<VaultItem>) => void;
}

export function VaultView({ vaultItems, onCreateVaultItem, onDeleteVaultItem, onUpdateVaultItem }: VaultViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newTags, setNewTags] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding && keyInputRef.current) {
      keyInputRef.current.focus();
    }
  }, [isAdding]);

  const filteredItems = vaultItems.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      item.key.toLowerCase().includes(query) ||
      item.value.toLowerCase().includes(query) ||
      item.tags.toLowerCase().includes(query)
    );
  });

  const handleAdd = async () => {
    if (newKey.trim()) {
      await onCreateVaultItem(newKey.trim(), newValue.trim(), newTags.trim());
      setNewKey("");
      setNewValue("");
      setNewTags("");
      setIsAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      handleAdd();
    } else if (e.key === "Escape") {
      setIsAdding(false);
      setNewKey("");
      setNewValue("");
      setNewTags("");
    }
  };

  const handleCopy = (id: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center h-11 px-3 border-b border-[#2f2f2f] shrink-0">
        <div className="flex items-center gap-2 text-sm text-[#9b9b9b]">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
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
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#2f2f2f] hover:bg-[#3f3f3f] text-[#ebebeb] text-sm rounded-md transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Item
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search vault..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#2f2f2f] text-[#ebebeb] text-sm pl-10 pr-4 py-2 rounded-md outline-none border border-transparent focus:border-[#4f4f4f] placeholder-[#6b6b6b]"
            />
          </div>

          {/* Add new item form */}
          {isAdding && (
            <div className="bg-[#252525] border border-[#3f3f3f] rounded-lg p-4 mb-6">
              <div className="grid gap-3">
                <div>
                  <label className="block text-xs text-[#9b9b9b] mb-1">Key</label>
                  <input
                    ref={keyInputRef}
                    type="text"
                    placeholder="e.g. GitHub Personal Access Token"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-[#2f2f2f] text-[#ebebeb] text-sm px-3 py-2 rounded outline-none border border-[#3f3f3f] focus:border-[#5f5f5f]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#9b9b9b] mb-1">Value</label>
                  <input
                    type="text"
                    placeholder="The actual secret or value"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-[#2f2f2f] text-[#ebebeb] text-sm px-3 py-2 rounded outline-none border border-[#3f3f3f] focus:border-[#5f5f5f] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#9b9b9b] mb-1">Tags (comma-separated)</label>
                  <input
                    type="text"
                    placeholder="e.g. api, github, work"
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-[#2f2f2f] text-[#ebebeb] text-sm px-3 py-2 rounded outline-none border border-[#3f3f3f] focus:border-[#5f5f5f]"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleAdd}
                  className="px-4 py-1.5 bg-[#4f4f4f] hover:bg-[#5f5f5f] text-[#ebebeb] text-sm rounded transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setNewKey("");
                    setNewValue("");
                    setNewTags("");
                  }}
                  className="px-4 py-1.5 text-[#9b9b9b] hover:text-[#ebebeb] text-sm rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Vault items */}
          {filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-12 h-12 mx-auto text-[#3f3f3f] mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <p className="text-[#6b6b6b]">
                {searchQuery ? "No items match your search" : "No items in the vault yet"}
              </p>
              {!searchQuery && !isAdding && (
                <button
                  onClick={() => setIsAdding(true)}
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
                        <svg className="w-4 h-4 shrink-0 text-[#6b6b6b]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                        <span className="font-medium text-[#ebebeb] truncate">{item.key}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <code className="flex-1 text-sm text-[#9b9b9b] font-mono bg-[#1a1a1a] px-2 py-1 rounded truncate">
                          {item.value || "(empty)"}
                        </code>
                      </div>
                      {item.tags && (
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
