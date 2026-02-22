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

  return (
    <div className="h-8 bg-[#202020] flex items-center justify-between select-none shrink-0"
         style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
      {/* App title */}
      <div className="px-3 text-xs text-[#7eb8f7] font-medium">
        Mothership
      </div>
      
      {/* Window controls */}
      <div className="flex h-full" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <button
          onClick={handleMinimize}
          className="w-12 h-full flex items-center justify-center hover:bg-[#3a3a3a] transition-colors"
        >
          <svg className="w-3 h-[2px] fill-[#9b9b9b]" viewBox="0 0 12 2">
            <rect width="12" height="2" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="w-12 h-full flex items-center justify-center hover:bg-[#3a3a3a] transition-colors"
        >
          <svg className="w-3 h-3 stroke-[#9b9b9b]" fill="none" viewBox="0 0 12 12">
            <rect x="1" y="1" width="10" height="10" strokeWidth="1.5" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="w-12 h-full flex items-center justify-center hover:bg-[#e81123] transition-colors group"
        >
          <svg className="w-3 h-3 stroke-[#9b9b9b] group-hover:stroke-white" fill="none" viewBox="0 0 12 12">
            <path d="M1 1L11 11M1 11L11 1" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
