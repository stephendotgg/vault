"use client";

import { useState, useEffect } from "react";

export function TitleBar() {
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    setIsElectron(!!window.electronAPI);
  }, []);

  const handleMinimize = () => {
    window.electronAPI?.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximize();
  };

  const handleClose = () => {
    window.electronAPI?.close();
  };

  // Don't render until we know if we're in Electron
  if (!isElectron) {
    return null;
  }

  // Minimal title bar with app name and window controls
  return (
    <div className="h-8 bg-[#191919] flex items-center justify-between select-none shrink-0"
         style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
      {/* App title */}
      <div className="px-3 text-xs text-[#7eb8f7] font-medium">
        Mothership
      </div>
      
      {/* Window controls - Windows style */}
      <div className="flex h-full" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <button
          onClick={handleMinimize}
          className="w-12 h-full flex items-center justify-center hover:bg-[#2a2a2a] transition-colors"
        >
          <svg className="w-2.5 h-[1px]" viewBox="0 0 10 1">
            <rect width="10" height="1" fill="#9b9b9b" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="w-12 h-full flex items-center justify-center hover:bg-[#2a2a2a] transition-colors"
        >
          <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
            <rect x="0.5" y="0.5" width="9" height="9" stroke="#9b9b9b" strokeWidth="1" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="w-12 h-full flex items-center justify-center hover:bg-[#e81123] transition-colors group"
        >
          <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
            <path d="M0 0L10 10M0 10L10 0" stroke="#9b9b9b" strokeWidth="1" className="group-hover:stroke-white" />
          </svg>
        </button>
      </div>
    </div>
  );
}
