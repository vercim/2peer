const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  session,
  Tray,
  Menu,
  Notification,
  nativeImage,
  shell,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { generateId, validateIdFormat } = require("./utils/idUtils.cjs");

if (process.platform === "win32") {
  app.setAppUserModelId("2peer");
}

// Dev convenience: `electron . --clone` (or any --clone=<name>) runs an isolated
// second instance with its own userData dir → its own profile.json / ID. Because
// the single-instance lock is keyed to userData, both instances run at once, so
// you can call yourself between them while testing.
const cloneArg = process.argv.find((a) => a.startsWith("--clone"));
if (cloneArg) {
  const suffix = cloneArg.includes("=") ? cloneArg.split("=")[1] : "clone";
  app.setPath("userData", `${app.getPath("userData")}-${suffix}`);
}

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
);
const APP_VERSION = packageJson.version;
const GITHUB_RELEASES_PAGE = "https://github.com/vercim/2peer/releases/latest";
const GITHUB_LATEST_API =
  "https://api.github.com/repos/vercim/2peer/releases/latest";

// Compare two semver-ish strings ("1.2.3"). Returns true if `latest` > `current`.
function isNewerVersion(latest, current) {
  const parse = (v) =>
    String(v)
      .replace(/^v/i, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

async function checkForUpdate() {
  try {
    const res = await fetch(GITHUB_LATEST_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return { updateAvailable: false };
    const data = await res.json();
    const latestVersion = (data.tag_name || data.name || "").replace(/^v/i, "");
    if (!latestVersion) return { updateAvailable: false };
    return {
      updateAvailable: isNewerVersion(latestVersion, APP_VERSION),
      latestVersion,
      url: data.html_url || GITHUB_RELEASES_PAGE,
    };
  } catch (_) {
    return { updateAvailable: false };
  }
}

function getSettingsFile() {
  return path.join(app.getPath("userData"), "profile.json");
}

function getAppSettingsFile() {
  return path.join(app.getPath("userData"), "settings.json");
}

const DEFAULT_APP_SETTINGS = {
  // App
  accentColor: "#22C79C",
  theme: "dark",
  fontSize: 14,
  soundEnabled: true,
  reduceMotion: false,
  monochromatic: false,
  // Network
  resolution: "1080p",
  fps: 60,
  streamAudio: true,
  trafficLimits: { enabled: false, uploadGB: 50, downloadGB: 50 },
  // System
  callNotifications: true,
  updateNotifications: true,
  startAtLogin: true,
  trayEnabled: true,
  minimizeToTray: true,
};

function loadAppSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(getAppSettingsFile(), "utf8"));
    return { ...DEFAULT_APP_SETTINGS, ...raw };
  } catch (_) {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

function saveAppSettings(settings) {
  const merged = { ...DEFAULT_APP_SETTINGS, ...settings };
  fs.mkdirSync(path.dirname(getAppSettingsFile()), { recursive: true });
  fs.writeFileSync(getAppSettingsFile(), JSON.stringify(merged, null, 2));
  return merged;
}

function applyLoginSetting(startAtLogin) {
  if (process.platform === "darwin") {
    app.setLoginItemSettings({ openAtLogin: startAtLogin, openAsHidden: true });
  } else if (process.platform === "win32") {
    app.setLoginItemSettings({ openAtLogin: startAtLogin, args: ["--hidden"] });
  }
}
function ensureProfile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(getSettingsFile(), "utf8"));
    if (parsed && validateIdFormat(parsed.id))
      return { ...parsed, lastCalledId: parsed.lastCalledId || "" };
  } catch (_) {}
  const profile = { id: generateId(), lastCalledId: "" };
  fs.mkdirSync(path.dirname(getSettingsFile()), { recursive: true });
  fs.writeFileSync(getSettingsFile(), JSON.stringify(profile, null, 2));
  return profile;
}
function setProfile(profile) {
  fs.mkdirSync(path.dirname(getSettingsFile()), { recursive: true });
  fs.writeFileSync(getSettingsFile(), JSON.stringify(profile, null, 2));
}
function getLastCalledId() {
  try {
    const parsed = JSON.parse(fs.readFileSync(getSettingsFile(), "utf8"));
    return parsed.lastCalledId || "";
  } catch (_) {
    return "";
  }
}
function setLastCalledId(lastCalledId) {
  try {
    const parsed = JSON.parse(fs.readFileSync(getSettingsFile(), "utf8"));
    parsed.lastCalledId = lastCalledId;
    fs.writeFileSync(getSettingsFile(), JSON.stringify(parsed, null, 2));
  } catch (_) {}
}

