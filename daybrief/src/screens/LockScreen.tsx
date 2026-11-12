import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Delete, Fingerprint, ScanFace } from 'lucide-react';
import { cx } from '../components/ui';
import { useSettings } from '../lib/store';
import { unlockWithBiometric, unlockWithPin } from '../lib/applock';

export function LockScreen() {
  const { security, name } = useSettings();
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(0);
  const [tries, setTries] = useState(0);
  const bio = security.lock === 'biometric' && !!security.credentialId;
  const isApple = /iPhone|iPad|Mac/.test(navigator.userAgent);

  useEffect(() => { if (bio) void unlockWithBiometric(); }, [bio]);

  useEffect(() => {
    if (pin.length < 4 || !security.pinHash) return;
    let cancelled = false;
    void unlockWithPin(pin).then(ok => {
      if (cancelled || ok) return;
      if (pin.length >= 8 || pin.length >= (security.pinHash ? 4 : 8)) {
        // Only shake when the entry can no longer become correct by typing more digits.
        setShake(s => s + 1); setTries(t => t + 1); setPin('');
      }
    });
    return () => { cancelled = true; };
  }, [pin, security.pinHash]);

  const delay = Math.min(30, Math.max(0, tries - 4) * 5);
  const press = (d: string) => { if (delay) return; setPin(p => (p + d).slice(0, 8)); };

  return (
    <div className="hero-gradient mx-auto flex h-full w-full max-w-[640px] flex-col items-center justify-between px-6 pb-10 safe-top">
      <div className="mt-14 text-center">
        <img src="icon.svg" alt="" className="mx-auto h-14 w-14 rounded-[16px] shadow-float" />
        <h1 className="mt-5 font-display text-[26px] font-bold tracking-tight">{name ? `Hi ${name.split(' ')[0]}` : 'Daybrief is locked'}</h1>
        <p className="mt-1 text-[15px] text-ink-3">{delay ? `Too many attempts. Wait ${delay}s.` : security.pinHash ? 'Enter your PIN' : 'Use your biometrics to continue'}</p>
      </div>

      {security.pinHash && (
        <motion.div key={shake} animate={shake ? { x: [0, -10, 10, -8, 8, 0] } : {}} transition={{ duration: 0.4 }} className="flex gap-3">
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => <span key={i} className={cx('h-3.5 w-3.5 rounded-full ring-2 ring-ink/40 transition-colors', i < pin.length && 'bg-ink ring-ink')} />)}
        </motion.div>
      )}

      <div className="w-full max-w-[320px]">
        {security.pinHash && (
          <div className="grid grid-cols-3 gap-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) => k === '' ? (
              <span key={i} className="grid place-items-center">
                {bio && <button aria-label="Use biometrics" onClick={() => void unlockWithBiometric()} className="pressable grid h-16 w-16 place-items-center rounded-full text-accent">{isApple ? <ScanFace size={28} /> : <Fingerprint size={28} />}</button>}
              </span>
            ) : (
              <button key={k} aria-label={k === 'del' ? 'Delete' : k} onClick={() => k === 'del' ? setPin(p => p.slice(0, -1)) : press(k)} disabled={!!delay}
                className="pressable mx-auto grid h-16 w-16 place-items-center rounded-full bg-card/70 text-[26px] font-medium ring-1 ring-line disabled:opacity-40">
                {k === 'del' ? <Delete size={24} /> : k}
              </button>
            ))}
          </div>
        )}
        {!security.pinHash && bio && (
          <button onClick={() => void unlockWithBiometric()} className="pressable mx-auto flex items-center gap-2 rounded-2xl bg-accent px-6 py-4 font-semibold text-accent-ink">{isApple ? <ScanFace size={22} /> : <Fingerprint size={22} />} Unlock</button>
        )}
      </div>
    </div>
  );
}
