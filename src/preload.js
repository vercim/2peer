const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getProfile:        () => ipcRenderer.invoke('profile:get'),
  regenerateProfile: () => ipcRenderer.invoke('profile:regen'),
  getConfig:         () => ipcRenderer.invoke('app:get-config'),
  getSources:        () => ipcRenderer.invoke('sources:get'),
  setPendingSource:  (id) => ipcRenderer.invoke('sources:set-pending', id),
  minimizeWindow:    () => ipcRenderer.invoke('window:minimize'),
  closeWindow:       () => ipcRenderer.invoke('window:close'),
  openFullscreen:    (videoType) => ipcRenderer.invoke('window:fullscreen-open', videoType),
  sendVideoUpdate:   (data) => ipcRenderer.send('fs:video-update', data),
  onFsVideoUpdate:   (cb) => ipcRenderer.on('fs:video-update', (_, data) => cb(data)),
  onFsClosed:        (cb) => ipcRenderer.on('fs:closed', () => cb()),
  onFsSetType:       (cb) => ipcRenderer.on('fs:set-type', (_, type) => cb(type)),
  getVersion:        () => ipcRenderer.invoke('app:version')
});