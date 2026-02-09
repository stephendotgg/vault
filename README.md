# Mothership

A Notion-like desktop app built with Next.js and Electron. Features notes with drag-drop reordering, a vault (key-value store), and memories with voice recording and local Whisper transcription.

## Tech Stack

- **Next.js 16** - App router with Turbopack
- **Electron 29** - Desktop app wrapper
- **Prisma** - SQLite database with better-sqlite3
- **@xenova/transformers** - Local Whisper model for voice transcription

## Development

### 1. Install dependencies

```bash
npm install
```

### 2. Generate Prisma client

```bash
npx prisma generate
```

### 3. Run in browser (Next.js dev mode)

```bash
npm run dev
# or
bun dev
```

Opens at http://localhost:3000

### 4. Run in Electron (dev mode)

```bash
npm run electron-dev
```

This starts Next.js dev server and Electron together.

## Packaging for Distribution

### 1. Build Next.js

```bash
npm rebuild better-sqlite3
npm run build
```

### 2. Rebuild native modules for Electron

```bash
npx @electron/rebuild -f -w better-sqlite3
```

### 3. Package with electron-packager

```bash
npx electron-packager . Mothership --platform=win32 --arch=x64 --out=dist --overwrite --no-asar
```

Output: `dist/Mothership-win32-x64/`

### 4. Install to Programs folder (optional)

```powershell
$dest = "$env:LOCALAPPDATA\Programs\Mothership"
Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue
Copy-Item -Recurse "dist\Mothership-win32-x64" $dest
```

### 5. After packaging, to return to dev mode

```bash
npm rebuild better-sqlite3
```

> **Note:** `better-sqlite3` is a native module that must be compiled for either your system's Node.js (dev) or Electron's Node.js (production). Always rebuild after switching.

## Data Storage

In production, user data is stored in:
- **Windows**: `%APPDATA%\Mothership\data\`
- **macOS**: `~/Library/Application Support/Mothership/data/`
- **Linux**: `~/.config/Mothership/data/`

This folder contains:
- `mothership.db` - SQLite database
- `images/` - Uploaded occasion images

Data persists across app updates since it's stored outside the app folder.
