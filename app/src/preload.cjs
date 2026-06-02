const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  getProfile: () => ipcRenderer.invoke("profile:get"),
  regenerateProfile: () => ipcRenderer.invoke("profile:regen"),
getSources: () => ipcRenderer.invoke("sources:get"),
  setPendingSource: (id) => ipcRenderer.invoke("sources:set-pending", id),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  getVersion: () => ipcRenderer.invoke("app:version"),
  checkForUpdate: () => ipcRenderer.invoke("app:check-update"),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),
  showNotification: (title, body) =>
    ipcRenderer.invoke("app:show-notification", { title, body }),
  quitApp: () => ipcRenderer.invoke("app:quit"),
  setLastCalledId: (id) => ipcRenderer.invoke("profile:set-last-called", id),
  setCallActive: (active) => ipcRenderer.invoke("app:set-call-active", active),
  onCallLast: (callback) => {
    ipcRenderer.on("call-last", (_, lastCalledId) => callback(lastCalledId));
  },
  onSetRemoteId: (callback) => {
    ipcRenderer.on("set-remote-id", (_, id) => callback(id));
  },
  onProfileUpdated: (callback) => {
    ipcRenderer.on("profile-updated", (_, profile) => callback(profile));
  },
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:set", settings),
});
