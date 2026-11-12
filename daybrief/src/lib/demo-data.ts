import type { Brief, MailMessage } from './types';

const now = Date.now();
const ago = (h: number) => new Date(now - h * 3600_000).toISOString();

export const DEMO_MESSAGES: MailMessage[] = [
  { id: 'd1', threadId: 't1', from: { name: 'Anna Lindqvist', email: 'anna@northwind.se' }, to: 'you@example.com', subject: 'Can we move Thursday to 15:00?', date: ago(1.2), snippet: 'Hi! Something came up on my side…', labels: ['INBOX', 'UNREAD'], unread: true,
    body: 'Hi!\n\nSomething came up on my side on Thursday morning. Could we move our review to 15:00 instead of 10:00? If that does not work, Friday morning is free as well.\n\nAlso, do you still want me to bring the printed mockups?\n\nBest,\nAnna' },
  { id: 'd2', threadId: 't2', from: { name: 'Stripe', email: 'receipts@stripe.com' }, to: 'you@example.com', subject: 'Your invoice INV-2041 is due in 3 days', date: ago(3), snippet: 'Invoice INV-2041 for €240.00 is due on…', labels: ['INBOX', 'UNREAD'], unread: true,
    body: 'Invoice INV-2041 for €240.00 from Lumen Hosting is due on Friday. Pay online to avoid service interruption.\n\nView invoice: https://example.com/inv/2041' },
  { id: 'd3', threadId: 't3', from: { name: 'Marcus Chen', email: 'marcus@orbit.io' }, to: 'you@example.com', subject: 'Re: Partnership proposal', date: ago(5), snippet: 'Thanks for sending this over. Two questions before I take it to the team…', labels: ['INBOX', 'UNREAD'], unread: true,
    body: 'Thanks for sending this over. Two questions before I take it to the team:\n\n1. Is the revenue share 20% on net or gross?\n2. Could you share one customer reference we can talk to?\n\nIf you can answer by Wednesday I can get a decision by the end of the week.\n\nMarcus' },
  { id: 'd4', threadId: 't4', from: { name: 'Dr. Patel\'s Office', email: 'noreply@cityhealth.example' }, to: 'you@example.com', subject: 'Appointment confirmation needed', date: ago(7), snippet: 'Please confirm your appointment on Monday 09:30…', labels: ['INBOX', 'UNREAD'], unread: true,
    body: 'Please confirm your appointment with Dr. Patel on Monday at 09:30 by replying YES to this email or calling 555-0142. Unconfirmed appointments are released 48 hours before.' },
  { id: 'd5', threadId: 't5', from: { name: 'Sofia Romero', email: 'sofia@example.com' }, to: 'you@example.com', subject: 'Photos from Saturday 📸', date: ago(9), snippet: 'Finally went through the photos, here are the best ones…', labels: ['INBOX', 'UNREAD'], unread: true,
    body: 'Finally went through the photos, here are the best ones from Saturday. The one by the lake is my favourite. No rush, just wanted to share!\n\nhttps://photos.example.com/album/8d2' },
  { id: 'd6', threadId: 't6', from: { name: 'GitHub', email: 'notifications@github.com' }, to: 'you@example.com', subject: '[daybrief] CI failed on main', date: ago(10), snippet: 'Run #312 failed: build step exited with code 1', labels: ['INBOX', 'UNREAD'], unread: true,
    body: 'Run #312 failed on main.\n\nbuild: tsc --noEmit exited with code 1\nsrc/screens/Today.tsx(42,7): error TS2322\n\nView run: https://github.com/example/daybrief/actions/runs/312' },
  { id: 'd7', threadId: 't7', from: { name: 'The Download', email: 'newsletter@technologyreview.example' }, to: 'you@example.com', subject: 'The Download: what\'s next for small reactors', date: ago(12), snippet: 'Plus: the quiet rise of on-device models…', labels: ['INBOX', 'UNREAD'], unread: true,
    body: 'Today in tech: small modular reactors get their first commercial order, on-device language models quietly spread to mid-range phones, and a look at who pays for the open web.' },
  { id: 'd8', threadId: 't8', from: { name: 'Lufthansa', email: 'noreply@lh.example' }, to: 'you@example.com', subject: 'Check-in is open for LH 2470', date: ago(14), snippet: 'Online check-in for your flight to Munich is now open…', labels: ['INBOX', 'UNREAD'], unread: true,
    body: 'Online check-in for your flight LH 2470 to Munich on Thursday 07:45 is now open. Check in now to choose your seat.' },
  { id: 'd9', threadId: 't9', from: { name: 'Zalando', email: 'news@zalando.example' }, to: 'you@example.com', subject: 'Up to 40% off this weekend only', date: ago(20), snippet: 'Autumn favourites, now reduced…', labels: ['INBOX', 'UNREAD', 'CATEGORY_PROMOTIONS'], unread: true,
    body: 'Autumn favourites, now reduced. Shop the sale before Sunday midnight.' },
  { id: 'd10', threadId: 't10', from: { name: 'Jonas Weber', email: 'jonas.weber@example.com' }, to: 'you@example.com', subject: 'Quick favour: reference for Lena?', date: ago(26), snippet: 'Lena applied for the design role at our place…', labels: ['INBOX', 'UNREAD'], unread: true,
    body: 'Hey,\n\nLena applied for the design role at our place and listed you as a reference. Would you be up for a 15-minute call this week? Any afternoon works for me.\n\nThanks a lot,\nJonas' },
];

