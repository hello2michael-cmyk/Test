// JSON schema shared by every provider so the triage result is identical regardless of model.
export const TRIAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'narrative', 'triage'],
  properties: {
    headline: { type: 'string', description: 'One sentence, max 25 words, summarizing what matters most today.' },
    narrative: { type: 'string', description: 'A spoken briefing of 4 to 7 sentences in second person, warm and direct. Numbers written as words. No bullet points.' },
    triage: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'category', 'summary', 'priority'],
        properties: {
          id: { type: 'string' },
          category: { type: 'string', enum: ['reply', 'action', 'fyi', 'noise'] },
          summary: { type: 'string', description: 'One line, max 22 words, what this email is about and what is asked.' },
          action: { type: 'string', description: 'The concrete next step for the user, 3 to 8 words. Omit when nothing is needed.' },
          deadline: { type: 'string', description: 'Short deadline such as "Wednesday" or "Fri 14:00" when one is stated or implied.' },
          priority: { type: 'integer', enum: [1, 2, 3] },
        },
      },
    },
  },
} as const;

export const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['body', 'tone'],
  properties: {
    body: { type: 'string', description: 'The full reply body in plain text, ready to send, without a subject line.' },
    tone: { type: 'string', description: 'Two or three words describing the tone used.' },
  },
} as const;
