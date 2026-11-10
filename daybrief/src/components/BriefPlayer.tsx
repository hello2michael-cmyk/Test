import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { canSpeak, pauseSpeaking, resumeSpeaking, speak, stopSpeaking } from '../lib/speech';
import { useSettings } from '../lib/store';
import { cx } from './ui';

// Plays the spoken briefing with the phone's own voice. Lock-screen controls arrive with Kokoro in phase 2.
export function BriefPlayer({ text, autoplay }: { text: string; autoplay?: boolean }) {
  const { voice } = useSettings();
  const [state, setState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [progress, setProgress] = useState(0);
  const started = useRef(false);

  const play = () => {
    speak(text, { rate: voice.rate, onEnd: () => { setState('idle'); setProgress(0); }, onBoundary: i => setProgress(Math.min(1, i / Math.max(1, text.length))) });
    setState('playing');
  };
  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => {
    if (autoplay && !started.current && canSpeak()) { started.current = true; play(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay]);

  if (!canSpeak()) return null;
  const words = text.split(/\s+/).length;
  const mins = Math.max(1, Math.round(words / 150 / voice.rate));

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card-2 p-2 pr-4">
      <button
        aria-label={state === 'playing' ? 'Pause briefing' : 'Play briefing'}
        onClick={() => { if (state === 'idle') play(); else if (state === 'playing') { pauseSpeaking(); setState('paused'); } else { resumeSpeaking(); setState('playing'); } }}
        className="pressable grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink shadow-[0_8px_20px_-10px_var(--accent)]"
      >
        {state === 'playing' ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-semibold">{state === 'idle' ? 'Listen to your brief' : state === 'paused' ? 'Paused' : 'Playing'}</span>
          <span className="text-ink-3">{mins} min</span>
        </div>
        <div className="mt-1.5 flex h-5 items-end gap-[3px]">
          {state === 'playing'
            ? Array.from({ length: 28 }).map((_, i) => <span key={i} className="eq-bar w-[3px] flex-1 rounded-full bg-accent/80" style={{ animationDelay: `${(i % 7) * 90}ms`, height: `${40 + ((i * 37) % 60)}%` }} />)
            : <div className="h-1.5 w-full self-center overflow-hidden rounded-full bg-ink-3/25"><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress * 100}%` }} /></div>}
        </div>
      </div>
      <button aria-label="Stop" onClick={() => { stopSpeaking(); setState('idle'); setProgress(0); }} className={cx('text-ink-3 transition-opacity', state === 'idle' && 'pointer-events-none opacity-0')}><Square size={16} fill="currentColor" /></button>
    </div>
  );
}