export const DEMO_BRIEF: Brief = {
  generatedAt: new Date().toISOString(),
  headline: 'Three people are waiting on you, one invoice is due Friday, and your Munich flight is ready for check-in.',
  narrative: 'Good morning. You have ten unread emails and three need a reply: Anna wants to move Thursday\'s review to three in the afternoon, Marcus has two questions on the partnership proposal and needs answers by Wednesday, and Jonas is asking for a fifteen-minute reference call for Lena. Two things need an action: a two hundred forty euro invoice from Lumen Hosting is due Friday, and Dr. Patel\'s office needs you to confirm Monday\'s nine thirty appointment. Good to know: check-in for your Thursday flight to Munich is open, the CI build on main failed, and Sofia shared photos from Saturday. The rest is newsletters and promotions. Shall I draft the replies?',
  triage: [
    { id: 'd1', category: 'reply', summary: 'Anna asks to move Thursday\'s review to 15:00 and whether to bring printed mockups.', action: 'Confirm 15:00 or offer Friday morning', deadline: 'Before Thursday', priority: 1 },
    { id: 'd3', category: 'reply', summary: 'Marcus needs the revenue-share basis (net or gross) and one customer reference.', action: 'Answer both questions', deadline: 'Wednesday', priority: 1 },
    { id: 'd10', category: 'reply', summary: 'Jonas asks for a 15-minute reference call about Lena this week.', action: 'Pick an afternoon', priority: 2 },
    { id: 'd2', category: 'action', summary: 'Invoice INV-2041 for €240 from Lumen Hosting is due Friday.', action: 'Pay the invoice', deadline: 'Friday', priority: 1 },
    { id: 'd4', category: 'action', summary: 'Confirm Monday 09:30 appointment with Dr. Patel.', action: 'Reply YES', deadline: '48h before', priority: 2 },
    { id: 'd8', category: 'fyi', summary: 'Check-in is open for LH 2470 to Munich, Thursday 07:45.', action: 'Check in and pick a seat', priority: 2 },
    { id: 'd6', category: 'fyi', summary: 'CI failed on main: a TypeScript error in Today.tsx.', priority: 2 },
    { id: 'd5', category: 'fyi', summary: 'Sofia shared the photos from Saturday.', priority: 3 },
    { id: 'd7', category: 'noise', summary: 'Newsletter on small reactors and on-device models.', priority: 3 },
    { id: 'd9', category: 'noise', summary: 'Zalando weekend sale.', priority: 3 },
  ],
};

export const DEMO_DRAFTS: Record<string, string> = {
  d1: 'Hi Anna,\n\n15:00 on Thursday works for me, let\'s do that. And yes, please bring the printed mockups, it will make the review much easier.\n\nSee you then,\n',
  d3: 'Hi Marcus,\n\nGood questions:\n\n1. The 20% revenue share is on net revenue, after payment processing and refunds.\n2. Happy to connect you with a customer reference. I\'ll send an intro to one of our partners today.\n\nThat should give you everything before Wednesday. Let me know if the team needs anything else.\n\nBest,\n',
  d10: 'Hi Jonas,\n\nOf course, happy to be a reference for Lena. Thursday or Friday afternoon both work on my side, just send me a time and a number.\n\nCheers,\n',
  d4: 'YES, I confirm the appointment on Monday at 09:30.\n\nThank you.',
};
