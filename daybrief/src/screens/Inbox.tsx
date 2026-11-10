import { useState } from 'react';
import { Card, Section, Segmented, Skeleton } from '../components/ui';
import { MessageRow } from '../components/MessageRow';
import { useStore } from '../lib/store';
import { useSession } from '../lib/session';
import { CATEGORY_META, type Category } from '../lib/types';

type Filter = 'all' | Category;

export function Inbox({ onOpen }: { onOpen: (id: string) => void }) {
  const { cache } = useStore();
  const { phase, done } = useSession();
  const [filter, setFilter] = useState<Filter>('all');
  const loading = (phase === 'fetching' || phase === 'thinking') && !cache.brief;
  const triage = new Map(cache.brief?.triage.map(t => [t.id, t]) ?? []);
  const groups: Category[] = filter === 'all' ? ['reply', 'action', 'fyi', 'noise'] : [filter];
  const unread = cache.messages.filter(m => !done[m.id]).length;

  return (
    <div className="px-4 pt-2 safe-top">
      <div className="mb-4 flex items-end justify-between px-1">
        <h1 className="font-display text-[32px] font-bold tracking-tight">Inbox</h1>
        <span className="pb-1.5 text-[14px] font-semibold text-ink-3">{unread} unread</span>
      </div>
      <div className="mb-5">
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'reply', label: 'Reply' }, { value: 'action', label: 'Action' }, { value: 'fyi', label: 'FYI' }, { value: 'noise', label: 'Noise' }]} />
      </div>

      {loading && (
        <Card className="divide-y divide-line overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 px-4 py-3.5"><Skeleton className="h-11 w-11 rounded-full" /><div className="flex-1 space-y-2 pt-1"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3.5 w-11/12" /></div></div>
          ))}
        </Card>
      )}

      {!loading && cache.messages.length === 0 && <p className="py-16 text-center text-[15px] text-ink-3">No unread mail. Pull the refresh on Today when you want to check again.</p>}

      {!loading && groups.map(c => {
        const rows = cache.messages.filter(m => (triage.get(m.id)?.category ?? 'fyi') === c);
        if (!rows.length) return null;
        return (
          <Section key={c} title={`${CATEGORY_META[c].label} · ${rows.length}`}>
            <Card className="divide-y divide-line overflow-hidden">
              {rows.map((m, i) => <MessageRow key={m.id} m={m} t={triage.get(m.id)} done={done[m.id]} index={i} onClick={() => onOpen(m.id)} />)}
            </Card>
          </Section>
        );
      })}
    </div>
  );
}
