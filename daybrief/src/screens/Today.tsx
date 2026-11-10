import { RefreshCw, ArrowRight, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { Button, Card, Section, Skeleton, cx } from '../components/ui';
import { BriefPlayer } from '../components/BriefPlayer';
import { MessageRow } from '../components/MessageRow';
import { useStore } from '../lib/store';
import { connectGoogle, refresh, useSession } from '../lib/session';
import { greeting, todayLabel } from '../lib/format';
import { CATEGORY_META, type Category } from '../lib/types';
import type { Tab } from '../components/TabBar';
import { toast } from '../lib/toast';

const COLOR: Record<Category, string> = { reply: 'var(--reply)', action: 'var(--action)', fyi: 'var(--fyi)', noise: 'var(--noise)' };

export function Today({ onOpen, onTab }: { onOpen: (id: string) => void; onTab: (t: Tab) => void }) {
  const { settings, cache } = useStore();
  const { phase, error, needsSignIn, done } = useSession();
  const brief = cache.brief;
  const loading = phase === 'fetching' || phase === 'thinking' || phase === 'auth';
  const byId = new Map(cache.messages.map(m => [m.id, m]));
  const open = brief?.triage.filter(t => !done[t.id]) ?? [];
  const counts = (['reply', 'action', 'fyi', 'noise'] as Category[]).map(c => ({ c, n: open.filter(t => t.category === c).length }));
  const top = open.filter(t => t.category === 'reply' || t.category === 'action').slice(0, 4);

  return (
    <div>
      <header className="hero-gradient px-5 pb-6 pt-3 safe-top">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[14px] font-semibold text-ink-3">{todayLabel()}</div>
            <h1 className="mt-0.5 font-display text-[34px] font-bold leading-tight tracking-tight">{greeting(settings.name)}</h1>
          </div>
          <button aria-label="Refresh" disabled={loading} onClick={() => void refresh({ force: true })} className="pressable mt-1 grid h-10 w-10 place-items-center rounded-full bg-card/70 text-ink-2 ring-1 ring-line disabled:opacity-50">
            <RefreshCw size={18} className={cx(loading && 'animate-spin')} />
          </button>
        </div>

        <div className="mt-5">
          {loading && !brief ? (
            <div className="space-y-2"><Skeleton className="h-6 w-11/12" /><Skeleton className="h-6 w-8/12" /></div>
          ) : brief ? (
            <motion.p key={brief.generatedAt} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-[19px] font-medium leading-snug">{brief.headline}</motion.p>
          ) : needsSignIn ? (
            <p className="text-[17px] leading-snug text-ink-2">Sign in to Google to load your inbox.</p>
          ) : null}
          {loading && <StatusLine phase={phase} />}
        </div>

        {needsSignIn && !loading && (
          <Button className="mt-4" full variant="secondary" onClick={async () => { try { await connectGoogle(); void refresh({ force: true }); } catch (e) { toast(e instanceof Error ? e.message : 'Sign-in failed', 'err'); } }}>Continue with Google</Button>
        )}
        {phase === 'error' && error && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-danger/10 p-3 text-[14px] text-danger"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><span>{error}</span></div>
        )}
        {brief && settings.voice.enabled && brief.narrative && (
          <div className="mt-4"><BriefPlayer text={brief.narrative} autoplay={settings.voice.autoplay && phase === 'ready'} /></div>
        )}
      </header>

      <div className="px-4">
        <div className="-mt-1 grid grid-cols-4 gap-2">
          {counts.map(({ c, n }, i) => (
            <motion.button key={c} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} onClick={() => onTab('inbox')}
              className="pressable rounded-2xl bg-card p-3 text-left shadow-card ring-1 ring-line">
              <div className="font-display text-[26px] font-bold leading-none" style={{ color: COLOR[c] }}>{loading && !brief ? '–' : n}</div>
              <div className="mt-1.5 text-[12px] font-semibold leading-tight text-ink-2">{CATEGORY_META[c].label}</div>
            </motion.button>
          ))}
        </div>

        <div className="mt-6">
          <Section title="Waiting on you" aside={top.length > 0 && <button onClick={() => onTab('inbox')} className="flex items-center gap-1 text-[13px] font-semibold text-accent">All <ArrowRight size={14} /></button>}>
            <Card className="divide-y divide-line overflow-hidden">
              {loading && !brief && Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3 px-4 py-3.5"><Skeleton className="h-11 w-11 rounded-full" /><div className="flex-1 space-y-2 pt-1"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3.5 w-11/12" /><Skeleton className="h-3.5 w-8/12" /></div></div>
              ))}
              {brief && top.length === 0 && <p className="px-4 py-8 text-center text-[15px] text-ink-3">Nothing is waiting on you right now.</p>}
              {top.map((t, i) => { const m = byId.get(t.id); return m ? <MessageRow key={t.id} m={m} t={t} index={i} onClick={() => onOpen(t.id)} /> : null; })}
            </Card>
          </Section>
        </div>

        {brief && (
          <Section title="Spoken brief">
            <Card className="p-4"><p className="text-[15.5px] leading-relaxed text-ink-2">{brief.narrative}</p></Card>
          </Section>
        )}
      </div>
    </div>
  );
}

function StatusLine({ phase }: { phase: string }) {
  const text = phase === 'auth' ? 'Waiting for Google…' : phase === 'fetching' ? 'Reading your unread mail…' : 'Thinking about what matters…';
  return <div className="mt-3 flex items-center gap-2 text-[14px] font-medium text-ink-3"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" />{text}</div>;
}
