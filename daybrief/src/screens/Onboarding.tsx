import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, KeyRound, Mail, Sparkles, ShieldCheck } from 'lucide-react';
import { Button, Input, cx } from '../components/ui';
import { updateSettings, useSettings } from '../lib/store';
import { PROVIDER_META, defaultModel } from '../lib/ai';
import { TOPIC_CATALOGUE, type AiProviderId } from '../lib/types';
import { connectGoogle } from '../lib/session';
import { toast } from '../lib/toast';
import { GoogleSetupGuide } from '../components/GoogleSetupGuide';

const steps = ['welcome', 'mail', 'ai', 'topics'] as const;
type Step = typeof steps[number];

export function Onboarding() {
  const s = useSettings();
  const [step, setStep] = useState<Step>('welcome');
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState(false);
  const i = steps.indexOf(step);
  const next = () => setStep(steps[Math.min(i + 1, steps.length - 1)]);

  return (
    <div className="hero-gradient mx-auto flex h-full w-full max-w-[640px] flex-col safe-top">
      <div className="flex items-center gap-1.5 px-6 pt-2">
        {steps.map((st, k) => <span key={st} className={cx('h-1 flex-1 rounded-full transition-colors', k <= i ? 'bg-accent' : 'bg-ink-3/25')} />)}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-6">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
            {step === 'welcome' && (
              <div className="flex min-h-[70dvh] flex-col justify-between">
                <div>
                  <img src="icon.svg" alt="" className="h-16 w-16 rounded-[18px] shadow-float" />
                  <h1 className="mt-8 font-display text-[40px] font-bold leading-[1.05] tracking-tight">Your day,<br />already sorted.</h1>
                  <p className="mt-4 text-[17px] leading-relaxed text-ink-2">Daybrief reads your unread mail, tells you what matters, drafts the replies, and reads it all out loud while you make coffee.</p>
                  <ul className="mt-8 space-y-3 text-[15px] text-ink-2">
                    {[
                      [ShieldCheck, 'No password is ever asked for. You sign in with Google itself.'],
                      [Sparkles, 'Your own AI key, or demo mode to look around first.'],
                      [Mail, 'Nothing is stored on a server. Everything stays on this phone.'],
                    ].map(([Icon, text], k) => {
                      const I = Icon as typeof ShieldCheck;
                      return <li key={k} className="flex items-start gap-3"><I size={20} className="mt-0.5 shrink-0 text-accent" /><span>{text as string}</span></li>;
                    })}
                  </ul>
                </div>
                <div className="mt-10">
                  <Input label="What should we call you?" placeholder="Your first name" value={s.name} onChange={e => updateSettings({ name: e.target.value })} autoComplete="given-name" />
                  <Button size="lg" full className="mt-4" onClick={next}>Get started <ArrowRight size={20} /></Button>
                </div>
              </div>
            )}

            {step === 'mail' && (
              <div>
                <h1 className="font-display text-[32px] font-bold leading-tight tracking-tight">Connect your mail</h1>
                <p className="mt-3 text-[16px] leading-relaxed text-ink-2">Tap the button and Google asks you directly. Daybrief only gets permission to read, label and send; it never sees your password.</p>
                <div className="mt-6 space-y-4">
                  <Button size="lg" full variant="secondary" disabled={busy}
                    onClick={async () => {
                      if (!s.mail.googleClientId) { setGuide(true); return; }
                      setBusy(true);
                      try { await connectGoogle(); toast('Gmail connected'); next(); } catch (e) { toast(e instanceof Error ? e.message : 'Sign-in failed', 'err'); } finally { setBusy(false); }
                    }}>
                    <GoogleMark /> {busy ? 'Waiting for Google…' : s.mail.email ? `Connected: ${s.mail.email}` : 'Continue with Google'}
                  </Button>
                  {!s.mail.googleClientId
                    ? <p className="text-center text-[13px] leading-relaxed text-ink-3">First time: Google needs a one-time registration from you. Tap the button and the app walks you through it, about five minutes.</p>
                    : <p className="truncate text-center text-[12.5px] text-ink-3">Client ID: {s.mail.googleClientId}</p>}
                  <button className="w-full text-center text-[14px] font-semibold text-accent" onClick={() => setGuide(true)}>{s.mail.googleClientId ? 'Change client ID' : 'Show me the setup steps'}</button>
                  <Button size="lg" full variant="ghost" onClick={() => { updateSettings({ mail: { ...s.mail, provider: 'demo' } }); next(); }}>Use the demo inbox for now</Button>
                </div>
              </div>
            )}

            {step === 'ai' && (
              <div>
                <h1 className="font-display text-[32px] font-bold leading-tight tracking-tight">Choose your AI</h1>
                <p className="mt-3 text-[16px] leading-relaxed text-ink-2">The model reads your mail and writes the drafts. Your key is stored only on this phone and sent only to the provider you pick.</p>
                <div className="mt-6 grid grid-cols-2 gap-2">
                  {(Object.keys(PROVIDER_META) as AiProviderId[]).map(id => (
                    <button key={id} onClick={() => updateSettings({ ai: { ...s.ai, provider: id, model: defaultModel(id) } })}
                      className={cx('pressable rounded-2xl p-4 text-left ring-1', s.ai.provider === id ? 'bg-card ring-accent shadow-card' : 'bg-card/60 ring-line')}>
                      <span className="flex items-center justify-between"><span className="font-bold">{PROVIDER_META[id].label}</span>{s.ai.provider === id && <Check size={18} className="text-accent" />}</span>
                      <span className="mt-1 block text-[13px] text-ink-3">{id === 'demo' ? 'Sample summaries, no key' : id === 'anthropic' ? 'Recommended' : 'Bring your own key'}</span>
                    </button>
                  ))}
                </div>
                {s.ai.provider !== 'demo' && (
                  <div className="mt-5">
                    <Input label={`${PROVIDER_META[s.ai.provider].label} API key`} type="password" placeholder={PROVIDER_META[s.ai.provider].keyHint} value={s.ai.apiKey} autoCapitalize="off" autoCorrect="off"
                      onChange={e => updateSettings({ ai: { ...s.ai, apiKey: e.target.value.trim() } })}
                      hint={<>Get one at <a className="text-accent underline" href={PROVIDER_META[s.ai.provider].keyUrl} target="_blank" rel="noreferrer">{PROVIDER_META[s.ai.provider].keyUrl.replace('https://', '')}</a></>} />
                  </div>
                )}
                <Button size="lg" full className="mt-8" onClick={next} disabled={s.ai.provider !== 'demo' && !s.ai.apiKey}><KeyRound size={18} /> Continue</Button>
              </div>
            )}

            {step === 'topics' && (
              <div>
                <h1 className="font-display text-[32px] font-bold leading-tight tracking-tight">What do you follow?</h1>
                <p className="mt-3 text-[16px] leading-relaxed text-ink-2">Pick the topics for your news brief. The news tab arrives in the next update; your picks are saved now.</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {TOPIC_CATALOGUE.map(t => {
                    const on = s.topics.includes(t);
                    return <button key={t} onClick={() => updateSettings({ topics: on ? s.topics.filter(x => x !== t) : [...s.topics, t] })}
                      className={cx('pressable rounded-full px-4 py-2 text-[15px] font-semibold ring-1', on ? 'bg-accent text-accent-ink ring-accent' : 'bg-card text-ink-2 ring-line')}>{t}</button>;
                  })}
                </div>
                <Button size="lg" full className="mt-10" onClick={() => updateSettings({ onboarded: true })}>Open my brief <ArrowRight size={20} /></Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <GoogleSetupGuide open={guide} onClose={() => setGuide(false)} />
    </div>
  );
}

export function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.4-5.6l-7.5-5.8c-2.1 1.4-4.8 2.2-7.9 2.2-6.3 0-11.7-4.1-13.6-9.8l-7.8 6C6.5 42.6 14.6 48 24 48z"/></svg>
  );
}
