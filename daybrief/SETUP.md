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
