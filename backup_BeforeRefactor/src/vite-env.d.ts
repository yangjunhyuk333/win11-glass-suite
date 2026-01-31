/// <reference types="vite/client" />

interface Window {
    electronAPI: {
        getSystemStats: () => Promise<{ cpu: number, mem: number }>;
        getSpotifyStatus: () => Promise<any>;
        getWeather: () => Promise<any>;
        getDesktopSourceId: () => Promise<string>;
        controlMedia: (cmd: string) => Promise<boolean>;
    }
}


interface SystemStats {
    cpu: number;
    mem: number;
    memUsed: string;
    memTotal: string;
    battery: number;
    charging: boolean;
}

interface SpotifyStatus {
    isPlaying: boolean;
    title: string;
    artist?: string;
    thumbnail?: string; // Base64
}

interface Weather {
    temp: number;
    code: number;
}

interface ElectronAPI {
    getSystemStats: () => Promise<SystemStats>;
    getSpotifyStatus: () => Promise<SpotifyStatus>;
    getWeather: () => Promise<Weather>;
    openExternal: (url: string) => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
