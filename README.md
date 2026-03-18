# Vault

A note-taking desktop app with rich text, spreadsheet notes, and hierarchical organization. It also includes opinionated everyday extras like a key-value vault, voice log, dream journal, file cleaner, plus Quick Note and Quick AI Chat for busy moments. Everything runs locally. No account, no subscription.

<img width="2068" height="1239" alt="image" src="https://github.com/user-attachments/assets/f8e978cd-1042-4a38-a033-29c0e25a2583" />

## Why

I built Vault because I was unsatisfied with existing apps. One app had features another didn’t, workflows were fragmented, and AI was often locked behind premium pricing. I wanted one place that covered my real daily workflow without subscriptions deciding what I could or couldn’t do.

I also wanted total control, so Vault is local-first by design: everything is stored in a local SQLite database on your machine, AI uses your own API key, and voice transcription runs through your own Azure Speech credentials. Due to popular demand, I open-sourced it and modularized it so users can bend it to their own will.

## Features

### Notes
- Hierarchical pages with drag-and-drop reordering
- Rich text editing, custom icons, archive, and full-text search

### Spreadsheets
- Spreadsheet notes with inline editing and formatting
- Resizable grid with optional AI help in context

### AI Chat
- Multi-session chat with auto-generated titles
- [OpenRouter](https://openrouter.ai) integration, streaming responses, image support, and custom instructions
- Context-aware in-note and global modes with vector search

### Quick Windows (Global Hotkeys)
- **Ctrl+Q** — floating Quick Note window, saves to your notes with AI-generated title
- **Ctrl+Space** — floating Quick AI window for instant queries without opening the full app

## Tech Stack

| Layer | Tech |
|---|---|
| Desktop shell | Electron 29 |
| Frontend | Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4 |
| Database | SQLite via Prisma |
| AI (cloud) | OpenRouter API (OpenAI-compatible, user-supplied key) |
| Transcription | Azure Speech live transcription (user-supplied key) |

## Data Storage

All user data lives in:

| OS | Path |
|---|---|
| Windows | `%APPDATA%\Vault\data\` |

This folder contains:
- `mothership.db` — the SQLite database (notes, vault, memories, chat history, settings)
- `icons/` — custom note icons
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
