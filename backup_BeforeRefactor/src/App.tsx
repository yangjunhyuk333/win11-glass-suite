// @ts-nocheck
import styled, { createGlobalStyle, keyframes, css } from 'styled-components';
import * as React from 'react';
import { useState, useEffect } from 'react';

// --- ICONS (Scaled Down slightly if needed) ---
const PlayIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>;
const PauseIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>;
const NextIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>;
const PrevIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>;
const VolUpIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>;
const VolDownIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>;

// Increased Noise for "Steamy" look
const NOISE_SVG = `data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.09'/%3E%3C/svg%3E`;

const GlobalStyle = createGlobalStyle`
  body, html { margin: 0; padding: 0; width: 100%; height: 100%; font-family: 'Segoe UI', sans-serif; background: transparent !important; overflow: hidden; user-select: none; }
  #root { background: transparent !important; width: 100%; height: 100%; }
  * { box-sizing: border-box; outline: none; }
`;

const FadeIn = keyframes`from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); }`;
const bounce = keyframes`0%, 20%, 50%, 80%, 100% {transform: translateY(0);} 40% {transform: translateY(-10px);} 60% {transform: translateY(-5px);}`;

const AppWrapper = styled.div`
  /* TIGHTER invisible padding for smaller window */
  padding: 0; 
  width: 100vw; height: 100vh;
  display: flex; justify-content: center; align-items: center;
  background: transparent;
`;

const FrostyContainer = styled.div<{ $locked: boolean }>`
  /* COMPACT FIXED DIMENSIONS (Target: Window 420x780) -> Container ~380x730 gives more vertical room */
  width: 380px; height: 730px; 
  background: rgba(25, 25, 30, 0.4); /* Reduced opacity */
  backdrop-filter: blur(80px) saturate(200%); 
  
  /* NO BORDER to prevent square lines */
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 44px;
  
  /* SUPER SOFT SHADOW: Minimizing the "black box" effect */
  box-shadow: 0 5px 20px rgba(0,0,0,0.15);
    
  position: relative; overflow: hidden; transition: all 0.3s ease;
  
  &::before { content: ''; position: absolute; inset: 0; background: url("${NOISE_SVG}"); opacity: 0.15; pointer-events: none; z-index: 0; mix-blend-mode: overlay; }
  -webkit-app-region: ${props => props.$locked ? 'no-drag' : 'drag'};
`;

// --- PINNED LAYOUT (SCALED DOWN) ---

// 1. Header: Primary Drag Handle
const Header = styled.div<{ $locked: boolean }>` 
  position: absolute; top: 0; left: 0; right: 0; height: 70px;
  display: flex; justify-content: space-between; align-items: center; 
  padding: 0 25px; 
  z-index: 1000; -webkit-app-region: ${props => props.$locked ? 'no-drag' : 'drag'};
`;

const HeaderTitle = styled.div`
  font-size: 11px; fontWeight: 800; opacity: 0.5; letter-spacing: 2px;
  pointer-events: none;
`;

// 2. BottomDock: Secondary Drag Handle
const BottomDock = styled.div<{ $mode: string; $locked: boolean }>`
  position: absolute; bottom: 0; left: 0; right: 0; height: 80px;
  display: flex; justify-content: space-between; align-items: center;
  padding: 0 35px 15px 35px;
  z-index: 1000; -webkit-app-region: ${props => props.$locked ? 'no-drag' : 'drag'};
`;

// 3. ContentArea: No Drag (Interactable/Scrollable)
const ContentArea = styled.div`
  position: absolute;
  top: 70px;    
  bottom: 80px; 
  left: 0; right: 0;
  
  display: flex; flex-direction: column; 
  align-items: center; justify-content: flex-start;
  padding: 0 20px;
  overflow-y: auto; 
  -webkit-app-region: no-drag; /* CONTENT IS NOT DRAGGABLE */
  &::-webkit-scrollbar { display: none; }
`;

