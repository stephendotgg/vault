import path from "path";
import { existsSync, mkdirSync } from "fs";

// Get the persistent data directory
// In development: use project folder
// In production: use user's app data folder
export function getDataDir(): string {
  // Check if we're in a packaged Electron app
  const isPackaged = process.env.NODE_ENV === "production" && !process.cwd().includes("node_modules");
  
  if (isPackaged) {
    // Use a persistent folder in user's app data
    // On Windows: C:\Users\<user>\AppData\Roaming\Mothership
    // On macOS: ~/Library/Application Support/Mothership
    // On Linux: ~/.config/Mothership
    const appData = process.env.APPDATA || 
      (process.platform === "darwin" 
        ? path.join(process.env.HOME || "", "Library", "Application Support")
        : path.join(process.env.HOME || "", ".config"));
    
    const dataDir = path.join(appData, "Mothership");
    
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
