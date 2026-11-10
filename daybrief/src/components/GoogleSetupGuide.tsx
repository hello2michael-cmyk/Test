import { ExternalLink } from 'lucide-react';
import { Button, Input, Sheet } from './ui';
import { updateSettings, useSettings } from '../lib/store';

export const SITE_ORIGIN = 'https://hello2michael-cmyk.github.io';

const STEPS: { title: string; body: string }[] = [
  { title: 'Open Google Cloud Console', body: 'Sign in with the same Gmail account you want Daybrief to read.' },
  { title: 'Create a project', body: 'Tap the project picker at the top, then "New project". Name it Daybrief and create it.' },
  { title: 'Enable the Gmail API', body: 'Menu → APIs & Services → Library. Search "Gmail API" and tap Enable.' },
  { title: 'Set up the consent screen', body: 'Menu → Google Auth Platform → Get started. App name Daybrief, your email, audience External, create.' },
  { title: 'Add yourself as a test user', body: 'Google Auth Platform → Audience → Test users → Add users. Add your Gmail address and the addresses of anyone you invite. No Google review is needed for test users.' },
  { title: 'Create the client', body: `Google Auth Platform → Clients → Create client. Type: Web application. Under "Authorized JavaScript origins" add exactly: ${SITE_ORIGIN}` },
  { title: 'Copy the client ID', body: 'It ends with .apps.googleusercontent.com. Paste it below.' },
];

// Shown when someone taps "Continue with Google" before a client ID exists.
export function GoogleSetupGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettings();
  return (
    <Sheet open={open} onClose={onClose} full title="Connect Google: one-time setup">
      <p className="text-[15px] leading-relaxed text-ink-2">Google only shows its sign-in screen to apps that are registered in your own Google account. Registering takes about five minutes, costs nothing and needs no approval from Google.</p>
      <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="mt-4 block">
        <Button full variant="secondary"><ExternalLink size={18} /> Open Google Cloud Console</Button>
      </a>
      <ol className="mt-5 space-y-3">
        {STEPS.map((st, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15 text-[13px] font-bold text-accent">{i + 1}</span>
            <div><div className="font-semibold">{st.title}</div><div className="text-[14px] leading-relaxed text-ink-2">{st.body}</div></div>
          </li>
        ))}
      </ol>
      <div className="mt-6">
        <Input label="Paste the client ID here" placeholder="…apps.googleusercontent.com" value={s.mail.googleClientId} autoCapitalize="off" autoCorrect="off" spellCheck={false}
          onChange={e => updateSettings({ mail: { ...s.mail, googleClientId: e.target.value.trim() } })} />
        <Button full className="mt-3" disabled={!/\.apps\.googleusercontent\.com$/.test(s.mail.googleClientId)} onClick={onClose}>Done, back to sign-in</Button>
      </div>
      <p className="mt-5 text-[13px] leading-relaxed text-ink-3">The client ID is not a secret. Once you have one, the owner can build it into the app so nobody you invite ever sees this step.</p>
    </Sheet>
  );
}
