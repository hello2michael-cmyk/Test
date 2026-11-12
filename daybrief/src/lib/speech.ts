// Voice in and out using what the phone already has. Phase 2 swaps the voice for Kokoro.

let current: SpeechSynthesisUtterance | null = null;

export function canSpeak() { return typeof speechSynthesis !== 'undefined'; }

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices();
  const lang = navigator.language || 'en-US';
  const preferred = ['Samantha', 'Ava', 'Karen', 'Daniel', 'Google US English', 'Microsoft Aria'];
  return voices.find(v => preferred.includes(v.name) && v.lang.startsWith(lang.slice(0, 2)))
    ?? voices.find(v => v.lang === lang) ?? voices.find(v => v.lang.startsWith(lang.slice(0, 2))) ?? voices[0];
}

export function speak(text: string, opts: { rate?: number; onEnd?: () => void; onBoundary?: (charIndex: number) => void } = {}) {
  if (!canSpeak()) return;
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = opts.rate ?? 1;
  const v = pickVoice();
  if (v) u.voice = v;
  u.onend = () => { current = null; opts.onEnd?.(); };
  u.onerror = () => { current = null; opts.onEnd?.(); };
  u.onboundary = e => opts.onBoundary?.(e.charIndex);
  current = u;
  speechSynthesis.speak(u);
}

export function pauseSpeaking() { if (canSpeak()) speechSynthesis.pause(); }
export function resumeSpeaking() { if (canSpeak()) speechSynthesis.resume(); }
export function stopSpeaking() { if (canSpeak()) { speechSynthesis.cancel(); current = null; } }
export function isSpeaking() { return !!current; }

// Speech recognition (dictation). Safari and Chrome expose it under a prefix.
interface RecognitionLike extends EventTarget {
  lang: string; interimResults: boolean; continuous: boolean;
  start(): void; stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type RecognitionCtor = new () => RecognitionLike;

function ctor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function canListen() { return !!ctor(); }

export function listen(onText: (text: string, final: boolean) => void, onDone: (err?: string) => void): () => void {
  const C = ctor();
  if (!C) { onDone('Dictation is not available in this browser.'); return () => {}; }
  const r = new C();
  r.lang = navigator.language || 'en-US';
  r.interimResults = true;
  r.continuous = false;
  r.onresult = e => {
    let text = '';
    let final = false;
    for (let i = 0; i < e.results.length; i++) { text += e.results[i][0].transcript; final = e.results[i].isFinal; }
    onText(text.trim(), final);
  };
  r.onerror = e => onDone(e.error === 'not-allowed' ? 'Microphone access was denied.' : e.error);
  r.onend = () => onDone();
  r.start();
  return () => r.stop();
}
