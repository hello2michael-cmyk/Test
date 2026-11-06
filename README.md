# TV Mirror

Three ways to connect your phone and your TCL TV:

1. **TV Screen Share** (same Wi‑Fi, no camera): a small app on the TV streams the TV's own screen to your phone.
2. **Home TV** (from anywhere): a spare phone or laptop at home films the TV and your phone shows it live.
3. **TV Mirror**: play a video on your phone and watch the same thing on your TCL TV.

Live at: https://hello2michael-cmyk.github.io/Test/

## See the TV's screen on your phone (same Wi‑Fi)

Your TCL runs Google TV (Android). The `android/` folder holds a small TV app, **TV Screen Share**, that captures the TV screen and serves it to your phone's browser over the home network. GitHub builds the installable file automatically.

Download link for the TV: https://github.com/hello2michael-cmyk/Test/releases/download/tv-app/TVScreenShare.apk

**One-time install on the TV**

1. On the TV, open the **Google Play Store** and install **Downloader** (by AFTVnews).
2. TV **Settings → Apps → Security & restrictions → Unknown sources**: allow **Downloader**.
3. Open Downloader, type the download link above and press Go. Choose **Install**, then **Open**.
4. In TV Screen Share press **Start sharing**, then **Start now** on the system question. Allow sound if asked.
5. The TV shows an address like `192.168.1.23:8080` and a QR code. Scan the QR code with your phone, or open https://hello2michael-cmyk.github.io/Test/tvapp.html and type the address once.
6. On the phone, use the browser menu and **Add to Home screen**.

**Every day**: open TV Screen Share on the TV (it keeps sharing until you stop it or turn the TV off), then tap the icon on your phone. Tap once for sound.

**Limits**: Netflix, Prime Video and Disney+ protect their picture and show as black in any screen capture. Sound comes through for apps that allow it (YouTube does). Phone and TV must be on the same Wi‑Fi. To update the TV app later, uninstall the old one first.

## Home TV: see what the TV at home is playing

A TV cannot send out a picture of its own screen, and apps like Netflix block screen capture. So this uses a spare phone, tablet or laptop at home, with its camera pointed at the TV. It works with any TV and any channel or app.

**One-time setup at home**

