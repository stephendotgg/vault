export interface ElectronAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  platform: string;
  selectFolder: () => Promise<string | null>;
  onGlobalNewNote: (callback: () => void) => () => void;
  openQuickNote: () => void;
  quickNoteCreate: (text: string, force?: boolean) => Promise<{ id: string }>;
  quickNoteUpdate: (noteId: string, text: string) => Promise<unknown>;
  quickNoteFinalize: (noteId: string, text: string) => void;
  quickNoteSave: (text: string) => Promise<{ saved: boolean; noteId?: string }>;
  quickNoteArchive: (text: string) => Promise<{ archived: boolean; noteId?: string }>;
  closeQuickNote: (noteId?: string | null, text?: string) => void;
  onQuickNotesChanged: (callback: () => void) => () => void;
  openQuickAi: () => void;
  quickAiChat: (messages: Array<{ role: "user" | "assistant"; content: string }>) => Promise<{ content: string }>;
  quickAiSave: (messages: Array<{ role: "user" | "assistant"; content: string }>) => Promise<{ saved: boolean; sessionId?: string }>;
  quickAiTrash: (sessionId?: string) => void;
  closeQuickAi: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