const IconButton = styled.button`
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.06); 
  color: inherit; opacity: 0.7; cursor: pointer; 
  border-radius: 50%; width: 38px; height: 38px; 
  display: flex; align-items: center; justify-content: center; 
  transition: all 0.2s; pointer-events: auto; -webkit-app-region: no-drag; /* BUTTONS MUST BE NO-DRAG */
  &:hover { background: rgba(255,255,255,0.15); transform: scale(1.05); opacity: 1; }
`;

const Page = styled.div` 
  width: 100%; flex: 1; display: flex; flex-direction: column; 
  animation: ${FadeIn} 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); 
`;

const GradientHeader = styled.h1<{ $mode: string }>`
  font-size: 46px; font-weight: 800; margin: 0; letter-spacing: -2px; line-height: 1.0;
  background: ${props => props.$mode === 'dark' ? 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)' : 'linear-gradient(135deg, #1e293b 0%, #6366f1 100%)'};
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.1));
`;

// PLAYER (Scaled Down)
const ArtWrapper = styled.div`
  position: relative; width: 200px; height: 200px;
  display: flex; align-items: center; justify-content: center;
  margin: 5px auto 20px auto;
`;
const PulseGlow = styled.div<{ $color: string, $kick: number }>`
  position: absolute; top: 50%; left: 50%;
  width: 120px; height: 120px; margin-left: -60px; margin-top: -60px;
  border-radius: 40px; background: ${p => p.$color}; 
  filter: blur(50px); opacity: ${p => 0.3 + (p.$kick * 0.4)};
  transform: scale(${p => 1.0 + (p.$kick * 0.4)}); 
  transition: all 0.05s linear; z-index: 0; pointer-events: none;
`;
const AlbumArt = styled.div<{ $src?: string }>`
  width: 150px; height: 150px; border-radius: 38px;
  background: ${props => {
    if (!props.$src) return 'rgba(255,255,255,0.05)';
    const url = (!props.$src.startsWith('http') && !props.$src.startsWith('file') && !props.$src.startsWith('data:'))
      ? `data:image/png;base64,${props.$src}`
      : props.$src;
    return `url("${url}")`;
  }};
  background-size: cover; background-position: center; border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 30px 60px rgba(0,0,0,0.5); z-index: 2; 
  position: relative; transition: transform 0.3s ease;
`;

const MusicInfo = styled.div` text-align: center; z-index: 2; width: 100%; padding-bottom: 15px; `;
const MusicTitle = styled.div<{ $mode: string }>` 
  font-weight: 800; font-size: 18px; margin-bottom: 5px; color: ${p => p.$mode === 'dark' ? '#fff' : '#222'};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; margin: 0 auto 5px auto;
`;
const MusicArtist = styled.div` font-weight: 600; font-size: 13px; opacity: 0.6; `;

const ControlsRow = styled.div`
  display: flex; align-items: center; justify-content: center; gap: 25px; 
  z-index: 50; -webkit-app-region: no-drag; padding-bottom: 25px;
`;
const ControlBtn = styled.button`
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.06); color: inherit;
  display: flex; align-items: center; justify-content: center; cursor: pointer; 
  border-radius: 50%; transition: all 0.1s ease-out; -webkit-app-region: no-drag; 
  &:hover { background: rgba(255,255,255,0.15); transform: scale(1.1); box-shadow: 0 0 15px rgba(255,255,255,0.1); }
  &:active { transform: scale(0.95); }
`;
const MiniBtn = styled(ControlBtn)` width: 46px; height: 46px; svg { width:20px; height:20px; } `;
const PlayBtn = styled(ControlBtn)` width: 64px; height: 64px; background: rgba(255,255,255,0.12); svg { width:28px; height:28px; } `;

const VolumeRow = styled.div`
   width: 200px; display: flex; gap: 10px; align-items: center; opacity: 0.8;
   background: rgba(0,0,0,0.15); padding: 5px; border-radius: 24px; margin: 0 auto;
   -webkit-app-region: no-drag; z-index: 50; 
`;
const VolBtn = styled.button`
  flex: 1; border: none; background: transparent; color: inherit; cursor: pointer; padding: 6px; 
  display: flex; align-items: center; justify-content: center; border-radius: 18px; transition: background 0.2s;
  &:hover { background: rgba(255,255,255,0.1); }
`;

