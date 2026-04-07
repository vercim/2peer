const { app, BrowserWindow, ipcMain, desktopCapturer, session } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const WebSocket = require('ws');

// ─── Signaling server ─────────────────────────────────────────────────────────
const SIGNAL_PORT = 3030;
const signalClients = new Map();
let wss = null;

function startSignalingServer() {
  wss = new WebSocket.Server({ port: SIGNAL_PORT });

  function send(ws, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
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
      if (currentId && signalClients.get(currentId) === ws) {
        signalClients.delete(currentId);
      }
    });

    ws.on('error', (err) => {
      console.error('[WS] client error:', err.message);
    });
  });

  wss.on('error', (err) => {
    console.error('[WS] server error:', err.message);
  });
}

// ─── Profile ──────────────────────────────────────────────────────────────────
function getSettingsFile() {
  return path.join(app.getPath('userData'), 'profile.json');
}

function ensureProfile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(getSettingsFile(), 'utf8'));
    if (parsed && typeof parsed.id === 'string' && parsed.id.length >= 8) return parsed;
  } catch (_) {}
  const profile = { id: crypto.randomBytes(6).toString('hex') };
  fs.mkdirSync(path.dirname(getSettingsFile()), { recursive: true });
  fs.writeFileSync(getSettingsFile(), JSON.stringify(profile, null, 2));
  return profile;
}

function setProfile(profile) {
  fs.mkdirSync(path.dirname(getSettingsFile()), { recursive: true });
  fs.writeFileSync(getSettingsFile(), JSON.stringify(profile, null, 2));
}

// ─── Pending source selection ─────────────────────────────────────────────────
let pendingSourceId = null;

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 770,
    minWidth: 800,
    minHeight: 600,
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

// ─── IPC handlers (регистрируем ДО создания окна) ─────────────────────────────
function registerIpcHandlers() {
  ipcMain.handle('profile:get', () => ensureProfile());

  ipcMain.handle('profile:regen', () => {
    const profile = { id: crypto.randomBytes(6).toString('hex') };
    setProfile(profile);
    return profile;
  });

  // Совместим и с 'get-config' и с 'app:get-config'
  const configHandler = () => ({
    supabaseUrl: 'https://nsoavwoouwjkqktlxjyr.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zb2F2d29vdXdqa3FrdGx4anlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTAwMjgsImV4cCI6MjA5MTA4NjAyOH0.GIzWLsvtzdqsODDjDNB_ZVRvST6KMroOSIaz3p9IUCo'
  });
  ipcMain.handle('get-config', configHandler);
  ipcMain.handle('app:get-config', configHandler);

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
}

// ─── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startSignalingServer();
  registerIpcHandlers();

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
    } catch (err) {
      console.error('[displayMedia] error:', err.message);
      callback({ video: null, audio: false });
    }
  }, { useSystemPicker: true });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (wss) wss.close();
  if (process.platform !== 'darwin') app.quit();
});