import type { Brief, Draft, MailMessage, Settings, Triage, AiProviderId } from '../types';
import { anthropicProvider } from './anthropic';
import { openaiProvider } from './openai';
import { geminiProvider } from './gemini';
import { demoProvider } from './demo';

export interface AiProvider {
  id: AiProviderId;
  triage(messages: MailMessage[], settings: Settings): Promise<Brief>;
  draft(message: MailMessage, triage: Triage | undefined, settings: Settings, samples: string[], instruction?: string): Promise<Draft>;
}

export const PROVIDER_META: Record<AiProviderId, { label: string; models: { id: string; label: string; note: string }[]; keyHint: string; keyUrl: string }> = {
  anthropic: {
    label: 'Claude',
    models: [
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Best judgement, recommended' },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Fast and capable' },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'Cheapest' },
    ],
    keyHint: 'sk-ant-…',
    keyUrl: 'https://platform.claude.com/settings/keys',
  },
  openai: {
    label: 'OpenAI',
    models: [
      { id: 'gpt-5', label: 'GPT-5', note: 'Default' },
      { id: 'gpt-5-mini', label: 'GPT-5 mini', note: 'Cheaper' },
    ],
    keyHint: 'sk-…',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  gemini: {
    label: 'Google Gemini',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'Default' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'Cheaper' },
    ],
    keyHint: 'AIza…',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  demo: { label: 'Demo (no key)', models: [], keyHint: '', keyUrl: '' },
};

export function defaultModel(id: AiProviderId) { return PROVIDER_META[id].models[0]?.id ?? ''; }

export function getProvider(settings: Settings): AiProvider {
  switch (settings.ai.provider) {
    case 'anthropic': return anthropicProvider;
    case 'openai': return openaiProvider;
    case 'gemini': return geminiProvider;
    default: return demoProvider;
  }
}

export class AiError extends Error {
  constructor(message: string, public readonly kind: 'auth' | 'rate' | 'network' | 'other' = 'other') { super(message); }
}

/** Shared post-processing: make sure every message has a triage row and the rows are ordered. */
export function finishBrief(raw: { headline: string; narrative: string; triage: Triage[] }, messages: MailMessage[]): Brief {
  const byId = new Map(raw.triage.map(t => [t.id, t]));
  const triage: Triage[] = messages.map(m => byId.get(m.id) ?? ({ id: m.id, category: 'fyi', summary: m.subject, priority: 3 }));
  const order: Record<string, number> = { reply: 0, action: 1, fyi: 2, noise: 3 };
  triage.sort((a, b) => order[a.category] - order[b.category] || a.priority - b.priority);
  return { generatedAt: new Date().toISOString(), headline: raw.headline, narrative: raw.narrative, triage };
}

export function parseJsonLoose<T>(text: string): T {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(trimmed) as T; } catch { /* fall through */ }
  const start = trimmed.indexOf('{'); const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)) as T;
  throw new AiError('The model did not return valid JSON.');
}
