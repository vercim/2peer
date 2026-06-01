# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

2peer is an Electron desktop app for peer-to-peer screen sharing between exactly two participants. Video/audio flow directly between peers over WebRTC; **[Trystero](https://github.com/dmotz/trystero) over BitTorrent DHT is used only as a signaling relay** (offer/answer/ICE exchange) — no media, no persisted data, and no central server is involved.

## Repo layout

This repo holds two independent projects:

- **`app/`** — the Electron app (this is where `package.json`, `src/`, `index.html`, `vite.config.js` live). **Run all `npm` commands from `app/`.**
- **`site/`** — the static marketing/landing site, deployed to Vercel. No build step; `vercel.json` at the repo root serves `site/` and skips deploys when nothing under `site/` changed.

## Commands

> Run from the `app/` directory.

| Command             | Purpose                                                |
| ------------------- | ------------------------------------------------------ |
| `npm run dev`       | Vite dev server only (renderer in browser, no Electron, no `window.electronAPI`) |
| `npm start`         | `vite build` + launch Electron (production-like run)   |
| `npm run build`     | Vite build to `dist/`                                  |
| `npm run build:win` | Windows NSIS installer → `release/`                    |
| `npm run build:mac` | macOS dmg + zip → `release/`                           |
| `npm run bump`      | Increment patch version in `package.json` (run once before a release, not per-platform) |

- **No test suite.** Verify changes manually with `npm start` (full Electron) or `npm run dev` (renderer only). Testing the WebRTC flow requires two running instances with different IDs.
- **Versioning**: run `npm run bump` **once** before a release to increment the patch version, then build for all platforms. Do NOT add auto-increment back to `prebuild:win` / `prebuild:mac` — building for multiple platforms in sequence would inflate the version incorrectly. The version is injected into `index.html` via the `{{VERSION}}` token by the `version-replace` Vite plugin (see [vite.config.js](app/vite.config.js)).

## Module system split (important)

Vite bundles the renderer as ESM, but the Electron process files must stay CommonJS and are shipped unbundled (listed individually under `build.files` in [package.json](app/package.json)):

- `app/src/electron.cjs` — main process
- `app/src/preload.cjs` — preload (context bridge)
- `app/src/utils/idUtils.cjs` — shared by main process

All other `src/` code is ESM consumed by Vite. Don't convert the `.cjs` files to ESM or import them from renderer code.

## Architecture

**Process boundary.** The renderer never touches Node/Electron APIs directly. [src/preload.cjs](app/src/preload.cjs) exposes a fixed `window.electronAPI` surface over IPC; [src/electron.cjs](app/src/electron.cjs) registers the matching `ipcMain` handlers. To add a renderer→main capability you must edit **both** files. No credentials are stored in the main process — Trystero requires no keys or server config.

**Renderer state lives in [src/App.jsx](app/src/App.jsx).** `App` is the single stateful component; it owns every `useState`/`useRef` (the `RTCPeerConnection` in `pcRef`, streams, call status, etc.) and threads them into a set of hooks that each encapsulate one concern. The hooks receive refs/setters as arguments — they hold almost no state of their own:

- [useSignaling.js](app/src/hooks/useSignaling.js) — Trystero room management (`initMyRoom`, `openCallChannel`, `closeCallChannel`, `sendSignal`) + the `handleSignal` dispatcher that processes every inbound message type.
- [usePeerConnection.js](app/src/hooks/usePeerConnection.js) — creates the `RTCPeerConnection`, wires `ontrack`/ICE/connection-state handlers, attaches local tracks, monitors bitrate.
- [useBroadcast.js](app/src/hooks/useBroadcast.js) — screen capture via `getDisplayMedia` (falls back to `getUserMedia` with `chromeMediaSource: "desktop"`), plus renegotiation when starting/stopping a broadcast.
- [useMicrophone.js](app/src/hooks/useMicrophone.js) — mic track add/remove/toggle/switch.
- [useStatusLog.js](app/src/hooks/useStatusLog.js) — the status message log shown in the sidebar.

**Signaling protocol.** Trystero (`@trystero-p2p/torrent`) uses BitTorrent DHT for serverless peer discovery. Each peer joins a Trystero room named after their own 12-char ID (`initMyRoom(selfId)`). To call someone, the caller joins the callee's room (`openCallChannel(calleeId)`) and waits for `onPeerJoin` (up to 30 s timeout) before sending the WebRTC offer. Signals flow through Trystero data channels; the media connection is a separate `RTCPeerConnection` managed by `usePeerConnection`. Message `type`s handled in `handleSignal`: `call`, `answer`, `candidate`, `renegotiate`, `renegotiate-answer`, `stop-broadcast`, `decline`, `cancel`, `hangup`. ICE candidates arriving before `remoteDescription` is set are buffered in `pendingIceRef` and flushed afterward. Idempotency refs (`answerProcessedRef`, `hangupProcessedRef`, `incomingProcessedRef`) guard against duplicate deliveries — reset via `resetSignalingRefs()` when starting a new call.

**Polite/impolite peer.** The caller is impolite (`isPoliteRef = false`), the accepter polite. This is the WebRTC perfect-negotiation role used to resolve glare during renegotiation.

**Connection lifecycle.** `handleCall` builds the offer; `handleAcceptCall` builds the answer; both then start the mic and attach local tracks. Connection recovery is automatic: `failed`/`disconnected` connection or ICE states trigger `pc.restartIce()`. `hangup()` in App.jsx is the central teardown — it closes the PC, stops tracks, clears all call state, and (optionally) notifies the peer.

**Quality / bitrate.** Resolution+fps presets and default bitrates live in [src/utils/rtcConfig.js](app/src/utils/rtcConfig.js). Quality is enforced two ways that work together: SDP munging (`setMaxBandwidthInSDP` in [sdpUtils.js](app/src/utils/sdpUtils.js)) sets `b=AS` bandwidth lines on every offer/answer, and sender `encodings` are set via `applyMaxQualityEncoding` in [bitrateManager.js](app/src/utils/bitrateManager.js). Changing `streamQuality` re-applies constraints, encodings, and SDP. `rtcConfig.js` also hardcodes STUN server IPs (in addition to hostnames) as a DNS-resolution fallback — there are **no TURN servers**, so peers behind symmetric NATs may fail to connect.

## App / OS behavior (main process)

- **Single-instance lock**: a second launch focuses the existing window.
- **Identity**: a random 12-char `[A-Z0-9]` ID (see [idUtils.cjs](app/src/utils/idUtils.cjs)) stored in `profile.json` under Electron's `userData` dir (`~/Library/Application Support/2peer/` on macOS, `%APPDATA%/2peer/` on Windows). "Update/Regenerate ID" rewrites it and re-joins the new Trystero room via `initMyRoom`.
- **Tray app**: closing the window hides it (app keeps running in the system tray); only the tray "Quit" / `app:quit` actually exits. On macOS the dock icon hides/shows with the window.
- **Auto-start at login**: enabled on both platforms; on Windows it launches with `--hidden` so the window starts hidden.
- **Screen source selection**: `setDisplayMediaRequestHandler` uses the OS-native picker (`useSystemPicker: true`); `pendingSourceId` (set via the in-app [SourcePicker](app/src/components/SourcePicker.jsx)) overrides which source is captured.
