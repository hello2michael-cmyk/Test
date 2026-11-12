import { get, set, del } from 'idb-keyval';
import { useSyncExternalStore } from 'react';
import { b64u, deviceCode, getDevicePublicB64, importPrivateJwk, importPublicJwk, open, parseDeviceCode, randomId, seal, sign, unwrapWithPassphrase, utf8, verify, wrapWithPassphrase } from './crypto';

// Invite-only access without a server.
//
// Every device has its own key pair. A new person sends the owner their device code (the
// public key). The owner signs a license that names that exact device. The app accepts a
// license only when the owner's signature is valid AND the device named in it is this one,
// so forwarding the license text to a friend does nothing: their device has a different key.
// Revocation works through revoked.json next to the app, which the owner edits on GitHub.

export const OWNER_PUBLIC_JWK: JsonWebKey = { kty: 'EC', crv: 'P-256', x: 'v_nkwjOfECups5bZSzXXneAjp6V5LeDAS2PNyY0YaIQ', y: 'TIWAdZ0t4-ad-Yq3OcC1JUQ-z-0Dyt07uwDZXPh-Cc0' };

export interface License {
  v: 1;
  id: string;
  name: string;
  dev: string; // device public key, base64url raw
  role: 'owner' | 'member';
  iat: string;
  exp: string | null;
  note?: string;
}

export interface IssuedRecord { id: string; name: string; note?: string; iat: string; exp: string | null; devShort: string }

type Status = { state: 'checking' } | { state: 'locked'; reason?: string } | { state: 'ok'; lic: License; isOwnerDevice: boolean };

const LIC_KEY = 'daybrief.license.v1';
const OWNER_KEY = 'daybrief.ownerkey.v1';
const ISSUED_KEY = 'daybrief.issued.v1';
const REVOKED_KEY = 'daybrief.revoked.v1';

let status: Status = { state: 'checking' };
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useLicense(): Status { return useSyncExternalStore(subscribe, () => status, () => status); }

function setStatus(s: Status) { status = s; emit(); }

export function encodePayload(p: License): Uint8Array { return utf8(JSON.stringify(p)); }

export async function signLicense(priv: CryptoKey, p: License): Promise<string> {
  const body = b64u(encodePayload(p));
  const sig = await sign(priv, utf8(body));
  return `dbl1.${body}.${sig}`;
}

