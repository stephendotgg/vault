import path from "path";
import { existsSync, mkdirSync } from "fs";

// Get the persistent data directory
// In development: use project folder
// In production: use user's app data folder
export function getDataDir(): string {
  const explicitDataDir = process.env.MOTHERSHIP_DATA_DIR?.trim();
  if (explicitDataDir) {
    if (!existsSync(explicitDataDir)) {
      mkdirSync(explicitDataDir, { recursive: true });
    }
    return explicitDataDir;
  }

  // Check if we're in a packaged Electron app using environment variable set by main.js
  const isPackaged = process.env.NEXT_PRIVATE_STANDALONE === "1";
  
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
