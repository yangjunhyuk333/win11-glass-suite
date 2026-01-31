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
                        thumbnail: json.thumbnailPath ? `file:///${json.thumbnailPath.replace(/\\/g, '/')}` : ''
                    };


                    // PERSISTENCE LOGIC: If new status is empty or just "Spotify" idle text, keep real song info
                    const isIdle = !newStatus.title || newStatus.title.toLowerCase() === 'spotify' || newStatus.title.toLowerCase() === 'spotify premium' || newStatus.title.toLowerCase() === 'spotify free';

                    if (isIdle && lastMediaStatus.title && lastMediaStatus.title.toLowerCase() !== 'spotify') {
                        newStatus.title = lastMediaStatus.title;
                        newStatus.artist = lastMediaStatus.artist;
                        newStatus.thumbnail = lastMediaStatus.thumbnail;
                        newStatus.isPlaying = false; // It's idle/paused, so force false
                    }


                    // ITUNES FALLBACK (Re-enabled by User)
                    if (!newStatus.thumbnail && newStatus.title && newStatus.artist) {
                        const artist = newStatus.artist;
                        const title = newStatus.title;
                        const cacheKey = `${artist}|${title}`;

                        if (cacheKey !== lastFetchedQuery) {
                            lastFetchedQuery = cacheKey;
                            lastMediaStatus.thumbnail = '';

                            console.log(`[MediaAgent] Robust fetch for: ${artist} - ${title}`);
                            fetchThumbnailFromItunes(title, artist).then(url => {
                                if (url) {
                                    console.log(`[MediaAgent] iTunes Art Found: ${url}`);
                                    lastMediaStatus.thumbnail = url;
                                }
                            });
                        } else {
                            if (lastMediaStatus.thumbnail && lastMediaStatus.thumbnail.startsWith('http')) {
                                newStatus.thumbnail = lastMediaStatus.thumbnail;
                            }
                        }
                    } else if (newStatus.title !== lastMediaStatus.title) {
                        lastFetchedQuery = '';
                        // CRITICAL FIX: Reset thumbnail if title changed but we have no new thumb yet
                        // This prevents showing the OLD song's art while the new one is loading/missing
                        newStatus.thumbnail = '';
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
        console.log(`[MediaAgent] Exited. Restarting in 2s...`);
        mediaAgent = null;
        setTimeout(startMediaAgent, 2000);
    });
}
let lastFetchedQuery = '';

function fetchThumbnailFromItunes(title: string, artist: string): Promise<string> {
    const cleanStr = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanTitle = (t: string) => t.replace(/\(feat\. .*?\)|\[.*?\]|feat\..*$/gi, '').trim();
    const hasCJK = (s: string) => /[^\x00-\x7F]/.test(s);

    const trySearch = (query: string, expectedArtist: string): Promise<string> => {
        return new Promise((resolve) => {
            const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=5`;
            https.get(url, (res) => {
                let data = Buffer.alloc(0);
                res.on('data', (chunk) => data = Buffer.concat([data, chunk]));
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data.toString('utf8'));
                        if (json.resultCount > 0) {
                            const targetArtist = cleanStr(expectedArtist);
                            const artists = expectedArtist.split(/[,&/]|feat\./i).map(a => a.trim()).filter(a => a);

                            for (const item of json.results) {
                                const foundArtist = cleanStr(item.artistName || '');

                                // Match Logic:
                                // 1. Full string match
                                if (foundArtist === targetArtist || foundArtist.includes(targetArtist) || targetArtist.includes(foundArtist)) {
                                    resolve(item.artworkUrl100.replace('100x100', '600x600'));
                                    return;
                                }
                                // 2. First artist match (for collaborations)
                                if (artists.length > 0) {
                                    const first = cleanStr(artists[0]);
                                    if (foundArtist.includes(first) || first.includes(foundArtist)) {
                                        resolve(item.artworkUrl100.replace('100x100', '600x600'));
                                    }
                                }
                                // 3. CJK Fuzzy inclusion
                                if (hasCJK(expectedArtist)) {
                                    if (item.artistName.includes(expectedArtist) || expectedArtist.includes(item.artistName)) {
                                        resolve(item.artworkUrl100.replace('100x100', '600x600'));
                                        return;
                                    }
                                }
                            }
                        }
                        resolve('');
                    } catch { resolve(''); }
                });
            }).on('error', () => resolve(''));
        });
    };

    return new Promise(async (resolve) => {
        // Pass 1: Full Artist + Title
        let url = await trySearch(`${artist} ${title}`, artist);
        if (url) return resolve(url);

        // Pass 2: Artist + Cleaned Title (Remove feat/remix tags)
        const t2 = cleanTitle(title);
        if (t2 !== title) {
            url = await trySearch(`${artist} ${t2}`, artist);
            if (url) return resolve(url);
        }

        // Pass 3: Title Only (Search broadly, then check artist in results)
        url = await trySearch(t2 || title, artist);
        if (url) return resolve(url);

        // Pass 4: First Artist Only + Title (For cases where 'Artist A, Artist B' fails)
        const artists = artist.split(/[,&/]|feat\./i).map(a => a.trim()).filter(a => a);
        if (artists.length > 1) {
            url = await trySearch(`${artists[0]} ${t2 || title}`, artists[0]);
            if (url) return resolve(url);
        }

        resolve('');
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
    if (mediaAgent && mediaAgent.stdin) {
        console.log(`[MediaControl] Sending command to agent: ${cmd}`);
        mediaAgent.stdin.write(cmd + '\n');
        return true;
    }
    console.error(`[MediaControl] ERROR: MediaAgent is not running or stdin not available`);
    return false;
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
