import { useEffect, useState } from 'react';
import { Copy, Share2, Trash2, UserPlus, KeyRound } from 'lucide-react';
import { Button, Input, Sheet, Textarea } from '../components/ui';
import { issueLicense, listIssued, ownerIsUnlocked, removeIssued, unlockOwner, type IssuedRecord } from '../lib/license';
import { toast } from '../lib/toast';

// Where the owner turns a device code into an invite, and keeps track of who has one.
export function OwnerConsole({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [unlocked, setUnlocked] = useState(ownerIsUnlocked());
  const [pass, setPass] = useState('');
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [days, setDays] = useState<string>('0');
  const [token, setToken] = useState('');
  const [issued, setIssued] = useState<IssuedRecord[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { void listIssued().then(setIssued); setUnlocked(ownerIsUnlocked()); setToken(''); } }, [open]);

  const unlock = async () => {
    setBusy(true);
    try { setKey(await unlockOwner(pass)); setUnlocked(true); setPass(''); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not unlock', 'err'); }
    finally { setBusy(false); }
  };

  const issue = async () => {
    setBusy(true);
    try {
      const k = key ?? await unlockOwner(pass);
      const { token: t } = await issueLicense(k, { deviceCode: code, name, days: Number(days) || null, note: note || undefined });
      setToken(t); setIssued(await listIssued()); setCode(''); setName(''); setNote('');
      toast('Invite created');
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not create invite', 'err'); }
    finally { setBusy(false); }
  };

  const shareToken = async () => {
    const text = `Your Daybrief invite (works only on the device whose code you sent):\n${token}`;
    if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* cancelled */ } }
    await navigator.clipboard.writeText(token); toast('Invite copied');
  };

  return (
    <Sheet open={open} onClose={onClose} full title="Owner console">
      {!unlocked ? (
        <div className="pb-6">
          <div className="flex items-center gap-2 text-sun"><KeyRound size={18} /><span className="text-[13px] font-bold uppercase tracking-[0.08em]">Locked</span></div>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">Enter the passphrase you set for the owner key. It stays unlocked for five minutes.</p>
          <Input className="mt-4" type="password" placeholder="Passphrase" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void unlock(); }} />
          <Button full className="mt-3" variant="sun" disabled={!pass || busy} onClick={unlock}>Unlock</Button>
        </div>
      ) : (
        <div className="pb-6">
          <section className="rounded-2xl bg-card p-4 ring-1 ring-line">
            <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.08em] text-ink-3"><UserPlus size={16} /> New invite</div>
            <div className="mt-3 space-y-3">
              <Textarea rows={2} placeholder="Paste the person's device code (db1.…)" value={code} onChange={e => setCode(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} className="font-mono text-[13px]" />
              <Input placeholder="Their name" value={name} onChange={e => setName(e.target.value)} />
              <Input placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} />
              <label className="flex items-center justify-between text-[15px]"><span>Valid for</span>
                <select className="rounded-xl bg-card-2 px-3 py-1.5" value={days} onChange={e => setDays(e.target.value)}>
                  <option value="0">No expiry</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option>
                </select>
              </label>
              <Button full disabled={!code.trim() || !name.trim() || busy} onClick={issue}>Create invite</Button>
            </div>
            {token && (
              <div className="mt-4 rounded-2xl bg-card-2 p-3">
                <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-3">Send this to them</div>
                <div className="mt-1.5 max-h-24 overflow-y-auto break-all font-mono text-[12px] text-ink-2">{token}</div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={shareToken}><Share2 size={16} /> Share</Button>
                  <Button size="sm" variant="secondary" onClick={async () => { await navigator.clipboard.writeText(token); toast('Copied'); }}><Copy size={16} /> Copy</Button>
                </div>
              </div>
            )}
          </section>

          <section className="mt-5">
            <div className="mb-2 px-1 text-[13px] font-bold uppercase tracking-[0.08em] text-ink-3">Invites issued · {issued.length}</div>
            {issued.length === 0 && <p className="px-1 text-[14px] text-ink-3">No invites yet.</p>}
            <div className="divide-y divide-line overflow-hidden rounded-2xl bg-card ring-1 ring-line">
              {issued.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.name}{r.note ? <span className="font-normal text-ink-3"> · {r.note}</span> : null}</div>
                    <div className="text-[12.5px] text-ink-3">{r.id} · {new Date(r.iat).toLocaleDateString()}{r.exp ? ` → ${new Date(r.exp).toLocaleDateString()}` : ''} · device {r.devShort}…</div>
                  </div>
                  <button aria-label="Forget" className="text-ink-3" onClick={async () => { await removeIssued(r.id); setIssued(await listIssued()); }}><Trash2 size={18} /></button>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-2xl bg-card-2 p-3 text-[13px] leading-relaxed text-ink-2">
              <b>To revoke an invite:</b> add its id to <code className="font-mono">daybrief/public/revoked.json</code> in the GitHub repository. Every device checks that file when it opens and locks itself if its id is listed.
              {issued.length > 0 && <Button size="sm" variant="secondary" className="mt-2" onClick={async () => { await navigator.clipboard.writeText(JSON.stringify({ revoked: issued.map(r => r.id) }, null, 2)); toast('revoked.json with all ids copied'); }}><Copy size={14} /> Copy a revoked.json with every id</Button>}
            </div>
          </section>
        </div>
      )}
    </Sheet>
  );
}
