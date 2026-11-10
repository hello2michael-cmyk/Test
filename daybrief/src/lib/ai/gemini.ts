import type { AiProvider } from './index';
import { AiError, finishBrief, parseJsonLoose } from './index';
import { TRIAGE_SCHEMA, DRAFT_SCHEMA } from './schema';
import { draftSystem, draftUser, triageSystem, triageUser } from './prompts';
import type { Triage } from '../types';

// Gemini's responseSchema is a subset of JSON schema: drop keys it does not accept.
function toGeminiSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(toGeminiSchema);
  if (s && typeof s === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
      if (k === 'additionalProperties') continue;
      out[k] = toGeminiSchema(v);
    }
    return out;
  }
  return s;
}

async function structured<T>(apiKey: string, model: string, system: string, user: string, schema: unknown): Promise<T> {
  if (!apiKey) throw new AiError('Add your Gemini API key in Settings.', 'auth');
  let r: Response;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: toGeminiSchema(schema) },
      }),
    });
  } catch { throw new AiError('Could not reach Gemini. Check your connection.', 'network'); }
  if (r.status === 400 || r.status === 403) throw new AiError('Gemini rejected the API key. Check it in Settings.', 'auth');
  if (r.status === 429) throw new AiError('Gemini is rate limiting this key. Try again in a minute.', 'rate');
  if (!r.ok) throw new AiError(`Gemini error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = j.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
  return parseJsonLoose<T>(text);
}

export const geminiProvider: AiProvider = {
  id: 'gemini',
  async triage(messages, s) {
    const raw = await structured<{ headline: string; narrative: string; triage: Triage[] }>(s.ai.apiKey, s.ai.model || 'gemini-2.5-pro', triageSystem(s), triageUser(messages), TRIAGE_SCHEMA);
    return finishBrief(raw, messages);
  },
  async draft(m, t, s, samples, instruction) {
    const raw = await structured<{ body: string; tone: string }>(s.ai.apiKey, s.ai.model || 'gemini-2.5-pro', draftSystem(s, samples), draftUser(m, t, instruction), DRAFT_SCHEMA);
    return { subject: m.subject, body: raw.body, tone: raw.tone };
  },
};
