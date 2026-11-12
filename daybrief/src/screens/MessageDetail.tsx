import { useEffect, useRef, useState } from 'react';
import { Archive, Check, Mic, MicOff, Send, Sparkles, Wand2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Badge, Button, IconButton, Sheet, Textarea, cx } from '../components/ui';
import { Avatar } from '../components/MessageRow';
import { useStore } from '../lib/store';
import { archive, draftFor, markRead, send, setDraftBody, useSession } from '../lib/session';
import { canListen, listen } from '../lib/speech';
import { CATEGORY_META } from '../lib/types';
import { toast } from '../lib/toast';

const COLOR: Record<string, string> = { reply: 'var(--reply)', action: 'var(--action)', fyi: 'var(--fyi)', noise: 'var(--noise)' };

export function MessageDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { cache, settings } = useStore();
  const { drafts, drafting, done } = useSession();
  const m = cache.messages.find(x => x.id === id);
  const t = cache.brief?.triage.find(x => x.id === id);
  const draft = id ? drafts[id] : undefined;
  const busy = id ? !!drafting[id] : false;
  const [composing, setComposing] = useState(false);
  const [sending, setSending] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [listening, setListening] = useState(false);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => { setComposing(!!draft); setInstruction(''); }, [id, draft]);
  useEffect(() => () => stopRef.current(), []);

  const run = async (extra?: string) => {
    if (!m) return;
    try { await draftFor(m, t, extra || undefined); setComposing(true); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not draft', 'err'); }
  };

  const dictate = () => {
    if (listening) { stopRef.current(); return; }
    setListening(true);
    const base = instruction;
    stopRef.current = listen((text, final) => { setInstruction((base ? base + ' ' : '') + text); if (final) setListening(false); }, err => { setListening(false); if (err) toast(err, 'err'); });
  };

  return (
    <Sheet open={!!m} onClose={onClose} full title={m ? (t ? CATEGORY_META[t.category].label : 'Email') : ''}>
      {m && (
        <div className="pb-6">
          <div className="flex items-start gap-3">
            <Avatar name={m.from.name} size={48} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[17px] font-bold">{m.from.name}</div>
              <div className="truncate text-[13px] text-ink-3">{m.from.email}</div>
            </div>
            <div className="shrink-0 text-[13px] text-ink-3">{new Date(m.date).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          <h3 className="mt-4 font-display text-[22px] font-bold leading-tight tracking-tight">{m.subject}</h3>

          {t && (
            <div className="mt-4 rounded-2xl p-4 ring-1 ring-line" style={{ background: `color-mix(in oklab, ${COLOR[t.category]} 8%, var(--card))` }}>
              <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider" style={{ color: COLOR[t.category] }}><Sparkles size={14} /> Summary</div>
              <p className="mt-1.5 text-[15.5px] leading-snug">{t.summary}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {t.action && <Badge color={COLOR[t.category]}>{t.action}</Badge>}
                {t.deadline && <Badge color="var(--action)">Due {t.deadline}</Badge>}
                {done[m.id] && <Badge color="var(--ok)"><Check size={11} /> {done[m.id]}</Badge>}
              </div>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            {!done[m.id] && (
              <>
                <Button className="flex-1" onClick={() => void run()} disabled={busy}><Wand2 size={18} /> {busy ? 'Drafting…' : draft ? 'Redraft' : 'Draft a reply'}</Button>
                <IconButton label="Archive" className="h-12 w-12 rounded-2xl" onClick={async () => { try { await archive(m); toast('Archived'); onClose(); } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'err'); } }}><Archive size={20} /></IconButton>
                <IconButton label="Mark done" className="h-12 w-12 rounded-2xl" onClick={async () => { try { await markRead(m); toast('Marked as done'); onClose(); } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'err'); } }}><Check size={20} /></IconButton>
              </>
            )}
          </div>

          {!done[m.id] && (
            <div className="mt-3 flex items-center gap-2 rounded-2xl bg-card-2 pl-4 pr-1.5">
              <input value={instruction} onChange={e => setInstruction(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && instruction.trim()) void run(instruction.trim()); }}
                placeholder={listening ? 'Listening…' : 'Tell it what to say, e.g. "say yes, Friday works"'} className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3" />
              {canListen() && <IconButton label="Dictate" onClick={dictate} className={cx('h-9 w-9', listening && 'bg-danger text-white')}>{listening ? <MicOff size={16} /> : <Mic size={16} />}</IconButton>}
              <Button size="sm" variant="secondary" disabled={!instruction.trim() || busy} onClick={() => void run(instruction.trim())}>Go</Button>
            </div>
          )}

          <AnimatePresence>
            {composing && draft && !done[m.id] && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink-3">Your reply</span>
                    <span className="text-[12.5px] text-ink-3">{draft.tone}</span>
                  </div>
                  <Textarea rows={9} value={draft.body} onChange={e => setDraftBody(m.id, e.target.value)} />
                  <Button full size="lg" className="mt-3" disabled={sending || !draft.body.trim()} onClick={async () => {
                    setSending(true);
                    try { await send(m, draft.body); toast(settings.mail.provider === 'gmail' ? 'Sent' : 'Sent (demo)'); onClose(); }
                    catch (e) { toast(e instanceof Error ? e.message : 'Could not send', 'err'); }
                    finally { setSending(false); }
                  }}><Send size={18} /> {sending ? 'Sending…' : `Send to ${m.from.name.split(' ')[0]}`}</Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-6">
            <div className="mb-2 px-1 text-[13px] font-bold uppercase tracking-[0.08em] text-ink-3">Original</div>
            <pre className="whitespace-pre-wrap rounded-2xl bg-card p-4 font-sans text-[15px] leading-relaxed text-ink-2 ring-1 ring-line">{m.body || m.snippet}</pre>
          </div>
        </div>
      )}
    </Sheet>
  );
}
