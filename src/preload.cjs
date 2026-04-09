const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getProfile: () => ipcRenderer.invoke("profile:get"),
  regenerateProfile: () => ipcRenderer.invoke("profile:regen"),
  getConfig: () => ipcRenderer.invoke("app:get-config"),
  getSources: () => ipcRenderer.invoke("sources:get"),
  setPendingSource: (id) => ipcRenderer.invoke("sources:set-pending", id),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  getVersion: () => ipcRenderer.invoke("app:version"),
  showNotification: (title, body) =>
    ipcRenderer.invoke("app:show-notification", { title, body }),
  quitApp: () => ipcRenderer.invoke("app:quit"),
});
