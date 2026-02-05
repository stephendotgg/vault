interface ElectronAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  platform: string;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
