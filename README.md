# Vault

A note-taking desktop app with rich text, spreadsheets, lists, AI chat, voice recordings, and more. Fully modular, with global hotkeys for quick capture. Your data stays on your machine — no account, no subscription.

<img width="1846" height="1098" alt="image" src="https://github.com/user-attachments/assets/818cb96b-bad5-46d4-a637-9af02afe4af6" />
<br>
<br>

> [!NOTE]  
> **To install**, grab the latest `.exe` from the [Releases](https://github.com/stephendotgg/vault/releases) tab on the right and run it.

## Why

I built Vault because I was unsatisfied with existing apps. One app had features another didn’t, workflows were fragmented, and AI was often locked behind premium pricing. I wanted one place that covered my real daily workflow without subscriptions deciding what I could or couldn’t do.

I also wanted total control, so Vault is local-first by design: everything is stored in a local SQLite database on your machine, AI uses your own API key, and voice transcription runs through your own Azure Speech credentials. Due to popular demand, I open-sourced it and modularized it so users can bend it to their own will.

## Features

### Notes
- Hierarchical pages with drag-and-drop reordering
- Rich text editing, custom icons, archive, and full-text search
- Note deep links — paste @mention-style clickable references between notes
- Pop-out notes into separate resizable windows
- Inline voice recordings via `/voice` slash command
- Inline emoji picker (`/emoji`) with ~500 searchable emojis
- Inline icon insertion (`/icon`) with searchable custom icons
- Native spellcheck with right-click suggestions and Add to Dictionary

### Spreadsheets
- Spreadsheet notes with inline editing and formatting
- Resizable grid with optional AI help in context

### Lists
- Quick-access list items with optional links and tags
- Tag-based filtering and search

### AI Chat
- Multi-session chat with auto-generated titles
- OpenRouter and Azure Foundry integration, streaming responses, image support, and custom instructions
- Context-aware in-note and global modes
- Blur/scramble chat history titles for privacy

### Quick Windows (Global Hotkeys)
- **Ctrl+Q** — floating Quick Note window, saves to your notes with AI-generated title
- **Ctrl+Space** — floating Quick AI window for instant queries without opening the full app

### Search
- Full-text search across notes and lists
- Filter by Notes, Lists, and toggle Include Archived

### Other
- Fully modular — enable or disable any feature (Notes, Lists, AI Chat, File Cleaner) from Settings
- Teams call transcription that auto-transcribes and summarises calls, saved as notes
- File Cleaner with Tinder-style swipe interface for cleaning up files on your machine
- One-click export of all data (notes, lists, audio, icons) as a zip

## Tech Stack

| Layer | Tech |
|---|---|
| Desktop shell | Electron 29 |
| Frontend | Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4 |
| Backend | Next.js API Routes, Prisma ORM |
| Database | SQLite via Prisma |
| AI (cloud) | OpenRouter or Azure Foundry (user-supplied key) |
| Transcription (cloud) | Azure Speech live transcription (user-supplied key) |

## Data Storage

All user data lives in:

| OS | Path |
|---|---|
| Windows | `%APPDATA%\Vault\data\` |

This folder contains:
- `mothership.db` — the SQLite database (notes, lists, chat history, settings)
- `icons/` — custom note icons
- `audio/` — voice recordings
- `.trash/` — stores the last deleted file to power the undo system (before final empty)

Data persists independently of the app installation, so reinstalling or updating doesn't touch it.

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- npm

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/yourusername/vault.git
cd vault

# 2. Install dependencies
npm install

# 3. Generate Prisma client
npx prisma generate
```

### Run in browser (Next.js dev mode)

```bash
npm run dev
```

Opens at http://localhost:3000. Good for UI work — no Electron overhead.

### Run in Electron (dev mode)

```bash
npm run electron:dev
```

Starts the Next.js dev server and Electron together.


## Building & Installing

### Install to your machine (one command)

```bash
npm run install:local
```

This will:
1. Kill any running Vault instance
2. Rebuild native modules for Node.js
3. Build Next.js for production
4. Rebuild native modules for Electron
5. Package with electron-packager
6. Install to `%LOCALAPPDATA%\Programs\Vault`

### Package only

```bash
npm run package
```

Output goes to `dist/Vault-win32-x64/`.

### Bump version + push tag (one command)

```bash
npm run version:push -- patch
```

You can use `patch`, `minor`, `major`, or an explicit version like:

```bash
npm run version:push -- 0.2.0
```

Or keep the bump type first and set an explicit version last:

```bash
npm run version:push -- patch --version 0.2.0
```

This command updates `package.json` (and `package-lock.json` if present), creates a release commit, creates the matching `vX.Y.Z` tag, and pushes both to GitHub.

## Contributing

PRs and issues are welcome. This is a personal project so I may be opinionated about direction, but if you've found a bug or have a genuinely useful idea, open an issue and let's talk.

If you're adding a feature, open an issue first so we're aligned before you put in the work. 

## License

CC BY-NC 4.0 (Creative Commons Attribution-NonCommercial 4.0 International)
