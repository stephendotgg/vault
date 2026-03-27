"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import Spreadsheet from "react-spreadsheet";
import type {
  Matrix,
  DataEditorProps,
  DataViewerProps,
  Point,
  Selection,
  ColumnIndicatorProps,
  RowIndicatorProps,
  RowProps,
} from "react-spreadsheet";
import { EmptySelection } from "react-spreadsheet";
import ReactMarkdown from "react-markdown";
import { AutoCorrect } from "@/app/extensions/AutoCorrect";
import { Note } from "@/types/models";

// Storage keys
const OPENROUTER_API_KEY_STORAGE_KEY = "vault-openrouter-api-key";
const LEGACY_OPENROUTER_API_KEY_STORAGE_KEY = "mothership-openrouter-api-key";
const AI_PROVIDER_STORAGE_KEY = "vault-ai-provider";
const AZURE_FOUNDRY_API_KEY_STORAGE_KEY = "vault-azure-foundry-api-key";
const AZURE_FOUNDRY_ENDPOINT_STORAGE_KEY = "vault-azure-foundry-endpoint";
const THEME_MODE_EVENT = "vault-theme-updated";
const SPREADSHEET_CONTENT_PREFIX = "vault:sheet:v1:";
const DEFAULT_SPREADSHEET_ROWS = 30;
const DEFAULT_SPREADSHEET_COLS = 12;
const DEFAULT_SPREADSHEET_COLUMN_WIDTH = 104;
const DEFAULT_SPREADSHEET_ROW_HEIGHT = 30;
const MIN_SPREADSHEET_COLUMN_WIDTH = 56;
const MIN_SPREADSHEET_ROW_HEIGHT = 24;

type SpreadsheetCell = { value: string };

function spreadsheetColumnIndexToLabel(column: number): string {
  let label = "";
  let index = column;
  while (index >= 0) {
    label = String.fromCharCode(65 + (index % 26)) + label;
    index = Math.floor(index / 26) - 1;
  }
  return label;
}

function ensureSize(values: number[], targetLength: number, fallback: number): number[] {
  if (values.length === targetLength) {
    return values;
  }

  if (values.length > targetLength) {
    return values.slice(0, targetLength);
  }

  return [...values, ...Array.from({ length: targetLength - values.length }, () => fallback)];
}

function toggleSheetInlineFormat(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  marker: "**" | "*" | "__"
): { nextValue: string; nextSelectionStart: number; nextSelectionEnd: number } {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd));
  const end = Math.max(selectionStart, selectionEnd);
  const markerLength = marker.length;

  if (start === end) {
    const hasOuterMarker =
      value.length >= markerLength * 2 &&
      value.startsWith(marker) &&
      value.endsWith(marker);

    if (hasOuterMarker) {
      const nextValue = value.slice(markerLength, value.length - markerLength);
      const nextCursor = Math.max(0, start - markerLength);
      return {
        nextValue,
        nextSelectionStart: nextCursor,
        nextSelectionEnd: nextCursor,
      };
    }

    const nextValue = `${marker}${value}${marker}`;
    const nextCursor = start + markerLength;
    return {
      nextValue,
      nextSelectionStart: nextCursor,
      nextSelectionEnd: nextCursor,
    };
  }

  const hasMarkersAroundSelection =
    start >= markerLength &&
    value.slice(start - markerLength, start) === marker &&
    value.slice(end, end + markerLength) === marker;

  if (hasMarkersAroundSelection) {
    const nextValue =
      value.slice(0, start - markerLength) +
      value.slice(start, end) +
      value.slice(end + markerLength);

    return {
      nextValue,
      nextSelectionStart: start - markerLength,
      nextSelectionEnd: end - markerLength,
    };
  }

  const selected = value.slice(start, end);
  const wrapped = `${marker}${selected}${marker}`;
  const nextValue = `${value.slice(0, start)}${wrapped}${value.slice(end)}`;
  const cursorStart = start + markerLength;
  const cursorEnd = cursorStart + selected.length;

  return {
    nextValue,
    nextSelectionStart: cursorStart,
    nextSelectionEnd: cursorEnd,
  };
}

function renderSheetInlineFormatting(value: string): React.ReactNode[] {
  type FormatState = { bold: boolean; italic: boolean; underline: boolean };
  type Segment = { text: string; state: FormatState };

  const segments: Segment[] = [];
  let state: FormatState = { bold: false, italic: false, underline: false };
  let buffer = "";

  const flush = () => {
    if (!buffer) {
      return;
    }

    segments.push({
      text: buffer,
      state: { ...state },
    });
    buffer = "";
  };

  for (let index = 0; index < value.length; ) {
    if (value.startsWith("**", index)) {
      flush();
      state = { ...state, bold: !state.bold };
      index += 2;
      continue;
    }

    if (value.startsWith("*", index) && !value.startsWith("**", index)) {
      flush();
      state = { ...state, italic: !state.italic };
      index += 1;
      continue;
    }

    if (value.startsWith("__", index)) {
      flush();
      state = { ...state, underline: !state.underline };
      index += 2;
      continue;
    }

    buffer += value[index];
    index += 1;
  }

  flush();

  if (segments.length === 0) {
    return [value];
  }

  return segments.map((segment, segmentIndex) => {
    const linkifiedNodes: React.ReactNode[] = [];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = urlRegex.exec(segment.text)) !== null) {
      const matchedUrl = match[0];
      const matchIndex = match.index;

      if (matchIndex > cursor) {
        linkifiedNodes.push(segment.text.slice(cursor, matchIndex));
      }

      linkifiedNodes.push(
        <a
          key={`url-${segmentIndex}-${matchIndex}`}
          href={matchedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 underline"
          onMouseDown={(event) => {
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          onClick={(event) => {
            event.preventDefault();

            if (event.ctrlKey || event.metaKey) {
              event.stopPropagation();
              window.open(matchedUrl, "_blank", "noopener,noreferrer");
            }
          }}
        >
          {matchedUrl}
        </a>
      );

      cursor = matchIndex + matchedUrl.length;
    }

    if (cursor < segment.text.length) {
      linkifiedNodes.push(segment.text.slice(cursor));
    }

    const baseNode: React.ReactNode = linkifiedNodes.length > 0 ? linkifiedNodes : segment.text;
    let node: React.ReactNode = baseNode;

    if (segment.state.bold) {
      node = <strong key={`b-${segmentIndex}`}>{node}</strong>;
    }
    if (segment.state.italic) {
      node = <em key={`i-${segmentIndex}`}>{node}</em>;
    }
    if (segment.state.underline) {
      node = <u key={`u-${segmentIndex}`}>{node}</u>;
    }

    return <span key={`seg-${segmentIndex}`}>{node}</span>;
  });
}

function SheetDataViewer({ cell, evaluatedCell }: DataViewerProps<SpreadsheetCell>) {
  const rawValue = evaluatedCell?.value ?? cell?.value ?? "";
  const value = typeof rawValue === "string" ? rawValue : String(rawValue);

  return (
    <span className="Spreadsheet__data-viewer">
      {renderSheetInlineFormatting(value)}
    </span>
  );
}

function SheetDataEditor({
  cell,
  onChange,
  exitEditMode,
  row,
  column,
  readOnly = false,
  onNavigateCell,
}: DataEditorProps<SpreadsheetCell> & {
  readOnly?: boolean;
  onNavigateCell?: (point: Point, direction: "up" | "down" | "left" | "right") => void;
}) {
  const handleEditorChange = (nextValue: string) => {
    if (readOnly) {
      return;
    }
    onChange({ value: nextValue });
  };

  const value = cell?.value ?? "";

  return (
    <div className="Spreadsheet__data-editor">
      <input
        value={value}
        onChange={(e) => handleEditorChange(e.target.value)}
        readOnly={readOnly}
        onKeyDown={(e) => {
          if (readOnly) {
            if (e.key === "Escape") {
              e.preventDefault();
              exitEditMode();
            }
            return;
          }

          const isMeta = e.ctrlKey || e.metaKey;
          if (isMeta && (e.key === "b" || e.key === "B" || e.key === "i" || e.key === "I" || e.key === "u" || e.key === "U")) {
            e.preventDefault();

            const marker = e.key.toLowerCase() === "b" ? "**" : e.key.toLowerCase() === "i" ? "*" : "__";
            const target = e.currentTarget;
            const selectionStart = target.selectionStart ?? 0;
            const selectionEnd = target.selectionEnd ?? selectionStart;
            const formatted = toggleSheetInlineFormat(value, selectionStart, selectionEnd, marker);

            handleEditorChange(formatted.nextValue);

            requestAnimationFrame(() => {
              target.setSelectionRange(formatted.nextSelectionStart, formatted.nextSelectionEnd);
            });
            return;
          }

          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            exitEditMode();
            onNavigateCell?.({ row, column }, "down");
            return;
          }

          if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            exitEditMode();

            const direction =
              e.key === "ArrowUp"
                ? "up"
                : e.key === "ArrowDown"
                  ? "down"
                  : e.key === "ArrowLeft"
                    ? "left"
                    : "right";

            onNavigateCell?.({ row, column }, direction);
            return;
          }

          if (e.key === "Escape") {
            e.preventDefault();
            exitEditMode();
          }
        }}
        autoFocus
      />
    </div>
  );
}

function createDefaultSpreadsheetData(rows = DEFAULT_SPREADSHEET_ROWS, cols = DEFAULT_SPREADSHEET_COLS): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
}

function isSpreadsheetContent(content: string): boolean {
  return content.startsWith(SPREADSHEET_CONTENT_PREFIX);
}

function isSpreadsheetNoteLike(noteLike: Pick<Note, "icon" | "content">): boolean {
  return noteLike.icon === "sheet" || noteLike.icon === "📊" || isSpreadsheetContent(noteLike.content || "");
}

function getUntitledLabel(noteLike: Pick<Note, "icon" | "content">): string {
  return isSpreadsheetNoteLike(noteLike) ? "New sheet" : "New page";
}

function hasSpreadsheetCellContent(content: string): boolean {
  if (!isSpreadsheetContent(content)) {
    return false;
  }

  try {
    const payload = content.slice(SPREADSHEET_CONTENT_PREFIX.length);
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed)) {
      return false;
    }

    return parsed.some((row) =>
      Array.isArray(row) && row.some((cell) => typeof cell === "string" && cell.trim().length > 0)
    );
  } catch {
    return false;
  }
}

function normalizeSpreadsheetData(raw: string[][]): string[][] {
  const rowCount = Math.max(raw.length, DEFAULT_SPREADSHEET_ROWS);
  const colCount = Math.max(
    DEFAULT_SPREADSHEET_COLS,
    ...raw.map((row) => row.length)
  );

  return Array.from({ length: rowCount }, (_, rowIndex) =>
    Array.from({ length: colCount }, (_, colIndex) => raw[rowIndex]?.[colIndex] ?? "")
  );
}

function parseSpreadsheetContent(content: string): string[][] {
  if (!isSpreadsheetContent(content)) {
    return createDefaultSpreadsheetData();
  }

  try {
    const payload = content.slice(SPREADSHEET_CONTENT_PREFIX.length);
    const parsed = JSON.parse(payload);

    if (!Array.isArray(parsed)) {
      return createDefaultSpreadsheetData();
    }

    const rows = parsed.map((row) =>
      Array.isArray(row) ? row.map((cell) => (typeof cell === "string" ? cell : "")) : []
    );

    return normalizeSpreadsheetData(rows);
  } catch {
    return createDefaultSpreadsheetData();
  }
}

function serializeSpreadsheetContent(data: string[][]): string {
  return `${SPREADSHEET_CONTENT_PREFIX}${JSON.stringify(data)}`;
}

function spreadsheetDataToPlainText(data: string[][]): string {
  return data
    .map((row) => row.join("\t").trimEnd())
    .filter((row) => row.length > 0)
    .join("\n");
}

// Strip HTML for plain text
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

type ParsedCallNoteSections = {
  transcriptLabel: string;
  transcriptDate: string | null;
  summaryItems: string[];
  actionItems: string[];
  transcriptLines: string[];
};