export function parseToken(token: string): { body: string; sig: string; lic: License } | null {
  const m = token.trim().match(/^dbl1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try {
    const lic = JSON.parse(new TextDecoder().decode(Uint8ArrayFrom(m[1]))) as License;
    if (lic?.v !== 1 || !lic.id || !lic.dev) return null;
    return { body: m[1], sig: m[2], lic };
  } catch { return null; }
}
function Uint8ArrayFrom(b64url: string): Uint8Array {
  const b = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b.padEnd(b.length + ((4 - (b.length % 4)) % 4), '='));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function revokedIds(refresh: boolean): Promise<Set<string>> {
  let ids = (await get<string[]>(REVOKED_KEY)) ?? [];
  if (refresh && navigator.onLine) {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}revoked.json?t=${Date.now()}`, { cache: 'no-store' });
      if (r.ok) { const j = await r.json() as { revoked?: string[] }; ids = j.revoked ?? []; await set(REVOKED_KEY, ids); }
    } catch { /* offline: keep cached list */ }
  }
  return new Set(ids);
}

export async function verifyToken(token: string, opts: { refreshRevoked?: boolean } = {}): Promise<{ ok: true; lic: License } | { ok: false; reason: string }> {
  const parsed = parseToken(token);
  if (!parsed) return { ok: false, reason: 'That does not look like a Daybrief invite.' };
  const pub = await importPublicJwk(OWNER_PUBLIC_JWK);
  if (!(await verify(pub, utf8(parsed.body), parsed.sig))) return { ok: false, reason: 'This invite was not issued by the owner.' };
  const mine = await getDevicePublicB64();
  if (parsed.lic.dev !== mine) return { ok: false, reason: 'This invite was issued for a different device. Ask the owner for one with your own device code.' };
  if (parsed.lic.exp && new Date(parsed.lic.exp).getTime() < Date.now()) return { ok: false, reason: 'This invite has expired.' };
  if ((await revokedIds(opts.refreshRevoked ?? false)).has(parsed.lic.id)) return { ok: false, reason: 'This invite has been revoked by the owner.' };
  return { ok: true, lic: parsed.lic };
}

export async function hasOwnerKey(): Promise<boolean> { return !!(await get<string>(OWNER_KEY)); }

export async function initLicense() {
  const token = await get<string>(LIC_KEY);
  if (!token) { setStatus({ state: 'locked' }); return; }
  const v = await verifyToken(token, { refreshRevoked: true });
  if (v.ok) setStatus({ state: 'ok', lic: v.lic, isOwnerDevice: await hasOwnerKey() });
  else { await del(LIC_KEY); setStatus({ state: 'locked', reason: v.reason }); }
}

export async function activate(token: string): Promise<void> {
  const v = await verifyToken(token, { refreshRevoked: true });
  if (!v.ok) throw new Error(v.reason);
  await set(LIC_KEY, token.trim());
  setStatus({ state: 'ok', lic: v.lic, isOwnerDevice: await hasOwnerKey() });
}

export async function deactivate() {
  await del(LIC_KEY);
  setStatus({ state: 'locked' });
}

// ---- Owner side -------------------------------------------------------------------------------

let ownerPrivCache: CryptoKey | null = null;
let ownerCacheTimer: ReturnType<typeof setTimeout> | undefined;

function rememberOwner(k: CryptoKey) {
  ownerPrivCache = k;
  clearTimeout(ownerCacheTimer);
  ownerCacheTimer = setTimeout(() => { ownerPrivCache = null; }, 5 * 60_000);
}
export function forgetOwnerUnlock() { ownerPrivCache = null; }

/** First-time owner setup: store the owner key encrypted with a passphrase and license this device as owner. */
export async function setupOwner(ownerKeyFileJson: string, passphrase: string, ownerName: string): Promise<void> {
  let jwk: JsonWebKey;
  try {
    const parsed = JSON.parse(ownerKeyFileJson) as { kind?: string; key?: JsonWebKey } | JsonWebKey;
    jwk = ('kind' in parsed && parsed.key) ? parsed.key : (parsed as JsonWebKey);
  } catch { throw new Error('That is not the owner key file.'); }
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d) throw new Error('That is not the owner key file.');
  if (jwk.x !== OWNER_PUBLIC_JWK.x || jwk.y !== OWNER_PUBLIC_JWK.y) throw new Error('This owner key does not match the key this app was built with.');
  if (passphrase.length < 8) throw new Error('Use a passphrase of at least 8 characters.');
  const priv = await importPrivateJwk(jwk);
  await set(OWNER_KEY, await wrapWithPassphrase(JSON.stringify(jwk), passphrase));
  rememberOwner(priv);
  const lic: License = { v: 1, id: `own-${randomId(6)}`, name: ownerName || 'Owner', dev: await getDevicePublicB64(), role: 'owner', iat: new Date().toISOString(), exp: null };
  await activate(await signLicense(priv, lic));
}

export async function unlockOwner(passphrase: string): Promise<CryptoKey> {
  if (ownerPrivCache) return ownerPrivCache;
  const wrapped = await get<string>(OWNER_KEY);
  if (!wrapped) throw new Error('This device does not hold the owner key.');
  const json = await unwrapWithPassphrase(wrapped, passphrase);
  if (!json) throw new Error('Wrong passphrase.');
  const priv = await importPrivateJwk(JSON.parse(json) as JsonWebKey);
  rememberOwner(priv);
  return priv;
}
export function ownerIsUnlocked() { return !!ownerPrivCache; }

export async function issueLicense(priv: CryptoKey, input: { deviceCode: string; name: string; days: number | null; note?: string }): Promise<{ token: string; record: IssuedRecord }> {
  const dev = parseDeviceCode(input.deviceCode);
  if (!dev) throw new Error('That device code is not valid. It starts with "db1." and is about 90 characters long.');
  if (!input.name.trim()) throw new Error('Give the person a name so you can recognise the invite later.');
  const lic: License = {
    v: 1, id: `inv-${randomId(8)}`, name: input.name.trim(), dev, role: 'member',
    iat: new Date().toISOString(), exp: input.days ? new Date(Date.now() + input.days * 86400_000).toISOString() : null,
    ...(input.note ? { note: input.note } : {}),
  };
  const token = await signLicense(priv, lic);
  const record: IssuedRecord = { id: lic.id, name: lic.name, note: lic.note, iat: lic.iat, exp: lic.exp, devShort: dev.slice(0, 8) };
  const list = await listIssued();
  await set(ISSUED_KEY, await seal([record, ...list]));
  return { token, record };
}

export async function listIssued(): Promise<IssuedRecord[]> {
  const sealed = await get<string>(ISSUED_KEY);
  return sealed ? ((await open<IssuedRecord[]>(sealed)) ?? []) : [];
}

export async function removeIssued(id: string) {
  const list = (await listIssued()).filter(r => r.id !== id);
  await set(ISSUED_KEY, await seal(list));
}

export async function forgetOwner() {
  await Promise.all([del(OWNER_KEY), del(ISSUED_KEY)]);
  ownerPrivCache = null;
  if (status.state === 'ok') setStatus({ ...status, isOwnerDevice: false });
}

export { deviceCode };
