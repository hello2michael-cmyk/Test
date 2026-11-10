import type Anthropic from '@anthropic-ai/sdk';
import type { AiProvider } from './index';
import { AiError, finishBrief, parseJsonLoose } from './index';
import { TRIAGE_SCHEMA, DRAFT_SCHEMA } from './schema';
import { draftSystem, draftUser, triageSystem, triageUser } from './prompts';
import type { Draft, Triage } from '../types';

// Claude is called straight from the browser with the user's own key. The key never leaves the
// device except to api.anthropic.com. Thinking is adaptive on these models; effort is the only knob.

// The SDK is loaded on first use so the app shell stays small for users of other providers.
let sdk: Promise<typeof import('@anthropic-ai/sdk')> | null = null;
function loadSdk() { return (sdk ??= import('@anthropic-ai/sdk')); }

async function client(apiKey: string): Promise<Anthropic> {
  if (!apiKey) throw new AiError('Add your Claude API key in Settings.', 'auth');
  const { default: Ctor } = await loadSdk();
  return new Ctor({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

async function mapError(e: unknown): Promise<never> {
  const { default: Anthropic } = await loadSdk();
  if (e instanceof Anthropic.AuthenticationError) throw new AiError('Claude rejected the API key. Check it in Settings.', 'auth');
  if (e instanceof Anthropic.RateLimitError) throw new AiError('Claude is rate limiting this key. Try again in a minute.', 'rate');
  if (e instanceof Anthropic.APIConnectionError) throw new AiError('Could not reach Claude. Check your connection.', 'network');
  if (e instanceof Anthropic.APIError) throw new AiError(`Claude error ${e.status}: ${e.message}`);
  throw e;
}

async function structured<T>(apiKey: string, model: string, effort: 'low' | 'medium' | 'high', system: string, user: string, schema: Record<string, unknown>, maxTokens: number): Promise<T> {
  const c = await client(apiKey);
  try {
    const res = await c.beta.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort, format: { type: 'json_schema', schema } },
      // Server-side fallback: if a safety classifier declines, the request is re-run on a
      // fallback model inside the same call instead of failing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (res.stop_reason === 'refusal') throw new AiError('Claude declined to process this content.');
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    return parseJsonLoose<T>(text);
  } catch (e) { return mapError(e); }
}

export const anthropicProvider: AiProvider = {
  id: 'anthropic',
  async triage(messages, s) {
    const raw = await structured<{ headline: string; narrative: string; triage: Triage[] }>(
      s.ai.apiKey, s.ai.model || 'claude-opus-5-5', s.ai.effort, triageSystem(s), triageUser(messages), TRIAGE_SCHEMA as unknown as Record<string, unknown>, 16000);
    return finishBrief(raw, messages);
  },
  async draft(m, t, s, samples, instruction) {
    const raw = await structured<{ body: string; tone: string }>(
      s.ai.apiKey, s.ai.model || 'claude-opus-5-5', s.ai.effort, draftSystem(s, samples), draftUser(m, t, instruction), DRAFT_SCHEMA as unknown as Record<string, unknown>, 4000);
    const d: Draft = { subject: m.subject, body: raw.body, tone: raw.tone };
    return d;
  },
};
