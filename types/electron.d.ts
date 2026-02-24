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
  closeQuickNote: (noteId?: string | null, text?: string) => void;
  onQuickNotesChanged: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
