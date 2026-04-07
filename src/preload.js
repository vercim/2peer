const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getProfile:        () => ipcRenderer.invoke('profile:get'),
  regenerateProfile: () => ipcRenderer.invoke('profile:regen'),
  getConfig:         () => ipcRenderer.invoke('app:get-config'),
  getSources:        () => ipcRenderer.invoke('sources:get'),
  setPendingSource:  (id) => ipcRenderer.invoke('sources:set-pending', id),
  minimizeWindow:    () => ipcRenderer.invoke('window:minimize'),
  closeWindow:       () => ipcRenderer.invoke('window:close'),
  openFullscreen:    () => ipcRenderer.invoke('window:fullscreen'),
  sendVideoToFs:     (stream) => ipcRenderer.send('fs:video', stream),
  onFsVideo:         (cb) => ipcRenderer.on('fs:video', (_, stream) => cb(stream)),
  onFsClosed:        (cb) => ipcRenderer.on('fs:closed', () => cb()),
  getVersion:        () => ipcRenderer.invoke('app:version')
});