const SettingItem = styled.div` background: rgba(255,255,255,0.05); padding: 16px; border-radius: 18px; display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; border: 1px solid rgba(255,255,255,0.05); -webkit-app-region: no-drag; `;
const ToggleRow = styled.div` display: flex; gap: 8px; background: rgba(0,0,0,0.2); padding: 4px; border-radius: 14px; -webkit-app-region: no-drag; `;
const ToggleBtn = styled.button<{ $active: boolean }>` flex: 1; background: ${props => props.$active ? 'rgba(255,255,255,0.2)' : 'transparent'}; border: none; color: inherit; padding: 8px; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s; opacity: ${props => props.$active ? 1 : 0.5}; fontSize: 12px; -webkit-app-region: no-drag; `;

// --- AUDIO ENGINE ---
function AudioEngine({ onUpdate }: { onUpdate: (kick: number) => void }) {
  useEffect(() => {
    let audioCtx: AudioContext; let analyzer: AnalyserNode; let runningKick = 0; let rafId: number; let dataArray: any;
    const init = async () => {
      try {
        let sourceId = 'screen:0:0';
        if ((window as any).electronAPI?.getDesktopSourceId) { sourceId = await (window as any).electronAPI.getDesktopSourceId(); }
        const stream = await (navigator.mediaDevices as any).getUserMedia({
          audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } },
          video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } }
        });
        audioCtx = new AudioContext(); analyzer = audioCtx.createAnalyser();
        const source = audioCtx.createMediaStreamSource(stream);
        analyzer.fftSize = 64; analyzer.smoothingTimeConstant = 0.8;
        source.connect(analyzer);
        dataArray = new Uint8Array(analyzer.frequencyBinCount);
        const loop = () => {
          analyzer.getByteFrequencyData(dataArray);
          // Widen range to 6 bins for better kick detection
          let sum = 0; for (let i = 0; i < 6; i++) sum += dataArray[i];
          let bass = sum / 6;

          // More sensitive math: lower divisor (100), lower pow (1.5)
          // Allow slight overdrive (up to 1.2) for massive kicks
          let target = Math.pow(bass / 100, 1.5);
          if (target > 1.2) target = 1.2;
          if (bass < 10) target = 0; // slightly higher noise gate

          runningKick += (target - runningKick) * 0.2; // faster attack (0.2)
          onUpdate(runningKick);
          rafId = requestAnimationFrame(loop);
        };
        loop();
      } catch (e) { }
    };
    init();
    return () => { if (audioCtx) audioCtx.close(); cancelAnimationFrame(rafId); };
  }, []);
  return null;
}

const getGradientFromImage = (src: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith('http') && !src.startsWith('file') && !src.startsWith('data:')) {
      img.src = `data:image/png;base64,${src}`;
    } else {
      img.crossOrigin = "Anonymous";
      img.src = src;
    }

    img.onload = () => {
      const c = document.createElement('canvas');
      // Use small size for performance
      c.width = 20; c.height = 20;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, 20, 20);
        const colors: string[] = [];

        // Sample 4 points vertically from Top to Bottom (x=10, varying y)
        const points = [[10, 2], [10, 7], [10, 13], [10, 18]];

        points.forEach(([x, y]) => {
          const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
          // Boost Logic
          let r_ = r / 255, g_ = g / 255, b_ = b / 255;
          let max = Math.max(r_, g_, b_), min = Math.min(r_, g_, b_);
          let h = 0, s = 0, l = (max + min) / 2;

          if (max !== min) {
            let d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
              case r_: h = (g_ - b_) / d + (g_ < b_ ? 6 : 0); break;
              case g_: h = (b_ - r_) / d + 2; break;
              case b_: h = (r_ - g_) / d + 4; break;
            }
            h /= 6;
          }

          h = Math.round(h * 360);
          s = Math.max(s * 100, 70); // High saturation
          l = Math.max(l * 100, 55); // moderate lightness
          colors.push(`hsl(${h}, ${s}%, ${l}%)`);
        });

        // Create a diagonal conic/linear mix
        resolve(`conic-gradient(from 180deg at 50% 50%, ${colors[0]}, ${colors[1]}, ${colors[2]}, ${colors[3]}, ${colors[0]})`);
      } else resolve('linear-gradient(135deg, #1e293b, #6366f1)');
    };
    img.onerror = () => resolve('linear-gradient(135deg, #1e293b, #6366f1)');
  });
};

