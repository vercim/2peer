# AGENTS.md

## Commands

| Command             | Purpose                                     |
| ------------------- | ------------------------------------------- |
| `npm run dev`       | Vite dev server only (web without Electron) |
| `npm start`         | Vite build + Electron (production-like)     |
| `npm run build`     | Vite build to `dist/`                       |
| `npm run build:win` | Windows installer (`release/`)              |
| `npm run build:mac` | macOS dmg + zip                             |

## Build Behavior

- `prebuild:win` / `prebuild:mac` auto-increments version in `package.json` before building
- Version is injected into `index.html` at build time via `{{VERSION}}`

## Tech Stack

- Electron + React + Vite + TailwindCSS v4
- WebRTC for P2P streaming
- Supabase: signaling server only (no data passes through)

## Electron File Requirements

- Electron main process: **must be CommonJS** (`src/electron.cjs`)
- Preload script: **must be CommonJS** (`src/preload.cjs`)
- All other source: ESM via Vite

## App Behavior

- Single instance lock (second instance focuses existing window)
- Profile stored at `%APPDATA%/2peer/profile.json` (Windows) or `~/Library/Application Support/2peer/profile.json` (macOS)
- Window hides on close; app runs in system tray
- On Windows: starts hidden with `--hidden` argument (auto-start at login)

## No test suite

This repo has no test commands. Verify manually via `npm start` or `npm run dev`.
