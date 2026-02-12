"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Image, Video, Music, FileText, FileType, FolderArchive, File } from "lucide-react";

// Extend Window interface for Electron API
declare global {
  interface Window {
    electronAPI?: {
      selectFolder: () => Promise<string | null>;
    };
  }
}

interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: string;
  type: "image" | "video" | "audio" | "text" | "pdf" | "archive" | "unknown";
  ext: string;
}

interface FileCleanerViewProps {
  onBack: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function FileCleanerView({ onBack: _onBack }: FileCleanerViewProps) {
  const [folderPath, setFolderPath] = useState("");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);
  const [keptCount, setKeptCount] = useState(0);
  const [deletedCount, setDeletedCount] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const cardRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const currentFile = files[currentIndex];
  const isComplete = currentIndex >= files.length && files.length > 0;

  // Load files from folder
  const loadFolder = async () => {
    if (!folderPath.trim()) return;
    
    setIsLoading(true);
    setError(null);
    setFiles([]);
    setCurrentIndex(0);
    setKeptCount(0);
    setDeletedCount(0);

    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(folderPath)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load folder");
        return;
      }

      setFiles(data.files);
      setFolderPath(data.path); // Use normalized path
    } catch {
      setError("Failed to connect to server");
    } finally {
      setIsLoading(false);
    }
  };

  // Browse for folder using native dialog
  const browseFolder = async () => {
    if (window.electronAPI?.selectFolder) {
      const selectedPath = await window.electronAPI.selectFolder();
      if (selectedPath) {
        setFolderPath(selectedPath);
      }
    }
  };

  // Check if we're in Electron
  const isElectron = typeof window !== "undefined" && !!window.electronAPI?.selectFolder;

  // Load text preview when current file changes
  useEffect(() => {
    if (currentFile?.type === "text") {
      fetch(`/api/files/preview?path=${encodeURIComponent(currentFile.path)}`)
        .then(res => res.json())
        .then(data => {
          if (data.type === "text") {
            setTextPreview(data.content);
          }
        })
        .catch(() => setTextPreview(null));
    } else {
      setTextPreview(null);
    }
  }, [currentFile]);

  // Handle keep action
  const handleKeep = useCallback(() => {
    if (isDeleting || !currentFile) return;
    
    setSwipeDirection("right");
    setKeptCount(prev => prev + 1);
    
    setTimeout(() => {
      setSwipeDirection(null);
      setCurrentIndex(prev => prev + 1);
    }, 300);
  }, [currentFile, isDeleting]);

  // Handle delete action
  const handleDelete = useCallback(async () => {
    if (isDeleting || !currentFile) return;
    
    setIsDeleting(true);
    setSwipeDirection("left");
    
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(currentFile.path)}`, {
        method: "DELETE",
      });
      
      if (res.ok) {
        setDeletedCount(prev => prev + 1);
      }
    } catch (err) {
      console.error("Failed to delete file:", err);
    }
    
    setTimeout(() => {
      setSwipeDirection(null);
      setCurrentIndex(prev => prev + 1);
      setIsDeleting(false);
    }, 300);
  }, [currentFile, isDeleting]);

  // Handle rename
  const handleStartRename = useCallback(() => {
    if (!currentFile) return;
    // Set only the name without extension
    const ext = currentFile.ext || "";
    const baseName = ext ? currentFile.name.slice(0, -ext.length) : currentFile.name;
    setRenameValue(baseName);
    setIsRenaming(true);
    setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
  }, [currentFile]);

  const handleConfirmRename = async () => {
    if (!currentFile || !renameValue.trim()) {
      setIsRenaming(false);
      return;
    }

    // Combine new name with original extension
    const ext = currentFile.ext || "";
    const newFullName = renameValue.trim() + ext;
    
    if (newFullName === currentFile.name) {
      setIsRenaming(false);
      return;
    }

    try {
      const res = await fetch("/api/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPath: currentFile.path, newName: newFullName }),
      });

      if (res.ok) {
        const data = await res.json();
        // Update the file in our list
        setFiles(prev => prev.map((f, i) => 
          i === currentIndex 
            ? { ...f, name: data.newName, path: data.newPath }
            : f
        ));
      }
    } catch (err) {
      console.error("Failed to rename file:", err);
    }

    setIsRenaming(false);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isComplete || !currentFile) return;
      if (isRenaming) return; // Don't handle shortcuts while renaming
      
      if (e.key === "ArrowLeft") {
        handleDelete();
      } else if (e.key === "ArrowRight") {
        handleKeep();
      } else if (e.key === "r" || e.key === "R") {
        handleStartRename();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeep, handleDelete, handleStartRename, isComplete, currentFile, isRenaming]);

  // Render file preview
  const renderPreview = () => {
    if (!currentFile) return null;

    const previewUrl = `/api/files/preview?path=${encodeURIComponent(currentFile.path)}`;

    switch (currentFile.type) {
      case "image":
        return (
          <img
            src={previewUrl}
            alt={currentFile.name}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        );
      
      case "video":
        return (
          <video
            src={previewUrl}
            controls
            autoPlay
            muted
            className="max-w-full max-h-full rounded-lg"
          />
        );
      
      case "audio":
        return (
          <div className="flex flex-col items-center gap-4">
            <div className="w-32 h-32 bg-[#2f2f2f] rounded-full flex items-center justify-center">
              <svg className="w-16 h-16 text-[#9b9b9b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <audio src={previewUrl} controls className="w-full max-w-md" />
          </div>
        );
      
      case "text":
        return (
          <div className="w-full h-full overflow-auto bg-[#1a1a1a] rounded-lg p-4">
            <pre className="text-sm text-[#e3e3e3] font-mono whitespace-pre-wrap break-words">
              {textPreview || "Loading..."}
            </pre>
          </div>
        );
      
      case "pdf":
        return (
          <div className="flex flex-col items-center gap-4">
            <div className="w-32 h-40 bg-[#2f2f2f] rounded-lg flex items-center justify-center border-2 border-[#4f4f4f]">
              <span className="text-2xl font-bold text-red-400">PDF</span>
            </div>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#6b9fff] hover:underline"
            >
              Open in new tab →
            </a>
          </div>
        );
      
      default:
        return (
          <div className="flex flex-col items-center gap-4">
            <div className="w-32 h-32 bg-[#2f2f2f] rounded-lg flex items-center justify-center">
              <svg className="w-16 h-16 text-[#6b6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="text-sm text-[#6b6b6b]">No preview available</span>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between h-11 px-4 border-b border-[#2f2f2f] shrink-0">
        <div className="flex items-center gap-1 text-sm text-[#9b9b9b]">
          <span>File Cleaner</span>
        </div>
        {files.length > 0 && !isComplete && (
          <div className="text-xs text-[#6b6b6b]">
            {currentIndex + 1} / {files.length}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Folder selection */}
        {files.length === 0 && !isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-md px-4">
              <h1 className="text-2xl font-bold text-[#e3e3e3] mb-2 text-center">File Cleaner</h1>
              <p className="text-[#9b9b9b] text-sm mb-6 text-center">
                Point to a folder and quickly decide what to keep or delete
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-[#9b9b9b] mb-1.5">Folder Path</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={folderPath}
                      onChange={(e) => setFolderPath(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && loadFolder()}
                      placeholder={isElectron ? "Click Browse to select a folder" : "C:\\Users\\...\\Downloads"}
                      className="flex-1 bg-[#2f2f2f] text-[#ebebeb] text-sm px-3 py-2.5 rounded-md outline-none border border-[#3f3f3f] focus:border-[#5f5f5f] placeholder-[#6b6b6b]"
                    />
                    {isElectron && (
                      <button
                        onClick={browseFolder}
                        className="px-4 py-2.5 bg-[#3f3f3f] hover:bg-[#4f4f4f] text-[#ebebeb] text-sm rounded-md transition-colors cursor-pointer"
                      >
                        Browse
                      </button>
                    )}
                  </div>
                </div>
                
                {error && (
                  <p className="text-sm text-red-400">{error}</p>
                )}
                
                <button
                  onClick={loadFolder}
                  disabled={!folderPath.trim()}
                  className="w-full py-2.5 bg-[#4f4f4f] hover:bg-[#5f5f5f] disabled:bg-[#3f3f3f] disabled:text-[#6b6b6b] text-[#ebebeb] text-sm rounded-md transition-colors cursor-pointer"
                >
                  Start Cleaning
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-[#9b9b9b]">Loading files...</div>
          </div>
        )}

        {/* Completion state */}
        {isComplete && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 bg-[#2f2f2f] rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-[#e3e3e3] mb-2">All done!</h2>
              <p className="text-[#9b9b9b] mb-4">
                Kept {keptCount} • Deleted {deletedCount}
              </p>
              <button
                onClick={() => {
                  setFiles([]);
                  setCurrentIndex(0);
                  setKeptCount(0);
                  setDeletedCount(0);
                }}
                className="px-4 py-2 bg-[#4f4f4f] hover:bg-[#5f5f5f] text-[#ebebeb] text-sm rounded-md transition-colors"
              >
                Clean Another Folder
              </button>
            </div>
          </div>
        )}

        {/* Card UI */}
        {currentFile && !isComplete && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-hidden">
            {/* Card */}
            <div
              ref={cardRef}
              className={`relative w-full max-w-lg bg-[#252525] rounded-xl border border-[#3f3f3f] shadow-2xl transition-all duration-300 overflow-hidden ${
                swipeDirection === "left" 
                  ? "-translate-x-full rotate-[-20deg] opacity-0" 
                  : swipeDirection === "right"
                  ? "translate-x-full rotate-[20deg] opacity-0"
                  : ""
              }`}
              style={{ height: "min(70vh, 500px)" }}
            >
              {/* Swipe indicators */}
              <div className={`absolute top-4 left-4 px-3 py-1 rounded-full border-2 border-red-500 text-red-500 font-bold text-sm z-10 transition-opacity ${swipeDirection === "left" ? "opacity-100" : "opacity-0"}`}>
                DELETE
              </div>
              <div className={`absolute top-4 right-4 px-3 py-1 rounded-full border-2 border-green-500 text-green-500 font-bold text-sm z-10 transition-opacity ${swipeDirection === "right" ? "opacity-100" : "opacity-0"}`}>
                KEEP
              </div>

              {/* Preview area */}
              <div className="h-[calc(100%-80px)] flex items-center justify-center p-4 overflow-hidden">
                {renderPreview()}
              </div>

              {/* File info */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#252525] via-[#252525] to-transparent px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 pr-4">
                    {isRenaming ? (
                      <div className="flex items-center gap-0">
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleConfirmRename();
                            if (e.key === "Escape") setIsRenaming(false);
                          }}
                          onBlur={handleConfirmRename}
                          className="flex-1 min-w-0 font-medium text-[#e3e3e3] bg-[#1a1a1a] border border-[#4f4f4f] rounded-l px-2 py-1 outline-none focus:border-[#6b6b6b]"
                        />
                        <span className="font-medium text-[#6b6b6b] bg-[#1a1a1a] border border-l-0 border-[#4f4f4f] rounded-r px-2 py-1">
                          {currentFile.ext}
                        </span>
                      </div>
                    ) : (
                      <h3 className="font-medium text-[#e3e3e3] truncate">{currentFile.name}</h3>
                    )}
                    <div className="flex items-center gap-3 text-xs text-[#6b6b6b] mt-1">
                      <span>{formatFileSize(currentFile.size)}</span>
                      <span>•</span>
                      <span>{new Date(currentFile.modified).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {/* File type icon */}
                  <div className="w-12 h-12 flex items-center justify-center text-[#6b6b6b]">
                    {currentFile.type === "image" && <Image className="w-10 h-10" strokeWidth={1.5} />}
                    {currentFile.type === "video" && <Video className="w-10 h-10" strokeWidth={1.5} />}
                    {currentFile.type === "audio" && <Music className="w-10 h-10" strokeWidth={1.5} />}
                    {currentFile.type === "text" && <FileText className="w-10 h-10" strokeWidth={1.5} />}
                    {currentFile.type === "pdf" && <FileType className="w-10 h-10" strokeWidth={1.5} />}
                    {currentFile.type === "archive" && <FolderArchive className="w-10 h-10" strokeWidth={1.5} />}
                    {currentFile.type === "unknown" && <File className="w-10 h-10" strokeWidth={1.5} />}
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-8 mt-6">
              {/* Delete button */}
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="w-16 h-16 rounded-full bg-[#2f2f2f] hover:bg-red-500/20 border-2 border-[#4f4f4f] hover:border-red-500 text-[#9b9b9b] hover:text-red-400 transition-all flex items-center justify-center disabled:opacity-50 cursor-pointer"
                title="Delete (←)"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Keep button */}
              <button
                onClick={handleKeep}
                disabled={isDeleting}
                className="w-16 h-16 rounded-full bg-[#2f2f2f] hover:bg-green-500/20 border-2 border-[#4f4f4f] hover:border-green-500 text-[#9b9b9b] hover:text-green-400 transition-all flex items-center justify-center disabled:opacity-50 cursor-pointer"
                title="Keep (→)"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </div>

            {/* Keyboard hints */}
            <p className="text-xs text-[#6b6b6b] mt-4">
              <kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[#9b9b9b]">←</kbd> delete, <kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[#9b9b9b]">→</kbd> keep, <kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[#9b9b9b]">R</kbd> rename
            </p>

            {/* Stats */}
            <div className="flex items-center gap-6 mt-4 text-sm">
              <div className="flex items-center gap-2 text-green-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>{keptCount} kept</span>
              </div>
              <div className="flex items-center gap-2 text-red-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>{deletedCount} deleted</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
