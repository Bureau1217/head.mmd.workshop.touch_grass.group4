# Browsy — browser extension prototype

A small glowing creature who shows up in your browser when it gets crowded,
and gets overwhelmed when you do.

Written in **TypeScript**, bundled with **Vite 8** and the **CRXJS** plugin
(same setup as the group's `minimal-simple-with-typescript` starter).

## Install (once)
```sh
npm install
```

## Run it
```sh
npm run dev      # keep this running: every file you save is rebuilt into dist/
```
1. Open `chrome://extensions` and turn on **Developer mode** (top right)
2. Click **Load unpacked** → pick the **`dist/`** folder
3. Pin Browsy's green icon from the puzzle-piece menu so the popup is one click away
4. Open a new tab — Chrome asks whether to keep the extension's New Tab page: keep it

With `npm run dev` running, saving a file updates the extension by itself
(refresh the web page if Browsy doesn't change straight away).

`npm run build` makes a finished version in `dist/` that works without the dev
server (use this for the final presentation). It also type-checks everything first.

Browsy lives on every normal website and on his own New Tab page. Chrome's
built-in pages (`chrome://settings`, `chrome://extensions`, the Web Store) are
off-limits to all extensions.

## Structure
```
manifest.json        # extension description (points directly to the .ts files)
vite.config.ts       # Vite config + CRXJS plugin
src/
├── content.ts       # Browsy himself, injected into every page: style, senses, body, brain
├── popup.html       # the window behind the toolbar icon — also the dev side panel
├── popup.ts         # switches & buttons + (side panel only) live graphs, log, tuning sliders
├── sound.ts         # all his sound effects, made in code (no sound files) — tweak them here
├── frames.ts        # tiny helper in embedded frames (Google Docs…): tells Browsy about key presses
├── background.ts    # tab count & switching, time on site, network, closing tabs, the crash
├── config.ts        # all tuning numbers + the data types every part shares
├── newtab.html      # Browsy's New Tab page (clock + search bar)
└── newtab.ts
public/              # copied into dist/ as-is
├── icons/           # toolbar icons (redraw them: node tools/make-icons.mjs)
└── cats/            # the calming cat photos
```
Why more than three files? `background.ts` has to exist: a web page isn't
allowed to count or close tabs, only the extension's background can.
`config.ts` is shared by the other three, so the numbers only live in one place.

**Dev panel:** popup → *open dev panel*. It docks next to your tabs and shows
live stress graphs, what's causing it, why he isn't dead yet, an event log, and
sliders for every setting (changes apply instantly, no reload). *copy for
Claude* copies your changes + the last death report.

## How to debug
- `content.ts`: DevTools on the web page (F12) → Console
- `popup.ts`: right-click in the popup → **Inspect**
- `background.ts`: `chrome://extensions` → Browsy → **service worker**

## The rules
- **He only exists when it's crowded:** **15 tabs** or more open. Close tabs
  and he fades away a few seconds later.
- calm (green) → uneasy → stressed (orange/red, shaking, darting eyes) →
  cat picture (blue, he calms himself and you down).
- **He tidies up:** while he shows you the cat he closes **2–3 tabs** you've
  looked at least recently. Every time he turns orange, he does it too.
- **Rushing:** typing 4+ letters a second (~48 wpm) for ~2.5 seconds → "you're rushing" →
  he closes the **3 tabs you've looked at least recently**.
- **Ripping:** fast scrolling (6+ wheel notches a second, or dragging the scroll bar)
  fills his *rip meter*; it only slowly empties again, so fast bursts add up.
  Half full → "stop scrolling! I'm warning you." Full → "THAT'S IT." — he
  **tears the tab in half** and it closes.
- **Touch him:** click him to boop him (he's happy if he's calm). Click him
  over and over and it hurts (stress). Press and drag to pick him up — he
  dangles and swings, carrying him fast makes him seasick. Let go and he
  falls; drop him outside his corner and he walks back home.
- **Too many tabs:** **33 tabs** kill him outright (he warns you at 30, 31 and 32).
- **Tab hopping:** switching tabs often wears him down until he dies
  (every 5 s ≈ 40 s, every 3 s ≈ 20 s); every 10 s or slower is fine.
- **Death:** stress maxed out with **2+** senses overloaded at once (0.8 s), or
  just staying at max stress for **2 s** → X eyes →
  a tombstone falls on him showing your stats → he **closes every tab one by
  one**, shows a crash screen and shuts the browser down. Your tabs do **not**
  come back. Next time he says: *"calmed down? we are so back."*

⚠️ Unsaved work in open tabs is lost in the crash. Tick **safe mode** in the
popup while developing: then he only dies, and **5 seconds of total stillness**
brings him back.

The **live outside condition** is the network: a slow ping + low speed makes him
fragile, so the same behaviour kills him faster on a bad connection.
