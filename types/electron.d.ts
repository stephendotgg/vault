export interface ElectronAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  platform: string;
  selectFolder: () => Promise<string | null>;
  onGlobalNewNote: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
