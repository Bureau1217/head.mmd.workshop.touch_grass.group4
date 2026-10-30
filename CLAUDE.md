# Browsy — Touch_Grass workshop project

## Brief constraints
Experimental site whose behavior depends on a live condition beyond the page.
Rules: no click as main entry, no scroll as main structure, not constantly
available, at least one external live condition that actually changes
behavior (not decoration).

## Concept
A Chrome (MV3) browser extension. Browsy is a living creature (not a widget/UI
element) who shows up when your browser gets crowded, gets overwhelmed by how
you're using it, and calms down when you slow down. Name history: "Webby"
(dropped because of the Webby Awards) → "Tabsy" → "Browsy" (user's choice,
same Clippy-style "thing he lives in + -y" vibe). Test scripts in webby-test
written before a rename still use the old `tabsy-*` / `webby-*` names.

## Visual design (source of truth: References/Frame 1–4.png)
Soot-sprite / Clippy-like soft glowing ball living on the right side of the
page: radial glow (solid core fading out) + thick white line-art face, arms and
legs. Hue follows stress: green → yellow → orange → red; blue while holding
the cat. Continuous idle motion always (breathing, irregular blinking, eye
drift, floating, hopping); stressed = shallow fast breathing, trembling,
darting eyes; many tabs = his space shrinks and he's squeezed thinner.
A glowing FRAME around the whole tab mirrors him (`.frame`, 2 inset
box-shadow layers: thin + thick), ONLY at big stress (user: "definitely not
green"): invisible below stress 0.5 and while holding the cat, then faint yellow →
orange → thick red; hue capped at 50 (never green/blue); pulsing with his breathing,
flicker > 0.8,
red when dead, flares on pokes/dizzy/death/impact (`flashFrame`). Only
opacity changes per frame (colour redrawn every 4° of hue) → 60 fps.
Comments are white Comic Sans text with a glow (no bubble box), ALWAYS all
lowercase (user's rule; `say()` lowercases everything, write new lines lowercase).
Faces: calm, uneasy, stressed, chill (cat), dead (X eyes) + per-comment faces
sad `:(`, meh `:|`, worried (wide eyes), hurt (`> <`). Every comment with a
negative emotion must carry a matching face (`say(text, { face })`).

## How he behaves
- **Demo mode** (popup): hyper-sensitive — mouse/typing/clicks/scroll
  thresholds ÷ demoSensitivity (3) and stress rises × demoRiseSpeed (4);
  typing "hello" fast ≈ 0.85, normal mouse moving 3 s ≈ 0.9. Rushing/ripping
  keep normal numbers. Plus the shorter cat cooldown + site minutes→seconds.
- **Overall sensitivity** (user: "way too sensitive", calmed down twice; last time
  "a bit less sensitive"): comfort 0.6, riseSpeed 0.06 (was 0.08), tabsCalm 15
  (was 10: no tab fragility until 15 tabs = when he appears), deathHold 1.5 s,
  maxedDeath 4 s. Measured with 16 tabs (test56.mjs; orange / death): normal
  mouse/typing never; fast mouse 9 s / 16.5 s, fast typing 11 s / 18 s, brisk
  scrolling 13 s / 23 s, clicking 2/s 22 s / 34 s (no cat). demoRiseSpeed 4 keeps
  demo mode exactly as hyper as before (0.06 × 4 = 0.08 × 3).
- **Presence:** only appears with 15+ tabs open (`appearAtTabs`; was "more than 10", then 5) ("not constantly
  available"); fades out a few seconds after dropping below 15.
- **Stress inputs (implemented):** mouse speed (weighted highest), typing
  speed (arrow/Page/Home/End keys don't count as typing), click rate +
  rage-clicks, scroll speed = max(wheel speed, how fast the page/any box
  really scrolls — so scroll bar dragging + keyboard scrolling count too;
  single jumps > 2 screens ignored), tab switches (count within a 10 s window
  — switchesCalm 1 / Max 3, weight 2 — PLUS +switchStress 0.05 on every
  switch; each tab saves its state the moment it's hidden and the "2 s at max"
  countdown (maxedFor) carries over, so switching can't reset him: every 5 s =
  fine every 10 s, dies after ~40 s (every 5 s) / ~21 s (3 s);
  opening several tabs quickly (each activation = a switch) also hurts. Was: a
  short 5 s window; now 3 switches in 10 s → dizzy spiral eyes). Tab count and
  network don't add stress directly — they make him *fragile* (stress rises
  faster) and tabs raise his stress floor.
- **Comments** (wording chosen by the user, all in `react()` etc. in
  content.ts): arrival "XX tabs… working hard?", typing violently / working
  hard, mouse too fast, ow ow ow (rage clicks), "XX tabs?! do you want me to
  suffocate?" (20+), "you've spent N minutes on <site>" (5/10/20/45/90),
  dizzy (tab switches), network bad → "I feel dizzy. What's happening to
  me?", relief ("phew").
- **Cat:** at high stress he holds up a cat photo with a long arm ("woah!
  slow down. / breathe in. breathe out.") and turns blue — at most every 2 min (catCooldown; 30 s in demo mode,
  catCooldownDemo; user found it too frequent before). The photo is loaded
  before the card fades in (an empty card used to jump into place). While the
  cat is up, activity adds NO stress (user: you can't see him react) and he
  can't die (maxed timer paused); being gentle still calms him ×2.
  Showing the cat (also via the popup button) closes 2–3 least-recently-used tabs 1.5 s in
  (closeTabsMin/Max), silently (whooshes only).
- **Turning orange** (stress crosses orangeAt 0.7 = catAt): every time (orangeEvery 1;
  was every other time, user: "make it more frequent") he closes 2–3 forgotten tabs → "there. N tabs fewer. breathe." Must calm
  below orangeReset 0.5 before it counts again; doesn't count when the cat comes out at that
  moment; orangeCount/wasOrange are shared across tabs (switching while orange ≠ turning orange).
  Closing tabs can drop you below 15 → he leaves.
- **Rushing:** typing 4+ keys/s (measured over the last 2 s) for ~2.5 s → he closes the 3 least-recently-used
  tabs.
- **Ripping:** "rip meter" (`brain.ripMeter`, shown in the sensor meters)
  fills while scrolling ≥ ripScrollSpeed (600 px/s), empties at ripDrain
  (0.2×) otherwise, full at ripTime (1.5 s) — so bursts add up (user wanted
  it to happen "from time to time": nonstop fast ≈ 2 s, fast bursts ≈ 11 s,
  reading never) → warning at 45% ("stop scrolling! I'm
  warning you.") → background `captureVisibleTab` (needs `<all_urls>` host
  permission; whole stage hidden during the shot, cat put away) → two clipped
  copies of the screenshot laid over the page, jagged tear, tug + fly apart
  ("THAT'S IT. no more scrolling.", 'ripping' pose; no CSS filters on the
  halves — white edge = SVG polyline, page under it set visibility:hidden, screenshot
  decoded first: 38 → 59 fps) → background closes the
  tab. Brain freezes (no stress/reactions) while ripping. NOT affected by safe
  mode (like rushing).
- **Touching him** (git tag `before-interactions` = state before this):
  only his solid core (`.grab`, 56% of the box) catches the mouse, only while
  alive + present + no cat; clicks on him don't count as page clicks. Click =
  boop (hop, "boop."/"hi!"/"hehe." with happy `^ ^` face, or "not now…" when
  stressed ≥ 0.35); clicks in a row (< pokeReset 1.5 s apart): the n-th adds n × pokeStress 0.03 (user wanted ~0.7 after 6), 3rd+ = poke (hurt face, POKE_LINES on 3/5/7: "ow. stop poking me." → "stop it. please." → "I SAID STOP."), no calming while poking, 8+ → max → dies;
  press + move 6 px = pick up ('held' pose, pendulum swing on `.browsy`,
  "whoa— put me down!", fast carrying → "I'm getting seasick…" + mouse
  stress); release = falls to the floor of his corner, dropped outside →
  "hey! be careful." or "slow dooown!" (random) and walks back. Not built yet: fling, petting.
- **Death:** 33+ open tabs (tabsDeathAt; warnings at 30/31/32 "I can't take this. stop this or I'm quitting." (user: no tab count —
  "too descriptive"); stillness can't revive while still ≥ 33), or stress at max + 2 overloaded senses (0.8 s), or just staying at
  max for 2 s → red, X eyes, DUN DUN DUNN, he staggers to the MIDDLE of the
  screen (`m.dash`) → tombstone always falls in the middle (falling whistle
  timed to the 0.6 s drop + big thud on impact) with your stats
  (internet, tabs, plus mouse/typing/clicks/scroll/tab switches ONLY if that
  sense was above its "calm" threshold — user: no "0 wpm" lines). Tombstone =
  light stone with depth + dark charcoal "carved" writing (user disliked red
  text, wants high contrast): RIP / BROWSY / label…value rows.
- **Crash (REAL, by the user's choice):** after the tombstone he closes every
  tab one by one, shows a full-screen crash screen ("ERROR 2442 / Browsy got
  overwhelmed.", 7 s countdown), and quits the browser. background.ts owns
  the whole crash: content sends `browsy-crash` with a `delay` at the moment
  of death; background waits, re-checks `browsyState.mode === 'dead'` (popup
  revive cancels), closes tabs, writes the "rebooted" state AFTER closing
  them. Survives switching/closing the tab he died in. Tabs are deliberately
  NOT restored (punishment). Next launch he just says "calmed down? we are so
  back." (no comment about the lost tabs; same line after a safe-mode revive).
  "Safe mode" in the popup disables the crash; then (and only then) 5 s of
  stillness revives him.

## External condition (satisfies brief rule)
Live network congestion: background pings gstatic generate_204 every 30 s +
navigator.connection.downlink. Congestion = slow ping AND low speed together
(fast ping alone = fine). Congestion multiplies fragility, so the same behavior
kills him faster on a bad connection. Popup can simulate bad internet.

## Code map (`src/`, TypeScript + Vite 8 + CRXJS)
Structure follows the group's starter (github.com/Bureau1217/
head.mmd.workshop.touch_grass.group4, branch `minimal-simple-with-typescript`):
`manifest.json` points straight at the `.ts` files, Vite builds into `dist/`.
- `content.ts` — Browsy himself, 4 sections in order: STYLE (CSS string for
  the shadow root), SENSES (input listeners → pressures 0..1), BODY (SVG
  shapes per mood built without innerHTML for Trusted Types sites, movement,
  tombstone, crash screen), BRAIN (main loop: presence, stress, reactions,
  cat, rushing, death, crash, shared state across tabs, event log + telemetry)
- `config.ts` — ALL tuning numbers (single source of truth), the shared types
  (`Stored` = every chrome.storage key, `Message`, `Telemetry`…), typed
  `load`/`save`/`send` helpers, live-tuning overlay (`browsyTuning`)
- `sound.ts` — every sound effect, synthesized with Web Audio (no files):
  `tone()` (oscillator + slide/vibrato/lowpass) and `noise()` helpers, then
  named sounds (pop, blip babble per 3rd letter, boing, eep(n), whistleUp/
  Down, thud, catChime, uhOh, wobble, sigh, whooshes, strain + rip,
  dunDunDunn, falling, impact, crashSting, beep, goodbye, sparkle). Vibe the user
  asked for: dramatic but goofy, "comic sans". The tear + death were made
  "way more dramatic" on request: compressor + echo bus, movie hit + boom + 55
  crackles; dunDunDunn = 3-layer brass + timpani + cymbal; falling + impact;
  crashSting = distorted BRAAAM then trombone. `setRumble(level)` = a continuous
  stress rumble (low-passed hiss + hum + tremolo, chattering rattle near the
  top) driven every frame from the brain: fades in from stress 0.45, loudest
  at breaking point; 0 when away / cat / ripping / dying / tab hidden. AudioContext only starts after
  a click/key on the page (`unlock()` in the keydown/pointerdown listeners).
  Popup switch "mute sounds" (`settings.mute`; hidden = muted too).
- `frames.ts` — second content script (`all_frames` + `match_about_blank`,
  document_start): inside iframes it posts `{browsy:'key'}` to `window.top` on
  each typing key, so typing in Google Docs/editors/iframes counts (user found
  "typing doesn't work" — it was iframes). Also exports `NOT_TYPING`/`isTyping`
  used by content.ts. The omnibox (address bar) is invisible to extensions.
- `background.ts` — tab count/switches, time on site, network, closing tabs
- `popup.html/ts` — ONE page used as both the toolbar popup (toggles: meters,
  demo mode, fake bad internet, hide, safe mode; cat/kill/revive) and the dev
  side panel (`body.panel`, detected via `chrome.extension.getViews({type:
  'popup'})`): live stress graph, causes, "why isn't he dead yet", log,
  tuning sliders, "copy for Claude"
- `newtab.html/ts` — replaces Chrome's New Tab page (imports `./content`) so
  he can live there too (chrome:// pages and the Web Store can't be injected)
- `public/icons`, `public/cats` — copied into dist as-is (`tools/make-icons.mjs`
  redraws the icons)

## Working with the user
- Beginner coder — explain code, don't just hand it over. Windows 11, Git
  Bash, Node 24, Chrome. Workshop project, presented at the end.
- The user tunes behavior via the dev panel and reports back (often pasting
  the "copy for Claude" text). Saved slider values override config defaults —
  remind them to ↺ reset when defaults change.
- After changes: user keeps `npm run dev` running with `dist/` loaded
  unpacked (auto-rebuilds); refresh tabs if needed.
- Sharing a version (user zips it for friends): `npx vite build --outDir
  release/browsy --emptyOutDir`, then zip `release/browsy` + `release/HOW TO
  INSTALL.txt` into `release/Browsy.zip` (`release/` is gitignored). Never zip
  `dist/` — in dev mode it only loads from localhost:5173.
- ⚠️ NEVER run `npm run build` (or any vite build into `dist/`) yourself: the
  user's dev server owns `dist/`, and overwriting it left Chrome running mixed
  versions (→ "tombstone fell, tabs didn't close"). Verify with
  `npx tsc --noEmit` + `npx vite build --outDir <scratchpad>/dist-test
  --emptyOutDir`, and point tests at that folder (`EXT` env var, see test26).
- Testing: puppeteer-core in `%LOCALAPPDATA%\Temp\webby-test` (folder kept
  its old name) drives the
  installed Chrome headless with `dist/` loaded (`enableExtensions`), takes
  screenshots and reads state (`brain`/`Body`/`devLog` are put on globalThis,
  readable on newtab.html at `src/newtab.html`). Pick the service worker by
  URL `…/service-worker-loader.js` and wait until `typeof chrome === 'object'`
  in it (module SW gets chrome.* a moment late). Headless has no toolbar, so
  the real popup needs headful + `--window-position=-4000,0`. Always set
  `safeDeath` in tests unless testing the crash. (test25.mjs = full check, test24.mjs = old-key migration)

## Ideas not built yet
- "Every tab is alive": animated favicons (tiny blinking eye) per tab
- CPU / memory (chrome.system.*), real traffic volume (chrome.webRequest),
  audible tabs, downloads as extra inputs
- Being completely still during the tombstone countdown could save him
- Gently hovering over him to pet/calm him (happy `^ ^` face already exists)
- Flinging him: release while moving fast → flies, bounces off screen edges,
  dizzy eyes, big stress spike (proposed to the user, not built yet)

## Narrative / meaning
Not "you are the problem" (direct critique) — instead Browsy mirrors the
user's own scattered behavior back at them through care/empathy (Tamagotchi
lineage: you moderate yourself to keep something ELSE okay). Target
audience: people who already feel scattered and have tried focus/blocking
apps before — not people who need convincing attention fragmentation is
real. (The real crash adds a consequence on top of the empathy.)

## Status
Earlier presentation deck (5 slides: Idea/Steps/Interaction/Resources/Data)
was for an older concept (rush-hour website with fake popups). The Browsy
extension is now a working prototype; behavior is being tuned with the user.
