export type Category = 'reply' | 'action' | 'fyi' | 'noise';

export interface MailMessage {
  id: string;
  threadId: string;
  from: { name: string; email: string };
  to: string;
  subject: string;
  date: string; // ISO
  snippet: string;
  body: string; // plain text, trimmed
  messageIdHeader?: string;
  references?: string;
  labels: string[];
  unread: boolean;
}

export interface Triage {
  id: string;
  category: Category;
  summary: string; // one line
  action?: string; // what the user should do, if anything
  deadline?: string; // "Fri 14:00" style, if mentioned
  priority: 1 | 2 | 3; // 1 = highest
}

export interface Brief {
  generatedAt: string;
  headline: string; // one sentence for the top of Today
  narrative: string; // 4-6 sentences, spoken by the voice player
  triage: Triage[];
}

export interface Draft {
  subject: string;
  body: string;
  tone: string;
}

export type AiProviderId = 'anthropic' | 'openai' | 'gemini' | 'demo';
export type MailProviderId = 'gmail' | 'demo';

export interface Settings {
  onboarded: boolean;
  name: string;
  theme: 'system' | 'dark' | 'light';
  mail: { provider: MailProviderId; googleClientId: string; email: string; maxMessages: number };
  ai: { provider: AiProviderId; apiKey: string; model: string; effort: 'low' | 'medium' | 'high' };
  topics: string[];
  voice: { enabled: boolean; rate: number; autoplay: boolean };
  signature: string;
  replyStyle: 'concise' | 'friendly' | 'formal';
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  name: '',
  theme: 'system',
  mail: { provider: 'demo', googleClientId: '', email: '', maxMessages: 30 },
  ai: { provider: 'demo', apiKey: '', model: '', effort: 'medium' },
  topics: ['Technology', 'Business'],
  voice: { enabled: true, rate: 1, autoplay: false },
  signature: '',
  replyStyle: 'friendly',
};

export const TOPIC_CATALOGUE = [
  'Technology', 'AI', 'Business', 'Finance', 'Science', 'Health', 'Sports', 'Politics',
  'World', 'Climate', 'Design', 'Startups', 'Gaming', 'Travel', 'Food', 'Culture', 'Automotive', 'Space',
];

export const CATEGORY_META: Record<Category, { label: string; short: string; hint: string }> = {
  reply: { label: 'Needs a reply', short: 'Reply', hint: 'Someone is waiting on you' },
  action: { label: 'Needs an action', short: 'Action', hint: 'Pay, sign, confirm or decide' },
  fyi: { label: 'Good to know', short: 'FYI', hint: 'Read when you have a minute' },
  noise: { label: 'Noise', short: 'Noise', hint: 'Newsletters, promotions, receipts' },
};
