import type { AiProvider } from './index';
import { finishBrief } from './index';
import { DEMO_BRIEF, DEMO_DRAFTS } from '../demo-data';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

// Demo mode lets anyone explore the app without a mailbox or an API key.
export const demoProvider: AiProvider = {
  id: 'demo',
  async triage(messages) {
    await wait(1400);
    const known = new Set(DEMO_BRIEF.triage.map(t => t.id));
    const triage = messages.map(m => DEMO_BRIEF.triage.find(t => t.id === m.id) ?? { id: m.id, category: 'fyi' as const, summary: m.subject, priority: 3 as const });
    const brief = finishBrief({ headline: DEMO_BRIEF.headline, narrative: DEMO_BRIEF.narrative, triage }, messages);
    if (!messages.some(m => known.has(m.id))) brief.headline = `${messages.length} unread emails, summarized in demo mode. Add an AI key in Settings for real summaries.`;
    return brief;
  },
  async draft(m, _t, s, _samples, instruction) {
    await wait(900);
    const base = DEMO_DRAFTS[m.id] ?? `Hi ${m.from.name.split(' ')[0]},\n\nThanks for your email about "${m.subject}". I'll get back to you with details shortly.\n\nBest,\n`;
    const body = (instruction ? `${base.trimEnd()}\n\n(${instruction})\n` : base) + (s.signature || s.name.split(' ')[0] || '');
    return { subject: m.subject, body, tone: 'friendly, brief' };
  },
};
