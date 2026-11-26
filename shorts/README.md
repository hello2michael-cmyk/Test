# Story shorts: narrated stories acted out by blocky avatars

Vertical YouTube Shorts in the style of the narrated "what if" story videos: a voice tells the story, block-figure
characters act it out in small 3D sets (a street, a classroom, a park, a living room, a stage), and the words appear
one to three at a time in big outlined captions. Everything is rendered by the existing video factory; no game, no
screen recording, no extra keys. The characters are original block figures drawn by `studio/js/blocky.js`, not assets
from any game.

Examples: `stories/truth-city.story.json` ("In This City, Everyone Has To Tell The Truth", 13 scenes, about 70 seconds) and
`stories/raphael-amma.story.json` ("The Home Nurse And Raphael Amma", a horror story, 23 scenes, about 2:45).

## Make one

1. **Write the story** as `shorts/stories/<id>.story.json` (or ask Claude in a Claude Code session: *"Write a story short
   about a city where nobody can lie"*). The format is below.
2. **Build the plan**: `node shorts/tools/make-short-plan.mjs shorts/stories/<id>.story.json`. It validates the story
   (cast, sets, actions, props, word counts) and writes `shorts/stories/<id>/plan.json` plus a readable `plan.md`.
   Commit both.
3. **Preview** any scene in the browser before rendering: open `shorts/preview.html` (on GitHub Pages:
   `https://hello2michael-cmyk.github.io/Test/shorts/preview.html?src=stories/<id>.story.json`), pick a scene, scrub the
   time or press Play.
4. **Render**: open an issue titled `Short: <id>` (from the GitHub app on a phone). The factory renders the committed
   plan in 9:16 with the English voice and posts the MP4, captions, YouTube text and a thumbnail on the issue, usually
   within 10 minutes. Locally: `SHORT=<id> node factory/run.mjs`.

Voice: Kokoro (runs inside the browser on the server, free; `"voice"` in the story picks one of the studio voices, e.g.
`am_adam`, `am_michael`, `af_heart`, `bm_george`). A Google voice can be forced with `TTS=google:en-US-Chirp3-HD-Charon`
when the `GOOGLE_TTS_KEY` secret exists.

## Story format

```json
{
  "id": "truth-city",
  "title": "In This City, Everyone Has To Tell The Truth",
  "voice": "am_adam", "speed": 1.04,
  "cast": {
    "max": { "skin": "light", "outfit": "blue", "hair": "short", "hairColor": "brown" },
    "mia": { "skin": "tan", "outfit": "pink", "hair": "long", "hairColor": "blonde", "glasses": true }
  },
  "scenes": [
    {
      "narration": "In this city, everyone has to tell the truth. No exceptions.",
      "emphasis": ["truth", "exceptions"],
      "set": "street", "time": "day",
      "camera": { "move": "push" },
      "actors": [
        { "who": "max", "pos": [-3.5, 0.6], "action": "walk", "keys": [{ "at": 0, "to": [0.2, 0.6], "dur": 3, "then": "idle" }] },
        { "who": "mia", "pos": [2, 0.4], "yaw": -60, "action": "talk", "face": "happy", "say": "Hi!" }
      ],
      "props": [{ "type": "sign", "pos": [1.9, 0.2], "yaw": 15, "text": "NO LIES\nALLOWED", "color": "#e74c3c" }]
    }
  ],
  "youtube": { "title": "...", "description": "...", "tags": ["story", "shorts"], "pinnedComment": "..." }
}
```

- **narration**: one beat per scene, 8 to 30 words (the picture should change every 3 to 6 seconds). **emphasis**: words
  shown in yellow.
- **set**: `street`, `classroom`, `park`, `home`, `stage`, `void`, `bedroom`, `woods` (a night forest with a hut), `cabin`
  (a dark wooden interior), `black`. **time**: `day`, `sunset`, `night`.
- **mood** (optional, per scene): `"tint": "#8a0f1a"` with `"tintAlpha": 0.2` washes the frame in a colour, `"vignette": true`
  darkens the edges, `"flash": 5.2` is a white flash at that second (horror beats).
- **camera** (all optional): `azimuth` (radians, default -0.35), `elevation` (0.2), `distance` (7.5), `target` `[x, y, z]`,
  `move`: `push`, `pull`, `orbit`, `pan`, `rise`. The camera sits on the +z side; characters at `yaw: 0` face it.
- **cast / look**: `skin` (`light`, `tan`, `brown`, `dark`, `pale`, `yellow` or a hex colour), `outfit` (`blue`, `red`,
  `green`, `yellow`, `purple`, `orange`, `pink`, `teal`, `white`, `black`, `police`, `suit`) or `shirt`/`pants` colours,
  `hair` (`short`, `long`, `bald`, `cap`, `bun`, `spiky`), `hairColor`, `hat`, `glasses`, `sleeves: "long"`, `logo`,
  `scale` (0.5 for a child), `hold` (something in the right hand: `cup`, `book`, `photo`, `axe`, `candle`, `phone`).
- **actors**: `pos` `[x, z]` on the ground (x left to right, z towards the camera; the acting area is about x −4…4,
  z −2…2), `yaw` in degrees, `action`, `face`, `say` (a speech bubble), and **keys** that change things at `at`
  seconds into the scene: `{ "at": 1.5, "action": "cheer", "face": "laugh", "say": "Yes!" }` or a move
  `{ "at": 0, "to": [2, 0], "dur": 2, "then": "idle" }` (the actor walks, or runs with `"action": "run"`). A key can also
  change `hold` (`null` puts the item down), `pos` (a jump cut) and `y` (height: `0.66` lies on a bed).
- **actions**: `idle`, `walk`, `run`, `sit` (put a `chair`, `bench` or `sofa` under the actor), `point`, `cheer`, `wave`, `sad`,
  `think`, `talk`, `jump`, `angry`, `dance`, `shrug`, `lie`, `sleep`, `pray`, `cry` (on the floor), `knock`, `scared`, `hold`,
  `offer` (hands something over), `possessed`, `raise` (an item over the head), `swing` (brings it down at about one second).
  **faces**: `neutral`, `happy`, `sad`, `surprised`, `angry`, `wink`, `laugh`, `scared`, `evil` (red eyes), `blank`.
- **props**: `sign` (`text`, up to three lines), `board` (`text`), `bench`, `chair`, `desk`, `table`, `tree`, `bush`,
  `crate` (`size`, `y` to put it on a table), `ball`, `car`, `lamp`, `podium`, `bed`, `fence` (`size` = length), `stand`
  (a market stall with `text`), `sofa`, `door` (`open: true`), `photo` (a framed picture, `y` for a shelf), `book` (`y`,
  `open`), `candle` (`y`), `stain` (a dark red pool, `size`), `axe` (on the floor), `dust` (a small heap), `text` (a floating
  label: `text`, `y`, `color`, `textColor`). Each takes `pos`, `yaw`, `color`.
- **headline**: optional big text at the top of the scene (for the hook or the final question).

## How it fits the factory

`story3d` is a storyboard scene kind like `math3d`: `studio/js/blocky.js` draws it with the deterministic software-3D
engine, the renderer adds the big captions (`captionStyle: "words"` in the plan settings splits the narration into
one-to-three-word cues), and `factory/run.mjs` renders the committed plan when `SHORT=<id>` is set (the workflow sets
it for issues titled `Short: <id>`). The same scenes can be used inside any other video by giving a storyboard scene
`"kind": "story3d"` and a `story` object.
