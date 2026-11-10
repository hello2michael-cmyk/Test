import { get, set, del } from 'idb-keyval';
import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, type Settings, type Brief, type MailMessage } from './types';

// A tiny external store: settings are persisted in IndexedDB, everything else lives in memory
// with a cached copy so the app opens instantly offline.

const SETTINGS_KEY = 'daybrief.settings.v1';
const CACHE_KEY = 'daybrief.cache.v1';

export interface Cache {
  messages: MailMessage[];
  brief: Brief | null;
  fetchedAt: string | null;
}

interface State {
  settings: Settings;
  cache: Cache;
  loaded: boolean;
}

let state: State = { settings: DEFAULT_SETTINGS, cache: { messages: [], brief: null, fetchedAt: null }, loaded: false };
const listeners = new Set<() => void>();

function emit() { for (const l of listeners) l(); }

export async function loadStore() {
  const [s, c] = await Promise.all([get<Partial<Settings>>(SETTINGS_KEY), get<Cache>(CACHE_KEY)]);
  state = {
    settings: deepMerge(DEFAULT_SETTINGS, s ?? {}),
    cache: c ?? state.cache,
    loaded: true,
  };
  emit();
}

function deepMerge<T>(base: T, patch: Partial<T>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const b = out[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object'
      ? deepMerge(b as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return out as T;
}

export function getState() { return state; }

export function updateSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
  const p = typeof patch === 'function' ? patch(state.settings) : patch;
  state = { ...state, settings: deepMerge(state.settings, p) };
  emit();
  void set(SETTINGS_KEY, state.settings);
}

export function updateCache(patch: Partial<Cache>) {
  state = { ...state, cache: { ...state.cache, ...patch } };
  emit();
  void set(CACHE_KEY, state.cache);
}

export async function wipeEverything() {
  await Promise.all([del(SETTINGS_KEY), del(CACHE_KEY)]);
  state = { settings: DEFAULT_SETTINGS, cache: { messages: [], brief: null, fetchedAt: null }, loaded: true };
  emit();
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

export function useStore(): State { return useSyncExternalStore(subscribe, getState, getState); }
export function useSettings(): Settings { return useStore().settings; }
