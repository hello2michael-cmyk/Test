import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Copy, KeyRound, Lock, Share2, ShieldCheck } from 'lucide-react';
import { Button, Input, Textarea, cx } from '../components/ui';
import { activate, deviceCode, setupOwner, useLicense } from '../lib/license';
import { toast } from '../lib/toast';

// Shown before anything else when this device has no valid invite from the owner.
export function Locked() {
  const lic = useLicense();
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [owner, setOwner] = useState(false);
  const [ownerKey, setOwnerKey] = useState('');
  const [pass, setPass] = useState('');
  const [name, setName] = useState('');

  useEffect(() => { void deviceCode().then(setCode); }, []);
  const reason = lic.state === 'locked' ? lic.reason : undefined;

  const share = async () => {
    const text = `My Daybrief device code:\n${code}`;
    if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* cancelled */ } }
    await navigator.clipboard.writeText(code); toast('Device code copied');
  };

  return (
    <div className="hero-gradient mx-auto flex h-full w-full max-w-[640px] flex-col overflow-y-auto px-6 pb-10 safe-top">
      <div className="mt-6 flex items-center gap-3">
        <img src="icon.svg" alt="" className="h-12 w-12 rounded-[14px] shadow-float" />
        <div><div className="font-display text-[22px] font-bold leading-none tracking-tight">Daybrief</div><div className="mt-1 text-[13px] text-ink-3">Private preview</div></div>
      </div>

      <AnimatePresence mode="wait">
        {!owner ? (
          <motion.div key="member" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="mt-10 flex items-center gap-2 text-accent"><Lock size={20} /><span className="text-[13px] font-bold uppercase tracking-[0.08em]">Invite only</span></div>
            <h1 className="mt-2 font-display text-[32px] font-bold leading-tight tracking-tight">This app opens with an invite from its owner.</h1>
            <p className="mt-3 text-[16px] leading-relaxed text-ink-2">Send the owner your device code below. They will reply with an invite that works on this device only, so it cannot be passed on.</p>

            {reason && <div className="mt-4 rounded-2xl bg-danger/10 p-3 text-[14px] text-danger">{reason}</div>}

            <div className="mt-6 rounded-2xl bg-card p-4 shadow-card ring-1 ring-line">
              <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-3">Your device code</div>
              <div className="mt-2 break-all font-mono text-[13px] leading-relaxed text-ink-2">{code || '…'}</div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={share}><Share2 size={16} /> Send to owner</Button>
                <Button size="sm" variant="ghost" onClick={async () => { await navigator.clipboard.writeText(code); toast('Copied'); }}><Copy size={16} /> Copy</Button>
              </div>
            </div>

            <div className="mt-6">
              <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Paste the invite you received</span>
              <Textarea rows={3} placeholder="dbl1.…" value={token} onChange={e => setToken(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} className="font-mono text-[13px]" />
              <Button full size="lg" className="mt-3" disabled={!token.trim() || busy} onClick={async () => { setBusy(true); try { await activate(token); toast('Welcome in'); } catch (e) { toast(e instanceof Error ? e.message : 'Invalid invite', 'err'); } finally { setBusy(false); } }}>
                <ShieldCheck size={20} /> Unlock
              </Button>
            </div>

            <button className="mt-10 w-full text-center text-[14px] font-semibold text-ink-3 underline-offset-4 hover:underline" onClick={() => setOwner(true)}>I am the owner</button>
          </motion.div>
        ) : (
          <motion.div key="owner" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="mt-10 flex items-center gap-2 text-sun"><KeyRound size={20} /><span className="text-[13px] font-bold uppercase tracking-[0.08em]">Owner setup</span></div>
            <h1 className="mt-2 font-display text-[32px] font-bold leading-tight tracking-tight">Load your owner key.</h1>
            <p className="mt-3 text-[16px] leading-relaxed text-ink-2">Paste the contents of your owner key file. It is encrypted with a passphrase and stored only on this device. You will need the passphrase each time you issue an invite.</p>
            <div className="mt-6 space-y-4">
              <Textarea rows={4} placeholder='{"kind":"daybrief-owner-key", …}' value={ownerKey} onChange={e => setOwnerKey(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} className="font-mono text-[12.5px]" />
              <Input label="Your name" placeholder="Shown on your own license" value={name} onChange={e => setName(e.target.value)} />
              <Input label="Passphrase for the owner key" type="password" placeholder="At least 8 characters" value={pass} onChange={e => setPass(e.target.value)} />
              <Button full size="lg" variant="sun" disabled={!ownerKey.trim() || pass.length < 8 || busy} onClick={async () => { setBusy(true); try { await setupOwner(ownerKey, pass, name); setOwnerKey(''); setPass(''); toast('You are set up as owner'); } catch (e) { toast(e instanceof Error ? e.message : 'Could not load key', 'err'); } finally { setBusy(false); } }}>
                Set up this device as owner
              </Button>
              <button className={cx('w-full text-center text-[14px] font-semibold text-ink-3')} onClick={() => setOwner(false)}>Back</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
