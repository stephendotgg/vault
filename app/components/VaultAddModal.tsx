"use client";

import { useState, useRef, useEffect } from "react";

interface VaultAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (key: string, value: string, tags?: string) => Promise<void>;
  initialTag?: string;
}

export function VaultAddModal({ isOpen, onClose, onAdd, initialTag }: VaultAddModalProps) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [tags, setTags] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetchingTitle, setIsFetchingTitle] = useState(false);
  const keyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialTag) {
        setTags(initialTag);
      }
      keyInputRef.current?.focus();
    }
  }, [isOpen, initialTag]);

  // Check if URL is a YouTube link
  const isYouTubeUrl = (url: string): boolean => {
    const patterns = [
      /^https?:\/\/(www\.)?youtube\.com\/watch\?v=/,
      /^https?:\/\/youtu\.be\//,
      /^https?:\/\/(www\.)?youtube\.com\/shorts\//,
    ];
    return patterns.some((pattern) => pattern.test(url));
  };

  // Check if string is a valid URL
  const isValidUrl = (str: string): boolean => {
    try {
      const url = new URL(str);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  };

  // Fetch YouTube video title using oEmbed
  const fetchYouTubeTitle = async (url: string): Promise<string | null> => {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const res = await fetch(oembedUrl);
      if (res.ok) {
        const data = await res.json();
        return data.title || null;
      }
    } catch (error) {
      console.error("Failed to fetch YouTube title:", error);
    }
    return null;
  };

  // Fetch page title via our API
  const fetchPageTitle = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/fetch-title?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const data = await res.json();
        return data.title || null;
      }
    } catch (error) {
      console.error("Failed to fetch page title:", error);
    }
    return null;
  };

  // Handle paste in value field
  const handleValuePaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData("text").trim();
    
    // Only auto-fetch if key is empty
    if (!key && isValidUrl(pastedText)) {
      setIsFetchingTitle(true);
      
      let title: string | null = null;
      
      // Use YouTube oEmbed for YouTube links (faster, more reliable)
      if (isYouTubeUrl(pastedText)) {
        title = await fetchYouTubeTitle(pastedText);
        if (title) {
          setTags((prev) => prev ? `${prev}, youtube` : "youtube");
        }
      } else {
        // Use our API for other URLs
        title = await fetchPageTitle(pastedText);
      }
      
      if (title) {
        setKey(title);
      }
      setIsFetchingTitle(false);
    }
  };

  const handleClose = () => {
    setKey("");
    setValue("");
    setTags("");
    onClose();
  };

  const handleSubmit = async () => {
    if (!key.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      await onAdd(key.trim(), value.trim(), tags.trim());
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleClose}
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
          <h2 className="text-sm font-medium text-[#ebebeb]">Add to Vault</h2>
          <button
            onClick={handleClose}
            className="p-1 text-[#6b6b6b] hover:text-[#ebebeb] hover:bg-[#3f3f3f] rounded transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs text-[#9b9b9b] mb-1.5">
              Key
              {isFetchingTitle && <span className="ml-2 text-[#6b6b6b]">Fetching title...</span>}
            </label>
            <input
              ref={keyInputRef}
              type="text"
              placeholder="e.g. GitHub Personal Access Token"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-[#1a1a1a] text-[#ebebeb] text-sm px-3 py-2 rounded-md outline-none border border-[#3f3f3f] focus:border-[#5f5f5f] placeholder-[#6b6b6b]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#9b9b9b] mb-1.5">Value <span className="text-[#6b6b6b]">(paste URL to auto-fill title)</span></label>
            <input
              type="text"
              placeholder="The actual secret or value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onPaste={handleValuePaste}
              onKeyDown={handleKeyDown}
              className="w-full bg-[#1a1a1a] text-[#ebebeb] text-sm px-3 py-2 rounded-md outline-none border border-[#3f3f3f] focus:border-[#5f5f5f] placeholder-[#6b6b6b] font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-[#9b9b9b] mb-1.5">Tags <span className="text-[#6b6b6b]">(comma-separated, optional)</span></label>
            <input
              type="text"
              placeholder="e.g. api, github, work"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-[#1a1a1a] text-[#ebebeb] text-sm px-3 py-2 rounded-md outline-none border border-[#3f3f3f] focus:border-[#5f5f5f] placeholder-[#6b6b6b]"
            />
            {/* Quick tag buttons */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["music", "shows", "food", "youtube", "work"].map((tag) => {
                const tagList = tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
                const isActive = tagList.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      if (isActive) {
                        // Remove tag
                        const newTags = tagList.filter((t) => t !== tag).join(", ");
                        setTags(newTags);
                      } else {
                        // Add tag
                        const newTags = tags.trim() ? `${tags.trim()}, ${tag}` : tag;
                        setTags(newTags);
                      }
                    }}
                    className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                      isActive
                        ? "bg-[#4f4f4f] text-[#ebebeb]"
                        : "bg-[#2a2a2a] text-[#9b9b9b] hover:bg-[#3a3a3a] hover:text-[#ebebeb]"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#3f3f3f]">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-sm text-[#9b9b9b] hover:text-[#ebebeb] rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!key.trim() || isSubmitting}
            className="px-3 py-1.5 text-sm bg-[#4f4f4f] hover:bg-[#5f5f5f] disabled:bg-[#3f3f3f] disabled:text-[#6b6b6b] text-[#ebebeb] rounded-md transition-colors"
          >
            {isSubmitting ? "Adding..." : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
