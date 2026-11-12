import type { MailMessage } from './types';

// Gmail API payload types, only the parts we read.
export interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

export function b64urlDecode(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

export function b64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function header(p: GmailPart | undefined, name: string): string {
  return p?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

export function parseAddress(raw: string): { name: string; email: string } {
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || m[2].trim(), email: m[2].trim() };
  const email = raw.trim();
  return { name: email.split('@')[0] || email, email };
}

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style,script,head,title').forEach(n => n.remove());
  doc.querySelectorAll('br').forEach(n => n.replaceWith('\n'));
  doc.querySelectorAll('p,div,li,tr,h1,h2,h3,h4,blockquote').forEach(n => n.append('\n'));
  return (doc.body?.textContent ?? '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function findBody(p: GmailPart | undefined): { text?: string; html?: string } {
  const out: { text?: string; html?: string } = {};
  const walk = (part: GmailPart | undefined) => {
    if (!part) return;
    const data = part.body?.data;
    if (data && part.mimeType === 'text/plain' && !out.text) out.text = b64urlDecode(data);
    else if (data && part.mimeType === 'text/html' && !out.html) out.html = b64urlDecode(data);
    part.parts?.forEach(walk);
  };
  walk(p);
  return out;
}

export function stripQuoted(text: string): string {
  // Cut typical reply quotes so summaries focus on the new content.
  const lines = text.split('\n');
  const cut = lines.findIndex(l => /^(On .+ wrote:|-----Original Message-----|From: .+)$/i.test(l.trim()) || /^>/.test(l));
  const kept = cut > 3 ? lines.slice(0, cut) : lines;
  return kept.join('\n').trim();
}

export function toMailMessage(m: GmailMessage, maxChars = 6000): MailMessage {
  const p = m.payload;
  const { text, html } = findBody(p);
  let body = text?.trim() || (html ? htmlToText(html) : '') || m.snippet || '';
  body = stripQuoted(body);
  if (body.length > maxChars) body = body.slice(0, maxChars) + '\n[...]';
  const labels = m.labelIds ?? [];
  return {
    id: m.id,
    threadId: m.threadId,
    from: parseAddress(header(p, 'From')),
    to: header(p, 'To'),
    subject: header(p, 'Subject') || '(no subject)',
    date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : new Date().toISOString(),
    snippet: m.snippet ?? '',
    body,
    messageIdHeader: header(p, 'Message-ID') || undefined,
    references: header(p, 'References') || undefined,
    labels,
    unread: labels.includes('UNREAD'),
  };
}

export function buildReplyMime(opts: { from: string; to: string; subject: string; body: string; inReplyTo?: string; references?: string }): string {
  const subject = /^re:/i.test(opts.subject) ? opts.subject : `Re: ${opts.subject}`;
  const encSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${encSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ];
  if (opts.inReplyTo) {
    lines.push(`In-Reply-To: ${opts.inReplyTo}`);
    lines.push(`References: ${[opts.references, opts.inReplyTo].filter(Boolean).join(' ')}`);
  }
  return lines.join('\r\n') + '\r\n\r\n' + opts.body.replace(/\r?\n/g, '\r\n');
}
