import { get, set, del } from 'idb-keyval';

// All cryptography uses WebCrypto. Device keys are generated non-extractable and kept in
// IndexedDB, so they can be used on this device but never copied off it.

export function b64u(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64u(s: string): Uint8Array {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b.padEnd(b.length + ((4 - (b.length % 4)) % 4), '='));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
const te = new TextEncoder();
const td = new TextDecoder();
export const utf8 = (s: string) => te.encode(s);

export function randomId(n = 10): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(r, b => alphabet[b % alphabet.length]).join('');
}

// ---- Device identity (ECDSA P-256) ---------------------------------------------------------

const DEVICE_KEY = 'daybrief.device.v1';
let devicePair: Promise<CryptoKeyPair> | null = null;

export function getDeviceKey(): Promise<CryptoKeyPair> {
  return (devicePair ??= (async () => {
    const existing = await get<CryptoKeyPair>(DEVICE_KEY);
    if (existing?.privateKey && existing.publicKey) return existing;
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    await set(DEVICE_KEY, pair);
    return pair;
  })());
}

export async function getDevicePublicB64(): Promise<string> {
  const { publicKey } = await getDeviceKey();
  return b64u(await crypto.subtle.exportKey('raw', publicKey));
}

/** The code a new user sends to the owner. It is the device's public key, nothing secret. */
export async function deviceCode(): Promise<string> { return `db1.${await getDevicePublicB64()}`; }

export function parseDeviceCode(code: string): string | null {
  const m = code.trim().match(/^db1\.([A-Za-z0-9_-]{80,100})$/);
  if (!m) return null;
  try { return unb64u(m[1]).length === 65 ? m[1] : null; } catch { return null; }
}

// ---- Signing / verifying (owner licenses) --------------------------------------------------

export async function importPublicJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
}
export async function importPrivateJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', { ...jwk, key_ops: ['sign'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}
export async function sign(priv: CryptoKey, data: Uint8Array): Promise<string> {
  return b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, data as BufferSource));
}
export async function verify(pub: CryptoKey, data: Uint8Array, sig: string): Promise<boolean> {
  try { return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64u(sig) as BufferSource, data as BufferSource); } catch { return false; }
}
export async function publicJwkFromPrivate(privJwk: JsonWebKey): Promise<JsonWebKey> {
  const { kty, crv, x, y } = privJwk;
  return { kty, crv, x, y } as JsonWebKey;
}

// ---- Data at rest (AES-GCM with a non-extractable device key) ------------------------------

const DATA_KEY = 'daybrief.datakey.v1';
let dataKey: Promise<CryptoKey> | null = null;

export function getDataKey(): Promise<CryptoKey> {
  return (dataKey ??= (async () => {
    const existing = await get<CryptoKey>(DATA_KEY);
    if (existing) return existing;
    const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await set(DATA_KEY, k);
    return k;
  })());
}

export async function seal(value: unknown): Promise<string> {
  const k = await getDataKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, utf8(JSON.stringify(value)));
  return `${b64u(iv)}.${b64u(ct)}`;
}
export async function open<T>(sealed: string): Promise<T | undefined> {
  try {
    const [iv, ct] = sealed.split('.');
    const k = await getDataKey();
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(iv) as BufferSource }, k, unb64u(ct) as BufferSource);
    return JSON.parse(td.decode(pt)) as T;
  } catch { return undefined; }
}

// ---- Passphrase wrapping (owner key, PIN hashing) -------------------------------------------

const PBKDF2_ITER = 310_000;

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', utf8(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: PBKDF2_ITER }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function wrapWithPassphrase(plaintext: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await deriveKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, utf8(plaintext));
  return `p1.${b64u(salt)}.${b64u(iv)}.${b64u(ct)}`;
}
export async function unwrapWithPassphrase(wrapped: string, passphrase: string): Promise<string | null> {
  try {
    const [, salt, iv, ct] = wrapped.split('.');
    const k = await deriveKey(passphrase, unb64u(salt));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(iv) as BufferSource }, k, unb64u(ct) as BufferSource);
    return td.decode(pt);
  } catch { return null; }
}

export async function hashSecret(secret: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? unb64u(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const base = await crypto.subtle.importKey('raw', utf8(secret.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: PBKDF2_ITER }, base, 256);
  return { hash: b64u(bits), salt: b64u(salt) };
}

export async function forgetDeviceKeys() {
  await Promise.all([del(DEVICE_KEY), del(DATA_KEY)]);
  devicePair = null; dataKey = null;
}
