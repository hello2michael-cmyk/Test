import { get, set, del } from 'idb-keyval';
import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, type Settings, type Brief, type MailMessage } from './types';
import { open, seal } from './crypto';

// A tiny external store. Settings (including API keys) and the mail cache are encrypted with a
// non-extractable device key before they are written to IndexedDB, so an exported or copied
// browser profile does not reveal mail or keys.

const SETTINGS_KEY = 'daybrief.settings.v2';
const CACHE_KEY = 'daybrief.cache.v2';
const LEGACY = ['daybrief.settings.v1', 'daybrief.cache.v1'];

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
  // One-time migration from the unencrypted first build.
  const [legacyS, legacyC] = await Promise.all([get<Partial<Settings>>(LEGACY[0]), get<Cache>(LEGACY[1])]);
  if (legacyS) { await set(SETTINGS_KEY, await seal(legacyS)); await del(LEGACY[0]); }
  if (legacyC) { await set(CACHE_KEY, await seal(legacyC)); await del(LEGACY[1]); }

  const [sealedS, sealedC] = await Promise.all([get<string>(SETTINGS_KEY), get<string>(CACHE_KEY)]);
  const s = sealedS ? await open<Partial<Settings>>(sealedS) : undefined;
  const c = sealedC ? await open<Cache>(sealedC) : undefined;
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
  void persist(SETTINGS_KEY, state.settings);
}

let chain = Promise.resolve();
function persist(key: string, value: unknown) {
  chain = chain.then(async () => { await set(key, await seal(value)); }).catch(() => {});
  return chain;
}

export function updateCache(patch: Partial<Cache>) {
  state = { ...state, cache: { ...state.cache, ...patch } };
  emit();
  // Mail bodies only touch disk when the user allows an offline copy.
  const toDisk = state.settings.security.keepMailOffline ? state.cache : { ...state.cache, messages: [], brief: null };
  void persist(CACHE_KEY, toDisk);
}

export function clearMailCache() {
  state = { ...state, cache: { messages: [], brief: null, fetchedAt: null } };
  emit();
  void persist(CACHE_KEY, state.cache);
}

export async function wipeEverything() {
  await Promise.all([del(SETTINGS_KEY), del(CACHE_KEY), ...LEGACY.map(k => del(k))]);
  state = { settings: DEFAULT_SETTINGS, cache: { messages: [], brief: null, fetchedAt: null }, loaded: true };
  emit();
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

export function useStore(): State { return useSyncExternalStore(subscribe, getState, getState); }
export function useSettings(): Settings { return useStore().settings; }
