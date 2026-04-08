# 2peer

A peer-to-peer screen streaming application that connects two computers directly. No servers, no accounts — just share your ID with another user and start sharing.

## Features

- **Direct connection** — P2P between two participants with no intermediaries
- **Screen sharing** — broadcast your entire screen or individual windows
- **Fullscreen mode** — view peer's screen on your entire monitor
- **Picture-in-Picture** — keep peer's screen in the corner

## How to use

1. Launch the app
2. Copy your ID (click "Copy") and send it to your peer
3. Enter peer's ID in the "Peer ID" field and click "Call"
4. The peer will see an incoming call — have them click "Accept"
5. Click "Broadcast" to start sharing your screen

### Controls

- **Broadcast** — start sharing your screen
- **Change** — switch source (screen or window)
- **PiP** — enable picture-in-picture
- **Fullscreen** — expand peer's screen to full monitor

## Requirements

- Windows, macOS
- Internet access
- Screen capture permission

## Technical details

The app uses WebRTC for direct P2P connection. Supabase is only used as a signaling server to establish the connection — no data passes through it.