let mainWindow = null;
let pendingSourceId = null;
let tray = null;
let isQuitting = false;
let isCallActive = false;
let minimizeToTray = true;
let trayEnabled = true;
const args = process.argv.slice(1);

function buildTrayMenu() {
  const lastCalled = getLastCalledId();
  const currentProfile = ensureProfile();
  const menuTemplate = [
    {
      label: `Your ID: ${currentProfile.id}`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Update ID",
      enabled: !isCallActive,
      click: () => {
        if (isCallActive) return;
        const current = JSON.parse(fs.readFileSync(getSettingsFile(), "utf8"));
        const profile = {
          id: generateId(),
          lastCalledId: current?.lastCalledId || "",
        };
        setProfile(profile);
        updateTrayMenu();
        if (mainWindow) {
          mainWindow.webContents.send("profile-updated", profile);
        }
      },
    },
    {
      label: "Copy ID",
      click: () => {
        const profile = ensureProfile();
        require("electron").clipboard.writeText(profile.id);
      },
    },
    { type: "separator" },
    {
      label: "Show 2peer",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    ...(lastCalled
      ? [
          {
            label: "Call the last",
            enabled: !isCallActive,
            click: () => {
              if (isCallActive) return;
              if (mainWindow) {
                mainWindow.show();
                mainWindow.focus();
                mainWindow.webContents.send("set-remote-id", lastCalled);
              }
            },
          },
        ]
      : []),
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ];
  return Menu.buildFromTemplate(menuTemplate);
}

function updateTrayMenu() {
  if (tray) {
    tray.setContextMenu(buildTrayMenu());
  }
}

function createTray() {
  const iconPath = path.join(__dirname, "..", "assets", "icon.png");
  let trayIcon;
  try {
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage
        .createFromPath(iconPath)
        .resize({ width: 16, height: 16 });
    } else {
      trayIcon = nativeImage.createEmpty();
    }
  } catch (_) {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(
    trayIcon.isEmpty()
      ? nativeImage.createFromDataURL(
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAA7AAAAOwBeShxvQAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAGfSURBVFiF7ZY9TsNAEIW/WRsJKChyAe6RK9A7cQNKJS5AT8ENKJW4ABUoKVBQoEuRC1Aok5CQNiQn2Rkva9bOxoDQsjP72n8e29nEGGP+T1L+HwP7wD5QAhZAA/gE3IBdYBuo/mXADnAKPAFvwAiwDdwGpoCJUwQngXPgEbgH3AL3QOkKsgWcA+fAE7ABbAL3QBkwBM6BV+AR2AQugBJQBM6AN+AZ2ACugCKQBy6AO+AJWAcuARlAClgGroBbIA9cAjJAHjgHboFbIA9cALLALXAe/PwK4E8BEsA5cAvIA+eADDADrADPgAwwDawC5UAmUAqU/9fA/8c4D4BToA4sA+f/+4DL4C+QCRSBJeDs/zlwHvgIXAEy/3dgJSAPnAAvgUugCFwC/gIog2XgGLgKXAJf/wugBBaBI+A0+N0E/gL+FwJnoBTYDhaBY+AqMAv8BSgBJSAHXASPgOPABSCBAngB3AQugZf/RVAESsAOcBY8Bo6AY0ACBfASuAueAVeBc+DzXwBl8Bi4Cp4Cx8AxIIECeAXcB8+Bq+ApcPIPgEvAcfAYOAaOgf8A5ICj4DFwHDwGjgF3AP8BUAMu/10ATwPO/wGQ+wdJ6g9M1Yq/GAAAAABJRU5ErkJggg==",
        )
      : trayIcon,
  );

  tray.setToolTip("2peer");
  tray.setContextMenu(buildTrayMenu());

  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      if (process.platform === "darwin") {
        app.dock.show();
      }
    }
  });
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    const initialSettings = loadAppSettings();
    applyLoginSetting(initialSettings.startAtLogin);
    minimizeToTray = initialSettings.minimizeToTray !== false;
    trayEnabled = initialSettings.trayEnabled !== false;

    registerIpcHandlers();

    if (trayEnabled) {
      createTray();
    }
    session.defaultSession.setDisplayMediaRequestHandler(
      async (_req, callback) => {
        try {
          const sources = await desktopCapturer.getSources({
            types: ["screen", "window"],
          });
          let source;
          if (pendingSourceId) {
            source =
              sources.find((s) => s.id === pendingSourceId) || sources[0];
            pendingSourceId = null;
          } else {
            source = sources[0];
          }
          callback({ video: source, audio: true });
        } catch (err) {
          console.error("[displayMedia] error:", err.message);
          callback({ video: null, audio: false });
        }
      },
      { useSystemPicker: true },
    );
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

