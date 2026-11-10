import { useSyncExternalStore } from 'react';
import { b64u, hashSecret, unb64u } from './crypto';
import { getState, updateSettings } from './store';

// App lock: a PIN or the phone's biometrics (Face ID, fingerprint) must be given before the
// inbox is shown, on open and again after the app has been in the background for a while.

interface LockState { locked: boolean; biometricAvailable: boolean }
let st: LockState = { locked: false, biometricAvailable: false };
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useAppLock(): LockState { return useSyncExternalStore(subscribe, () => st, () => st); }

let hiddenAt = 0;

export async function initAppLock() {
  const { security } = getState().settings;
  st = { ...st, locked: security.lock !== 'off' };
  try {
    st.biometricAvailable = !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { st.biometricAvailable = false; }
  emit();
  document.addEventListener('visibilitychange', () => {
    const s = getState().settings.security;
    if (s.lock === 'off') return;
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > s.autoLockMinutes * 60_000) lockNow();
  });
}

export function lockNow() { st = { ...st, locked: true }; emit(); }
function unlock() { st = { ...st, locked: false }; hiddenAt = 0; emit(); }

export async function setPin(pin: string) {
  if (!/^\d{4,8}$/.test(pin)) throw new Error('Use 4 to 8 digits.');
  const { hash, salt } = await hashSecret(pin);
  updateSettings(s => ({ security: { ...s.security, pinHash: hash, pinSalt: salt, lock: s.security.lock === 'off' ? 'pin' : s.security.lock } }));
}

export async function unlockWithPin(pin: string): Promise<boolean> {
  const { security } = getState().settings;
  if (!security.pinHash || !security.pinSalt) return false;
  const { hash } = await hashSecret(pin, security.pinSalt);
  if (hash !== security.pinHash) return false;
  unlock();
  return true;
}

export async function enrollBiometric(displayName: string): Promise<void> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Daybrief', id: location.hostname },
      user: { id: userId, name: displayName || 'daybrief-user', displayName: displayName || 'Daybrief user' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60_000,
      attestation: 'none',
    },
  }) as PublicKeyCredential | null;
  if (!cred) throw new Error('Biometric setup was cancelled.');
  updateSettings(s => ({ security: { ...s.security, credentialId: b64u(cred.rawId), lock: 'biometric' } }));
}

export async function unlockWithBiometric(): Promise<boolean> {
  const { security } = getState().settings;
  if (!security.credentialId) return false;
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: unb64u(security.credentialId) as BufferSource }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    if (!assertion) return false;
    unlock();
    return true;
  } catch { return false; }
}

export function disableLock() {
  updateSettings(s => ({ security: { ...s.security, lock: 'off', pinHash: undefined, pinSalt: undefined, credentialId: undefined } }));
  unlock();
}
