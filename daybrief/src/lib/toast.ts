import { useSyncExternalStore } from 'react';

type T = { id: number; text: string; kind: 'ok' | 'err' } | null;
let current: T = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function toast(text: string, kind: 'ok' | 'err' = 'ok') {
  current = { id: Date.now(), text, kind };
  for (const l of listeners) l();
  clearTimeout(timer);
  timer = setTimeout(() => { current = null; for (const l of listeners) l(); }, kind === 'err' ? 4200 : 2200);
}
export function useToast() { return useSyncExternalStore(subscribe, () => current, () => current); }
