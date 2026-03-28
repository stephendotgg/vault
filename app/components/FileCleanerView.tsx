"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Image, Video, Music, FileText, FileType, FolderArchive, File } from "lucide-react";

// Use type assertion for the extended electronAPI
const getElectronAPI = () => window.electronAPI as (typeof window.electronAPI & { selectFolder?: () => Promise<string | null> }) | undefined;

interface FileInfo {
  name: string;
  path: string;
  size: number;
  created: string;
  modified: string;
  type: "image" | "video" | "audio" | "text" | "pdf" | "archive" | "unknown";
  ext: string;
}

type ActionType = "keep" | "delete" | "move";

// Only track the last action for one-time undo
interface LastAction {
  type: ActionType;
  file: FileInfo;
  index: number;
  movedFrom?: string; // For move actions, the destination folder
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
  const [keptCount, setKeptCount] = useState(0);
  const [deletedCount, setDeletedCount] = useState(0);
  const [movedCount, setMovedCount] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastVolumeRef = useRef<number>(1);

  const currentFile = files[currentIndex];
  const isComplete = currentIndex >= files.length && files.length > 0;
  const isLastFile = currentIndex === files.length - 1;

  // Load files from folder
  const loadFolder = async () => {
    if (!folderPath.trim()) return;
    
    setIsLoading(true);
    setError(null);
    setFiles([]);
    setCurrentIndex(0);
    setKeptCount(0);
    setDeletedCount(0);
    setMovedCount(0);
    setLastAction(null);
    setCanUndo(false);

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
    const api = getElectronAPI();
    if (api?.selectFolder) {
      const selectedPath = await api.selectFolder();
      if (selectedPath) {
        setFolderPath(selectedPath);
      }
    }
  };

  // Check if we're in Electron
  const isElectron = typeof window !== "undefined" && !!getElectronAPI()?.selectFolder;

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
    
