import { useState } from 'react';
import { ExternalLink, Fingerprint, KeyRound, LogOut, Lock, Trash2 } from 'lucide-react';
import { Button, Card, Input, Section, Segmented, Switch, Textarea, cx } from '../components/ui';
import { GoogleMark } from './Onboarding';
import { OwnerConsole } from './OwnerConsole';
import { GoogleSetupGuide } from '../components/GoogleSetupGuide';
import { clearMailCache, updateSettings, useSettings, wipeEverything } from '../lib/store';
import { deactivate, forgetOwner, useLicense } from '../lib/license';
import { forgetDeviceKeys } from '../lib/crypto';
import { disableLock, enrollBiometric, lockNow, setPin, useAppLock } from '../lib/applock';
import { PROVIDER_META, defaultModel } from '../lib/ai';
import { TOPIC_CATALOGUE, type AiProviderId } from '../lib/types';
import { connectGoogle, disconnectGoogle, refresh, resetSession } from '../lib/session';
import { toast } from '../lib/toast';

export function SettingsScreen() {
  const s = useSettings();
  const [busy, setBusy] = useState(false);
  const meta = PROVIDER_META[s.ai.provider];
  const lic = useLicense();
  const lock = useAppLock();
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [guide, setGuide] = useState(false);
  const [pin, setPinDraft] = useState('');
  const isOwner = lic.state === 'ok' && lic.isOwnerDevice;

  return (
    <div className="px-4 pt-2 safe-top">
      <h1 className="mb-5 px-1 font-display text-[32px] font-bold tracking-tight">Settings</h1>

      <Section title="Mail">
        <Card className="p-4">
          {s.mail.provider === 'gmail' && s.mail.email ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-[13px] text-ink-3">Connected</div><div className="truncate font-semibold">{s.mail.email}</div></div>
              <Button size="sm" variant="secondary" onClick={() => { disconnectGoogle(); toast('Disconnected'); }}><LogOut size={16} /> Disconnect</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Button full variant="secondary" disabled={busy} onClick={async () => {
                if (!s.mail.googleClientId) { setGuide(true); return; }
                setBusy(true);
                try { await connectGoogle(); toast('Gmail connected'); void refresh({ force: true }); } catch (e) { toast(e instanceof Error ? e.message : 'Sign-in failed', 'err'); } finally { setBusy(false); }
              }}>
                <GoogleMark /> {busy ? 'Waiting for Google…' : 'Continue with Google'}
              </Button>
              <button className="w-full text-center text-[14px] font-semibold text-accent" onClick={() => setGuide(true)}>{s.mail.googleClientId ? 'Change client ID' : 'Google one-time setup steps'}</button>
              <p className="text-[13px] text-ink-3">Currently showing the demo inbox.</p>
            </div>
          )}
          <div className="mt-4 border-t border-line pt-3">
            <label className="flex items-center justify-between text-[15px]"><span>Unread emails per refresh</span>
              <select className="rounded-xl bg-card-2 px-3 py-1.5" value={s.mail.maxMessages} onChange={e => updateSettings({ mail: { ...s.mail, maxMessages: Number(e.target.value) } })}>
                {[15, 30, 50, 80].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
        </Card>
      </Section>

      <Section title="AI">
        <Card className="p-4">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(PROVIDER_META) as AiProviderId[]).map(id => (
              <button key={id} onClick={() => { updateSettings({ ai: { ...s.ai, provider: id, model: defaultModel(id) } }); resetSession(); }}
                className={cx('pressable rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold ring-1', s.ai.provider === id ? 'bg-accent/12 text-accent ring-accent/50' : 'bg-card-2 ring-transparent')}>{PROVIDER_META[id].label}</button>
            ))}
          </div>
          {s.ai.provider !== 'demo' && (
            <div className="mt-4 space-y-4">
              <Input label="API key" type="password" placeholder={meta.keyHint} value={s.ai.apiKey} autoCapitalize="off" autoCorrect="off" onChange={e => updateSettings({ ai: { ...s.ai, apiKey: e.target.value.trim() } })}
                hint={<a className="inline-flex items-center gap-1 text-accent" href={meta.keyUrl} target="_blank" rel="noreferrer">Get a key <ExternalLink size={12} /></a>} />
              <div>
                <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Model</span>
                <div className="space-y-1.5">
                  {meta.models.map(m => (
                    <button key={m.id} onClick={() => updateSettings({ ai: { ...s.ai, model: m.id } })} className={cx('pressable flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left ring-1', s.ai.model === m.id ? 'bg-accent/12 ring-accent/50' : 'bg-card-2 ring-transparent')}>
                      <span className="font-semibold">{m.label}</span><span className="text-[13px] text-ink-3">{m.note}</span>
                    </button>
                  ))}
                </div>
                <Input className="mt-2" placeholder="or type any model id" value={s.ai.model} onChange={e => updateSettings({ ai: { ...s.ai, model: e.target.value.trim() } })} />
              </div>
              {s.ai.provider === 'anthropic' && (
                <div>
                  <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Effort</span>
                  <Segmented value={s.ai.effort} onChange={v => updateSettings({ ai: { ...s.ai, effort: v } })} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} />
                  <p className="mt-1.5 text-[12.5px] text-ink-3">Higher effort thinks longer and costs more. Medium is right for mail.</p>
                </div>
              )}
            </div>
          )}
        </Card>
      </Section>

      <Section title="Replies">
        <Card className="p-4 space-y-4">
          <div>
            <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Style</span>
            <Segmented value={s.replyStyle} onChange={v => updateSettings({ replyStyle: v })} options={[{ value: 'concise', label: 'Concise' }, { value: 'friendly', label: 'Friendly' }, { value: 'formal', label: 'Formal' }]} />
          </div>
          <Input label="Your name" value={s.name} onChange={e => updateSettings({ name: e.target.value })} />
          <div>
            <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Signature</span>
            <Textarea rows={2} placeholder={'Best,\nAlex'} value={s.signature} onChange={e => updateSettings({ signature: e.target.value })} />
          </div>
        </Card>
      </Section>

      <Section title="Voice">
        <Card className="px-4 py-1">
          <Switch label="Spoken brief" description="Show the player on Today" checked={s.voice.enabled} onChange={v => updateSettings({ voice: { ...s.voice, enabled: v } })} />
          <Switch label="Play automatically" description="Start reading when the brief is ready" checked={s.voice.autoplay} onChange={v => updateSettings({ voice: { ...s.voice, autoplay: v } })} />
          <label className="flex items-center justify-between py-3 text-[16px]"><span>Speed</span>
            <input type="range" min={0.8} max={1.4} step={0.1} value={s.voice.rate} onChange={e => updateSettings({ voice: { ...s.voice, rate: Number(e.target.value) } })} className="w-36 accent-[var(--accent)]" />
          </label>
        </Card>
      </Section>

      <Section title="News topics">
        <Card className="p-4">
          <div className="flex flex-wrap gap-2">
            {TOPIC_CATALOGUE.map(t => {
              const on = s.topics.includes(t);
              return <button key={t} onClick={() => updateSettings({ topics: on ? s.topics.filter(x => x !== t) : [...s.topics, t] })} className={cx('pressable rounded-full px-3.5 py-1.5 text-[14px] font-semibold ring-1', on ? 'bg-accent text-accent-ink ring-accent' : 'bg-card-2 text-ink-2 ring-transparent')}>{t}</button>;
            })}
          </div>
          <p className="mt-3 text-[13px] text-ink-3">The news brief arrives in the next update and will use these.</p>
        </Card>
      </Section>

      <Section title="Appearance">
        <Card className="p-4">
          <Segmented value={s.theme} onChange={v => updateSettings({ theme: v })} options={[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </Card>
      </Section>

      <Section title="Security">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-[15px] font-semibold"><Lock size={18} className="text-accent" /> App lock</div>
          <p className="mt-1 text-[13px] text-ink-3">Ask for {lock.biometricAvailable ? 'Face ID, fingerprint or ' : ''}a PIN when the app opens and after it has been in the background.</p>
          <div className="mt-3 space-y-3">
            {s.security.lock === 'off' ? (
              <>
                <div className="flex gap-2">
                  <Input className="flex-1" inputMode="numeric" pattern="[0-9]*" type="password" placeholder="Choose a 4–8 digit PIN" value={pin} onChange={e => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 8))} />
                  <Button variant="secondary" disabled={pin.length < 4} onClick={async () => { try { await setPin(pin); setPinDraft(''); toast('PIN set'); } catch (e) { toast(e instanceof Error ? e.message : 'Invalid PIN', 'err'); } }}>Set</Button>
                </div>
                {lock.biometricAvailable && <Button full variant="secondary" onClick={async () => { try { await enrollBiometric(s.name); toast('Biometric lock on'); } catch (e) { toast(e instanceof Error ? e.message : 'Could not enrol', 'err'); } }}><Fingerprint size={18} /> Use Face ID / fingerprint</Button>}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-xl bg-card-2 px-3.5 py-2.5 text-[14px]">
                  <span>{s.security.lock === 'biometric' ? 'Biometrics' : 'PIN'}{s.security.pinHash && s.security.lock === 'biometric' ? ' + PIN fallback' : ''} on</span>
                  <Button size="sm" variant="ghost" onClick={() => { disableLock(); toast('App lock off'); }}>Turn off</Button>
                </div>
                {s.security.lock === 'biometric' && !s.security.pinHash && (
                  <div className="flex gap-2">
                    <Input className="flex-1" inputMode="numeric" type="password" placeholder="Add a PIN fallback" value={pin} onChange={e => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 8))} />
                    <Button variant="secondary" disabled={pin.length < 4} onClick={async () => { await setPin(pin); setPinDraft(''); toast('PIN set'); }}>Set</Button>
                  </div>
                )}
                {s.security.lock === 'pin' && lock.biometricAvailable && <Button full variant="secondary" onClick={async () => { try { await enrollBiometric(s.name); toast('Biometric lock on'); } catch (e) { toast(e instanceof Error ? e.message : 'Could not enrol', 'err'); } }}><Fingerprint size={18} /> Also allow Face ID / fingerprint</Button>}
                <label className="flex items-center justify-between text-[15px]"><span>Lock after</span>
                  <select className="rounded-xl bg-card-2 px-3 py-1.5" value={s.security.autoLockMinutes} onChange={e => updateSettings({ security: { ...s.security, autoLockMinutes: Number(e.target.value) } })}>
                    {[0, 1, 5, 15, 60].map(n => <option key={n} value={n}>{n === 0 ? 'immediately' : `${n} min`}</option>)}
                  </select>
                </label>
                <Button full variant="ghost" size="sm" onClick={lockNow}>Lock now</Button>
              </>
            )}
          </div>
          <div className="mt-4 border-t border-line pt-1">
            <Switch label="Keep mail offline" description="Encrypted copy on this device so the app opens instantly" checked={s.security.keepMailOffline} onChange={v => { updateSettings({ security: { ...s.security, keepMailOffline: v } }); if (!v) clearMailCache(); }} />
          </div>
        </Card>
      </Section>

      <Section title="Access">
        <Card className="p-4">
          {lic.state === 'ok' && (
            <div className="text-[14px] text-ink-2">
              <div className="flex items-center justify-between"><span>This device</span><span className="font-semibold">{lic.lic.role === 'owner' ? 'Owner' : 'Invited'} · {lic.lic.name}</span></div>
              <div className="mt-1 flex items-center justify-between text-ink-3"><span>Invite id</span><span className="font-mono text-[12.5px]">{lic.lic.id}</span></div>
              {lic.lic.exp && <div className="mt-1 flex items-center justify-between text-ink-3"><span>Expires</span><span>{new Date(lic.lic.exp).toLocaleDateString()}</span></div>}
            </div>
          )}
          {isOwner && <Button full variant="sun" className="mt-3" onClick={() => setOwnerOpen(true)}><KeyRound size={18} /> Owner console: invite people</Button>}
          <p className="mt-3 text-[13px] leading-relaxed text-ink-3">Invites are tied to one device and cannot be forwarded. Only the owner can create them.</p>
        </Card>
      </Section>

      <Section title="Privacy">
        <Card className="p-4">
          <p className="text-[14px] leading-relaxed text-ink-2">Mail, summaries, keys and preferences are encrypted and live only in this browser's storage. Nothing is sent anywhere except to Google for mail and to the AI provider you chose for summaries.</p>
          <Button variant="danger" full className="mt-4" onClick={async () => { if (confirm('Delete all local data, keys and this device\'s invite, and sign out?')) { disconnectGoogle(); await wipeEverything(); await forgetOwner(); await deactivate(); await forgetDeviceKeys(); location.reload(); } }}><Trash2 size={18} /> Delete everything</Button>
        </Card>
      </Section>
      <OwnerConsole open={ownerOpen} onClose={() => setOwnerOpen(false)} />
      <GoogleSetupGuide open={guide} onClose={() => setGuide(false)} />
      <p className="pb-4 text-center text-[12px] text-ink-3">Daybrief 0.2 · phase one, browser-only, invite-only</p>
    </div>
  );
}