1. On the spare device, open `camera.html` (https://hello2michael-cmyk.github.io/Test/camera.html) in Chrome and allow the camera.
2. Stand it where it sees the TV, plugged in. Pick the right camera from the list if needed.
3. Scan the QR code it shows with your own phone. The watch page opens with the key filled in.
4. On your phone, use the browser menu, then **Add to Home screen**. You get a "Home TV" icon.
5. On the spare device tap **Dim screen** so it is not a lamp at night. It keeps streaming.

**Every day**

Tap the Home TV icon. The phone connects on its own and shows the TV live, with sound after one tap. If the home device is off you see "Home camera is offline" and it keeps retrying.

Anyone with the key can watch, so share the QR code only with people you trust. **New key** on the camera page locks everyone out and starts fresh.

## TV Mirror: play a video from your phone on the TV

```
Phone  ──(same Wi‑Fi)──▶  TV
index.html                 tv.html
```

## Two ways to get the picture onto the TV

| Method | Works with | What the TV needs |
|---|---|---|
| **Mirror** (default) | Video files on the phone and video links. Picture **and** sound. | A web browser on the TV (or any device plugged into the TV, like a laptop or Android box) that opens `tv.html`. |
| **Cast** | Video links only (https://…/video.mp4, m3u8, …). | A TCL **Google TV / Android TV** model (Chromecast built in). Phone must use Chrome on Android. |

If your TCL is a **Roku TV** model it has no browser and no Chromecast. For those, use the TV's own *Screen mirroring* setting with your phone's built‑in mirroring (Android: "Smart View" / "Cast screen"; iPhone: AirPlay on newer TCL models).

## Set it up once (free hosting on GitHub Pages)

1. In this repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, pick the branch that contains these files and the `/ (root)` folder, then **Save**.
3. After a minute, GitHub shows a link like `https://<your-user>.github.io/Test/`. That is your app.
   - Phone page: `https://<your-user>.github.io/Test/index.html`
   - TV page: `https://<your-user>.github.io/Test/tv.html`
4. On your phone, open the phone page in Chrome and choose **Add to Home screen** so it behaves like an app with its own icon.

## Watch something

1. **On the TV**, open the TV page in its browser. It shows a big 4‑character code and a QR code.
2. **On the phone**, open the app (or scan the QR code, which fills in the code for you).
3. Tap **Pick a video on this phone** (or paste a link and tap **Load**). The video plays on the phone.
4. Type the code from the TV and tap **Send to TV**. Within a few seconds the TV plays the same video with sound.
5. Press **OK** on the remote if the TV asks for a press to play with sound. Press **OK** again for full screen.

Pause, seek or change the video on the phone and the TV follows. Keep the phone page open while watching. The app asks the phone to keep its screen on.

To use **Cast** instead, load a video *link*, open the **Cast** tab and tap **Cast to TV**, then pick your TCL TV from the list.

## How it works

- The phone captures its own playing `<video>` and sends it to the TV over WebRTC, directly over your Wi‑Fi. The video does not go through any server.
- To find each other, both sides use the free public PeerJS signaling server. Only the code or key travels through it.
- Across the internet, the direct route is found with public STUN servers. If a mobile network blocks direct routes, the free Open Relay TURN servers carry the stream instead. No account or key is needed for any of this.
- Cast uses the Google Cast Web Sender SDK with the default media receiver, so the TV itself streams the link.

### Running it on your own computer instead of GitHub Pages

Any static web server works. For example, from this folder:

```
python3 -m http.server 8080
```

Then open `http://<computer-ip>:8080/index.html` on the phone and `http://<computer-ip>:8080/tv.html` on the TV. Note that mobile browsers only allow some features (install to home screen, wake lock) on `https://` pages, so GitHub Pages is the better choice.

To run your own signaling server too (no internet needed at all):

```
npx peer --port 9000 --path /
```

and add `?host=<computer-ip>&port=9000&path=/` to both page URLs.

## Files

- `android/`: the TV Screen Share app for Android TV / Google TV (Kotlin). `.github/workflows/android.yml` builds it.
- `tvapp.html`: phone page with the install steps and a launcher for the TV's address.
- `watch.html`, `watch.js`: Home TV viewer (your phone). `manifest-watch.webmanifest` makes it installable as "Home TV".
- `camera.html`, `camera.js`: the camera page for the spare device at home.
- `index.html`, `sender.js`: TV Mirror phone page.
- `tv.html`, `receiver.js`: TV Mirror TV page.
- `common.js`, `app.css`: shared helpers and styling.
- `manifest.webmanifest`, `sw.js`, `icon*.{svg,png}`: lets the phone page be installed like an app.
- `vendor/`: PeerJS 1.5.5 and qrcode-generator 1.5.2, bundled so the app does not depend on a CDN.

## Tube Player: watch YouTube on the iPhone

The `ios/` folder holds a small iPhone app, **Tube Player**. It searches YouTube, opens pasted links, keeps history and saved videos, and plays everything through YouTube's own player. It does not block or skip ads. The honest way to watch ad-free is a **YouTube Premium** account: sign in once inside the app (Settings → Sign in to YouTube) and the player shows no ads. Without Premium, YouTube's usual ads play.

GitHub builds the app file automatically: https://github.com/hello2michael-cmyk/Test/releases/download/iphone-app/TubePlayer.ipa

Apple only lets apps from the App Store install directly, so the file has to be put on the phone from a computer. Pick one of these.

**Option A: a Mac with Xcode (simplest if you have a Mac)**

1. Install **Xcode** from the Mac App Store and open `ios/TubePlayer.xcodeproj` from this repository.
2. In Xcode → Settings → Accounts, add your Apple ID (a free one is fine).
3. Click the **TubePlayer** project, then the **Signing & Capabilities** tab, and choose your name under **Team**.
4. Plug in the iPhone, pick it at the top of the window and press the **Run** (▶) button.
5. On the phone: **Settings → General → VPN & Device Management**, tap your Apple ID and **Trust**.

With a free Apple ID the app stops opening after 7 days. Press Run in Xcode again to renew it. With a paid Apple Developer account ($99/year) it lasts a year.

**Option B: Windows or Mac without Xcode, using Sideloadly**

1. On the computer install **iTunes** (Windows) and **Sideloadly** from https://sideloadly.io.
2. Download `TubePlayer.ipa` from the link above.
3. Plug in the iPhone, open Sideloadly, drag the `.ipa` in, type your Apple ID and press **Start**.
4. On the phone: **Settings → General → VPN & Device Management**, tap your Apple ID and **Trust**.

Same 7-day rule as above with a free Apple ID; run Sideloadly again to renew.

**Every day**: tap Tube Player, search or paste a link, tap a video. Tap the full-screen button in the player and turn the phone sideways for a big picture.

### Search key

Searching inside the app uses Google's free **YouTube Data API**. Pasting links works without it. To turn on search (about five minutes, no payment):

1. Open https://console.cloud.google.com and sign in with any Google account.
2. Create a project (any name), then open **APIs & Services → Library**, find **YouTube Data API v3** and press **Enable**.
3. Open **APIs & Services → Credentials → Create credentials → API key**. Copy the key.
4. In the app: **Settings → Search → API key** and paste it.

The free quota allows roughly 100 searches a day.
