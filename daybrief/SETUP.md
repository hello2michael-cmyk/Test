# Daybrief setup

Daybrief runs entirely in the browser. Two things are needed to use it with a real inbox, and both are self-service: no review, no waiting.

## 1. Google OAuth client ID (five minutes, once)

This lets the app show Google's own "Continue with Google" screen. The app never sees the password.

1. Open https://console.cloud.google.com/ and create a project (any name, e.g. "Daybrief").
2. **APIs & Services → Library**: search for **Gmail API** and click **Enable**.
3. **APIs & Services → OAuth consent screen** (now called *Google Auth Platform → Branding/Audience*):
   - User type **External**, app name "Daybrief", your email as support and developer contact.
   - **Audience**: keep the app in **Testing** and add the Gmail addresses that may sign in as **test users** (up to 100). No verification is needed for test users.
   - **Data access / Scopes**: add `gmail.readonly`, `gmail.send`, `gmail.modify` and `userinfo.email`.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type **Web application**.
   - **Authorized JavaScript origins**: `https://hello2michael-cmyk.github.io` (and `http://localhost:5173` for local development).
   - No redirect URI is needed.
5. Copy the client ID (ends in `.apps.googleusercontent.com`) and paste it into Daybrief during onboarding or under **Settings → Mail**.

When you later want strangers to sign in without being added as test users, Google requires app verification for the Gmail scopes. That is a separate, later step and does not block anything here.

## 2. An AI key

Pick one provider in onboarding or Settings and paste its key. The key is stored only on the device and sent only to that provider.

| Provider | Where to get a key |
|---|---|
| Claude (recommended) | https://platform.claude.com/settings/keys |
| OpenAI | https://platform.openai.com/api-keys |
| Google Gemini | https://aistudio.google.com/apikey |

Or choose **Demo** to explore the app with a sample inbox and canned summaries.

## Install on the phone

- **iPhone**: open the link in Safari, tap Share, then **Add to Home Screen**.
- **Android**: open the link in Chrome, tap the menu, then **Install app** or **Add to Home screen**.

## Local development

```
cd daybrief
npm install
DAYBRIEF_BASE=/ npm run dev
```

Google sign-in works on `http://localhost:5173` once that origin is added to the OAuth client.

## Sharing the app: invite-only access

The app is private. A device opens it only with an invite signed by you, and an invite is tied to one device, so nobody can forward it.

**You, once:** open the app, tap **I am the owner**, paste the contents of your owner key file (`daybrief-owner-key.json`, delivered to you separately, never committed to the repository), choose a passphrase. Keep the key file in a password manager; without it no new invites can be made.

**Inviting someone:**

1. They open the link. The app shows their **device code** (it starts with `db1.`). They send it to you by any messenger.
2. You open **Settings → Owner console**, paste the code, add their name and an optional expiry, tap **Create invite**, and send them the invite text (starts with `dbl1.`).
3. They paste it into the app. It unlocks on that device only.

If they want to bring someone else in, that person has to send *you* their device code. Nobody but the holder of the owner key can create invites.

**Revoking:** add the invite id (shown in the owner console) to `daybrief/public/revoked.json` and commit. Every device re-checks that file each time it opens.

**What this does and does not protect.** The invite check runs in the browser. It stops casual sharing completely: the invite text is useless on another device, and the device key cannot be exported. It does not stop someone who downloads the source and hosts their own copy without the check, which is true of every app that runs on the user's own device. Your mail and keys are never at risk from that: they live only on each user's own phone.

## Data security

- **Encrypted at rest.** Settings, API keys and the cached mail are encrypted with AES-GCM using a non-extractable key that the browser generates on the device. A copied or exported browser profile does not reveal them.
- **App lock.** Settings → Security lets each user require Face ID / fingerprint or a PIN when the app opens and after it has been in the background for a chosen number of minutes. Repeated wrong PINs slow down.
- **No server, no copies.** Mail goes from Google to the phone and from the phone to the AI provider the user chose. Nothing else sees it. "Keep mail offline" can be switched off so mail bodies never touch storage.
- **Content Security Policy.** The page may only talk to Google, Gmail and the chosen AI provider. Injected scripts or a compromised dependency cannot send data anywhere else.
- **Prompt-injection resistance.** The model is told that emails are untrusted data, and nothing is ever sent without the user's tap.
- **Delete everything.** One button wipes settings, keys, cache and the device identity.
