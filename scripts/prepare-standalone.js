/**
 * Prepares the standalone build for Electron packaging.
 * 
 * After `next build` with `output: 'standalone'`, this script:
 * 1. Copies .next/static to .next/standalone/.next/static
 * 2. Copies public to .next/standalone/public
 */

const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const standaloneDir = path.join(rootDir, ".next", "standalone");
const staticSrc = path.join(rootDir, ".next", "static");
const staticDest = path.join(standaloneDir, ".next", "static");
const publicSrc = path.join(rootDir, "public");
const publicDest = path.join(standaloneDir, "public");

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    console.log(`Source does not exist: ${src}`);
    return;
  }

  const stat = fs.statSync(src);
  
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    const files = fs.readdirSync(src);
    for (const file of files) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log("Preparing standalone build for Electron...");

// Ensure standalone directory exists
if (!fs.existsSync(standaloneDir)) {
  console.error("Standalone directory not found. Did you run `next build`?");
  process.exit(1);
}

// Remove better-sqlite3 from standalone node_modules so that at runtime
// Node's module resolution falls through to the root node_modules copy,
// which is rebuilt for Electron's ABI by @electron/rebuild.
const standaloneBetterSqlite3 = path.join(standaloneDir, "node_modules", "better-sqlite3");
if (fs.existsSync(standaloneBetterSqlite3)) {
  fs.rmSync(standaloneBetterSqlite3, { recursive: true, force: true });
  console.log("Removed standalone better-sqlite3 (will use electron-rebuilt root copy)");
}

// Copy static files
console.log("Copying .next/static...");
copyRecursive(staticSrc, staticDest);

// Copy public folder
console.log("Copying public...");
copyRecursive(publicSrc, publicDest);

console.log("Standalone build prepared successfully!");
