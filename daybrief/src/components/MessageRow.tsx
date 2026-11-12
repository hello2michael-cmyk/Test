import { Check, Archive, Send } from 'lucide-react';
import { motion } from 'motion/react';
import { Badge, cx } from './ui';
import { CATEGORY_META, type MailMessage, type Triage } from '../lib/types';
import { avatarColor, initials, relTime } from '../lib/format';

const COLOR: Record<string, string> = { reply: 'var(--reply)', action: 'var(--action)', fyi: 'var(--fyi)', noise: 'var(--noise)' };

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-bold text-white" style={{ width: size, height: size, background: avatarColor(name), fontSize: size * 0.36 }}>
      {initials(name)}
    </span>
  );
}

export function MessageRow({ m, t, done, onClick, index = 0 }: { m: MailMessage; t?: Triage; done?: 'sent' | 'archived' | 'read'; onClick: () => void; index?: number }) {
  const cat = t?.category ?? 'fyi';
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.03, duration: 0.25 }}
      onClick={onClick}
      className={cx('pressable flex w-full items-start gap-3 px-4 py-3.5 text-left', done && 'opacity-55')}
    >
      <Avatar name={m.from.name} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cx('truncate text-[16px]', done ? 'font-medium' : 'font-bold')}>{m.from.name}</span>
          <span className="shrink-0 text-[12.5px] text-ink-3">{relTime(m.date)}</span>
        </span>
        <span className="mt-0.5 block truncate text-[14.5px] font-medium text-ink-2">{m.subject}</span>
        <span className="mt-0.5 line-clamp-2 block text-[14px] leading-snug text-ink-3">{t?.summary ?? m.snippet}</span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          {done === 'sent' && <Badge color="var(--ok)"><Send size={11} /> Sent</Badge>}
          {done === 'archived' && <Badge color="var(--noise)"><Archive size={11} /> Archived</Badge>}
          {done === 'read' && <Badge color="var(--noise)"><Check size={11} /> Done</Badge>}
          {!done && t && <Badge color={COLOR[cat]}>{CATEGORY_META[cat].short}</Badge>}
          {!done && t?.deadline && <Badge color="var(--action)">{t.deadline}</Badge>}
          {!done && t?.action && <span className="text-[12.5px] font-medium text-ink-2">{t.action}</span>}
        </span>
      </span>
    </motion.button>
  );
}
