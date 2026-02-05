"use client";

import { useState } from "react";

type SectionKey = "notes" | "vault" | "memories";

export function Sidebar() {
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    notes: true,
    vault: true,
    memories: false,
  });

  const toggleSection = (section: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <aside className="flex flex-col w-60 h-full bg-[#202020] border-r border-[#2f2f2f] shrink-0 select-none">
      {/* Workspace header */}
      <div className="flex items-center h-11 px-3 hover:bg-[#2f2f2f] cursor-pointer">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xs font-medium text-white">
            M
          </div>
          <span className="text-sm font-medium text-[#e3e3e3] truncate">Mothership</span>
        </div>
      </div>

      {/* Search and quick actions */}
      <div className="px-2 py-1">
        <div className="flex items-center gap-2 px-2 py-1.5 text-[#9b9b9b] hover:bg-[#2f2f2f] rounded cursor-pointer text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span>Search</span>
        </div>
        <div className="flex items-center gap-2 px-2 py-1.5 text-[#9b9b9b] hover:bg-[#2f2f2f] rounded cursor-pointer text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span>Create</span>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#2f2f2f] mx-2 my-1" />

      {/* Sections */}
      <div className="flex-1 overflow-auto px-2 py-2">
        {/* NOTES Section */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[#91918e] uppercase tracking-wider cursor-pointer hover:text-[#aeaeae] rounded transition-colors"
          onClick={() => toggleSection("notes")}
        >
          <svg
            className={`w-3 h-3 transition-transform duration-150 ${openSections.notes ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          <span>Notes</span>
        </div>
        {openSections.notes && (
          <div className="ml-1 mt-0.5 flex flex-col gap-[1px]">
            <div className="flex items-center gap-2.5 px-2 py-[5px] text-[#ebebeb] bg-[rgba(255,255,255,0.055)] rounded-[6px] cursor-pointer text-sm transition-all">
              <span className="text-[15px]">📄</span>
              <span className="truncate">Quick Notes</span>
            </div>
            <div className="flex items-center gap-2.5 px-2 py-[5px] text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] cursor-pointer text-sm transition-all">
              <span className="text-[15px]">📝</span>
              <span className="truncate">Meeting Notes</span>
            </div>
            <div className="flex items-center gap-2.5 px-2 py-[5px] text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] cursor-pointer text-sm transition-all">
              <span className="text-[15px]">💡</span>
              <span className="truncate">Ideas</span>
            </div>
          </div>
        )}

        {/* VAULT Section */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[#91918e] uppercase tracking-wider cursor-pointer hover:text-[#aeaeae] rounded transition-colors mt-6"
          onClick={() => toggleSection("vault")}
        >
          <svg
            className={`w-3 h-3 transition-transform duration-150 ${openSections.vault ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          <span>Vault</span>
        </div>
        {openSections.vault && (
          <div className="ml-1 mt-0.5 flex flex-col gap-[1px]">
            <div className="flex items-center gap-2.5 px-2 py-[5px] text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] cursor-pointer text-sm transition-all">
              <span className="text-[15px]">🔐</span>
              <span className="truncate">Passwords</span>
            </div>
            <div className="flex items-center gap-2.5 px-2 py-[5px] text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] cursor-pointer text-sm transition-all">
              <span className="text-[15px]">🔑</span>
              <span className="truncate">API Keys</span>
            </div>
            <div className="flex items-center gap-2.5 px-2 py-[5px] text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] cursor-pointer text-sm transition-all">
              <span className="text-[15px]">📁</span>
              <span className="truncate">Secure Documents</span>
            </div>
          </div>
        )}

        {/* MEMORIES Section */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[#91918e] uppercase tracking-wider cursor-pointer hover:text-[#aeaeae] rounded transition-colors mt-6"
          onClick={() => toggleSection("memories")}
        >
          <svg
            className={`w-3 h-3 transition-transform duration-150 ${openSections.memories ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          <span>Memories</span>
        </div>
        {openSections.memories && (
          <div className="ml-1 mt-0.5 flex flex-col gap-[1px]">
            <div className="flex items-center gap-2.5 px-2 py-[5px] text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] cursor-pointer text-sm transition-all">
              <span className="text-[15px]">📸</span>
              <span className="truncate">Photos</span>
            </div>
            <div className="flex items-center gap-2.5 px-2 py-[5px] text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] cursor-pointer text-sm transition-all">
              <span className="text-[15px]">🎥</span>
              <span className="truncate">Videos</span>
            </div>
            <div className="flex items-center gap-2.5 px-2 py-[5px] text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] cursor-pointer text-sm transition-all">
              <span className="text-[15px]">📅</span>
              <span className="truncate">Journal</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom section */}
      <div className="px-2 py-2 border-t border-[#2f2f2f]">
        <div className="flex items-center gap-2.5 px-2 py-[5px] text-[#ebebeb80] hover:bg-[rgba(255,255,255,0.055)] hover:text-[#ebebeb] rounded-[6px] cursor-pointer text-sm transition-all">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>Settings</span>
        </div>
      </div>
    </aside>
  );
}