function normalizeCallLine(text: string): string {
  return String(text || "")
    .replace(/^[-•]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCallNoteSections(html: string): ParsedCallNoteSections {
  if (!html || typeof window === "undefined") {
    return {
      transcriptLabel: "Transcript",
      transcriptDate: null,
      summaryItems: [],
      actionItems: [],
      transcriptLines: [],
    };
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");
  const blocks = Array.from(document.body.querySelectorAll("p,li"));

  let currentSection: "summary" | "actions" | "transcript" | null = null;
  let transcriptLabel = "Transcript";
  let transcriptDate: string | null = null;
  const summaryItems: string[] = [];
  const actionItems: string[] = [];
  const transcriptLines: string[] = [];

  const pushUnique = (list: string[], value: string) => {
    if (!value) {
      return;
    }

    if (list[list.length - 1] === value || list.includes(value)) {
      return;
    }

    list.push(value);
  };

  for (const block of blocks) {
    if (block.tagName === "P" && block.closest("li")) {
      continue;
    }

    const text = normalizeCallLine(block.textContent || "");
    if (!text) {
      continue;
    }

    if (/^summary:?$/i.test(text)) {
      currentSection = "summary";
      continue;
    }

    if (/^action\s*items:?$/i.test(text)) {
      currentSection = "actions";
      continue;
    }

    if (/^transcript(?:\s*\((.+)\))?:?$/i.test(text)) {
      const match = text.match(/^transcript(?:\s*\((.+)\))?:?$/i);
      if (match?.[1]) {
        transcriptDate = match[1].trim();
        transcriptLabel = `Transcript (${transcriptDate})`;
      }
      currentSection = "transcript";
      continue;
    }

    if (currentSection === "summary") {
      pushUnique(summaryItems, text);
      continue;
    }

    if (currentSection === "actions") {
      pushUnique(actionItems, text);
      continue;
    }

    if (currentSection === "transcript") {
      pushUnique(transcriptLines, text);
    }
  }

  return {
    transcriptLabel,
    transcriptDate,
    summaryItems,
    actionItems,
    transcriptLines,
  };
}

function isImageUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function parseImageWidth(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const width = parseInt(value, 10);
    return Number.isFinite(width) ? width : null;
  }

  return null;
}

function buildUploadFilename(file: Blob & { name?: string }, prefix: string): string {
  const rawName = typeof file.name === "string" ? file.name.trim() : "";
  if (rawName.length > 0) {
    return rawName;
  }

  const mime = typeof file.type === "string" ? file.type.toLowerCase() : "";
  let ext = "png";
  if (mime === "image/jpeg") ext = "jpg";
  else if (mime === "image/gif") ext = "gif";
  else if (mime === "image/webp") ext = "webp";
  else if (mime === "image/svg+xml") ext = "svg";
  else if (mime === "image/bmp") ext = "bmp";
  else if (mime === "image/avif") ext = "avif";

  return `${prefix}-${Date.now()}.${ext}`;
}

const NoteImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      inlineIcon: {
        default: false,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-inline-icon") === "true",
        renderHTML: (attributes: { inlineIcon?: unknown }) => {
          return attributes.inlineIcon ? { "data-inline-icon": "true" } : {};
        },
      },
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const dataWidth = element.getAttribute("data-width");
          if (dataWidth) {
            const parsed = parseInt(dataWidth, 10);
            if (Number.isFinite(parsed)) {
              return parsed;
            }
          }

          const styleWidth = element.style.width;
          if (styleWidth?.endsWith("px")) {
            const parsed = parseInt(styleWidth.replace("px", ""), 10);
            if (Number.isFinite(parsed)) {
              return parsed;
            }
          }

          return null;
        },
        renderHTML: (attributes: { width?: unknown }) => {
          const width = parseImageWidth(attributes.width);
          if (!width) {
            return {};
          }

          return {
            "data-width": String(width),
            style: `width:${width}px;height:auto;`,
          };
        },
      },
    };
  },
});

