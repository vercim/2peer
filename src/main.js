const { app, BrowserWindow, ipcMain, desktopCapturer, session } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const WebSocket = require('ws');

// ─── Signaling server ─────────────────────────────────────────────────────────
const SIGNAL_PORT = 3030;
const signalClients = new Map();

function startSignalingServer() {
  const wss = new WebSocket.Server({ port: SIGNAL_PORT });
  function send(ws, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }
  wss.on('connection', (ws) => {
    let currentId = null;
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (_) { return; }
      if (msg.type === 'register') {
        currentId = String(msg.id || '').trim();
        if (!currentId) return;
        signalClients.set(currentId, ws);
        send(ws, { type: 'registered', id: currentId });
        return;
      }
      const targetId = String(msg.to || '').trim();
      const target = signalClients.get(targetId);
      if (!target) {
        send(ws, { type: 'error', message: `Пользователь ${targetId} не найден.` });
        return;
      }
      send(target, { ...msg, from: msg.from || currentId });
    });
    ws.on('close', () => {
      if (currentId && signalClients.get(currentId) === ws) signalClients.delete(currentId);
    });
  });
  console.log(`[signal] Embedded signaling server on ws://localhost:${SIGNAL_PORT}`);
}

// ─── Profile ──────────────────────────────────────────────────────────────────
const SETTINGS_FILE = path.join(app.getPath('userData'), 'profile.json');
function ensureProfile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (parsed && typeof parsed.id === 'string' && parsed.id.length >= 8) return parsed;
  } catch (_) {}
  const profile = { id: crypto.randomBytes(6).toString('hex') };
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(profile, null, 2));
  return profile;
}
function setProfile(profile) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(profile, null, 2));
}

// ─── Pending source selection ─────────────────────────────────────────────────
let pendingSourceId = null;

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer.html'));
  return win;
}

app.whenReady().then(() => {
  startSignalingServer();

  // Custom display media handler — uses pendingSourceId if set, else screen[0]
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      let source;
      if (pendingSourceId) {
        source = sources.find(s => s.id === pendingSourceId) || sources[0];
        pendingSourceId = null;
      } else {
        source = sources[0];
      }
      callback({ video: source, audio: false });
    } catch (_) {
      callback({ video: null, audio: false });
    }
  }, { useSystemPicker: true });

  ipcMain.handle('profile:get', () => ensureProfile());
  ipcMain.handle('profile:regen', () => {
    const profile = { id: crypto.randomBytes(6).toString('hex') };
    setProfile(profile);
    return profile;
  });
  ipcMain.handle('app:get-config', () => ({
    signalServerUrl: process.env.SIGNAL_SERVER_URL || 'ws://26.156.250.104:3030'
  }));
  ipcMain.handle('sources:get', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
      isScreen: s.id.startsWith('screen:')
    }));
  });
  ipcMain.handle('sources:set-pending', (_, sourceId) => {
    pendingSourceId = sourceId;
  });
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
