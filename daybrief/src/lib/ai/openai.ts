import type { AiProvider } from './index';
import { AiError, finishBrief, parseJsonLoose } from './index';
import { TRIAGE_SCHEMA, DRAFT_SCHEMA } from './schema';
import { draftSystem, draftUser, triageSystem, triageUser } from './prompts';
import type { Triage } from '../types';

async function structured<T>(apiKey: string, model: string, system: string, user: string, schema: unknown, name: string): Promise<T> {
  if (!apiKey) throw new AiError('Add your OpenAI API key in Settings.', 'auth');
  let r: Response;
  try {
    r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_schema', json_schema: { name, schema } },
      }),
    });
  } catch { throw new AiError('Could not reach OpenAI. Check your connection.', 'network'); }
  if (r.status === 401) throw new AiError('OpenAI rejected the API key. Check it in Settings.', 'auth');
  if (r.status === 429) throw new AiError('OpenAI is rate limiting this key. Try again in a minute.', 'rate');
  if (!r.ok) throw new AiError(`OpenAI error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json() as { choices?: { message?: { content?: string; refusal?: string } }[] };
  const msg = j.choices?.[0]?.message;
  if (msg?.refusal) throw new AiError('OpenAI declined to process this content.');
  return parseJsonLoose<T>(msg?.content ?? '');
}

export const openaiProvider: AiProvider = {
  id: 'openai',
  async triage(messages, s) {
    const raw = await structured<{ headline: string; narrative: string; triage: Triage[] }>(s.ai.apiKey, s.ai.model || 'gpt-5', triageSystem(s), triageUser(messages), TRIAGE_SCHEMA, 'brief');
    return finishBrief(raw, messages);
  },
  async draft(m, t, s, samples, instruction) {
    const raw = await structured<{ body: string; tone: string }>(s.ai.apiKey, s.ai.model || 'gpt-5', draftSystem(s, samples), draftUser(m, t, instruction), DRAFT_SCHEMA, 'draft');
    return { subject: m.subject, body: raw.body, tone: raw.tone };
  },
};
