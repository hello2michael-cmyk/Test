import { Sunrise, Inbox, Settings } from 'lucide-react';
import { motion } from 'motion/react';
import { cx } from './ui';
import { useStore } from '../lib/store';
import { useSession } from '../lib/session';

export type Tab = 'today' | 'inbox' | 'settings';

export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const { cache } = useStore();
  const { done } = useSession();
  const waiting = cache.brief?.triage.filter(t => (t.category === 'reply' || t.category === 'action') && !done[t.id]).length ?? 0;
  const items: { id: Tab; label: string; Icon: typeof Sunrise; badge?: number }[] = [
    { id: 'today', label: 'Today', Icon: Sunrise },
    { id: 'inbox', label: 'Inbox', Icon: Inbox, badge: waiting },
    { id: 'settings', label: 'Settings', Icon: Settings },
  ];
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[640px] border-t border-line safe-bottom">
      <div className="flex h-[64px] items-stretch">
        {items.map(({ id, label, Icon, badge }) => {
          const active = tab === id;
          return (
            <button key={id} onClick={() => onTab(id)} className={cx('relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', active ? 'text-accent' : 'text-ink-3')}>
              <span className="relative">
                <Icon size={24} strokeWidth={active ? 2.4 : 2} />
                {!!badge && <span className="absolute -right-2.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-action px-1 text-[11px] font-bold text-white">{badge}</span>}
              </span>
              {label}
              {active && <motion.span layoutId="tab-dot" className="absolute top-0 h-[3px] w-8 rounded-b-full bg-accent" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
