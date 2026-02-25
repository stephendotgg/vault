export interface ElectronAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  reportRendererRuntimeError: (payload: unknown) => void;
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
  quickAiChatStream: (requestId: string, messages: Array<{ role: "user" | "assistant"; content: string }>) => void;
  quickAiSave: (messages: Array<{ role: "user" | "assistant"; content: string }>) => Promise<{ saved: boolean; sessionId?: string }>;
  quickAiSaveAndClose: (messages: Array<{ role: "user" | "assistant"; content: string }>) => void;
  quickAiTrash: (sessionId?: string) => void;
  closeQuickAi: () => void;
  onQuickAiStream: (callback: (payload: { requestId: string; type: "chunk" | "end" | "error"; chunk?: string; content?: string; message?: string }) => void) => () => void;
  onQuickAiSessionsChanged: (callback: () => void) => () => void;
  callsTranscriberSendChunk: (wavBase64: string) => void;
  callsTranscriberReportError: (message: string) => void;
  callsTranscriberLog: (message: string, data?: unknown) => void;
  onCallsTranscriberStart: (callback: (payload: { chunkMs?: number }) => void) => () => void;
  onCallsTranscriberStop: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
