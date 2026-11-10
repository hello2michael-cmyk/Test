import { b64urlEncode, buildReplyMime, toMailMessage, type GmailMessage } from './mime';
import type { MailMessage } from './types';

// Gmail in the browser: Google Identity Services issues a short-lived access token after the
// user taps "Continue with Google"; the Gmail REST API is called directly with it. No password
// is ever seen by the app, and the user can revoke access at myaccount.google.com at any time.

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken(o?: { prompt?: string; hint?: string }): void; callback: (r: TokenResponse) => void }
declare global {
  interface Window {
    google?: { accounts: { oauth2: {
      initTokenClient(c: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string; message?: string }) => void }): TokenClient;
      revoke(token: string, done?: () => void): void;
    } } };
  }
}

let token: { value: string; expiresAt: number } | null = null;
let gisLoading: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in. Check your connection.'));
    document.head.appendChild(s);
  });
  return gisLoading;
}

export class GmailAuthError extends Error {}

/** Interactive sign-in (must be called from a user gesture). Resolves with the account email. */
export async function signIn(clientId: string, hintEmail?: string): Promise<string> {
  if (!clientId) throw new GmailAuthError('Add your Google OAuth client ID in Settings first.');
  await loadGis();
  const t = await new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: r => {
        if (r.error || !r.access_token) reject(new GmailAuthError(r.error_description || r.error || 'Sign-in was cancelled.'));
        else { token = { value: r.access_token, expiresAt: Date.now() + ((r.expires_in ?? 3600) - 60) * 1000 }; resolve(r.access_token); }
      },
      error_callback: e => reject(new GmailAuthError(e.type === 'popup_closed' ? 'Sign-in window was closed.' : e.message || e.type)),
    });
    client.requestAccessToken(hintEmail ? { hint: hintEmail } : undefined);
  });
  const me = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json());
  return String(me.email ?? '');
}

export function hasSession(): boolean { return !!token && token.expiresAt > Date.now(); }

export function signOut() {
  if (token) { try { window.google?.accounts.oauth2.revoke(token.value); } catch { /* ignore */ } }
  token = null;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!hasSession()) throw new GmailAuthError('Your Google session expired. Tap Connect again.');
  const r = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token!.value}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  if (r.status === 401) { token = null; throw new GmailAuthError('Your Google session expired. Tap Connect again.'); }
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Gmail error ${r.status}: ${body.slice(0, 200)}`);
  }
  return (r.status === 204 ? ({} as T) : r.json()) as Promise<T>;
}

/** Unread inbox messages, newest first, with bodies. */
export async function fetchUnread(max = 30): Promise<MailMessage[]> {
  const list = await call<{ messages?: { id: string }[] }>(`/messages?q=${encodeURIComponent('is:unread in:inbox')}&maxResults=${max}`);
  const ids = list.messages ?? [];
  const out: MailMessage[] = [];
  // Modest concurrency so Gmail's per-user quota is respected.
  for (let i = 0; i < ids.length; i += 6) {
    const chunk = await Promise.all(ids.slice(i, i + 6).map(({ id }) => call<GmailMessage>(`/messages/${id}?format=full`)));
    out.push(...chunk.map(m => toMailMessage(m)));
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** A few recent sent messages, used to learn the user's writing voice. */
export async function fetchSentSamples(n = 5): Promise<string[]> {
  const list = await call<{ messages?: { id: string }[] }>(`/messages?q=${encodeURIComponent('in:sent -subject:fwd')}&maxResults=${n}`);
  const msgs = await Promise.all((list.messages ?? []).map(({ id }) => call<GmailMessage>(`/messages/${id}?format=full`)));
  return msgs.map(m => toMailMessage(m, 1200).body).filter(b => b.length > 40);
}

export async function sendReply(from: string, original: MailMessage, body: string): Promise<void> {
  const raw = buildReplyMime({ from, to: `${original.from.name} <${original.from.email}>`, subject: original.subject, body, inReplyTo: original.messageIdHeader, references: original.references });
  await call('/messages/send', { method: 'POST', body: JSON.stringify({ raw: b64urlEncode(raw), threadId: original.threadId }) });
}

export async function modifyLabels(id: string, add: string[], remove: string[]): Promise<void> {
  await call(`/messages/${id}/modify`, { method: 'POST', body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }) });
}

export const markRead = (id: string) => modifyLabels(id, [], ['UNREAD']);
export const archive = (id: string) => modifyLabels(id, [], ['INBOX', 'UNREAD']);