    setKeptCount(prev => prev + 1);
    setLastAction({ type: "keep", file: currentFile, index: currentIndex });
    setCanUndo(true);
    setCurrentIndex(prev => prev + 1);
  }, [currentFile, currentIndex, isDeleting]);

  // Handle delete action
  const handleDelete = useCallback(async () => {
    if (isDeleting || !currentFile) return;
    
    setIsDeleting(true);
    
    try {
      // If last file, send to recycle bin directly (no undo)
      const url = `/api/files?path=${encodeURIComponent(currentFile.path)}${isLastFile ? "&isLastFile=true" : ""}`;
      const res = await fetch(url, { method: "DELETE" });
      
      if (res.ok) {
        setDeletedCount(prev => prev + 1);
        // Only allow undo if not last file
        if (!isLastFile) {
          setLastAction({ type: "delete", file: currentFile, index: currentIndex });
          setCanUndo(true);
        } else {
          setLastAction(null);
          setCanUndo(false);
        }
      }
    } catch (err) {
      console.error("Failed to delete file:", err);
    }
    
    setCurrentIndex(prev => prev + 1);
    setIsDeleting(false);
  }, [currentFile, currentIndex, isDeleting, isLastFile]);

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

  // Handle move to different folder
  const handleMove = useCallback(async () => {
    const api = getElectronAPI();
    if (!currentFile || !api?.selectFolder) return;
    
    const destinationDir = await api.selectFolder();
    if (!destinationDir) return; // User cancelled

    try {
      const res = await fetch("/api/files/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: currentFile.path, destinationDir }),
      });

      if (res.ok) {
        setMovedCount(prev => prev + 1);
        setLastAction({ type: "move", file: currentFile, index: currentIndex, movedFrom: destinationDir });
        setCanUndo(true);
        setCurrentIndex(prev => prev + 1);
      } else {
        const data = await res.json();
        console.error("Failed to move file:", data.error);
      }
    } catch (err) {
      console.error("Failed to move file:", err);
    }
  }, [currentFile, currentIndex]);

  // Handle quit - go back to folder selection
  const handleQuit = useCallback(() => {
    setFiles([]);
    setCurrentIndex(0);
    setKeptCount(0);
    setDeletedCount(0);
    setMovedCount(0);
    setLastAction(null);
    setCanUndo(false);
    setFolderPath("");
  }, []);

  // Handle undo action (one-time only)
  const handleUndo = useCallback(async () => {
    if (!canUndo || !lastAction || isDeleting) return;
    
    // For "keep" actions, just go back
    if (lastAction.type === "keep") {
      setKeptCount(prev => prev - 1);
      setCurrentIndex(lastAction.index);
      setLastAction(null);
      setCanUndo(false);
      return;
    }
    
    // For "delete" actions, restore from centralized trash
    if (lastAction.type === "delete") {
      try {
        const res = await fetch("/api/files/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ originalPath: lastAction.file.path }),
        });

        if (res.ok) {
          setDeletedCount(prev => prev - 1);
          setCurrentIndex(lastAction.index);
          setLastAction(null);
          setCanUndo(false);
        }
      } catch (err) {
        console.error("Failed to restore file:", err);
      }
      return;
    }
    
    // For "move" actions, move the file back
    if (lastAction.type === "move" && lastAction.movedFrom) {
      const movedFilePath = lastAction.movedFrom + "\\" + lastAction.file.name;
      try {
        const res = await fetch("/api/files/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            filePath: movedFilePath, 
            destinationDir: folderPath 
          }),
        });

        if (res.ok) {
          setMovedCount(prev => prev - 1);
          setCurrentIndex(lastAction.index);
          // Update the file path in the files array
          setFiles(prev => prev.map((f, i) => 
            i === lastAction.index 
              ? { ...f, path: folderPath + "\\" + f.name }
              : f
          ));
          setLastAction(null);
          setCanUndo(false);
        }
      } catch (err) {
        console.error("Failed to undo move:", err);
      }
    }
  }, [canUndo, lastAction, isDeleting, folderPath]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept keys when video/audio is focused (let native controls work)
      const activeEl = document.activeElement;
      if (activeEl?.tagName === "VIDEO" || activeEl?.tagName === "AUDIO") {
        // Only handle Escape to quit
        if (e.key === "Escape") {
          handleQuit();
        }
        return;
      }
      
      // Allow undo even when complete
      if (e.key === "u" || e.key === "U") {
        if (!isRenaming) handleUndo();
        return;
      }
      
      if (e.key === "Escape") {
        handleQuit();
        return;
      }
      
      if (isComplete || !currentFile) return;
      if (isRenaming) return; // Don't handle shortcuts while renaming
      
      if (e.key === "ArrowLeft") {
        handleDelete();
      } else if (e.key === "ArrowRight") {
        handleKeep();
      } else if (e.key === "r" || e.key === "R") {
        handleStartRename();
      } else if (e.key === "m" || e.key === "M") {
        handleMove();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeep, handleDelete, handleStartRename, handleMove, handleUndo, handleQuit, isComplete, currentFile, isRenaming]);

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
            ref={videoRef}
            key={currentFile.path}
            src={previewUrl}
            controls
            autoPlay
            className="max-w-full max-h-full rounded-lg"
            style={{ pointerEvents: "auto" }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onLoadedData={(e) => {
              // Restore volume from last video
              e.currentTarget.volume = lastVolumeRef.current;
            }}
            onVolumeChange={(e) => {
              // Save volume for next video
              lastVolumeRef.current = e.currentTarget.volume;
            }}
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
          <iframe
            src={previewUrl}
            className="w-full h-full rounded-lg border-0"
            title={currentFile.name}
          />
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
                Point to a folder and swipe to decide what to keep or delete
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
                Deleted {deletedCount} • Kept {keptCount}{movedCount > 0 ? ` • Moved ${movedCount}` : ""}
              </p>
              <button
                onClick={() => {
                  setFiles([]);
                  setCurrentIndex(0);
                  setKeptCount(0);
                  setDeletedCount(0);
                  setMovedCount(0);
                  setLastAction(null);
                  setCanUndo(false);
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
              className="relative w-full max-w-lg bg-[#252525] rounded-xl border border-[#3f3f3f] shadow-2xl overflow-hidden"
              style={{ height: "min(70vh, 500px)" }}
            >
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
                    <div className="flex items-center gap-2 text-xs text-[#6b6b6b] mt-1 flex-wrap">
                      <span>{formatFileSize(currentFile.size)}</span>
                      {(() => {
                        const created = new Date(currentFile.created);
                        const modified = new Date(currentFile.modified);
                        const formatDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                        const isValidDate = (d: Date) => !isNaN(d.getTime()) && d.getTime() > 0;
                        const isSameDay = isValidDate(created) && isValidDate(modified) && 
                          created.toDateString() === modified.toDateString();
                        
                        if (isSameDay) {
                          return <><span>•</span><span>{formatDate(modified)}</span></>;
                        }
                        return (
                          <>
                            {isValidDate(created) && <><span>•</span><span>Created {formatDate(created)}</span></>}
                            {isValidDate(modified) && <><span>•</span><span>Modified {formatDate(modified)}</span></>}
                          </>
                        );
                      })()}
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
              {/* Undo button */}
              <button
                onClick={handleUndo}
                disabled={isDeleting || !canUndo}
                className="w-12 h-12 rounded-full bg-[#2f2f2f] hover:bg-yellow-500/20 border-2 border-[#4f4f4f] hover:border-yellow-500 text-[#9b9b9b] hover:text-yellow-400 transition-all flex items-center justify-center disabled:opacity-30 cursor-pointer"
                title="Undo (U) - one time only"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </button>

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
              <kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[#9b9b9b]">←</kbd> delete, <kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[#9b9b9b]">→</kbd> keep, <kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[#9b9b9b]">R</kbd> rename, <kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[#9b9b9b]">M</kbd> move, <kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[#9b9b9b]">U</kbd> undo, <kbd className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[#9b9b9b]">Esc</kbd> quit
            </p>

            {/* Stats */}
            <div className="flex items-center gap-6 mt-4 text-sm">
              <span className="text-red-400">{deletedCount} deleted</span>
              <span className="text-green-400">{keptCount} kept</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
