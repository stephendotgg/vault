"use client";

import { useState, useRef, useEffect } from "react";

interface IconPickerProps {
  currentIcon: string;
  noteId: string;
  onIconChange: (newIcon: string) => void;
  onClose: () => void;
}

// Common emoji icons for pages
const EMOJI_OPTIONS = [
  "📄", "📝", "📋", "📌", "📎", "📁", "📂", "🗂️", "📚", "📖",
  "🔖", "📑", "📰", "🗞️", "🏷️", "💡", "💭", "💬", "✨", "⭐",
  "🌟", "💫", "🔥", "❤️", "💜", "💙", "💚", "💛", "🧡", "🖤",
  "🎯", "🎨", "🎭", "🎪", "🎬", "🎤", "🎧", "🎵", "🎶", "🎸",
  "🏠", "🏢", "🏗️", "🌍", "🌎", "🌏", "🌲", "🌳", "🌴", "🌵",
  "🐱", "🐶", "🦊", "🦁", "🐯", "🐻", "🐼", "🐨", "🐰", "🦄",
  "🍎", "🍊", "🍋", "🍇", "🍓", "🍕", "🍔", "🍟", "🍩", "🍪",
  "☕", "🍵", "🥤", "🍷", "🍸", "🍹", "🥂", "🧃", "🧊", "🍶",
  "🚀", "✈️", "🚗", "🚕", "🚌", "🚂", "🛸", "🚁", "⛵", "🚲",
  "💻", "🖥️", "📱", "⌨️", "🖱️", "💾", "📀", "🔌", "💡", "🔋",
];

export function IconPicker({ currentIcon, noteId, onIconChange, onClose }: IconPickerProps) {
  const [activeTab, setActiveTab] = useState<"emoji" | "custom">("emoji");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleEmojiSelect = async (emoji: string) => {
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icon: emoji }),
      });
      if (res.ok) {
        onIconChange(emoji);
        onClose();
      }
    } catch (error) {
      console.error("Failed to update icon:", error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Read file as base64 - simpler for local Electron app than multipart
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      const ext = file.name.split(".").pop() || "png";

      const res = await fetch(`/api/notes/${noteId}/icon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, ext, mimeType: file.type }),
      });

      if (res.ok) {
        const data = await res.json();
        onIconChange(data.icon);
        onClose();
      }
    } catch (error) {
      console.error("Failed to upload icon:", error);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveIcon = async () => {
    try {
      // If it's a custom icon, delete it
      if (currentIcon.startsWith("icon:")) {
        await fetch(`/api/notes/${noteId}/icon`, { method: "DELETE" });
      } else {
        // Just reset to default emoji
        await fetch(`/api/notes/${noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ icon: "📄" }),
        });
      }
      onIconChange("📄");
      onClose();
    } catch (error) {
      console.error("Failed to remove icon:", error);
    }
  };

  return (
    <div 
      ref={containerRef}
      className="absolute z-50 bg-[#252525] border border-[#3f3f3f] rounded-lg shadow-2xl w-80 overflow-hidden"
    >
      {/* Tabs */}
      <div className="flex border-b border-[#3f3f3f]">
        <button
          onClick={() => setActiveTab("emoji")}
          className={`flex-1 px-4 py-2 text-sm transition-colors ${
            activeTab === "emoji"
              ? "text-[#ebebeb] bg-[#2f2f2f]"
              : "text-[#9b9b9b] hover:text-[#ebebeb] hover:bg-[#2a2a2a]"
          }`}
        >
          Emoji
        </button>
        <button
          onClick={() => setActiveTab("custom")}
          className={`flex-1 px-4 py-2 text-sm transition-colors ${
            activeTab === "custom"
              ? "text-[#ebebeb] bg-[#2f2f2f]"
              : "text-[#9b9b9b] hover:text-[#ebebeb] hover:bg-[#2a2a2a]"
          }`}
        >
          Custom
        </button>
      </div>

      {/* Content */}
      <div className="p-3">
        {activeTab === "emoji" ? (
          <div className="grid grid-cols-10 gap-1">
            {EMOJI_OPTIONS.map((emoji, index) => (
              <button
                key={index}
                onClick={() => handleEmojiSelect(emoji)}
                className={`w-7 h-7 flex items-center justify-center text-lg hover:bg-[#3f3f3f] rounded transition-colors ${
                  currentIcon === emoji ? "bg-[#4f4f4f]" : ""
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-[#9b9b9b]">
              Upload a custom image to use as this page&apos;s icon.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full py-2 text-sm bg-[#3f3f3f] hover:bg-[#4f4f4f] text-[#ebebeb] rounded transition-colors disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Choose Image"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            {/* Preview current custom icon */}
            {currentIcon.startsWith("icon:") && (
              <div className="flex items-center gap-3 p-2 bg-[#1a1a1a] rounded">
                <img
                  src={`/api/icons/${currentIcon.substring(5)}`}
                  alt="Current icon"
                  className="w-8 h-8 rounded object-cover"
                />
                <span className="text-xs text-[#9b9b9b] flex-1">Current icon</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[#3f3f3f] flex justify-between">
        <button
          onClick={handleRemoveIcon}
          className="text-xs text-[#9b9b9b] hover:text-[#ebebeb] transition-colors"
        >
          Remove icon
        </button>
        <button
          onClick={onClose}
          className="text-xs text-[#9b9b9b] hover:text-[#ebebeb] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
