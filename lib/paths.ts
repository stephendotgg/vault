import path from "path";
import { existsSync, mkdirSync, appendFileSync } from "fs";

// Simple file logger for production debugging
let logFilePath: string | null = null;

export function serverLog(...args: unknown[]) {
  const msg = `[${new Date().toISOString()}] ${args.map(a => (typeof a === "string" ? a : JSON.stringify(a, null, 0))).join(" ")}\n`;
  console.log(...args);
  try {
    if (!logFilePath) {
      const dir = getDataDir();
      const dataDir = path.join(dir, "data");
      if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
      logFilePath = path.join(dataDir, "vault.log");
    }
    appendFileSync(logFilePath, msg);
  } catch {
    // ignore file write errors
  }
}

export function serverError(...args: unknown[]) {
  const msg = `[${new Date().toISOString()}] [ERROR] ${args.map(a => {
    if (a instanceof Error) return `${a.message}\n${a.stack}`;
    return typeof a === "string" ? a : JSON.stringify(a, null, 0);
  }).join(" ")}\n`;
  console.error(...args);
  try {
    if (!logFilePath) {
      const dir = getDataDir();
      const dataDir = path.join(dir, "data");
      if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
      logFilePath = path.join(dataDir, "vault.log");
    }
    appendFileSync(logFilePath, msg);
  } catch {
    // ignore file write errors
  }
}

// Get the persistent data directory
// In development: use project folder
// In production: use user's app data folder
export function getDataDir(): string {
  const explicitDataDir = process.env.MOTHERSHIP_DATA_DIR?.trim();
  if (explicitDataDir) {
    console.log("[paths] Using explicit data dir:", explicitDataDir);
    if (!existsSync(explicitDataDir)) {
      mkdirSync(explicitDataDir, { recursive: true });
    }
    return explicitDataDir;
  }

  // Check if we're in a packaged Electron app using environment variable set by main.js
  const isPackaged = process.env.NEXT_PRIVATE_STANDALONE === "1";
  console.log("[paths] isPackaged:", isPackaged, "MOTHERSHIP_DATA_DIR:", process.env.MOTHERSHIP_DATA_DIR, "cwd:", process.cwd());
  
  if (isPackaged) {
    // Use a persistent folder in user's app data
    // On Windows: C:\Users\<user>\AppData\Roaming\Vault
    // On macOS: ~/Library/Application Support/Vault
    // On Linux: ~/.config/Vault
    const appData = process.env.APPDATA || 
      (process.platform === "darwin" 
        ? path.join(process.env.HOME || "", "Library", "Application Support")
        : path.join(process.env.HOME || "", ".config"));
    
    const dataDir = path.join(appData, "Vault");
    
    // Ensure the directory exists
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    
    return dataDir;
  }
  
  // Development mode - use project folder
  return process.cwd();
}

export function getDatabasePath(): string {
  const dataDir = getDataDir();
  // Put database in data/ subfolder to keep separate from Electron's internal folders
  const dbDir = path.join(dataDir, "data");
  
  // Ensure data directory exists
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  
  return path.join(dbDir, "mothership.db");
}

export function getImagesDir(): string {
  const dataDir = getDataDir();
  const imagesDir = path.join(dataDir, "data", "images");
  
  // Ensure images directory exists
  if (!existsSync(imagesDir)) {
    mkdirSync(imagesDir, { recursive: true });
  }
  
  return imagesDir;
}

export function getIconsDir(): string {
  const dataDir = getDataDir();
  const iconsDir = path.join(dataDir, "data", "icons");
  
  // Ensure icons directory exists
  if (!existsSync(iconsDir)) {
    mkdirSync(iconsDir, { recursive: true });
  }
  
  return iconsDir;
}

export function getAudioDir(): string {
  const dataDir = getDataDir();
  const audioDir = path.join(dataDir, "data", "audio");
  
  if (!existsSync(audioDir)) {
    mkdirSync(audioDir, { recursive: true });
  }
  
  return audioDir;
}
