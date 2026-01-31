import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
    getSystemStats: () => ipcRenderer.invoke('get-system-stats'),
    getSpotifyStatus: () => ipcRenderer.invoke('get-spotify-status'),
    getWeather: () => ipcRenderer.invoke('get-weather'),
    getDesktopSourceId: () => ipcRenderer.invoke('get-desktop-source-id'),
    controlMedia: (cmd: string) => ipcRenderer.invoke('control-media', cmd), // NEW
})