function createWindow() {
  const indexPath = path.join(__dirname, "..", "dist", "index.html");
  const preloadPath = path.join(__dirname, "preload.cjs");

  const isLaunchedAsHidden = args.includes("--hidden");
  const isMac = process.platform === "darwin";
  mainWindow = new BrowserWindow({
    width: 850,
    height: 700,
    minWidth: 720,
    minHeight: 540,
    ...(isMac
      ? { titleBarStyle: "hidden", trafficLightPosition: { x: 13, y: 13 } }
      : { frame: false }),
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    show: !isLaunchedAsHidden,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  mainWindow.loadFile(indexPath);

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      if (minimizeToTray && tray) {
        event.preventDefault();
        mainWindow.hide();
        if (process.platform === "darwin") {
          app.dock.hide();
        }
      }
      // else: allow window to close naturally
    }
  });

  mainWindow.on("show", () => {
    if (process.platform === "darwin") {
      app.dock.show();
    }
  });

  return mainWindow;
}

function registerIpcHandlers() {
  ipcMain.handle("profile:get", () => ensureProfile());
  ipcMain.handle("profile:regen", () => {
    if (isCallActive) return null;
    const current = JSON.parse(fs.readFileSync(getSettingsFile(), "utf8"));
    const profile = {
      id: generateId(),
      lastCalledId: current?.lastCalledId || "",
    };
    setProfile(profile);
    updateTrayMenu();
    return profile;
  });
  ipcMain.handle("profile:get-last-called", () => getLastCalledId());
  ipcMain.handle("profile:set-last-called", (_, lastCalledId) => {
    setLastCalledId(lastCalledId);
    updateTrayMenu();
  });
  ipcMain.handle("app:set-call-active", (_, active) => {
    isCallActive = !!active;
    updateTrayMenu();
  });
  ipcMain.handle("sources:get", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
      isScreen: s.id.startsWith("screen:"),
    }));
  });
  ipcMain.handle("sources:set-pending", (_, sourceId) => {
    pendingSourceId = sourceId;
  });
  ipcMain.handle("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle("app:version", () => APP_VERSION);
  ipcMain.handle("app:check-update", () => checkForUpdate());
  ipcMain.handle("app:open-external", (_, url) => {
    shell.openExternal(url || GITHUB_RELEASES_PAGE);
  });
  ipcMain.handle("app:show-notification", (_, { title, body }) => {
    if (!Notification.isSupported()) return;
    if (mainWindow && mainWindow.isVisible()) return;

    const iconPath = path.join(__dirname, "..", "assets", "icon.png");
    const notification = new Notification({
      title: title,
      body: body,
      silent: false,
      icon: fs.existsSync(iconPath) ? iconPath : undefined,
    });
    notification.on("click", () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
        if (process.platform === "darwin") {
          app.dock.show();
        }
      }
    });
    notification.show();
  });
  ipcMain.handle("app:quit", () => {
    isQuitting = true;
    app.quit();
  });
  ipcMain.handle("settings:get", () => loadAppSettings());
  ipcMain.handle("settings:set", (_, settings) => {
    const saved = saveAppSettings(settings);
    applyLoginSetting(saved.startAtLogin);
    minimizeToTray = saved.minimizeToTray !== false;
    trayEnabled = saved.trayEnabled !== false;
    if (trayEnabled && !tray) {
      createTray();
    } else if (!trayEnabled && tray) {
      tray.destroy();
      tray = null;
    } else if (tray) {
      updateTrayMenu();
    }
    return saved;
  });
}

app.on("window-all-closed", () => {
  if (process.platform === "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});