const STRINGS = {
  en: { back: 'BACK', weather: 'Weather', settings: 'Settings', theme: 'THEME MODE', dark: 'Dark Frost', light: 'Winter Day', opacity: 'OPACITY', exit: 'EXIT APPLICATION', runIn: 'Running in', playMusic: 'Select Music', humidity: 'HUMIDITY', wind: 'WIND' },
  kr: { back: '돌아가기', weather: '날씨', settings: '설정', theme: '테마 모드', dark: '다크 프로스트', light: '윈터 데이', opacity: '투명도', exit: '앱 종료하기', runIn: '현재 위치:', playMusic: '음악 재생 대기 중', humidity: '습도', wind: '풍속' },
  jp: { back: '戻る', weather: '天気', settings: '設定', theme: 'テーマ', dark: 'ダークフロスト', light: 'ウィンターデイ', opacity: '透明度', exit: 'アプリを終了', runIn: '現在地:', playMusic: '音楽を選択してください', humidity: '湿度', wind: '風速' },
};

interface Theme { mode: 'dark' | 'light'; opacity: number; lang: 'en' | 'kr' | 'jp'; }

// --- ERROR BOUNDARY ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any, info: any) { console.error("ErrorBoundary caught:", error, info); }
  render() {
    if (this.state.hasError) {
      return <div style={{ color: 'white', padding: 20, textAlign: 'center', background: 'rgba(50,0,0,0.8)', borderRadius: 20 }}>
        <h3>Application Error</h3>
        <p>Something went wrong.</p>
        <button onClick={() => window.location.reload()} style={{ padding: 10, cursor: 'pointer', background: 'white', border: 'none', borderRadius: 8 }}>Reload</button>
      </div>;
    }
    return this.props.children;
  }
}

