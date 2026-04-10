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
} = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

if (process.platform === "win32") {
  app.setAppUserModelId("2peer");
}

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
);
const APP_VERSION = packageJson.version;

function getSettingsFile() {
  return path.join(app.getPath("userData"), "profile.json");
}
function ensureProfile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(getSettingsFile(), "utf8"));
    if (parsed && typeof parsed.id === "string" && parsed.id.length >= 8)
      return { ...parsed, lastCalledId: parsed.lastCalledId || "" };
  } catch (_) {}
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  const bytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) {
    id += chars[bytes[i] % chars.length];
  }
  const profile = { id, lastCalledId: "" };
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

let pendingSourceId = null;
let tray = null;
let isQuitting = false;
const args = process.argv.slice(1);

function buildTrayMenu() {
  const lastCalled = getLastCalledId();
  const menuTemplate = [
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
            label: "Call last id",
            click: () => {
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

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (process.platform === "darwin") {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true,
      });
    } else if (process.platform === "win32") {
      app.setLoginItemSettings({
        openAtLogin: true,
        args: ["--hidden"],
      });
    }

    registerIpcHandlers();

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
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAA7AAAAOwBeShxvQAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAGfSURBVFiF7ZY9TsNAEIW/WRsJKChyAe6RK9A7cQNKJS5AT8ENKJW4ABUoKVBQoEuRC1Aok5CQNiQn2Rkva9bOxoDQsjP72n8e29nEGGP+T1L+HwP7wD5QAhZAA/gE3IBdYBuo/mXADnAKPAFvwAiwDdwGpoCJUwQngXPgEbgH3AL3QOkKsgWcA+fAE7ABbAH3QBkwBM6BV+AR2AQugBJQBM6AN+AZ2ACugCKQBy6AO+AJWAcuARlAClgGroBbIA9cAjJAHjgHboFbIA9cALLALXAe/PwK4E8BEsA5cAvIA+eADDADrADPgAwwDawC5UAmUAqU/9fA/8c4D4BToA4sA+f/+4DL4C+QCRSBJeDs/zlwHvgIXAEy/3dgJSAPnAAvgUugCFwC/gIog2XgGLgKXAJf/wugBBaBI+A0+N0E/gL+FwJnoBTYDhaBY+AqMAv8BSgBJSAHXASPgOPABSCBAngB3AQugZf/RVAESsAOcBY8Bo6AY0ACBfASuAueAVeBc+DzXwBl8Bi4Cp4Cx8AxIIECeAXcB8+Bq+ApcPIPgEvAcfAYOAaOgf8A5ICj4DFwHDwGjgF3AP8BUAMu/10ATwPO/wGQ+wdJ6g9M1Yq/GAAAAABJRU5ErkJggg==",
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

    createTray();
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
  // Determine if we're running in development or production
  const isDev = !app.isPackaged;

  // In development, dist is in the project root
  // In production, dist is next to the main entry point (src folder)
  let indexPath;
  let preloadPath;

  if (isDev) {
    indexPath = path.join(__dirname, "..", "dist", "index.html");
    preloadPath = path.join(__dirname, "preload.cjs");
  } else {
    // In production (packaged app), files are in app.asar
    indexPath = path.join(__dirname, "..", "dist", "index.html");
    preloadPath = path.join(__dirname, "preload.cjs");
  }

  const isLaunchedAsHidden = args.includes("--hidden");
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 770,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    show: !isLaunchedAsHidden,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(indexPath);

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (process.platform === "darwin") {
        app.dock.hide();
      }
    }
  });

  mainWindow.on("show", () => {
    if (process.platform === "darwin") {
      app.dock.show();
    }
  });

  // if (isDev) {
  //   mainWindow.webContents.openDevTools();
  // }

  return mainWindow;
}

function registerIpcHandlers() {
  ipcMain.handle("profile:get", () => ensureProfile());
  ipcMain.handle("profile:regen", () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let id = "";
    const bytes = crypto.randomBytes(12);
    for (let i = 0; i < 12; i++) {
      id += chars[bytes[i] % chars.length];
    }
    const current = JSON.parse(fs.readFileSync(getSettingsFile(), "utf8"));
    const profile = { id, lastCalledId: current?.lastCalledId || "" };
    setProfile(profile);
    return profile;
  });
  ipcMain.handle("profile:get-last-called", () => getLastCalledId());
  ipcMain.handle("profile:set-last-called", (_, lastCalledId) => {
    setLastCalledId(lastCalledId);
    updateTrayMenu();
  });
  const configHandler = () => ({
    supabaseUrl: "https://nsoavwoouwjkqktlxjyr.supabase.co",
    supabaseKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zb2F2d29vdXdqa3FrdGx4anlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTAwMjgsImV4cCI6MjA5MTA4NjAyOH0.GIzWLsvtzdqsODDjDNB_ZVRvST6KMroOSIaz3p9IUCo",
  });
  ipcMain.handle("get-config", configHandler);
  ipcMain.handle("app:get-config", configHandler);
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
