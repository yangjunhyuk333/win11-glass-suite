// @ts-nocheck
import { app, BrowserWindow, ipcMain, desktopCapturer, shell } from 'electron'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import https from 'https'
import si from 'systeminformation'

const isDev = !app.isPackaged;
const ROOT_PATH = path.join(__dirname, '../');
process.env.VITE_PUBLIC = isDev ? path.join(ROOT_PATH, 'public') : process.env.DIST || path.join(__dirname, '../dist');
const RESOURCES_PATH = isDev ? path.join(ROOT_PATH, 'resources') : path.join(process.resourcesPath, 'resources');

let win: BrowserWindow | null = null

// --- UNIFIED MEDIA AGENT ---
let mediaAgent: ChildProcess | null = null;
let lastMediaStatus: any = { isPlaying: false, title: '', artist: '', thumbnail: '' };

function startMediaAgent() {
    if (mediaAgent && !mediaAgent.killed) return;
    stopServices();

    const scriptPath = path.join(RESOURCES_PATH, 'MediaAgent.ps1');
    const finalPath = fs.existsSync(scriptPath) ? scriptPath : path.join(__dirname, '../resources/MediaAgent.ps1');

    console.log(`[MediaAgent] Starting: ${finalPath}`);

    // Spawn PowerShell with -Mta for WinRT compatibility
    mediaAgent = spawn('powershell.exe', ['-Mta', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', finalPath], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    mediaAgent.stdin?.setDefaultEncoding('utf-8');

    mediaAgent.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('{')) continue;
            try {
                const json = JSON.parse(trimmed);
                if (json.status === 'ready') {
                    console.log('[MediaAgent] Ready');
                } else if (!json.error) {
                    const newStatus = {
                        isPlaying: json.isPlaying || false,
                        title: json.title || '',
                        artist: json.artist || '',
                        thumbnail: json.thumbnailPath || ''
                    };

                    // PERSISTENCE LOGIC: If new status is empty, keep old info
                    if (!newStatus.title && !newStatus.artist && lastMediaStatus.title) {
                        newStatus.title = lastMediaStatus.title;
                        newStatus.artist = lastMediaStatus.artist;
                        newStatus.thumbnail = lastMediaStatus.thumbnail; // Keep thumb too
                        newStatus.isPlaying = false; // Force paused state
                    }

                    // ITUNES FALLBACK
                    if (!newStatus.thumbnail && newStatus.title && newStatus.artist) {
                        const query = `${newStatus.artist} ${newStatus.title}`;
                        if (query !== lastFetchedQuery) {
                            lastFetchedQuery = query;
                            console.log(`[MediaAgent] Fetching iTunes art for: ${query}`);
                            fetchThumbnailFromItunes(query).then(url => {
                                if (url) {
                                    console.log(`[MediaAgent] iTunes Art Found: ${url}`);
                                    lastMediaStatus.thumbnail = url;
                                } else {
                                    console.log(`[MediaAgent] iTunes Art Not Found for: ${query}`);
                                }
                            });
                        } else {
                            // Keep existing thumb if same song
                            if (lastMediaStatus.thumbnail && lastMediaStatus.thumbnail.startsWith('http')) {
                                newStatus.thumbnail = lastMediaStatus.thumbnail;
                            }
                        }
                    } else if (newStatus.title !== lastMediaStatus.title) {
                        lastFetchedQuery = '';
                    }

                    lastMediaStatus = {
                        ...newStatus,
                        thumbnail: newStatus.thumbnail || lastMediaStatus.thumbnail
                    };
                }
            } catch (e) { }
        }
    });

    mediaAgent.stderr?.on('data', (data) => {
        console.error(`[MediaAgent] Log: ${data}`);
    });

    mediaAgent.on('exit', (code) => {
        console.log(`[MediaAgent] Exited. Restarting in 5s...`);
        mediaAgent = null;
        setTimeout(startMediaAgent, 5000);
    });
}
let lastFetchedQuery = '';

function fetchThumbnailFromItunes(query: string): Promise<string> {
    return new Promise((resolve) => {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=1`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.resultCount > 0 && json.results[0].artworkUrl100) {
                        resolve(json.results[0].artworkUrl100.replace('100x100', '600x600'));
                    } else {
                        resolve('');
                    }
                } catch { resolve(''); }
            });
        }).on('error', () => resolve(''));
    });
}

function stopServices() {
    if (mediaAgent) {
        mediaAgent.kill();
        mediaAgent = null;
    }
}

function createWindow() {
    win = new BrowserWindow({
        width: 420, height: 780, x: 100, y: 100,
        icon: path.join(process.env.VITE_PUBLIC || '', 'electron-vite.svg'),
        frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false, contextIsolation: true, backgroundThrottling: false, webSecurity: false
        },
    });

    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

// IPC
ipcMain.handle('get-system-stats', async () => {
    try { const [c, m] = await Promise.all([si.currentLoad(), si.mem()]); return { cpu: Math.round(c.currentLoad), mem: Math.round((m.active / m.total) * 100) }; } catch { return { cpu: 0, ram: 0 }; }
});
ipcMain.handle('get-desktop-source-id', async () => {
    try { const s = await desktopCapturer.getSources({ types: ['screen'] }); return s[0]?.id; } catch { return null; }
});
ipcMain.handle('get-weather', async () => {
    return new Promise(r => { https.get('https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&current_weather=true', res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { const j = JSON.parse(d); r({ temp: j.current_weather.temperature, code: j.current_weather.weathercode }) } catch { r({ temp: 12, code: 1 }) } }) }).on('error', () => r({ temp: 12, code: 1 })); });
});

ipcMain.handle('control-media', async (_, cmd) => {
    // Spawn transient process for reliability
    const scriptPath = path.join(RESOURCES_PATH, 'control_media.ps1');
    const finalPath = fs.existsSync(scriptPath) ? scriptPath : path.join(__dirname, '../resources/control_media.ps1');

    spawn('powershell.exe', ['-Mta', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', finalPath, cmd]);
    return true;
});

ipcMain.handle('get-spotify-status', async () => {
    return lastMediaStatus;
});

app.whenReady().then(() => {
    startMediaAgent();
    createWindow();
});

app.on('before-quit', () => stopServices());
app.on('window-all-closed', () => { stopServices(); if (process.platform !== 'darwin') app.quit(); });