// Note icon - can be emoji, custom image, or default document icon
function NoteIcon({ icon, hasContent, content = "", className = "" }: { 
  icon: string; 
  hasContent: boolean; 
  content?: string;
  className?: string;
}) {
  // Custom image icon (stored as "icon:filename.ext")
  if (icon.startsWith("icon:")) {
    const filename = icon.substring(5);
    return (
      <img 
        src={`/api/icons/${filename}`} 
        alt="" 
        className={`w-4 h-4 shrink-0 rounded-sm object-cover ${className}`}
      />
    );
  }

  const isSpreadsheetIcon = icon === "sheet" || icon === "📊";
  const resolvedHasContent = isSpreadsheetIcon ? hasSpreadsheetCellContent(content) : hasContent;
  if (isSpreadsheetIcon) {
    if (resolvedHasContent) {
      return (
        <svg className={`w-4 h-4 shrink-0 text-[#9b9b9b] note-filled-icon ${className}`} viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="3" width="18" height="18" rx="2.5" ry="2.5" />
          <line className="note-filled-icon-line" x1="9" y1="3" x2="9" y2="21" stroke="#202020" strokeWidth="1.4" />
          <line className="note-filled-icon-line" x1="15" y1="3" x2="15" y2="21" stroke="#202020" strokeWidth="1.4" />
          <line className="note-filled-icon-line" x1="3" y1="9" x2="21" y2="9" stroke="#202020" strokeWidth="1.4" />
          <line className="note-filled-icon-line" x1="3" y1="15" x2="21" y2="15" stroke="#202020" strokeWidth="1.4" />
        </svg>
      );
    }

    return (
      <svg className={`w-4 h-4 shrink-0 text-[#6b6b6b] ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2.5" ry="2.5" />
        <line x1="9" y1="3" x2="9" y2="21" />
        <line x1="15" y1="3" x2="15" y2="21" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
      </svg>
    );
  }
  
  // Emoji icon (any non-default value that's not an image)
  if (icon && icon !== "📄" && icon !== "sheet" && icon !== "📊") {
    return (
      <span className={`w-4 h-4 shrink-0 text-sm leading-none flex items-center justify-center ${className}`}>
        {icon}
      </span>
    );
  }
  
  // Default document icon
  if (resolvedHasContent) {
    return (
      <svg className={`w-4 h-4 shrink-0 text-[#9b9b9b] note-filled-icon ${className}`} viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
        <path d="M14 2v6h6" fill="none" stroke="currentColor" strokeWidth="1"/>
        <line className="note-filled-icon-line" x1="8" y1="13" x2="16" y2="13" stroke="#202020" strokeWidth="1.5"/>
        <line className="note-filled-icon-line" x1="8" y1="17" x2="14" y2="17" stroke="#202020" strokeWidth="1.5"/>
      </svg>
    );
  }
  return (
    <svg className={`w-4 h-4 shrink-0 text-[#6b6b6b] ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
      <polyline points="14,2 14,8 20,8"/>
    </svg>
  );
}

// Chat message type
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

type SaveOptions = {
  silent?: boolean;
  skipParentUpdate?: boolean;
};

type SlashCommand = {
  id: "table" | "emoji" | "icon";
  label: string;
  description: string;
  keywords: string[];
};

type EmojiInsertOption = {
  emoji: string;
  name: string;
  keywords: string[];
};

type InlineInsertPickerState = {
  mode: "emoji" | "icon";
  query: string;
  left: number;
  top: number;
};

const EMOJI_INSERT_OPTIONS: EmojiInsertOption[] = [
  { emoji: "😀", name: "grinning face", keywords: ["happy", "smile"] },
  { emoji: "😂", name: "face with tears of joy", keywords: ["lol", "laugh"] },
  { emoji: "🙂", name: "slightly smiling face", keywords: ["smile", "friendly"] },
  { emoji: "😊", name: "smiling face with smiling eyes", keywords: ["happy", "warm"] },
  { emoji: "😉", name: "winking face", keywords: ["wink"] },
  { emoji: "😍", name: "smiling face with heart eyes", keywords: ["love", "heart"] },
  { emoji: "🤔", name: "thinking face", keywords: ["think", "hmm"] },
  { emoji: "😎", name: "smiling face with sunglasses", keywords: ["cool"] },
  { emoji: "😭", name: "loudly crying face", keywords: ["sad", "cry"] },
  { emoji: "😴", name: "sleeping face", keywords: ["sleep", "tired"] },
  { emoji: "🔥", name: "fire", keywords: ["hot", "lit"] },
  { emoji: "✨", name: "sparkles", keywords: ["magic", "shine"] },
  { emoji: "⭐", name: "star", keywords: ["favorite"] },
  { emoji: "✅", name: "check mark", keywords: ["done", "task"] },
  { emoji: "❌", name: "cross mark", keywords: ["no", "fail"] },
  { emoji: "⚠️", name: "warning", keywords: ["alert", "caution"] },
  { emoji: "💡", name: "light bulb", keywords: ["idea", "brainstorm"] },
  { emoji: "📌", name: "pushpin", keywords: ["pin", "important"] },
  { emoji: "📎", name: "paperclip", keywords: ["attachment"] },
  { emoji: "📝", name: "memo", keywords: ["note", "write"] },
  { emoji: "📄", name: "page", keywords: ["document", "file"] },
  { emoji: "📁", name: "folder", keywords: ["directory"] },
  { emoji: "🗂️", name: "card index dividers", keywords: ["organize", "folder"] },
  { emoji: "📚", name: "books", keywords: ["read", "library"] },
  { emoji: "📅", name: "calendar", keywords: ["date", "schedule"] },
  { emoji: "🗓️", name: "spiral calendar", keywords: ["calendar", "plan"] },
  { emoji: "⏰", name: "alarm clock", keywords: ["time", "reminder"] },
  { emoji: "🎯", name: "direct hit", keywords: ["goal", "target"] },
  { emoji: "🚀", name: "rocket", keywords: ["launch", "ship"] },
  { emoji: "🧠", name: "brain", keywords: ["thinking", "smart"] },
  { emoji: "💬", name: "speech balloon", keywords: ["chat", "message"] },
  { emoji: "📢", name: "loudspeaker", keywords: ["announce", "alert"] },
  { emoji: "📷", name: "camera", keywords: ["photo", "image"] },
  { emoji: "🖼️", name: "framed picture", keywords: ["image", "art"] },
  { emoji: "🎨", name: "artist palette", keywords: ["design", "art"] },
  { emoji: "🎵", name: "musical note", keywords: ["music", "audio"] },
  { emoji: "🎬", name: "clapper board", keywords: ["video", "movie"] },
  { emoji: "💻", name: "laptop", keywords: ["computer", "code"] },
  { emoji: "📱", name: "mobile phone", keywords: ["phone", "device"] },
  { emoji: "🔧", name: "wrench", keywords: ["tool", "fix"] },
  { emoji: "🛠️", name: "hammer and wrench", keywords: ["build", "repair"] },
  { emoji: "🔒", name: "locked", keywords: ["secure", "private"] },
  { emoji: "🔓", name: "unlocked", keywords: ["open"] },
  { emoji: "❤️", name: "red heart", keywords: ["love", "like"] },
  { emoji: "👍", name: "thumbs up", keywords: ["yes", "approve"] },
  { emoji: "👎", name: "thumbs down", keywords: ["no", "dislike"] },
  { emoji: "🙏", name: "folded hands", keywords: ["thanks", "please"] },
  { emoji: "👀", name: "eyes", keywords: ["look", "review"] },
  { emoji: "🏠", name: "house", keywords: ["home"] },
  { emoji: "🌍", name: "globe showing europe-africa", keywords: ["world", "global"] },
  { emoji: "🌱", name: "seedling", keywords: ["growth", "new"] },
  { emoji: "🍀", name: "four leaf clover", keywords: ["lucky"] },
  { emoji: "☕", name: "hot beverage", keywords: ["coffee", "break"] },
  { emoji: "🍕", name: "pizza", keywords: ["food"] },
  { emoji: "🎉", name: "party popper", keywords: ["celebrate", "success"] },
  { emoji: "🏆", name: "trophy", keywords: ["win", "achievement"] },
];

type SlashMenuState = {
  query: string;
  from: number;
  to: number;
  left: number;
  top: number;
};

function getSlashMenuState(editor: Editor): SlashMenuState | null {
  const { state, view } = editor;
  const { selection } = state;

  if (!selection.empty) {
    return null;
  }

  const { $from } = selection;
  if (!$from.parent.isTextblock) {
    return null;
  }

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\n", "\0");
  const match = textBefore.match(/(?:^|\s)\/([a-z0-9-]*)$/i);
  if (!match) {
    return null;
  }

  const fullMatch = match[0];
  const query = match[1] ?? "";
  const startsWithSpace = fullMatch.startsWith(" ");
  const slashIndexInText = textBefore.length - fullMatch.length + (startsWithSpace ? 1 : 0);
  const from = $from.start() + slashIndexInText;
  const to = $from.pos;

  const coords = view.coordsAtPos(to);
  const menuWidth = 320;
  const left = Math.max(12, Math.min(coords.left, window.innerWidth - menuWidth - 12));
  const top = coords.bottom + 6;

  return { query, from, to, left, top };
}

interface NoteEditorProps {
  note: Note;
  allNotes: Note[];
  onUpdate: (note: Note) => void;
  onSelectNote: (id: string) => void;
  chatOpenStates: Map<string, boolean>;
  setChatOpenStates: React.Dispatch<React.SetStateAction<Map<string, boolean>>>;
  allChatMessages: Map<string, ChatMessage[]>;
  setAllChatMessages: React.Dispatch<React.SetStateAction<Map<string, ChatMessage[]>>>;
  breadcrumbPrefixLabel?: string;
  onBreadcrumbPrefixClick?: () => void;
  headerActions?: React.ReactNode;
  allowAIChat?: boolean;
}

export function NoteEditor({ note, allNotes, onUpdate, onSelectNote, chatOpenStates, setChatOpenStates, allChatMessages, setAllChatMessages, breadcrumbPrefixLabel, onBreadcrumbPrefixClick, headerActions, allowAIChat = true }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const isLocked = Boolean(note.isLocked);
  const parentNote = useMemo(
    () => (note.parentId ? allNotes.find((entry) => entry.id === note.parentId) ?? null : null),
    [allNotes, note.parentId]
  );
  const isCallNote = useMemo(() => {
    if (parentNote?.title === "Calls") {
      return true;
    }

    const contentText = stripHtml(note.content || "");
    return /transcript\s*\(/i.test(contentText) && /summary/i.test(contentText);
  }, [note.content, parentNote?.title]);
  const parsedCallSections = useMemo(
    () => parseCallNoteSections(note.content || ""),
    [note.content]
  );
  const isSpreadsheetNote = useMemo(() => isSpreadsheetContent(note.content || ""), [note.content]);
  const showCallNoteView = !isSpreadsheetNote && isCallNote;
  const [spreadsheetData, setSpreadsheetData] = useState<string[][]>(() =>
    parseSpreadsheetContent(note.content || "")
  );
  const [spreadsheetColumnWidths, setSpreadsheetColumnWidths] = useState<number[]>(() =>
    Array.from({ length: DEFAULT_SPREADSHEET_COLS }, () => DEFAULT_SPREADSHEET_COLUMN_WIDTH)
  );
  const [spreadsheetRowHeights, setSpreadsheetRowHeights] = useState<number[]>(() =>
    Array.from({ length: DEFAULT_SPREADSHEET_ROWS }, () => DEFAULT_SPREADSHEET_ROW_HEIGHT)
  );
  const [activeSpreadsheetCell, setActiveSpreadsheetCell] = useState<Point | null>(null);
  const [spreadsheetSelection, setSpreadsheetSelection] = useState<Selection | undefined>(undefined);
  const [isSpreadsheetResizing, setIsSpreadsheetResizing] = useState(false);
  const spreadsheetResizeRef = useRef<
    | { axis: "column"; index: number; startPosition: number; startSize: number }
    | { axis: "row"; index: number; startPosition: number; startSize: number }
    | null
  >(null);
  const spreadsheetRef = useRef<{ activate: (point: Point) => void } | null>(null);
  const [isLightTheme, setIsLightTheme] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const spreadsheetSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const spreadsheetDraftRef = useRef<string[][]>(
    parseSpreadsheetContent(note.content || "")
  );
  const lastSpreadsheetNoteIdRef = useRef(note.id);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const uploadNoteImageRef = useRef<(file: File) => Promise<string | null>>(async () => null);
  const lastLocalEditorHtmlRef = useRef(note.content || "");
  const lastSpreadsheetSerializedRef = useRef(
    isSpreadsheetContent(note.content || "")
      ? serializeSpreadsheetContent(parseSpreadsheetContent(note.content || ""))
      : ""
  );

  // AI Chat state - local per-render state
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [copiedChatMessageId, setCopiedChatMessageId] = useState<string | null>(null);
  const chatMessagesScrollRef = useRef<HTMLDivElement>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollChatRef = useRef(true);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const [slashMenuState, setSlashMenuState] = useState<SlashMenuState | null>(null);
  const [slashMenuSelectedIndex, setSlashMenuSelectedIndex] = useState(0);
  const slashMenuStateRef = useRef<SlashMenuState | null>(null);
  const filteredSlashCommandsRef = useRef<SlashCommand[]>([]);
  const slashMenuSelectedIndexRef = useRef(0);
  const [inlineInsertPickerState, setInlineInsertPickerState] = useState<InlineInsertPickerState | null>(null);
  const [inlineInsertPickerSelectedIndex, setInlineInsertPickerSelectedIndex] = useState(-1);
  const inlineInsertPickerPositionRef = useRef<number | null>(null);
  const inlineInsertPickerContainerRef = useRef<HTMLDivElement | null>(null);
  const inlineInsertPickerInputRef = useRef<HTMLInputElement | null>(null);
  const inlineInsertPickerModeRef = useRef<"emoji" | "icon" | null>(null);

  const isNearBottom = (element: HTMLDivElement) =>
    element.scrollHeight - element.scrollTop - element.clientHeight < 96;

  // Get current note's chat open state
  const showAIChat = allowAIChat && (chatOpenStates.get(note.id) || false);
  const setShowAIChat = (open: boolean) => {
    setChatOpenStates(prev => {
      const newMap = new Map(prev);
      newMap.set(note.id, open);
      return newMap;
    });
  };

  useEffect(() => {
    if (!allowAIChat && chatOpenStates.get(note.id)) {
      setShowAIChat(false);
    }
  }, [allowAIChat, chatOpenStates, note.id]);

  // Get current note's chat messages
  const chatMessages = useMemo(() => allChatMessages.get(note.id) || [], [allChatMessages, note.id]);
  const lastAssistantMessageId = useMemo(
    () => [...chatMessages].reverse().find((msg) => msg.role === "assistant")?.id ?? null,
    [chatMessages]
  );

  const slashCommands = useMemo<SlashCommand[]>(() => {
    return [
      {
        id: "table",
        label: "Table",
        description: "Insert a simple 2-column table template",
        keywords: ["table", "grid", "columns"],
      },
      {
        id: "emoji",
        label: "Emoji",
        description: "Insert an emoji inline",
        keywords: ["emoji", "smile", "symbol"],
      },
      {
        id: "icon",
        label: "Icon",
        description: "Insert an uploaded icon image inline",
        keywords: ["icon", "image", "uploaded"],
      },
    ];
  }, []);

  const [uploadedIcons, setUploadedIcons] = useState<string[]>([]);
  const [isLoadingUploadedIcons, setIsLoadingUploadedIcons] = useState(false);

  const filteredEmojiInsertOptions = useMemo(() => {
    if (!inlineInsertPickerState || inlineInsertPickerState.mode !== "emoji") {
      return [] as EmojiInsertOption[];
    }

    const query = inlineInsertPickerState.query.trim().toLowerCase();
    if (!query) {
      return EMOJI_INSERT_OPTIONS;
    }

    return EMOJI_INSERT_OPTIONS.filter((option) => {
      if (option.emoji.includes(query) || option.name.includes(query)) {
        return true;
      }
      return option.keywords.some((keyword) => keyword.includes(query));
    });
  }, [inlineInsertPickerState]);

  const filteredUploadedIcons = useMemo(() => {
    if (!inlineInsertPickerState || inlineInsertPickerState.mode !== "icon") {
      return [] as string[];
    }

    const query = inlineInsertPickerState.query.trim().toLowerCase();
    if (!query) {
      return uploadedIcons;
    }

    return uploadedIcons.filter((filename) => filename.toLowerCase().includes(query));
  }, [inlineInsertPickerState, uploadedIcons]);

  const filteredSlashCommands = useMemo(() => {
    if (!slashMenuState) {
      return [] as SlashCommand[];
    }

    const query = slashMenuState.query.trim().toLowerCase();
    if (!query) {
      return slashCommands;
    }

    return slashCommands.filter((command) => {
      if (command.id.includes(query) || command.label.toLowerCase().includes(query)) {
        return true;
      }
      return command.keywords.some((keyword) => keyword.includes(query));
    });
  }, [slashCommands, slashMenuState]);

  useEffect(() => {
    slashMenuStateRef.current = slashMenuState;
  }, [slashMenuState]);

  useEffect(() => {
    filteredSlashCommandsRef.current = filteredSlashCommands;
  }, [filteredSlashCommands]);

  useEffect(() => {
    slashMenuSelectedIndexRef.current = slashMenuSelectedIndex;
  }, [slashMenuSelectedIndex]);

  useEffect(() => {
    inlineInsertPickerModeRef.current = inlineInsertPickerState?.mode ?? null;
  }, [inlineInsertPickerState]);

  const closeInlineInsertPicker = useCallback(() => {
    console.log("[slash-insert] picker:close", {
      noteId: note.id,
      mode: inlineInsertPickerModeRef.current,
    });
    setInlineInsertPickerState(null);
    setInlineInsertPickerSelectedIndex(-1);
    inlineInsertPickerPositionRef.current = null;
  }, [note.id]);

  const openInlineInsertPicker = useCallback((
    mode: "emoji" | "icon",
    anchor: { left: number; top: number },
    insertPos: number
  ) => {
    console.log("[slash-insert] picker:open", {
      noteId: note.id,
      mode,
      anchor,
      insertPos,
    });
    inlineInsertPickerPositionRef.current = insertPos;
    setInlineInsertPickerState({
      mode,
      query: "",
      left: anchor.left,
      top: anchor.top,
    });
    setInlineInsertPickerSelectedIndex(0);
    if (mode === "emoji") {
      requestAnimationFrame(() => {
        inlineInsertPickerInputRef.current?.focus();
      });
    } else {
      requestAnimationFrame(() => {
        inlineInsertPickerContainerRef.current?.focus();
      });
    }
  }, [note.id]);

  const insertEmojiFromPicker = useCallback((emoji: string) => {
    const currentEditor = editorRef.current;
    const insertPos = inlineInsertPickerPositionRef.current;
    if (!currentEditor) {
      console.warn("[slash-insert] emoji:missing-editor", { noteId: note.id, emoji, insertPos });
      closeInlineInsertPicker();
      return;
    }

    const fallbackPos = currentEditor.state.selection.from;
    const rawPos = typeof insertPos === "number" ? insertPos : fallbackPos;
    const docSize = currentEditor.state.doc.content.size;
    const targetPos = Math.max(1, Math.min(rawPos, docSize));

    const inserted = currentEditor
      .chain()
      .focus()
      .insertContentAt(targetPos, `${emoji} `)
      .run();

    if (!inserted) {
      console.warn("[slash-insert] emoji:insert-failed-fallback", {
        noteId: note.id,
        emoji,
        rawPos,
        targetPos,
        docSize,
      });
      currentEditor.chain().focus().insertContent(`${emoji} `).run();
    }

    console.log("[slash-insert] emoji:insert", {
      noteId: note.id,
      emoji,
      inserted,
      rawPos,
      targetPos,
      docSize,
      selectionFrom: currentEditor.state.selection.from,
    });

    closeInlineInsertPicker();
  }, [closeInlineInsertPicker, note.id]);

  const insertUploadedIconFromPicker = useCallback((filename: string) => {
    const currentEditor = editorRef.current;
    const insertPos = inlineInsertPickerPositionRef.current;
    if (!currentEditor) {
      console.warn("[slash-insert] icon:missing-editor", { noteId: note.id, filename, insertPos });
      closeInlineInsertPicker();
      return;
    }

    const fallbackPos = currentEditor.state.selection.from;
    const rawPos = typeof insertPos === "number" ? insertPos : fallbackPos;
    const docSize = currentEditor.state.doc.content.size;
    const targetPos = Math.max(1, Math.min(rawPos, docSize));

    const inserted = currentEditor
      .chain()
      .focus()
      .insertContentAt(targetPos, [
        {
          type: "image",
          attrs: {
            src: `/api/icons/${filename}`,
            alt: filename,
            width: 18,
          },
        },
        {
          type: "text",
          text: " ",
        },
      ])
      .run();

    if (!inserted) {
      console.warn("[slash-insert] icon:insert-failed-fallback", {
        noteId: note.id,
        filename,
        rawPos,
        targetPos,
        docSize,
      });
      currentEditor
        .chain()
        .focus()
        .setImage({
          src: `/api/icons/${filename}`,
          alt: filename,
          width: 18,
        })
        .insertContent(" ")
        .run();
    }

    console.log("[slash-insert] icon:insert", {
      noteId: note.id,
      filename,
      inserted,
      rawPos,
      targetPos,
      docSize,
      selectionFrom: currentEditor.state.selection.from,
    });

    closeInlineInsertPicker();
  }, [closeInlineInsertPicker, note.id]);

  const loadUploadedIcons = useCallback(async () => {
    setIsLoadingUploadedIcons(true);
    try {
      const response = await fetch("/api/icons");
      if (!response.ok) {
        console.warn("[slash-insert] icon:list-failed", { noteId: note.id, status: response.status });
        setUploadedIcons([]);
        return;
      }

      const data = await response.json();
      console.log("[slash-insert] icon:list-success", {
        noteId: note.id,
        count: Array.isArray(data.icons) ? data.icons.length : 0,
      });
      setUploadedIcons(Array.isArray(data.icons) ? data.icons : []);
    } catch {
      console.warn("[slash-insert] icon:list-error", { noteId: note.id });
      setUploadedIcons([]);
    } finally {
      setIsLoadingUploadedIcons(false);
    }
  }, [note.id]);

  const runSlashCommand = useCallback(async (command: SlashCommand) => {
    const currentEditor = editorRef.current;
    const currentSlashMenuState = slashMenuStateRef.current;
    if (!currentEditor || !currentSlashMenuState) {
      console.warn("[slash-insert] command:missing-context", {
        noteId: note.id,
        command: command.id,
        hasEditor: Boolean(currentEditor),
        hasMenuState: Boolean(currentSlashMenuState),
      });
      return;
    }

    console.log("[slash-insert] command:start", {
      noteId: note.id,
      command: command.id,
      menuState: currentSlashMenuState,
      selectionFrom: currentEditor.state.selection.from,
    });

    const removedSlash = currentEditor
      .chain()
      .focus()
      .deleteRange({ from: currentSlashMenuState.from, to: currentSlashMenuState.to })
      .run();

    const insertPos = currentEditor.state.selection.from;
    console.log("[slash-insert] command:after-delete", {
      noteId: note.id,
      command: command.id,
      removedSlash,
      insertPos,
      selectionFrom: currentEditor.state.selection.from,
    });

    setSlashMenuState(null);
    setSlashMenuSelectedIndex(0);

    if (command.id === "table") {
      const insertedTable = currentEditor
        .chain()
        .focus()
        .insertTable({ rows: 3, cols: 2, withHeaderRow: true })
        .run();
      console.log("[slash-insert] table:insert", { noteId: note.id, insertedTable });
      return;
    }

    if (command.id === "emoji") {
      openInlineInsertPicker("emoji", { left: currentSlashMenuState.left, top: currentSlashMenuState.top }, insertPos);
      return;
    }

    if (command.id === "icon") {
      openInlineInsertPicker("icon", { left: currentSlashMenuState.left, top: currentSlashMenuState.top }, insertPos);
    }
  }, [openInlineInsertPicker]);


  const syncSlashMenu = useCallback((currentEditor: Editor | null) => {
    if (!currentEditor || isSpreadsheetNote || isLocked || showCallNoteView) {
      setSlashMenuState(null);
      setSlashMenuSelectedIndex(0);
      return;
    }

    const nextState = getSlashMenuState(currentEditor);
    setSlashMenuState(nextState);
    if (!nextState) {
      setSlashMenuSelectedIndex(0);
    }
  }, [isLocked, isSpreadsheetNote, showCallNoteView]);

  const spreadsheetMatrix = useMemo<Matrix<SpreadsheetCell>>(
    () => spreadsheetData.map((row) => row.map((value) => ({ value }))),
    [spreadsheetData]
  );

  useEffect(() => {
    if (!slashMenuState) {
      return;
    }

    if (filteredSlashCommands.length === 0) {
      setSlashMenuSelectedIndex(0);
      return;
    }

    if (slashMenuSelectedIndex >= filteredSlashCommands.length) {
      setSlashMenuSelectedIndex(filteredSlashCommands.length - 1);
    }
  }, [filteredSlashCommands.length, slashMenuSelectedIndex, slashMenuState]);

  useEffect(() => {
    if (!inlineInsertPickerState) {
      return;
    }

    const optionsLength = inlineInsertPickerState.mode === "emoji"
      ? filteredEmojiInsertOptions.length
      : filteredUploadedIcons.length;

    if (optionsLength === 0) {
      setInlineInsertPickerSelectedIndex(-1);
      return;
    }

    if (inlineInsertPickerSelectedIndex < 0) {
      setInlineInsertPickerSelectedIndex(0);
      return;
    }

    if (inlineInsertPickerSelectedIndex >= optionsLength) {
      setInlineInsertPickerSelectedIndex(optionsLength - 1);
    }
  }, [filteredEmojiInsertOptions.length, filteredUploadedIcons.length, inlineInsertPickerSelectedIndex, inlineInsertPickerState]);

  useEffect(() => {
    if (!inlineInsertPickerState || inlineInsertPickerState.mode !== "icon") {
      return;
    }

    void loadUploadedIcons();
  }, [inlineInsertPickerState, loadUploadedIcons]);

  useEffect(() => {
    if (!inlineInsertPickerState) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (inlineInsertPickerContainerRef.current?.contains(target)) {
        return;
      }

      closeInlineInsertPicker();
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [closeInlineInsertPicker, inlineInsertPickerState]);

  const queueSpreadsheetSave = useCallback((normalized: string[][]) => {
    if (isLocked) {
      return;
    }

    const previousSerialized = lastSpreadsheetSerializedRef.current;
    const nextSerialized = serializeSpreadsheetContent(normalized);

    if (nextSerialized === previousSerialized) {
      return;
    }

    spreadsheetDraftRef.current = normalized;
    setSpreadsheetData(normalized);

    const hadContent = hasSpreadsheetCellContent(previousSerialized);
    const hasContentNow = hasSpreadsheetCellContent(nextSerialized);
    if (hadContent !== hasContentNow) {
      onUpdate({
        ...note,
        title: titleRef.current,
        content: nextSerialized,
      });
    }

    if (spreadsheetSaveTimeoutRef.current) {
      clearTimeout(spreadsheetSaveTimeoutRef.current);
    }

    spreadsheetSaveTimeoutRef.current = setTimeout(() => {
      if (nextSerialized === lastSpreadsheetSerializedRef.current) {
        return;
      }

      lastSpreadsheetSerializedRef.current = nextSerialized;
      void (async () => {
        try {
          const res = await fetch(`/api/notes/${note.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: titleRef.current, content: nextSerialized }),
          });

          if (!res.ok) {
            const payload = await res.text().catch(() => "");
            console.error("Failed to save note:", {
              noteId: note.id,
              status: res.status,
              statusText: res.statusText,
              payload,
            });
            return;
          }
        } catch (error) {
          console.error("Failed to save note:", error);
        }
      })();
    }, 1200);
  }, [isLocked, note, onUpdate]);

  const applyFormatToActiveSpreadsheetCell = useCallback((marker: "**" | "*" | "__") => {
    if (!activeSpreadsheetCell) {
      return;
    }

    const row = activeSpreadsheetCell.row;
    const column = activeSpreadsheetCell.column;
    const source = spreadsheetDraftRef.current.length > 0 ? spreadsheetDraftRef.current : spreadsheetData;
    const base = normalizeSpreadsheetData(source.map((r) => [...r]));
    const currentValue = base[row]?.[column] ?? "";
    const formatted = toggleSheetInlineFormat(currentValue, 0, currentValue.length, marker);

    if (!base[row]) {
      base[row] = [];
    }
    base[row][column] = formatted.nextValue;
    queueSpreadsheetSave(base);
  }, [activeSpreadsheetCell, queueSpreadsheetSave, spreadsheetData]);

  const moveSpreadsheetSelection = useCallback((fromPoint: Point | null | undefined, direction: "up" | "down" | "left" | "right") => {
    const active = fromPoint ?? activeSpreadsheetCell;
    if (!active) {
      return;
    }

    const lastRow = Math.max(spreadsheetData.length - 1, 0);
    const lastColumn = Math.max((spreadsheetData[0]?.length ?? DEFAULT_SPREADSHEET_COLS) - 1, 0);

    const rowDelta = direction === "up" ? -1 : direction === "down" ? 1 : 0;
    const columnDelta = direction === "left" ? -1 : direction === "right" ? 1 : 0;

    const nextRow = Math.min(Math.max(active.row + rowDelta, 0), lastRow);
    const nextColumn = Math.min(Math.max(active.column + columnDelta, 0), lastColumn);
    const nextPoint: Point = { row: nextRow, column: nextColumn };

    setActiveSpreadsheetCell(nextPoint);
    requestAnimationFrame(() => {
      spreadsheetRef.current?.activate(nextPoint);
    });
  }, [activeSpreadsheetCell, spreadsheetData]);

  const spreadsheetDataEditor = useCallback((props: DataEditorProps<SpreadsheetCell>) => (
    <SheetDataEditor
      {...props}
      readOnly={isLocked}
      onNavigateCell={(point, direction) => moveSpreadsheetSelection(point, direction)}
    />
  ), [isLocked, moveSpreadsheetSelection]);

  const clearSpreadsheetInteractionState = useCallback(() => {
    setSpreadsheetSelection(new EmptySelection());
    setActiveSpreadsheetCell(null);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, []);

  const beginSpreadsheetColumnResize = useCallback((column: number, event: React.MouseEvent) => {
    if (isLocked) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    clearSpreadsheetInteractionState();
    setIsSpreadsheetResizing(true);

    const baseWidth = spreadsheetColumnWidths[column] ?? DEFAULT_SPREADSHEET_COLUMN_WIDTH;
    spreadsheetResizeRef.current = {
      axis: "column",
      index: column,
      startPosition: event.clientX,
      startSize: baseWidth,
    };
  }, [clearSpreadsheetInteractionState, isLocked, spreadsheetColumnWidths]);

  const beginSpreadsheetRowResize = useCallback((row: number, event: React.MouseEvent) => {
    if (isLocked) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    clearSpreadsheetInteractionState();
    setIsSpreadsheetResizing(true);

    const baseHeight = spreadsheetRowHeights[row] ?? DEFAULT_SPREADSHEET_ROW_HEIGHT;
    spreadsheetResizeRef.current = {
      axis: "row",
      index: row,
      startPosition: event.clientY,
      startSize: baseHeight,
    };
  }, [clearSpreadsheetInteractionState, isLocked, spreadsheetRowHeights]);

  const SpreadsheetColumnIndicator = useCallback(({
    column,
    label,
    selected,
    onSelect,
  }: ColumnIndicatorProps) => {
    const width = spreadsheetColumnWidths[column] ?? DEFAULT_SPREADSHEET_COLUMN_WIDTH;

    return (
      <th
        className={`Spreadsheet__header ${selected ? "Spreadsheet__header--selected" : ""} Spreadsheet__header--resizable-column`}
        onClick={(event) => onSelect(column, event.shiftKey)}
        tabIndex={0}
        style={{ width, minWidth: width, maxWidth: width }}
      >
        <span>{label !== undefined ? label : spreadsheetColumnIndexToLabel(column)}</span>
        <button
          type="button"
          aria-label={`Resize column ${column + 1}`}
          className="Spreadsheet__resize-handle Spreadsheet__resize-handle--column"
          onMouseDown={(event) => beginSpreadsheetColumnResize(column, event)}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      </th>
    );
  }, [beginSpreadsheetColumnResize, spreadsheetColumnWidths]);

  const SpreadsheetRowIndicator = useCallback(({
    row,
    label,
    selected,
    onSelect,
  }: RowIndicatorProps) => {
    const height = spreadsheetRowHeights[row] ?? DEFAULT_SPREADSHEET_ROW_HEIGHT;

    return (
      <th
        className={`Spreadsheet__header ${selected ? "Spreadsheet__header--selected" : ""} Spreadsheet__header--resizable-row`}
        onClick={(event) => onSelect(row, event.shiftKey)}
        tabIndex={0}
        style={{ height, minHeight: height, maxHeight: height }}
      >
        <span>{label !== undefined ? label : row + 1}</span>
        <button
          type="button"
          aria-label={`Resize row ${row + 1}`}
          className="Spreadsheet__resize-handle Spreadsheet__resize-handle--row"
          onMouseDown={(event) => beginSpreadsheetRowResize(row, event)}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      </th>
    );
  }, [beginSpreadsheetRowResize, spreadsheetRowHeights]);

  const SpreadsheetRow = useCallback(({ row, children }: RowProps) => {
    const height = spreadsheetRowHeights[row] ?? DEFAULT_SPREADSHEET_ROW_HEIGHT;

    return (
      <tr>
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) {
            return child;
          }

          const existingStyle = ((child.props as { style?: React.CSSProperties }).style ?? {});
          return React.cloneElement(child as React.ReactElement<{ style?: React.CSSProperties }>, {
            style: {
              ...existingStyle,
              height,
              minHeight: height,
              maxHeight: height,
            },
          });
        })}
      </tr>
    );
  }, [spreadsheetRowHeights]);

  const spreadsheetColumnSizeCss = useMemo(() => {
    return spreadsheetColumnWidths
      .map((width, index) => {
        const columnPosition = index + 2;
        return `.sheet-note-grid .Spreadsheet.vault-sheet-resizable .Spreadsheet__table tr > *:nth-child(${columnPosition}) { width: ${width}px; min-width: ${width}px; max-width: ${width}px; }`;
      })
      .join("\n");
  }, [spreadsheetColumnWidths]);

  useEffect(() => {
    const columnCount = Math.max(spreadsheetData[0]?.length ?? 0, DEFAULT_SPREADSHEET_COLS);
    const rowCount = Math.max(spreadsheetData.length, DEFAULT_SPREADSHEET_ROWS);

    setSpreadsheetColumnWidths((prev) => ensureSize(prev, columnCount, DEFAULT_SPREADSHEET_COLUMN_WIDTH));
    setSpreadsheetRowHeights((prev) => ensureSize(prev, rowCount, DEFAULT_SPREADSHEET_ROW_HEIGHT));
  }, [spreadsheetData]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const resizeState = spreadsheetResizeRef.current;
      if (!resizeState) {
        return;
      }

      if (resizeState.axis === "column") {
        const delta = event.clientX - resizeState.startPosition;
        const nextWidth = Math.max(MIN_SPREADSHEET_COLUMN_WIDTH, resizeState.startSize + delta);

        setSpreadsheetColumnWidths((prev) => {
          const next = [...prev];
          next[resizeState.index] = nextWidth;
          return next;
        });
        return;
      }

      const delta = event.clientY - resizeState.startPosition;
      const nextHeight = Math.max(MIN_SPREADSHEET_ROW_HEIGHT, resizeState.startSize + delta);

      setSpreadsheetRowHeights((prev) => {
        const next = [...prev];
        next[resizeState.index] = nextHeight;
        return next;
      });
    };

    const handleMouseUp = () => {
      spreadsheetResizeRef.current = null;
      setIsSpreadsheetResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    if (!activeSpreadsheetCell) {
      return;
    }

    requestAnimationFrame(() => {
      spreadsheetRef.current?.activate(activeSpreadsheetCell);
    });
  }, [activeSpreadsheetCell, spreadsheetColumnWidths]);

  const setChatMessages = (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setAllChatMessages(prev => {
      const newMap = new Map(prev);
      const currentMessages = prev.get(note.id) || [];
      const newMessages = typeof updater === "function" ? updater(currentMessages) : updater;
      newMap.set(note.id, newMessages);
      return newMap;
    });
  };

  // Clear input when note changes
  useEffect(() => {
    setChatInput("");
    setChatError(null);
  }, [note.id]);

  // Track whether user is near bottom; only stick-scroll while they are.
  useEffect(() => {
    const container = chatMessagesScrollRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      shouldAutoScrollChatRef.current = isNearBottom(container);
    };

    handleScroll();
    container.addEventListener("scroll", handleScroll);

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [note.id, showAIChat]);

  useEffect(() => {
    shouldAutoScrollChatRef.current = true;
    requestAnimationFrame(() => {
      const container = chatMessagesScrollRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });
  }, [note.id, showAIChat]);

  // Scroll to bottom of chat only if user hasn't scrolled away
  useEffect(() => {
    const container = chatMessagesScrollRef.current;
    if (!container || !shouldAutoScrollChatRef.current) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [chatMessages]);

  // Sync title when note changes externally (e.g., renamed from sidebar)
  useEffect(() => {
    setTitle(note.title);
  }, [note.title]);

  useEffect(() => {
    if (!isSpreadsheetNote) {
      return;
    }

    const incoming = parseSpreadsheetContent(note.content || "");
    const serializedIncoming = serializeSpreadsheetContent(incoming);

    const isSameNote = lastSpreadsheetNoteIdRef.current === note.id;
    lastSpreadsheetNoteIdRef.current = note.id;

    if (isSameNote && serializedIncoming === lastSpreadsheetSerializedRef.current) {
      return;
    }

    setSpreadsheetData(incoming);
    spreadsheetDraftRef.current = incoming;
    lastLocalEditorHtmlRef.current = serializedIncoming;
    lastSpreadsheetSerializedRef.current = serializedIncoming;
  }, [isSpreadsheetNote, note.id, note.content]);

  // Auto-focus title input when opening a new/empty note
  useEffect(() => {
    if (note.title === "" && (note.content === "" || isSpreadsheetNote)) {
      titleInputRef.current?.focus();
    }
  }, [isSpreadsheetNote, note.id, note.title, note.content]);

  useEffect(() => {
    const syncTheme = () => {
      const mode = document.documentElement.getAttribute("data-theme");
      setIsLightTheme(mode === "light");
    };

    syncTheme();

    const handleThemeUpdated = () => {
      syncTheme();
    };

    window.addEventListener(THEME_MODE_EVENT, handleThemeUpdated as EventListener);
    return () => {
      window.removeEventListener(THEME_MODE_EVENT, handleThemeUpdated as EventListener);
    };
  }, []);

  // Build breadcrumb trail from current note to root
  const breadcrumbs = useMemo(() => {
    const trail: Note[] = [];
    let current: Note | undefined = note;
    
    while (current) {
      trail.unshift(current);
      current = current.parentId 
        ? allNotes.find(n => n.id === current!.parentId) 
        : undefined;
    }
    
    return trail;
  }, [note, allNotes]);

  // Get child pages (sub-notes) for current note
  const childPages = useMemo(() => {
    return allNotes
      .filter(n => n.parentId === note.id && !n.archived)
      .sort((a, b) => a.order - b.order);
  }, [note.id, allNotes]);

  const uploadNoteImage = useCallback(async (file: File): Promise<string | null> => {
    try {
      console.log("[notes:image-upload][client] upload:start", {
        noteId: note.id,
        name: file.name,
        type: file.type,
        size: file.size,
      });

      const uploadFilename = buildUploadFilename(file, "note-image");
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      console.log("[notes:image-upload][client] upload:filename", {
        noteId: note.id,
        uploadFilename,
        mimeType: file.type,
        base64Length: base64.length,
      });

      const res = await fetch(`/api/notes/${note.id}/images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          base64,
          mimeType: file.type,
          ext: uploadFilename.split(".").pop()?.toLowerCase() ?? "png",
          originalName: uploadFilename,
        }),
      });

      if (!res.ok) {
        const responseText = await res.text().catch(() => "<failed to read response body>");
        console.error("[notes:image-upload][client] upload:failed", {
          noteId: note.id,
          status: res.status,
          statusText: res.statusText,
          responseText,
        });
        return null;
      }

      const data = await res.json();
      console.log("[notes:image-upload][client] upload:success", {
        noteId: note.id,
        url: data.url,
        filename: data.filename,
        requestId: data.requestId,
      });
      return data.url || null;
    } catch (error) {
      console.error("[notes:image-upload][client] upload:error", {
        noteId: note.id,
        error,
      });
      return null;
    }
  }, [note.id]);

  useEffect(() => {
    uploadNoteImageRef.current = uploadNoteImage;
  }, [uploadNoteImage]);

  const insertImageWithParagraph = useCallback((view: EditorView, src: string, alt?: string, atPos?: number) => {
    const imageType = view.state.schema.nodes.image;
    const paragraphType = view.state.schema.nodes.paragraph;
    if (!imageType) {
      return;
    }

    const editorContentEl = view.dom.closest(".max-w-3xl") as HTMLElement | null;
    const contentWidth = editorContentEl?.clientWidth ?? 700;
    const initialWidth = Math.max(240, Math.min(900, Math.floor(contentWidth * 0.85)));

    let tr = view.state.tr;

    if (typeof atPos === "number") {
      tr = tr.setSelection(TextSelection.create(tr.doc, atPos));
    }

    const imageNode = imageType.create({ src, alt, width: initialWidth });
    const selection = tr.selection;
    const currentParent = selection.$from.parent;
    const isOnEmptyTextBlock =
      selection.empty &&
      currentParent.isTextblock &&
      currentParent.textContent.trim().length === 0;

    let insertPos: number;
    if (isOnEmptyTextBlock) {
      let textBlockDepth = selection.$from.depth;
      while (textBlockDepth > 0 && !selection.$from.node(textBlockDepth).isTextblock) {
        textBlockDepth -= 1;
      }

      const blockFrom = selection.$from.before(textBlockDepth);
      const blockTo = selection.$from.after(textBlockDepth);
      tr = tr.delete(blockFrom, blockTo);
      tr = tr.insert(blockFrom, imageNode);
      insertPos = blockFrom + imageNode.nodeSize;
    } else {
      tr = tr.replaceSelectionWith(imageNode);
      insertPos = tr.selection.from;
    }

    if (paragraphType) {
      const paragraphNode = paragraphType.create();
      tr = tr.insert(insertPos, paragraphNode);
      tr = tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
    }

    view.dispatch(tr.scrollIntoView());
    view.focus();
  }, []);

  // Auto-save function
  const saveNote = useCallback(async (newTitle: string, newContent: string, options?: SaveOptions) => {
    const skipParentUpdate = options?.skipParentUpdate === true;

    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, content: newContent }),
      });

      if (!res.ok) {
        const payload = await res.text().catch(() => "");
        console.error("Failed to save note:", {
          noteId: note.id,
          status: res.status,
          statusText: res.statusText,
          payload,
        });
        return;
      }

      const updatedNote = await res.json();
      if (!skipParentUpdate) {
        onUpdate(updatedNote);
      }
    } catch (error) {
      console.error("Failed to save note:", error);
    }
  }, [note.id, onUpdate]);

  const handleToggleLock = useCallback(async () => {
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isLocked: !isLocked }),
      });

      if (!res.ok) {
        return;
      }

      const updatedNote = await res.json();
      onUpdate(updatedNote);
    } catch (error) {
      console.error("Failed to toggle note lock:", error);
    }
  }, [isLocked, note.id, onUpdate]);

  // TipTap editor
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        bulletList: {
          HTMLAttributes: {
            class: "list-disc pl-6 space-y-1",
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: "list-decimal pl-6 space-y-1",
          },
        },
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Placeholder.configure({
        placeholder: "Start typing...",
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: "text-blue-400 underline cursor-pointer",
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      NoteImage.configure({
        inline: true,
        HTMLAttributes: {
          class: "mothership-note-image",
        },
      }),
      AutoCorrect,
    ],
    content: isSpreadsheetNote ? "<p></p>" : note.content,
    editable: !isSpreadsheetNote && !isLocked,
    editorProps: {
      attributes: {
        class: "prose prose-invert max-w-none focus:outline-none h-full min-h-[120px] text-[#e3e3e3] text-base leading-relaxed",
      },
      handleKeyDown: (view, event) => {
        if (isLocked) {
          return false;
        }

        if (slashMenuStateRef.current) {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            const commandCount = filteredSlashCommandsRef.current.length;
            if (commandCount > 0) {
              setSlashMenuSelectedIndex((prev) => (prev + 1) % commandCount);
            }
            return true;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            const commandCount = filteredSlashCommandsRef.current.length;
            if (commandCount > 0) {
              setSlashMenuSelectedIndex((prev) =>
                prev <= 0 ? commandCount - 1 : prev - 1
              );
            }
            return true;
          }

          if (event.key === "Enter") {
            const selectedCommand = filteredSlashCommandsRef.current[slashMenuSelectedIndexRef.current];
            if (selectedCommand) {
              event.preventDefault();
              void runSlashCommand(selectedCommand);
              return true;
            }
          }

          if (event.key === "Escape") {
            event.preventDefault();
            setSlashMenuState(null);
            setSlashMenuSelectedIndex(0);
            return true;
          }
        }

        if (
          (event.ctrlKey || event.metaKey) &&
          !event.shiftKey &&
          !event.altKey &&
          event.key.toLowerCase() === "x"
        ) {
          const { state } = view;
          const { selection } = state;

          if (selection.empty) {
            const { $from } = selection;

            let targetDepth = -1;
            for (let depth = $from.depth; depth > 0; depth -= 1) {
              const node = $from.node(depth);
              if (node.type.name === "taskItem" || node.type.name === "listItem") {
                targetDepth = depth;
                break;
              }
            }

            if (targetDepth < 0) {
              for (let depth = $from.depth; depth > 0; depth -= 1) {
                const node = $from.node(depth);
                if (node.isBlock) {
                  targetDepth = depth;
                  break;
                }
              }
            }

            if (targetDepth > 0) {
              event.preventDefault();
              const from = $from.before(targetDepth);
              const to = $from.after(targetDepth);
              const tr = state.tr.delete(from, to);
              view.dispatch(tr);
              return true;
            }
          }
        }

        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();

          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }

          void saveNote(titleRef.current, editor?.getHTML() || note.content, {
            skipParentUpdate: true,
          });
          return true;
        }

        if (
          event.key === "Backspace" &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.shiftKey
        ) {
          const { selection } = view.state;
          if (selection.empty && selection.from <= 1) {
            event.preventDefault();
            const input = titleInputRef.current;
            if (input) {
              input.focus();
              const end = input.value.length;
              input.setSelectionRange(end, end);
            }
            return true;
          }
        }

        return false;
      },
      handlePaste: (view, event) => {
        if (isLocked) {
          return false;
        }

        const clipboard = event.clipboardData;
        if (!clipboard) {
          return false;
        }

        const imageFiles = Array.from(clipboard.files).filter(file => file.type.startsWith("image/"));
        if (imageFiles.length > 0) {
          event.preventDefault();

          void (async () => {
            for (const file of imageFiles) {
              const imageUrl = await uploadNoteImageRef.current(file);
              if (imageUrl) {
                insertImageWithParagraph(view, imageUrl, file.name || "Pasted image");
              }
            }
          })();

          return true;
        }

        const plainText = clipboard.getData("text/plain").trim();
        if (isImageUrl(plainText)) {
          event.preventDefault();
          insertImageWithParagraph(view, plainText);

          return true;
        }

        return false;
      },
      handleDrop: (view, event) => {
        if (isLocked) {
          return false;
        }

        const dataTransfer = event.dataTransfer;
        if (!dataTransfer) {
          return false;
        }

        const imageFiles = Array.from(dataTransfer.files).filter(file => file.type.startsWith("image/"));
        if (imageFiles.length === 0) {
          return false;
        }

        event.preventDefault();

        const dropPosition = view.posAtCoords({ left: event.clientX, top: event.clientY });

        void (async () => {
          let insertPosition = dropPosition?.pos ?? view.state.selection.from;

          for (const file of imageFiles) {
            const imageUrl = await uploadNoteImageRef.current(file);
            if (imageUrl) {
              insertImageWithParagraph(view, imageUrl, file.name || "Dropped image", insertPosition);
              insertPosition = view.state.selection.from;
            }
          }
        })();

        return true;
      },
      handleDOMEvents: {
        mousedown: (view, event) => {
          if (isLocked) {
            return false;
          }

          if (!(event instanceof MouseEvent) || event.button !== 0) {
            return false;
          }

          const target = event.target as HTMLElement | null;
          if (
            !(target instanceof HTMLImageElement) ||
            !target.classList.contains("mothership-note-image") ||
            target.getAttribute("data-inline-icon") === "true"
          ) {
            return false;
          }

          event.preventDefault();

          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!coords) {
            return false;
          }

          const resolved = view.state.doc.resolve(coords.pos);
          const nodeAfter = resolved.nodeAfter;
          const nodeBefore = resolved.nodeBefore;

          let imagePos: number | null = null;
          if (nodeAfter?.type.name === "image") {
            imagePos = coords.pos;
          } else if (nodeBefore?.type.name === "image") {
            imagePos = coords.pos - nodeBefore.nodeSize;
          }

          if (imagePos === null) {
            return false;
          }

          view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, imagePos)));
          view.focus();

          const startX = event.clientX;
          const selectedNode = view.state.doc.nodeAt(imagePos);
          const startWidth = parseImageWidth(selectedNode?.attrs.width) ?? target.clientWidth;

          const onMouseMove = (moveEvent: MouseEvent) => {
            const currentNode = view.state.doc.nodeAt(imagePos!);
            if (!currentNode || currentNode.type.name !== "image") {
              return;
            }

            const deltaX = moveEvent.clientX - startX;
            const nextWidth = Math.max(140, Math.min(1800, Math.round(startWidth + deltaX)));

            view.dispatch(
              view.state.tr.setNodeMarkup(imagePos!, undefined, {
                ...currentNode.attrs,
                width: nextWidth,
              })
            );
          };

          const onMouseUp = () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
          };

          window.addEventListener("mousemove", onMouseMove);
          window.addEventListener("mouseup", onMouseUp);

          return true;
        },
      },
    },
    onUpdate: ({ editor }) => {
      if (isSpreadsheetNote || isLocked) {
        return;
      }

      syncSlashMenu(editor);

      const html = editor.getHTML();
      lastLocalEditorHtmlRef.current = html;
      
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new timeout for auto-save (500ms debounce)
      saveTimeoutRef.current = setTimeout(() => {
        void saveNote(titleRef.current, html, {
          skipParentUpdate: true,
        });
      }, 500);
    },
  }, [insertImageWithParagraph, isLocked, isSpreadsheetNote, note.content, note.id, runSlashCommand, saveNote, syncSlashMenu]);

  useEffect(() => {
    if (!editor) {
      editorRef.current = null;
      return;
    }

    editorRef.current = editor;
    editor.setEditable(!isSpreadsheetNote && !isLocked);
  }, [editor, isLocked, isSpreadsheetNote]);

  useEffect(() => {
    setSlashMenuState(null);
    setSlashMenuSelectedIndex(0);
    closeInlineInsertPicker();
  }, [closeInlineInsertPicker, note.id, isSpreadsheetNote, isLocked, showCallNoteView]);

  // Update editor content when note changes, including external updates to same note
  useEffect(() => {
    if (isSpreadsheetNote || !editor) {
      return;
    }

    const incomingHtml = note.content || "";
    const currentHtml = editor.getHTML();

    if (incomingHtml === currentHtml) {
      return;
    }

    if (incomingHtml === lastLocalEditorHtmlRef.current) {
      return;
    }

    editor.commands.setContent(incomingHtml);
    lastLocalEditorHtmlRef.current = incomingHtml;
  }, [isSpreadsheetNote, note.id, note.content, editor]);

  // Update title ref for save function
  const titleRef = useRef(title);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  // Debounced auto-save on title change
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) {
      return;
    }

    const newTitle = e.target.value;
    setTitle(newTitle);

    // Optimistically update the note in parent state for instant sidebar update
    onUpdate({ ...note, title: newTitle });

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for auto-save (500ms debounce)
    saveTimeoutRef.current = setTimeout(() => {
      const content = isSpreadsheetNote
        ? serializeSpreadsheetContent(spreadsheetData)
        : (editor?.getHTML() || note.content);
      saveNote(newTitle, content, { skipParentUpdate: true });
    }, 500);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (spreadsheetSaveTimeoutRef.current) {
        clearTimeout(spreadsheetSaveTimeoutRef.current);
      }
    };
  }, []);

  // Send chat message with note as context
  const getProviderConfig = () => {
    const aiProvider = localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
    const openRouterApiKey = localStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY) || localStorage.getItem(LEGACY_OPENROUTER_API_KEY_STORAGE_KEY) || "";
    const azureFoundryApiKey = localStorage.getItem(AZURE_FOUNDRY_API_KEY_STORAGE_KEY) || "";
    const azureFoundryEndpoint = localStorage.getItem(AZURE_FOUNDRY_ENDPOINT_STORAGE_KEY) || "";

    if (aiProvider === "azure-foundry") {
      if (azureFoundryApiKey && azureFoundryEndpoint) {
        return {
          provider: "azure-foundry" as const,
          apiKey: azureFoundryApiKey,
          endpoint: azureFoundryEndpoint,
        };
      }

      if (openRouterApiKey) {
        return {
          provider: "openrouter" as const,
          apiKey: openRouterApiKey,
          endpoint: undefined,
        };
      }

      return null;
    }

    if (aiProvider === "openrouter") {
      if (openRouterApiKey) {
        return {
          provider: "openrouter" as const,
          apiKey: openRouterApiKey,
          endpoint: undefined,
        };
      }

      if (azureFoundryApiKey && azureFoundryEndpoint) {
        return {
          provider: "azure-foundry" as const,
          apiKey: azureFoundryApiKey,
          endpoint: azureFoundryEndpoint,
        };
      }

      return null;
    }

    if (azureFoundryApiKey && azureFoundryEndpoint) {
      return {
        provider: "azure-foundry" as const,
        apiKey: azureFoundryApiKey,
        endpoint: azureFoundryEndpoint,
      };
    }

    if (openRouterApiKey) {
      return {
        provider: "openrouter" as const,
        apiKey: openRouterApiKey,
        endpoint: undefined,
      };
    }

    return null;
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const providerConfig = getProviderConfig();
    if (!providerConfig) {
      setChatError("Please set either an OpenRouter API key or Azure Foundry key + endpoint in Settings > API Keys.");
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: chatInput.trim(),
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatInput("");
    setIsChatLoading(true);
    setChatError(null);

    // Reset textarea height
    if (chatInputRef.current) {
      chatInputRef.current.style.height = "auto";
    }

    // Add assistant message immediately to show loading dots
    const tempAssistantId = `assistant-${Date.now()}`;
    setChatMessages(prev => [...prev, {
      id: tempAssistantId,
      role: "assistant",
      content: "",
    }]);

    try {
      const apiMessages = [...chatMessages, userMessage].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const noteContent = isSpreadsheetNote
        ? spreadsheetDataToPlainText(spreadsheetData)
        : stripHtml(editor?.getHTML() || note.content);

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          apiKey: providerConfig.apiKey,
          provider: providerConfig.provider,
          endpoint: providerConfig.endpoint,
          model: providerConfig.provider === "azure-foundry" ? "gpt-4o-mini" : "openai/gpt-4o-mini",
          noteContext: {
            title: title || getUntitledLabel(note),
            type: isSpreadsheetNote ? "spreadsheet" : "note",
            content: noteContent,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || "Failed to get response");
      }

      // Stream the response
      let streamedContent = "";

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          streamedContent += chunk;

          setChatMessages(prev =>
            prev.map(m =>
              m.id === tempAssistantId ? { ...m, content: streamedContent } : m
            )
          );
        }
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Failed to get response");
      // Remove the empty assistant message on error
      setChatMessages(prev => prev.filter(m => m.id !== tempAssistantId));
    } finally {
      setIsChatLoading(false);
    }
  };

  // Handle chat input key down
  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  // Auto-resize chat textarea
  const handleChatInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
  };

  // Clear chat
  const handleClearChat = () => {
    setChatMessages([]);
    setChatError(null);
  };

  const handleRedoChat = async (messageId: string) => {
    if (isChatLoading) return;

    const providerConfig = getProviderConfig();
    if (!providerConfig) {
      setChatError("Please set either an OpenRouter API key or Azure Foundry key + endpoint in Settings > API Keys.");
      return;
    }

    const messageIndex = chatMessages.findIndex((msg) => msg.id === messageId);
    if (messageIndex === -1) {
      return;
    }

    const messagesBeforeRedo = chatMessages.slice(0, messageIndex);

    setIsChatLoading(true);
    setChatError(null);

    const tempAssistantId = `assistant-redo-${Date.now()}`;
    setChatMessages([...messagesBeforeRedo, {
      id: tempAssistantId,
      role: "assistant",
      content: "",
    }]);

    try {
      const apiMessages = messagesBeforeRedo.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const noteContent = isSpreadsheetNote
        ? spreadsheetDataToPlainText(spreadsheetData)
        : stripHtml(editor?.getHTML() || note.content);

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          apiKey: providerConfig.apiKey,
          provider: providerConfig.provider,
          endpoint: providerConfig.endpoint,
          model: providerConfig.provider === "azure-foundry" ? "gpt-4o-mini" : "openai/gpt-4o-mini",
          noteContext: {
            title: title || getUntitledLabel(note),
            type: isSpreadsheetNote ? "spreadsheet" : "note",
            content: noteContent,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || "Failed to regenerate response");
      }

      let streamedContent = "";
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          streamedContent += chunk;

          setChatMessages((prev) =>
            prev.map((msg) =>
              msg.id === tempAssistantId ? { ...msg, content: streamedContent } : msg
            )
          );
        }
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Failed to regenerate response");
      setChatMessages(messagesBeforeRedo);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* Left side - Editor with header */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between h-11 px-4 border-b border-[#2f2f2f] shrink-0">
          <div className="flex items-center gap-1 text-sm text-[#9b9b9b] overflow-hidden">
            {breadcrumbPrefixLabel && (
              <>
                {onBreadcrumbPrefixClick ? (
                  <button
                    onClick={onBreadcrumbPrefixClick}
                    className="hover:text-[#e3e3e3] transition-colors cursor-pointer"
                  >
                    <span className="truncate">{breadcrumbPrefixLabel}</span>
                  </button>
                ) : (
                  <span className="truncate">{breadcrumbPrefixLabel}</span>
                )}
                {breadcrumbs.length > 0 && (
                  <svg className="w-3 h-3 text-[#6b6b6b] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </>
            )}
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.id} className="flex items-center gap-1 min-w-0">
                {index > 0 && (
                  <svg className="w-3 h-3 text-[#6b6b6b] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                {index === breadcrumbs.length - 1 ? (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <NoteIcon icon={crumb.icon} hasContent={crumb.content.length > 0 && crumb.content !== "<p></p>"} content={crumb.content} />
                    <span className="truncate">{crumb.id === note.id ? (title || getUntitledLabel(note)) : (crumb.title || getUntitledLabel(crumb))}</span>
                  </div>
                ) : (
                  <button
                    onClick={() => onSelectNote(crumb.id)}
                    className="flex items-center gap-1.5 hover:text-[#e3e3e3] transition-colors min-w-0 cursor-pointer"
                  >
                    <NoteIcon icon={crumb.icon} hasContent={crumb.content.length > 0 && crumb.content !== "<p></p>"} content={crumb.content} />
                    <span className="truncate max-w-[120px]">{crumb.title || getUntitledLabel(crumb)}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {headerActions}
            <button
              onClick={handleToggleLock}
              className={`p-1 rounded transition-colors ${isLocked ? "text-[#7eb8f7] bg-[#3f3f3f]" : "text-[#6b6b6b] hover:text-[#ebebeb] hover:bg-[#3f3f3f]"}`}
              title={isLocked ? "Unlock editing" : "Lock editing"}
            >
              {isLocked ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="5" y="11" width="14" height="10" rx="2" strokeWidth="2" />
                  <path d="M8 11V8a4 4 0 1 1 8 0v3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="16" r="1.25" fill="currentColor" stroke="none" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="5" y="11" width="14" height="10" rx="2" strokeWidth="2" />
                  <path d="M10 11V8a4 4 0 1 1 8 0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="16" r="1.25" fill="currentColor" stroke="none" />
                </svg>
              )}
            </button>
            {allowAIChat && (
              <button
                onClick={() => {
                  setShowAIChat(!showAIChat);
                  if (!showAIChat) {
                    setTimeout(() => chatInputRef.current?.focus(), 100);
                  }
                }}
                className={`p-1 rounded transition-colors ${showAIChat ? "text-[#7eb8f7] bg-[#3f3f3f]" : "text-[#6b6b6b] hover:text-[#ebebeb] hover:bg-[#3f3f3f]"}`}
                title="AI Chat"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Editor content */}
        <div className="flex-1 overflow-auto">
          <div className={isSpreadsheetNote ? "h-full flex flex-col" : "max-w-3xl mx-auto px-16 py-12 h-full flex flex-col"}>
            {/* Title */}
            {!isSpreadsheetNote && (
              <input
                type="text"
                value={title}
                onChange={handleTitleChange}
                readOnly={isLocked}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();

                    if (saveTimeoutRef.current) {
                      clearTimeout(saveTimeoutRef.current);
                    }

                    const content = isSpreadsheetNote
                      ? serializeSpreadsheetContent(spreadsheetData)
                      : (editor?.getHTML() || note.content);

                    void saveNote(titleRef.current, content, {
                      skipParentUpdate: true,
                    });
                    return;
                  }

                  if (e.key === "Enter" && !isSpreadsheetNote) {
                    e.preventDefault();
                    editor?.chain().focus().setTextSelection(0).run();
                  }
                }}
                ref={titleInputRef}
                placeholder="New page"
                className={`w-full text-4xl font-bold text-[#e3e3e3] bg-transparent border-none outline-none placeholder-[#4a4a4a] mb-4 leading-tight ${isLocked ? "cursor-default" : ""}`}
              />
            )}

            {!isSpreadsheetNote && showCallNoteView && parsedCallSections.transcriptDate && (
              <div className="mb-4 flex items-center gap-2 text-sm text-[#8f8f8f]">
                <span className="text-base leading-none">🗓️</span>
                <span>{parsedCallSections.transcriptDate}</span>
              </div>
            )}

            {/* Sub-pages list */}
            {!isSpreadsheetNote && childPages.length > 0 && (
              <div className="mb-6 -mx-2">
                {childPages.map((child) => (
                  <button
                    key={child.id}
                    onClick={() => onSelectNote(child.id)}
                    className="w-full flex items-center gap-2 px-2 py-1 hover:bg-[#2a2a2a] rounded transition-colors cursor-pointer text-left"
                  >
                    <NoteIcon icon={child.icon} hasContent={child.content.length > 0 && child.content !== "<p></p>"} content={child.content} />
                    <span className="note-title-text text-[#9b9b9b] text-sm truncate">
                      {child.title || getUntitledLabel(child)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {isSpreadsheetNote ? (
              <div className={`sheet-note-grid flex-1 overflow-auto bg-[#111111] ${isLightTheme ? "sheet-note-grid--light" : ""}`}>
                <style>{spreadsheetColumnSizeCss}</style>
                <Spreadsheet
                  ref={spreadsheetRef as unknown as React.Ref<unknown>}
                  className={`vault-sheet-resizable ${isSpreadsheetResizing ? "vault-sheet-resizing" : ""}`}
                  data={spreadsheetMatrix}
                  selected={spreadsheetSelection}
                  DataViewer={SheetDataViewer}
                  DataEditor={spreadsheetDataEditor}
                  ColumnIndicator={SpreadsheetColumnIndicator}
                  RowIndicator={SpreadsheetRowIndicator}
                  Row={SpreadsheetRow}
                  onSelect={(selection) => {
                    if (isLocked) {
                      return;
                    }
                    if (isSpreadsheetResizing) {
                      return;
                    }
                    setSpreadsheetSelection(selection);
                  }}
                  onActivate={(active) => {
                    if (isLocked) {
                      return;
                    }
                    if (isSpreadsheetResizing) {
                      return;
                    }
                    setActiveSpreadsheetCell(active);
                  }}
                  onKeyDown={(event) => {
                    if (isLocked) {
                      return;
                    }

                    if (event.target instanceof HTMLInputElement) {
                      return;
                    }

                    if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
                      const active = activeSpreadsheetCell;
                      const activeValue = active
                        ? (spreadsheetDraftRef.current[active.row]?.[active.column] ?? "")
                        : "";

                      if (activeValue.trim().length === 0) {
                        return;
                      }

                      event.preventDefault();
                      moveSpreadsheetSelection(active, "down");
                      return;
                    }

                    const isMeta = event.ctrlKey || event.metaKey;
                    if (!isMeta) {
                      return;
                    }

                    const key = event.key.toLowerCase();
                    if (key === "b" || key === "i" || key === "u") {
                      event.preventDefault();
                      const marker = key === "b" ? "**" : key === "i" ? "*" : "__";
                      applyFormatToActiveSpreadsheetCell(marker);
                    }
                  }}
                  onChange={(nextData) => {
                    if (isLocked) {
                      return;
                    }

                    const source = nextData ?? [];
                    const normalized = normalizeSpreadsheetData(
                      source.map((row) => row.map((cell) => cell?.value ?? ""))
                    );
                    queueSpreadsheetSave(normalized);
                  }}
                />
              </div>
            ) : showCallNoteView ? (
              <div className="flex-1 pb-10">
                <div className="space-y-4">
                  <section className={`rounded-lg border px-4 py-3 ${isLightTheme ? "border-[#d6d6d6] bg-[#f7f7f7]" : "border-[#2f2f2f] bg-[#191919]"}`}>
                    <h3 className={`text-xs uppercase tracking-wider font-semibold mb-2 ${isLightTheme ? "text-[#4b4b4b]" : "text-[#91918e]"}`}>🧠 Summary</h3>
                    {parsedCallSections.summaryItems.length > 0 ? (
                      <ul className="space-y-1.5">
                        {parsedCallSections.summaryItems.map((item, index) => (
                          <li key={`summary-${index}`} className={`text-sm leading-relaxed ${isLightTheme ? "text-[#141414]" : "text-[#d7d7d7]"}`}>
                            • {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={`text-sm ${isLightTheme ? "text-[#5f5f5f]" : "text-[#7a7a7a]"}`}>No summary yet.</p>
                    )}
                  </section>

                  <section className={`rounded-lg border px-4 py-3 ${isLightTheme ? "border-[#d6d6d6] bg-[#f7f7f7]" : "border-[#2f2f2f] bg-[#191919]"}`}>
                    <h3 className={`text-xs uppercase tracking-wider font-semibold mb-2 ${isLightTheme ? "text-[#4b4b4b]" : "text-[#91918e]"}`}>✅ Action Items</h3>
                    {parsedCallSections.actionItems.length > 0 ? (
                      <ul className="space-y-1.5">
                        {parsedCallSections.actionItems.map((item, index) => (
                          <li key={`action-${index}`} className={`text-sm leading-relaxed ${isLightTheme ? "text-[#141414]" : "text-[#d7d7d7]"}`}>
                            • {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={`text-sm ${isLightTheme ? "text-[#5f5f5f]" : "text-[#7a7a7a]"}`}>No action items identified.</p>
                    )}
                  </section>

                  <section className={`rounded-lg border px-4 py-3 ${isLightTheme ? "border-[#d6d6d6] bg-[#f7f7f7]" : "border-[#2f2f2f] bg-[#191919]"}`}>
                    <h3 className={`text-xs uppercase tracking-wider font-semibold mb-2 ${isLightTheme ? "text-[#4b4b4b]" : "text-[#91918e]"}`}>🗣️ {parsedCallSections.transcriptLabel}</h3>
                    {parsedCallSections.transcriptLines.length > 0 ? (
                      <div className="space-y-2 max-h-[52vh] overflow-auto pr-1">
                        {parsedCallSections.transcriptLines.map((line, index) => (
                          <p key={`line-${index}`} className={`text-sm leading-relaxed ${isLightTheme ? "text-[#141414]" : "text-[#c5c5c5]"}`}>
                            {line}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className={`text-sm ${isLightTheme ? "text-[#5f5f5f]" : "text-[#7a7a7a]"}`}>Transcript will appear here as the call is transcribed.</p>
                    )}
                  </section>
                </div>
              </div>
            ) : (
              <div className="relative flex-1">
                <EditorContent
                  editor={editor}
                  className="flex-1"
                  
                />
                {slashMenuState && filteredSlashCommands.length > 0 && (
                  <div
                    className="fixed z-[80] w-80 rounded-lg border border-[#3f3f3f] bg-[#252525] p-1 shadow-xl"
                    style={{ left: slashMenuState.left, top: slashMenuState.top }}
                  >
                    {filteredSlashCommands.map((command, index) => {
                      const selected = index === slashMenuSelectedIndex;
                      return (
                        <button
                          key={command.id}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            void runSlashCommand(command);
                          }}
                          className={`w-full rounded px-2 py-1.5 text-left transition-colors ${selected ? "bg-[#3f3f3f]" : "hover:bg-[#2f2f2f]"}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-sm ${selected ? "text-[#ebebeb]" : "text-[#d0d0d0]"}`}>
                              /{command.id}
                            </span>
                            <span className="text-xs text-[#6b6b6b]">{command.label}</span>
                          </div>
                          <div className="text-xs text-[#8a8a8a] truncate">{command.description}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {inlineInsertPickerState && (
                  <div
                    ref={inlineInsertPickerContainerRef}
                    tabIndex={inlineInsertPickerState.mode === "icon" ? 0 : -1}
                    onKeyDown={(event) => {
                      if (inlineInsertPickerState.mode !== "icon") {
                        return;
                      }

                      const options = filteredUploadedIcons;
                      if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        closeInlineInsertPicker();
                        return;
                      }

                      if (options.length === 0) {
                        return;
                      }

                      const getCurrentIndex = () => (inlineInsertPickerSelectedIndex >= 0 ? inlineInsertPickerSelectedIndex : 0);
                      const columns = 8;

                      if (event.key === "ArrowRight") {
                        event.preventDefault();
                        event.stopPropagation();
                        setInlineInsertPickerSelectedIndex((prev) => {
                          const current = prev >= 0 ? prev : 0;
                          return Math.min(current + 1, options.length - 1);
                        });
                        return;
                      }

                      if (event.key === "ArrowLeft") {
                        event.preventDefault();
                        event.stopPropagation();
                        setInlineInsertPickerSelectedIndex((prev) => {
                          const current = prev >= 0 ? prev : 0;
                          return Math.max(current - 1, 0);
                        });
                        return;
                      }

                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        event.stopPropagation();
                        setInlineInsertPickerSelectedIndex((prev) => {
                          const current = prev >= 0 ? prev : 0;
                          return Math.min(current + columns, options.length - 1);
                        });
                        return;
                      }

                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        event.stopPropagation();
                        setInlineInsertPickerSelectedIndex((prev) => {
                          const current = prev >= 0 ? prev : 0;
                          return Math.max(current - columns, 0);
                        });
                        return;
                      }

                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.stopPropagation();
                        const selectedFilename = options[getCurrentIndex()];
                        if (selectedFilename) {
                          insertUploadedIconFromPicker(selectedFilename);
                        }
                      }
                    }}
                    className="fixed z-[81] w-80 rounded-lg border border-[#3f3f3f] bg-[#252525] p-2 shadow-xl outline-none"
                    style={{ left: inlineInsertPickerState.left, top: inlineInsertPickerState.top }}
                  >
                    {inlineInsertPickerState.mode === "emoji" && (
                      <input
                        ref={inlineInsertPickerInputRef}
                        value={inlineInsertPickerState.query}
                        onChange={(event) => {
                          setInlineInsertPickerState((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  query: event.target.value,
                                }
                              : prev
                          );
                          setInlineInsertPickerSelectedIndex(0);
                        }}
                        onKeyDown={(event) => {
                          const options = filteredEmojiInsertOptions;

                          if (event.key === "ArrowDown") {
                            event.preventDefault();
                            event.stopPropagation();
                            if (options.length > 0) {
                              setInlineInsertPickerSelectedIndex((prev) => (prev + 1) % options.length);
                            }
                            return;
                          }

                          if (event.key === "ArrowUp") {
                            event.preventDefault();
                            event.stopPropagation();
                            if (options.length > 0) {
                              setInlineInsertPickerSelectedIndex((prev) => (prev <= 0 ? options.length - 1 : prev - 1));
                            }
                            return;
                          }

                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.stopPropagation();
                            if (options.length === 0) {
                              return;
                            }

                            const option = options[inlineInsertPickerSelectedIndex];
                            if (option) {
                              insertEmojiFromPicker(option.emoji);
                            }
                            return;
                          }

                          if (event.key === "Escape") {
                            event.preventDefault();
                            event.stopPropagation();
                            closeInlineInsertPicker();
                          }
                        }}
                        placeholder="Search emojis..."
                        className="mb-2 w-full rounded border border-[#3f3f3f] bg-[#1a1a1a] px-2 py-1.5 text-sm text-[#e3e3e3] outline-none"
                      />
                    )}

                    {inlineInsertPickerState.mode === "emoji" ? (
                      <div className="max-h-60 overflow-auto space-y-0.5">
                        {filteredEmojiInsertOptions.length === 0 ? (
                          <div className="px-2 py-1.5 text-xs text-[#7d7d7d]">No emojis found</div>
                        ) : (
                          filteredEmojiInsertOptions.map((option, index) => {
                            const selected = index === inlineInsertPickerSelectedIndex;
                            return (
                              <button
                                key={`${option.emoji}-${option.name}`}
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  console.log("[slash-insert] emoji:click", {
                                    noteId: note.id,
                                    emoji: option.emoji,
                                    name: option.name,
                                    index,
                                  });
                                  insertEmojiFromPicker(option.emoji);
                                }}
                                className={`w-full rounded px-2 py-1.5 text-left transition-colors ${selected ? "bg-[#3f3f3f]" : "hover:bg-[#2f2f2f]"}`}
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className="text-lg leading-none"
                                    style={{ fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif' }}
                                  >
                                    {option.emoji}
                                  </span>
                                  <span className={`text-sm ${selected ? "text-[#ebebeb]" : "text-[#d0d0d0]"}`}>{option.name}</span>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    ) : (
                      <div className="max-h-60 overflow-auto">
                        {isLoadingUploadedIcons ? (
                          <div className="px-2 py-1.5 text-xs text-[#7d7d7d]">Loading icons...</div>
                        ) : filteredUploadedIcons.length === 0 ? (
                          <div className="px-2 py-1.5 text-xs text-[#7d7d7d]">No uploaded icons found</div>
                        ) : (
                          <div className="grid grid-cols-8 gap-1">
                            {filteredUploadedIcons.map((filename, index) => {
                              const selected = inlineInsertPickerSelectedIndex >= 0 && index === inlineInsertPickerSelectedIndex;
                              return (
                                <button
                                  key={filename}
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    console.log("[slash-insert] icon:click", {
                                      noteId: note.id,
                                      filename,
                                      index,
                                    });
                                    insertUploadedIconFromPicker(filename);
                                  }}
                                  className={`w-8 h-8 flex items-center justify-center rounded transition-colors focus:outline-none ${selected ? "bg-[#3f3f3f] shadow-[inset_0_0_0_2px_#7eb8f7]" : "hover:bg-[#3f3f3f]"}`}
                                  title="Insert icon"
                                >
                                  <img
                                    src={`/api/icons/${filename}`}
                                    alt=""
                                    className="w-7 h-7 rounded-sm object-cover"
                                  />
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right side - AI Chat Panel (full height) */}
      {showAIChat && (
        <div className="w-80 border-l border-[#2f2f2f] flex flex-col shrink-0">
          {/* Chat header - same level as top bar */}
          <div className="h-11 px-4 flex items-center justify-between border-b border-[#2f2f2f] shrink-0">
            <span className="text-xs text-[#9b9b9b] font-medium">Note AI Chat</span>
            {chatMessages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="p-1 text-[#6b6b6b] hover:text-[#ebebeb] hover:bg-[#3f3f3f] rounded transition-colors"
                title="Clear chat"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>

          {/* Chat messages */}
          <div ref={chatMessagesScrollRef} className="flex-1 overflow-auto p-4 space-y-4">
            {chatError && (
              <div className="bg-red-500/10 text-red-400 text-xs px-3 py-2 rounded-lg">
                {chatError}
              </div>
            )}
            {chatMessages.map((msg) => {
              const isLastAssistantMessage = msg.role === "assistant" && msg.id === lastAssistantMessageId;

              return (
              <div
                key={msg.id}
                className={msg.role === "user" ? "flex justify-end" : ""}
              >
                {msg.role === "user" ? (
                  <div className="ai-user-bubble max-w-[85%] rounded-2xl px-3 py-2 bg-[#3f3f3f] text-[#e3e3e3] text-sm break-words">
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                ) : (
                  <div>
                    <div className="ai-assistant-content prose prose-invert prose-sm max-w-none text-[#e3e3e3] leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_code]:bg-[#2a2a2a] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[#7eb8f7] [&_pre]:bg-[#2a2a2a] [&_pre]:p-2 [&_pre]:rounded-lg [&_pre_code]:bg-transparent [&_pre_code]:p-0">
                      {msg.content ? (
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      ) : (
                        <div className="flex gap-1.5 py-1">
                          <span className="w-1.5 h-1.5 bg-[#6b6b6b] rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                          <span className="w-1.5 h-1.5 bg-[#6b6b6b] rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                          <span className="w-1.5 h-1.5 bg-[#6b6b6b] rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                        </div>
                      )}
                    </div>
                    {isLastAssistantMessage && msg.content && (
                      <div className="flex gap-3 mt-2.5">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(msg.content);
                            setCopiedChatMessageId(msg.id);
                            setTimeout(() => setCopiedChatMessageId(null), 400);
                          }}
                          className={`transition-colors ${copiedChatMessageId === msg.id ? "text-green-400" : "text-[#6b6b6b] hover:text-[#ebebeb]"}`}
                          title="Copy"
                        >
                          {copiedChatMessageId === msg.id ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => handleRedoChat(msg.id)}
                          className="text-[#6b6b6b] hover:text-[#ebebeb] transition-colors"
                          title="Regenerate"
                          disabled={isChatLoading}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 4v6h6"/>
                            <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );})}
            <div ref={chatMessagesEndRef} />
          </div>

          {/* Chat input */}
          <div className="p-4 shrink-0">
            <div className="ai-chat-composer flex gap-2 items-end bg-[#252525] rounded-lg border border-[#3f3f3f] p-2">
              <textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={handleChatInputChange}
                onKeyDown={handleChatKeyDown}
                placeholder="Chat about this note..."
                className="flex-1 bg-transparent text-[#e3e3e3] placeholder-[#6b6b6b] resize-none outline-none text-sm px-2 py-1"
                rows={1}
                style={{ maxHeight: "100px" }}
              />
              <button
                onClick={handleSendChat}
                disabled={!chatInput.trim() || isChatLoading}
                className="p-2 rounded-md bg-[#4f4f4f] hover:bg-[#5f5f5f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4 text-[#e3e3e3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
