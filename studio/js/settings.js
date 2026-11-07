export const THEMES = {
  Midnight: { bgTop: '#0d1229', bgBottom: '#170d38', surface: 'rgba(255,255,255,0.07)', border: 'rgba(255,255,255,0.14)', accent: '#5c9eff', accent2: '#6bedb8', text: '#ffffff', muted: 'rgba(255,255,255,0.62)', caption: 'rgba(0,0,0,0.55)', dark: true },
  Aurora: { bgTop: '#08242b', bgBottom: '#290d3d', surface: 'rgba(255,255,255,0.07)', border: 'rgba(255,255,255,0.14)', accent: '#fa739e', accent2: '#59e6f2', text: '#ffffff', muted: 'rgba(255,255,255,0.62)', caption: 'rgba(0,0,0,0.55)', dark: true },
  Slate: { bgTop: '#1a1a1a', bgBottom: '#292929', surface: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)', accent: '#ffb840', accent2: '#8cccff', text: '#ffffff', muted: 'rgba(255,255,255,0.6)', caption: 'rgba(0,0,0,0.6)', dark: true },
  Paper: { bgTop: '#faf8f0', bgBottom: '#edebe0', surface: 'rgba(255,255,255,0.85)', border: 'rgba(0,0,0,0.08)', accent: '#e6543d', accent2: '#1a80b3', text: '#1f1f1f', muted: 'rgba(31,31,31,0.6)', caption: 'rgba(0,0,0,0.72)', dark: false },
};

export const ASPECTS = {
  '16x9': { label: '16:9 (YouTube)', size: { '720': [1280, 720], '1080': [1920, 1080] } },
  '9x16': { label: '9:16 (Shorts)', size: { '720': [720, 1280], '1080': [1080, 1920] } },
  '1x1': { label: '1:1 (Square)', size: { '720': [720, 720], '1080': [1080, 1080] } },
};

export const VOICES = [
  ['af_heart', 'Heart (US, female) — recommended'], ['af_bella', 'Bella (US, female)'], ['af_nicole', 'Nicole (US, female, soft)'],
  ['af_sarah', 'Sarah (US, female)'], ['am_michael', 'Michael (US, male)'], ['am_fenrir', 'Fenrir (US, male, deep)'],
  ['am_adam', 'Adam (US, male)'], ['bf_emma', 'Emma (UK, female)'], ['bm_george', 'George (UK, male)'], ['bm_lewis', 'Lewis (UK, male)'],
];

const DEFAULTS = {
  aspect: '16x9', quality: '1080', fps: 30, theme: 'Midnight',
  burnInCaptions: true, showProgressBar: true, maxDuration: 60, targetDuration: 50,
  voice: 'af_heart', speed: 1.0, musicName: '', musicVolume: 0.18, ambientBed: false,
  channelName: '', cta: 'Subscribe for more AI explainers', modelId: '',
};

const KEY = 'aivideostudio.settings.v1';

export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
export function saveSettings(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
export function canvasSize(s) { return ASPECTS[s.aspect].size[s.quality]; }
