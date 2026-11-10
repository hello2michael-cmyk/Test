import { useSyncExternalStore } from 'react';
import { getState, updateCache, updateSettings } from './store';
import * as gmail from './gmail';
import { getProvider, AiError } from './ai';
import { DEMO_MESSAGES } from './demo-data';
import type { Draft, MailMessage, Triage } from './types';

// Orchestrates one "open the app" cycle: fetch unread mail, triage it, keep drafts.
// Everything here is UI-agnostic so a scheduled Worker can reuse it in phase 3.

export type Phase = 'idle' | 'auth' | 'fetching' | 'thinking' | 'ready' | 'error';

interface SessionState {
  phase: Phase;
  error: string | null;
  needsSignIn: boolean;
  drafts: Record<string, Draft>;
  drafting: Record<string, boolean>;
  samples: string[];
  done: Record<string, 'sent' | 'archived' | 'read'>;
}

let s: SessionState = { phase: 'idle', error: null, needsSignIn: false, drafts: {}, drafting: {}, samples: [], done: {} };
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
function patch(p: Partial<SessionState>) { s = { ...s, ...p }; emit(); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useSession() { return useSyncExternalStore(subscribe, () => s, () => s); }

function describe(e: unknown): string {
  if (e instanceof gmail.GmailAuthError) return e.message;
  if (e instanceof AiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}

export function isDemoMail() { return getState().settings.mail.provider === 'demo'; }

/** Interactive Google sign-in. Must run from a tap. */
export async function connectGoogle(): Promise<void> {
  const { settings } = getState();
  patch({ phase: 'auth', error: null });
  try {
    const email = await gmail.signIn(settings.mail.googleClientId, settings.mail.email || undefined);
    updateSettings({ mail: { ...settings.mail, provider: 'gmail', email } });
    patch({ needsSignIn: false, phase: 'idle' });
  } catch (e) {
    patch({ phase: 'error', error: describe(e) });
    throw e;
  }
}

export function disconnectGoogle() {
  gmail.signOut();
  const { settings } = getState();
  updateSettings({ mail: { ...settings.mail, provider: 'demo', email: '' } });
  updateCache({ messages: [], brief: null, fetchedAt: null });
  s = { ...s, drafts: {}, done: {}, samples: [], needsSignIn: false };
  emit();
}

/** Fetch and triage. Resolves silently when a sign-in is required (needsSignIn is set). */
export async function refresh(opts: { force?: boolean } = {}): Promise<void> {
  const { settings, cache } = getState();
  if (s.phase === 'fetching' || s.phase === 'thinking') return;
  const fresh = cache.fetchedAt && Date.now() - new Date(cache.fetchedAt).getTime() < 10 * 60_000;
  if (!opts.force && fresh && cache.brief) { patch({ phase: 'ready' }); return; }

  let messages: MailMessage[];
  patch({ phase: 'fetching', error: null });
  try {
    if (settings.mail.provider === 'gmail') {
      if (!gmail.hasSession()) { patch({ phase: 'idle', needsSignIn: true }); return; }
      messages = await gmail.fetchUnread(settings.mail.maxMessages);
      if (!s.samples.length) gmail.fetchSentSamples().then(samples => patch({ samples })).catch(() => {});
    } else {
      await new Promise(r => setTimeout(r, 600));
      messages = DEMO_MESSAGES;
    }
  } catch (e) {
    patch({ phase: 'error', error: describe(e), needsSignIn: e instanceof gmail.GmailAuthError });
    return;
  }

  updateCache({ messages, fetchedAt: new Date().toISOString() });
  s = { ...s, done: {}, drafts: {} };
  if (messages.length === 0) {
    updateCache({ brief: { generatedAt: new Date().toISOString(), headline: 'Inbox zero. Nothing is waiting on you.', narrative: 'Good news: there are no unread emails right now. Enjoy the quiet.', triage: [] } });
    patch({ phase: 'ready' });
    return;
  }

  patch({ phase: 'thinking' });
  try {
    const brief = await getProvider(settings).triage(messages, settings);
    updateCache({ brief });
    patch({ phase: 'ready' });
  } catch (e) {
    patch({ phase: 'error', error: describe(e) });
  }
}

export async function draftFor(m: MailMessage, t: Triage | undefined, instruction?: string): Promise<Draft> {
  const { settings } = getState();
  patch({ drafting: { ...s.drafting, [m.id]: true } });
  try {
    const d = await getProvider(settings).draft(m, t, settings, s.samples, instruction);
    patch({ drafts: { ...s.drafts, [m.id]: d } });
    return d;
  } finally {
    patch({ drafting: { ...s.drafting, [m.id]: false } });
  }
}

export function setDraftBody(id: string, body: string) {
  const d = s.drafts[id];
  if (d) patch({ drafts: { ...s.drafts, [id]: { ...d, body } } });
}

export async function send(m: MailMessage, body: string): Promise<void> {
  const { settings } = getState();
  if (settings.mail.provider === 'gmail') {
    await gmail.sendReply(settings.mail.email, m, body);
    await gmail.markRead(m.id).catch(() => {});
  } else {
    await new Promise(r => setTimeout(r, 700));
  }
  patch({ done: { ...s.done, [m.id]: 'sent' } });
}

export async function archive(m: MailMessage): Promise<void> {
  const { settings } = getState();
  if (settings.mail.provider === 'gmail') await gmail.archive(m.id);
  patch({ done: { ...s.done, [m.id]: 'archived' } });
}

export async function markRead(m: MailMessage): Promise<void> {
  const { settings } = getState();
  if (settings.mail.provider === 'gmail') await gmail.markRead(m.id);
  patch({ done: { ...s.done, [m.id]: 'read' } });
}

export function resetSession() { s = { phase: 'idle', error: null, needsSignIn: false, drafts: {}, drafting: {}, samples: [], done: {} }; emit(); }