function App() {

  const [view, setView] = useState('home');
  const [theme, setTheme] = useState<Theme>({ mode: 'dark', opacity: 0.95, lang: 'kr' });
  const [locked, setLocked] = useState(false);
  const [spotify, setSpotify] = useState({ isPlaying: false, title: '', artist: '', thumbnail: '' });
  const [vizColor, setVizColor] = useState('linear-gradient(135deg, #a5b4fc, #6366f1)');
  const [kick, setKick] = useState(0);
  const [time, setTime] = useState(new Date());
  const [weather, setWeather] = useState({ temp: 12, code: 1 });
  const T = STRINGS[theme.lang];

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    const d = setInterval(async () => {
      if (window.electronAPI) {
        const music = await window.electronAPI.getSpotifyStatus();
        if (music.title !== spotify.title || music.thumbnail?.length !== spotify.thumbnail?.length) {
          setSpotify(music);
          if (music.thumbnail && music.thumbnail.length > 10) {
            const c = await getGradientFromImage(music.thumbnail);
            setVizColor(c);
          } else { setVizColor('linear-gradient(135deg, #a5b4fc, #6366f1)'); }
        } else { setSpotify(prev => ({ ...prev, isPlaying: music.isPlaying })); }
        const w = await window.electronAPI.getWeather();
        setWeather(w);
      }
    }, 1000);
    return () => { clearInterval(t); clearInterval(d); }
  }, [spotify.title, spotify.thumbnail]);

  const handleMedia = (cmd: string) => {
    try {
      if (window.electronAPI && window.electronAPI.controlMedia) {
        // Explicit Play/Pause logic
        let finalCmd = cmd;
        if (cmd === 'playpause') {
          finalCmd = spotify.isPlaying ? 'pause' : 'play';
        }

        window.electronAPI.controlMedia(finalCmd);

        if (cmd === 'playpause') setSpotify(p => ({ ...p, isPlaying: !p.isPlaying }));
      }
    } catch (e) { console.error(e); }
  };

  const bg = theme.mode === 'dark' ? `rgba(15, 15, 20, ${theme.opacity})` : `rgba(235, 240, 245, ${theme.opacity})`;
  const txt = theme.mode === 'dark' ? '#fff' : '#222';

  return (
    <ErrorBoundary>
      <AppWrapper>
        <GlobalStyle />
        <AudioEngine onUpdate={setKick} />

        {/* COMPACT FROSTY CONTAINER */}
        <FrostyContainer $locked={locked} style={{ background: bg, color: txt }}>

          {/* COMPACT PINNED HEADER */}
          <Header $locked={locked}>
            <HeaderTitle>GLASS AI</HeaderTitle>
            <div style={{ display: 'flex', gap: 8 }}>
              <IconButton onClick={() => setLocked(!locked)}>{locked ? '🔒' : '🔓'}</IconButton>
              <IconButton onClick={() => window.close()}>✕</IconButton>
            </div>
          </Header>

          {/* COMPACT SCROLLABLE CONTENT */}
          <ContentArea>
            {view === 'home' && (
              <Page>
                <div style={{ textAlign: 'center', marginTop: 10, marginBottom: 15 }}>
                  <GradientHeader $mode={theme.mode}>{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</GradientHeader>
                  <div style={{ opacity: 0.6, fontSize: 13, fontWeight: 600, marginTop: 4 }}>{time.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</div>
                </div>

                <ArtWrapper>
                  <PulseGlow $color={vizColor} $kick={spotify.isPlaying ? kick : 0} />
                  <AlbumArt $src={spotify.thumbnail}>{!spotify.thumbnail && <div style={{ opacity: 0.3 }}>🎵</div>}</AlbumArt>
                </ArtWrapper>

                <MusicInfo>
                  <MusicTitle $mode={theme.mode} style={{ display: 'flex', justifyContent: 'center', gap: '1px', height: '27px', alignItems: 'center' }}>
                    {spotify.title ? (
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', display: 'block' }}>
                        {spotify.title.match(/ - /) ? spotify.title.split(' - ')[1] : spotify.title}
                      </span>
                    ) : (
                      "음악 같이 듣는 중".split('').map((char, i) => (
                        <span key={i} style={{
                          display: 'inline-block',
                          animation: 'bounce 1.5s infinite',
                          animationDelay: `${i * 0.1}s`
                        }}>
                          {char === ' ' ? '\u00A0' : char}
                        </span>
                      ))
                    )}
                  </MusicTitle>
                  <MusicArtist style={{ display: 'flex', justifyContent: 'center', gap: '1px', height: '20px', alignItems: 'center', opacity: 0.6, marginTop: '5px' }}>
                    {spotify.title ? (
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', display: 'block' }}>
                        {spotify.artist || (spotify.title.match(/ - /) ? spotify.title.split(' - ')[0] : '')}
                      </span>
                    ) : (
                      "부른 사람 찾는 중".split('').map((char, i) => (
                        <span key={i} style={{
                          display: 'inline-block',
                          animation: 'bounce 1.5s infinite',
                          animationDelay: `${(i * 0.1) + 0.5}s`,
                          fontSize: '12px'
                        }}>
                          {char === ' ' ? '\u00A0' : char}
                        </span>
                      ))
                    )}
                  </MusicArtist>
                </MusicInfo>

                <ControlsRow>
                  <MiniBtn onClick={() => handleMedia('prev')}><PrevIcon /></MiniBtn>
                  <PlayBtn onClick={() => handleMedia('playpause')}>{spotify.isPlaying ? <PauseIcon /> : <PlayIcon />}</PlayBtn>
                  <MiniBtn onClick={() => handleMedia('next')}><NextIcon /></MiniBtn>
                </ControlsRow>

                <VolumeRow>
                  <VolBtn onClick={() => handleMedia('vol_down')}><VolDownIcon /></VolBtn>
                  <div style={{ width: 1, height: 14, background: 'currentColor', opacity: 0.3 }}></div>
                  <VolBtn onClick={() => handleMedia('vol_up')}><VolUpIcon /></VolBtn>
                </VolumeRow>

                <div style={{ marginTop: 'auto', paddingBottom: 5, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8, cursor: 'pointer', position: 'relative', zIndex: 50 }} onClick={() => setView('weather')}>{T.runIn} Seoul, {weather.temp}°</div>
                </div>
              </Page>
            )}

            {view === 'weather' && (
              <Page>
                <button onClick={() => setView('home')} style={{ background: 'none', border: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, marginBottom: 15, opacity: 0.7, WebkitAppRegion: 'no-drag', fontWeight: 700, position: 'relative', zIndex: 50 } as any}>← {T.back}</button>
                <div style={{ textAlign: 'center', marginBottom: 30 }}>
                  <GradientHeader $mode={theme.mode}>{weather.temp}°</GradientHeader>
                  <div style={{ opacity: 0.6, fontSize: 18, marginTop: 8, textTransform: 'uppercase', letterSpacing: 2 }}>Seoul</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: 18, borderRadius: 20, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>{T.humidity}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>45%</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: 18, borderRadius: 20, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>{T.wind}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>2 m/s</div>
                  </div>
                </div>
              </Page>
            )}

            {view === 'settings' && (
              <Page>
                <button onClick={() => setView('home')} style={{ background: 'none', border: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, marginBottom: 15, opacity: 0.7, WebkitAppRegion: 'no-drag', fontWeight: 700, position: 'relative', zIndex: 50 } as any}>← {T.back}</button>
                <h2 style={{ margin: '0 0 20px 0', fontWeight: 800 }}>{T.settings}</h2>
                <SettingItem>
                  <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>LANGUAGE</div>
                  <ToggleRow>
                    <ToggleBtn $active={theme.lang === 'kr'} onClick={() => setTheme(p => ({ ...p, lang: 'kr' }))}>KR</ToggleBtn>
                    <ToggleBtn $active={theme.lang === 'en'} onClick={() => setTheme(p => ({ ...p, lang: 'en' }))}>EN</ToggleBtn>
                    <ToggleBtn $active={theme.lang === 'jp'} onClick={() => setTheme(p => ({ ...p, lang: 'jp' }))}>JP</ToggleBtn>
                  </ToggleRow>
                </SettingItem>
                <SettingItem>
                  <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>{T.theme}</div>
                  <ToggleRow>
                    <ToggleBtn $active={theme.mode === 'dark'} onClick={() => setTheme(p => ({ ...p, mode: 'dark' }))}>{T.dark}</ToggleBtn>
                    <ToggleBtn $active={theme.mode === 'light'} onClick={() => setTheme(p => ({ ...p, mode: 'light' }))}>{T.light}</ToggleBtn>
                  </ToggleRow>
                </SettingItem>

                <SettingItem>
                  <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>{T.opacity} {Math.round(theme.opacity * 100)}%</div>
                  <input
                    type="range" min="0.3" max="1" step="0.05"
                    value={theme.opacity}
                    onChange={(e) => setTheme(p => ({ ...p, opacity: parseFloat(e.target.value) }))}
                    style={{ width: '100%', accentColor: theme.mode === 'dark' ? '#fff' : '#666', cursor: 'pointer' }}
                  />
                </SettingItem>

                <div onClick={() => window.close()} style={{ background: 'rgba(255,50,50,0.1)', padding: 16, borderRadius: 16, cursor: 'pointer', marginTop: 'auto', position: 'relative', zIndex: 50 }}>
                  <div style={{ color: '#ff5f57', fontWeight: 800, textAlign: 'center' }}>{T.exit}</div>
                </div>
              </Page>
            )}
          </ContentArea>

          {/* COMPACT PINNED BOTTOM DOCK */}
          <BottomDock $mode={theme.mode} $locked={locked}>
            <IconButton onClick={() => setView('home')}>🏠</IconButton>
            <IconButton onClick={() => setView('weather')}>☁️</IconButton>
            <IconButton onClick={() => setView('settings')}>⚙️</IconButton>
          </BottomDock>

        </FrostyContainer>
      </AppWrapper>
    </ErrorBoundary>
  )
}

export default App
