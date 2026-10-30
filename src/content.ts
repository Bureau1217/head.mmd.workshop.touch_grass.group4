// ─────────────────────────────────────────────────────────────
// CONTENT — Browsy himself. This script is injected into every web
// page (and Browsy's own New Tab page loads it too). Four parts:
//   1. STYLE   his CSS
//   2. SENSES  what he can feel: your mouse, keyboard, clicks, scrolling
//   3. BODY    drawing him and making him move
//   4. BRAIN   the main loop: presence, stress, comments, cat, death
// All the tuning numbers live in config.ts.
// ─────────────────────────────────────────────────────────────

import {
  CONFIG, load, save, send,
  type Command, type EventKind, type Episode, type Face, type LogEvent, type Mode, type Mood,
  type Net, type Pressure, type Sense, type Settings, type Stats, type TabInfo,
} from './config';
import { isTyping } from './frames';
import * as Sound from './sound'; // all his sound effects (Sound.boing(), Sound.thud() …)

type Point = { x: number; y: number };

// ── small math helpers ──
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// ramp(v, lo, hi): 0 when v ≤ lo, 1 when v ≥ hi, smooth in between
const ramp = (v: number, lo: number, hi: number) => clamp((v - lo) / (hi - lo), 0, 1);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];


// ═════════════════════════════════════════════════════════════
// 1. STYLE — Browsy's CSS. It lives in a string because it gets put
// inside a "shadow root": a private bubble on the page, so the
// website's CSS can't mess up Browsy and Browsy can't mess up the website.
// ═════════════════════════════════════════════════════════════

const BROWSY_CSS = `
:host { all: initial; }

.stage {
  position: fixed; inset: 0; overflow: hidden;
  pointer-events: none;            /* clicks pass straight through to the page */
  user-select: none; -webkit-user-select: none; /* clicking him never selects text */
  z-index: 2147483647;             /* on top of everything */
  font-family: 'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', cursive;
}

/* ── the frame: a soft glow around the whole tab, in his colour, breathing with him ──
   (drawn once; only its opacity changes every frame — cheap for the graphics card) */
.frame { position: absolute; inset: 0; --fc: hsl(135 100% 50%); transition: opacity .8s; }
.frame.absent { opacity: 0; }
.frame-glow { position: absolute; inset: 0; opacity: 0; will-change: opacity; }
.frame-glow.thin { box-shadow: inset 0 0 4vmin 0 var(--fc); }
.frame-glow.thick { box-shadow: inset 0 0 16vmin 3vmin var(--fc); } /* fades in when he's stressed: the frame "thickens" */

/* ── Browsy himself ── */
.browsy {
  position: absolute; left: 0; top: 0;
  width: var(--size); height: var(--size);
  --c: hsl(135 100% 45%);          /* his colour, updated every frame from JS */
  will-change: transform;
  transform-origin: 50% 25%;       /* the pendulum swing pivots near the top, where you hold him */
  transition: opacity .4s;
}
.browsy.crushed, .browsy.absent { opacity: 0; }
/* the part of him you can touch: only his solid round core, so the page
   around him (and behind his glow and arms) stays clickable */
.grab {
  position: absolute; left: 22%; top: 22%; width: 56%; height: 56%; border-radius: 50%;
  pointer-events: none; cursor: grab; touch-action: none;
}
.browsy.touchable .grab { pointer-events: auto; } /* only when he's here and alive */
.browsy.held .grab { cursor: grabbing; }
.squash { position: absolute; inset: 0; transform-origin: 50% 85%; }
.browsy.booting .squash { animation: boot .9s cubic-bezier(.3, 1.6, .5, 1); }
@keyframes boot { from { transform: scale(.1); } to { transform: scale(1); } }

/* the soft glowing ball: solid in the middle, fading out at the edge */
.glow {
  position: absolute; inset: 0; border-radius: 50%;
  background: radial-gradient(circle closest-side,
    var(--c) 0%, var(--c) 48%,
    color-mix(in srgb, var(--c) 55%, transparent) 66%,
    transparent 100%);
  filter: blur(calc(var(--size) * .02));
}

/* the white line-art face */
.face {
  position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible;
  fill: none; stroke: #fff; stroke-width: 11;
  stroke-linecap: round; stroke-linejoin: round;
}
.part { transition: d .45s ease; }           /* paths smoothly morph between moods */
.eyes { transform-box: fill-box; transform-origin: center; }
.eyes-x, .eyes-dizzy, .eyes-squint, .eyes-happy { display: none; }
[data-mood="dead"] .eyes-open,
[data-mood="hurt"] .eyes-open,
[data-mood="ripping"] .eyes-open,
[data-mood="happy"] .eyes-open,
.browsy[data-dizzy="1"] .eyes-open { display: none; }
[data-mood="dead"] .eyes-x { display: inline; }
[data-mood="hurt"] .eyes-squint, [data-mood="ripping"] .eyes-squint { display: inline; }
[data-mood="happy"] .eyes-happy { display: inline; }
.browsy[data-dizzy="1"] .eyes-squint, .browsy[data-dizzy="1"] .eyes-happy { display: none; }
.browsy[data-dizzy="1"]:not([data-mood="dead"]) .eyes-dizzy { display: inline; }
.spiral { stroke-width: 5; transform-box: fill-box; transform-origin: center; animation: spin .6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── speech ── */
.bubble {
  position: absolute; bottom: 92%; right: 6%;
  width: max-content; max-width: min(460px, 70vw);
  color: #fff; font-size: calc(var(--size) * .13); line-height: 1.2;
  white-space: pre-line; text-align: left;
  text-shadow: 0 0 2px rgba(0,0,0,.7), 0 0 10px var(--c), 0 0 18px var(--c);
  opacity: 0; transform: translateY(8px);
  transition: opacity .25s, transform .25s;
}
.bubble.show { opacity: 1; transform: none; }

/* ── the calming cat ── */
.cat {
  position: absolute; top: 4vh; left: 50%; height: 84vh;
  background: #222; box-shadow: 0 20px 60px rgba(0,0,0,.5);
  opacity: 0; transform: translate(-60%, 20px) scale(.97);
  transition: opacity .5s, transform .5s;
}
.cat.show { opacity: 1; transform: translate(-60%, 0); }
.cat img { display: block; height: 100%; width: auto; max-width: 42vw; object-fit: cover; }
.cat.emoji { width: 50vh; display: grid; place-items: center; font-size: 30vh; }
.cat.emoji img { display: none; }
.cat.emoji::after { content: '🐈'; }
.cat-arm {
  position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible;
  fill: none; stroke: #fff; stroke-linecap: round;
  opacity: 0; transition: opacity .4s;
}
.cat-arm.show { opacity: 1; }

/* ── ripping the tab in half: two halves of a screenshot, laid exactly over the page ── */
.rip-page { position: absolute; inset: 0; pointer-events: auto; background: #0d0d0d; contain: strict; }
/* each half is its own layer that the graphics card just slides and turns (no filters: they're slow on a whole screen) */
.rip-half { position: absolute; inset: 0; will-change: transform; contain: strict; }
.rip-paper { position: absolute; inset: 0; background: #ecebe6 0 0 no-repeat; } /* (blank paper if there's no screenshot) */
/* the torn paper edge: a thin white jagged line along the tear */
.rip-edge { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; fill: none; stroke: #f4f4f0; stroke-width: 3; stroke-linejoin: round; }

/* ── the tombstone ── */
.tomb {
  position: absolute; bottom: -2vh; height: 78vh; aspect-ratio: 300 / 520;
  transform: translateY(-130vh);
}
.tomb-art { display: block; width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 10px 25px rgba(0,0,0,.5)); }
.tomb.dropping { animation: drop .75s forwards; }
.tomb.landed { transform: none; }
.tomb.lifting { animation: lift 1.1s forwards; }
@keyframes drop {
  0%   { transform: translateY(-130vh); animation-timing-function: cubic-bezier(.55, 0, 1, .45); }
  80%  { transform: translateY(0);      animation-timing-function: ease-out; }
  90%  { transform: translateY(-2vh);   animation-timing-function: ease-in; }
  100% { transform: translateY(0); }
}
@keyframes lift {
  0%   { transform: none; }
  15%  { transform: translateY(1vh); animation-timing-function: cubic-bezier(.5, 0, .75, 0); }
  100% { transform: translateY(-130vh); }
}
.carve { fill: none; stroke: rgba(38,38,34,.55); stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; }
.carve-light { fill: none; stroke: rgba(255,255,255,.4); stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }

/* the writing: dark charcoal "carved" into the light stone (a thin light edge under each letter) */
.inscription {
  position: absolute; left: 18%; right: 18%; top: 18.5%; bottom: 14%; /* inside the carved border */
  display: flex; flex-direction: column; align-items: center; text-align: center;
  color: #22221f; text-shadow: 0 1px 0 rgba(255,255,255,.45);
}
.rip { font: 700 4.8vh/1 Georgia, 'Times New Roman', serif; letter-spacing: .14em; margin-right: -.14em; }
.name { margin-top: 1vh; font: 1.7vh/1 Georgia, serif; letter-spacing: .45em; margin-right: -.45em; text-transform: uppercase; color: #33332f; }
.divider {
  width: 45%; margin: 2.4vh 0 2.8vh;
  border-top: 2px solid rgba(34,34,31,.5); box-shadow: 0 1px 0 rgba(255,255,255,.45);
}
.epitaph { width: 100%; display: flex; flex-direction: column; gap: 2.3vh; }
.epitaph:has(.stat:nth-child(6)) { gap: 1.4vh; } /* lots of lines → a bit closer together */
.stat { display: flex; justify-content: space-between; align-items: baseline; gap: 1vh; }
.stat span {
  font: 700 1.4vh/1.2 system-ui, 'Segoe UI', sans-serif; letter-spacing: .12em;
  text-transform: uppercase; text-align: left; white-space: nowrap; color: #2e2e2a;
}
.stat b { font: 700 2.7vh/1.1 Georgia, serif; white-space: nowrap; }
.stat span:empty + b { margin: 0 auto; }
.tomb-note { margin-top: auto; width: 100%; font: italic 1.9vh/1.4 Georgia, serif; color: #2a2a26; white-space: pre-line; }

/* ── the crash screen: the last thing you see before the browser closes ── */
.crash {
  position: absolute; inset: 0; display: none;
  pointer-events: auto;            /* blocks the page underneath */
  flex-direction: column; justify-content: center; gap: 2.4vh; padding: 0 12vw;
  background: #0b0b0b; color: #f2f2f2;
  font: 2.4vh/1.5 'Segoe UI', system-ui, sans-serif;
}
.crash.show { display: flex; animation: flicker .35s steps(2) 2; }
@keyframes flicker { 50% { opacity: .2; } }
.crash-browsy {
  position: relative; width: 24vh; height: 24vh; margin-left: -4vh;
  --c: hsl(0 100% 47%);
  animation: glitch 1.6s steps(1) infinite;
}
@keyframes glitch {
  0%, 100% { transform: none; }
  20% { transform: translate(-6px, 2px) skewX(-6deg); }
  23% { transform: none; }
  61% { transform: translate(5px, -3px); }
  63% { transform: none; }
}
.crash-title { font-size: 6vh; font-weight: 600; letter-spacing: .03em; line-height: 1.1; max-width: 60vw; }
.crash-text { color: #cfcfcf; max-width: 60vw; }
.crash-small { font: 1.8vh/1.7 ui-monospace, Consolas, monospace; color: #9a9a9a; }
.crash-count { margin-top: 2vh; font-size: 2.8vh; color: #ff3b3b; }

/* ── debug meters (toggle in the popup) ── */
.hud {
  position: absolute; top: 12px; left: 12px; margin: 0; padding: 10px 12px;
  background: rgba(10,10,10,.85); color: #e8e8e8; border-radius: 8px;
  font: 12px/1.45 ui-monospace, Consolas, monospace; white-space: pre;
  display: none;
}
.hud.show { display: block; }
`;


// ═════════════════════════════════════════════════════════════
// 2. SENSES — what Browsy can feel. Listens to your mouse, keyboard,
// clicks and scrolling on this page, and reads the tab + network
// info that background.ts collects for the whole browser.
// Privacy: we never record WHAT you type, only WHEN a key is pressed.
// ═════════════════════════════════════════════════════════════

const senses = {
  mouseSpeed: 0,                               // px per second, smoothed
  scrollSpeed: 0,                              // px per second, smoothed (the bigger of the two below)
  wheelSpeed: 0,                               //   …how fast the mouse wheel / touchpad turns
  pageSpeed: 0,                                //   …how fast the page really moves (scroll bar, keyboard too)
  keyTimes: [] as number[],                    // timestamps of recent key presses
  clickTimes: [] as { t: number; x: number; y: number }[], // recent clicks
  rageUntil: 0,                                // set when rage-clicking is detected
  pointer: { x: innerWidth / 2, y: innerHeight / 2 } as Point,
  lastActive: Date.now(),                      // last time you did anything at all
  tabInfo: null as TabInfo | null,             // from background.ts
  net: null as Net | null,                     // from background.ts
};

let movedPx = 0;     // mouse distance travelled since the last frame
let wheeledPx = 0;   // mouse-wheel distance since the last frame
let pageMovedPx = 0; // how far the page (or a box in it) actually scrolled since the last frame
const scrollTops = new WeakMap<Element, number>(); // where each scrolling thing was last time
let lastPointer: Point | null = null;

// "capture: true" means we hear events before the page does,
// so websites can't accidentally hide them from Browsy.
const listen = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) =>
  addEventListener(type, fn, { capture: true, passive: true });

listen('pointermove', (e) => {
  if (lastPointer) movedPx += Math.hypot(e.clientX - lastPointer.x, e.clientY - lastPointer.y);
  lastPointer = senses.pointer = { x: e.clientX, y: e.clientY };
  senses.lastActive = Date.now();
});

// (Scrolling keys like the arrows don't count as typing — they count as scrolling when
// the page moves, see 'scroll' below. The list of those keys is in frames.ts.)
const typed = () => {
  senses.keyTimes.push(Date.now());
  senses.lastActive = Date.now();
};
listen('keydown', (e) => {
  senses.lastActive = Date.now();
  Sound.unlock(); // a key press = the browser allows sound from now on
  if (isTyping(e)) typed();
});
// Typing inside an embedded frame (Google Docs, editors, chat boxes…): frames.ts tells us
listen('message', (e) => {
  if (e.data?.browsy === 'key') typed();
});

listen('pointerdown', (e) => {
  const now = Date.now();
  senses.lastActive = now;
  Sound.unlock(); // a click = the browser allows sound from now on
  // Touching Browsy himself isn't a page click (the brain has its own reactions for that).
  // From out here, a click anywhere inside him looks like a click on <browsy-host>.
  if ((e.target as Element | null)?.localName === 'browsy-host') return;
  senses.clickTimes.push({ t: now, x: e.clientX, y: e.clientY });

  // Rage click = CONFIG.rageClicks+ clicks within one second, all in roughly the same spot
  const sameSpot = senses.clickTimes.filter(
    (c) => now - c.t < 1000 && Math.hypot(c.x - e.clientX, c.y - e.clientY) < 60
  );
  if (sameSpot.length >= CONFIG.rageClicks) senses.rageUntil = now + 2500;
});

listen('wheel', (e) => {
  wheeledPx += Math.abs(e.deltaY) * (e.deltaMode === 1 ? 16 : 1); // deltaMode 1 = lines, not pixels
  senses.lastActive = Date.now();
});

// The page really scrolling — however you do it: dragging the scroll bar, the
// keyboard (arrows, Page Down, space), a touchpad… (also boxes inside the page)
listen('scroll', (e) => {
  const box = e.target === document ? document.scrollingElement : e.target;
  if (!(box instanceof Element)) return;
  const before = scrollTops.get(box);
  scrollTops.set(box, box.scrollTop);
  if (before == null) return; // the first time we only learn where it is
  const moved = Math.abs(box.scrollTop - before);
  if (moved > innerHeight * 2) return; // one giant jump ("back to top", a link) isn't you scrolling
  pageMovedPx += moved;
  senses.lastActive = Date.now();
});
if (document.scrollingElement) scrollTops.set(document.scrollingElement, document.scrollingElement.scrollTop);

// How bad is the internet right now? 0 = great, 1 = terrible/offline
function networkCongestion(settings: Settings) {
  if (settings.badNet) return 1; // the "simulate bad internet" switch in the popup
  const net = senses.net;
  if (!net) return 0;
  if (net.rtt == null) return 1; // ping failed → offline
  const slowPing = ramp(net.rtt, 100, 600);
  if (net.downlink == null) return slowPing;
  const lowSpeed = 1 - ramp(net.downlink, 1, 10);
  // Congestion = slow ping AND low speed together. A fast ping means
  // the line is fine, even if Chrome's speed guess happens to be low.
  return slowPing * (0.5 + 0.5 * lowSpeed);
}

// Called every frame by the brain. dt = seconds since the last frame.
function readSenses(dt: number, settings: Settings) {
  const now = Date.now();

  // Smooth the raw speeds so one jerky frame doesn't spike everything
  const k = 1 - Math.exp(-dt / 0.3);
  senses.mouseSpeed += (movedPx / dt - senses.mouseSpeed) * k;
  senses.wheelSpeed += (wheeledPx / dt - senses.wheelSpeed) * k;
  senses.pageSpeed += (pageMovedPx / dt - senses.pageSpeed) * k;
  // Wheel scrolling moves the page too — taking the bigger one counts it once, not twice.
  // (The wheel still counts where the page can't move: the New Tab page, the very bottom…)
  senses.scrollSpeed = Math.max(senses.wheelSpeed, senses.pageSpeed);
  movedPx = wheeledPx = pageMovedPx = 0;

  // Only keep the last 2 seconds of keys (so fast typing shows up quickly) and 3 seconds of clicks
  senses.keyTimes = senses.keyTimes.filter((t) => now - t < 2000);
  senses.clickTimes = senses.clickTimes.filter((c) => now - c.t < 3000);

  const keysPerSec = senses.keyTimes.length / 2;
  const tabs = senses.tabInfo?.count ?? 1;
  const switches = (senses.tabInfo?.switches ?? []).filter((t) => now - t < CONFIG.switchMemory).length;
  const clicks = senses.clickTimes.length;
  // Demo mode: hyper-sensitive — mouse, typing, clicks and scrolling count from a fraction of the usual speed
  const d = settings.demo ? CONFIG.demoSensitivity : 1;

  const pressure: Pressure = {
    mouse: ramp(senses.mouseSpeed, CONFIG.mouseCalm / d, CONFIG.mouseMax / d),
    typing: ramp(keysPerSec, CONFIG.typingCalm / d, CONFIG.typingMax / d),
    clicks: now < senses.rageUntil ? 1 : ramp(clicks, CONFIG.clicksCalm / d, CONFIG.clicksMax / d),
    scroll: ramp(senses.scrollSpeed, CONFIG.scrollCalm / d, CONFIG.scrollMax / d),
    switching: ramp(switches, CONFIG.switchesCalm, CONFIG.switchesMax),
    tabs: ramp(tabs, CONFIG.tabsCalm, CONFIG.tabsMax),
    network: networkCongestion(settings),
  };

  const stats: Stats = {
    mouseSpeed: senses.mouseSpeed,
    scrollSpeed: senses.scrollSpeed,
    keysPerSec,
    wpm: keysPerSec * 12, // 1 word ≈ 5 keys → keys/s × 60 / 5
    clicks,
    tabs,
    switches,
    rtt: senses.net?.rtt ?? null,
    downlink: senses.net?.downlink ?? null,
  };

  return { pressure, stats, stillFor: now - senses.lastActive };
}


// ═════════════════════════════════════════════════════════════
// 3. BODY — draws Browsy and makes him move. It doesn't know anything
// about stress math; the brain (part 4) just tells it his mood.
// ═════════════════════════════════════════════════════════════

type Part = 'mouth' | 'armL' | 'armR' | 'legL' | 'legR';
const PARTS: Part[] = ['mouth', 'armL', 'armR', 'legL', 'legR'];
type Pose = Mood | Face | 'held' | 'ripping'; // everything his face and limbs can show

// Line-art shapes for each mood. Coordinates are in a 400×400 box with
// (0,0) in the middle of Browsy. Each part keeps the same path commands
// in every mood, so the browser can smoothly morph from one to the next.
const SHAPES: Record<Pose, Record<Part, string>> = {
  happy: { // ^ ^  big smile, little cheer (when you boop him)
    mouth: 'M -20 16 C -12 42, 12 42, 20 16',
    armL: 'M -85 12 Q -140 -10 -158 -40',
    armR: 'M 90 10 Q 145 -10 158 -45',
    legL: 'M -40 75 Q -70 75 -68 108 Q -66 135 -90 140',
    legR: 'M 25 75 Q 55 75 55 105 Q 55 132 80 138',
  },
  ripping: { // tearing the tab apart: arms out wide, legs braced, eyes squeezed > <
    mouth: 'M -18 34 C -10 16, 10 16, 18 34',
    armL: 'M -85 10 Q -150 -5 -195 -20',
    armR: 'M 85 10 Q 150 -5 195 -20',
    legL: 'M -40 75 Q -75 85 -85 115 Q -95 140 -115 145',
    legR: 'M 25 75 Q 60 85 70 115 Q 80 140 100 145',
  },
  held: { // picked up: arms up, legs dangling straight down, wide eyes
    mouth: 'M -16 30 C -6 20, 6 38, 16 26',
    armL: 'M -85 10 Q -125 -40 -110 -95',
    armR: 'M 85 10 Q 125 -40 110 -95',
    legL: 'M -40 75 Q -45 100 -42 125 Q -40 150 -44 172',
    legR: 'M 25 75 Q 30 100 27 125 Q 25 150 29 172',
  },
  calm: {
    mouth: 'M -16 18 C -12 34, 12 34, 16 18',
    armL: 'M -85 18 Q -140 0 -165 45',
    armR: 'M 90 15 Q 150 30 155 75',
    legL: 'M -40 75 Q -70 75 -68 108 Q -66 135 -90 140',
    legR: 'M 25 75 Q 55 75 55 105 Q 55 132 80 138',
  },
  uneasy: {
    mouth: 'M -16 28 C -6 20, 6 36, 16 26',
    armL: 'M -85 12 Q -140 -10 -160 20',
    armR: 'M 88 12 Q 150 10 160 40',
    legL: 'M -40 75 Q -66 80 -62 108 Q -60 135 -82 142',
    legR: 'M 25 75 Q 52 80 50 108 Q 50 134 72 142',
  },
  stressed: {
    mouth: 'M -18 34 C -10 16, 10 16, 18 34',
    armL: 'M -85 5 Q -150 -20 -150 -85',
    armR: 'M 85 5 Q 150 -20 150 -85',
    legL: 'M -40 75 Q -60 85 -55 110 Q -50 130 -70 145',
    legR: 'M 25 75 Q 45 85 40 110 Q 35 130 55 145',
  },
  // Faces for single comments (say(text, { face: 'sad' })), whatever his stress is
  sad: { // :(
    mouth: 'M -16 34 C -10 22, 10 22, 16 34',
    armL: 'M -85 22 Q -120 40 -128 88',
    armR: 'M 85 22 Q 120 40 128 88',
    legL: 'M -40 75 Q -70 75 -68 108 Q -66 135 -90 140',
    legR: 'M 25 75 Q 55 75 55 105 Q 55 132 80 138',
  },
  meh: { // :|
    mouth: 'M -14 28 C -5 28, 5 28, 14 28',
    armL: 'M -85 18 Q -132 18 -148 58',
    armR: 'M 88 18 Q 140 32 144 72',
    legL: 'M -40 75 Q -70 75 -68 108 Q -66 135 -90 140',
    legR: 'M 25 75 Q 55 75 55 105 Q 55 132 80 138',
  },
  worried: { // wide eyes, wobbly mouth, arms half up
    mouth: 'M -16 30 C -6 20, 6 38, 16 26',
    armL: 'M -85 10 Q -140 -15 -150 -60',
    armR: 'M 85 10 Q 140 -15 150 -60',
    legL: 'M -40 75 Q -60 85 -55 110 Q -50 130 -70 145',
    legR: 'M 25 75 Q 45 85 40 110 Q 35 130 55 145',
  },
  hurt: { // > <  eyes squeezed shut, grimace, arms up shielding his head
    mouth: 'M -18 32 C -8 18, 8 44, 18 28',
    armL: 'M -85 5 Q -132 -10 -112 -58',
    armR: 'M 85 5 Q 132 -10 112 -58',
    legL: 'M -40 75 Q -60 85 -55 110 Q -50 130 -70 145',
    legR: 'M 25 75 Q 45 85 40 110 Q 35 130 55 145',
  },
  chill: { // holding up the cat picture (frame 2) — the long left arm is drawn separately
    mouth: 'M -14 30 C -5 30, 5 30, 14 30',
    armL: 'M -85 30 Q -85 30 -85 30',
    armR: 'M 85 20 Q 140 35 140 70',
    legL: 'M -40 75 Q -70 75 -68 108 Q -66 135 -90 140',
    legR: 'M 25 75 Q 55 75 55 105 Q 55 132 80 138',
  },
  dead: { // frame 3
    mouth: 'M -40 52 C -15 44, 15 30, 40 22',
    armL: 'M -80 30 Q -135 30 -140 90',
    armR: 'M 80 40 Q 160 50 160 -20',
    legL: 'M -40 75 Q -20 70 -40 95 Q -65 120 -78 115',
    legR: 'M 20 80 Q 50 75 40 105 Q 30 130 50 145',
  },
};

// sad = heavy, half-closed eyes · worried = wide open   [width, height]
const EYE_SIZE: Partial<Record<Pose, [number, number]>> = { sad: [1, 0.6], worried: [1.15, 1.45], held: [1.15, 1.45] };

// A little spiral for dizzy eyes
const SPIRAL = 'M 0 0 a 5 5 0 1 1 10 0 a 10 10 0 1 1 -20 0 a 15 15 0 1 1 30 0 a 20 20 0 1 1 -40 0';

// Tiny helpers to build elements. (We avoid innerHTML because some
// sites, like YouTube, block it for security reasons.)
//   h('div', { class: 'cat' }, [child])  → an HTML element
//   s('path', { d: '…' })                → an SVG element
type Attrs = Record<string, string | number>;
type Kids = (Node | string)[];
const SVG_NS = 'http://www.w3.org/2000/svg';
function dress<T extends Element>(node: T, attrs: Attrs, children: Kids) {
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  node.append(...children);
  return node;
}
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, children: Kids = []) =>
  dress(document.createElement(tag), attrs, children);
const s = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, children: Kids = []) =>
  dress(document.createElementNS(SVG_NS, tag), attrs, children);

// Morph a part of the face into a shape (CSS animates the change)
const shape = (path: SVGPathElement, d: string) => path.style.setProperty('d', `path("${d}")`);

function buildFace() {
  const part = (name: Part) => s('path', { class: `part ${name}` });
  return s('svg', { class: 'face', viewBox: '-200 -200 400 400' }, [
    part('armL'), part('armR'), part('legL'), part('legR'),
    s('g', { class: 'eyes' }, [
      s('g', { class: 'eyes-open' }, [
        s('ellipse', { cx: -45, cy: -20, rx: 13, ry: 9 }),
        s('ellipse', { cx: 45, cy: -20, rx: 13, ry: 9 }),
      ]),
      s('path', { class: 'eyes-x', d: 'M -58 -33 L -32 -7 M -58 -7 L -32 -33 M 32 -33 L 58 -7 M 32 -7 L 58 -33' }),
      s('path', { class: 'eyes-squint', d: 'M -58 -32 L -34 -20 L -58 -8 M 58 -32 L 34 -20 L 58 -8' }),
      s('path', { class: 'eyes-happy', d: 'M -58 -14 Q -45 -36 -32 -14 M 32 -14 Q 45 -36 58 -14' }), // ^ ^
      s('g', { class: 'eyes-dizzy' }, [-45, 45].map((x) =>
        s('g', { transform: `translate(${x} -20)` }, [s('path', { class: 'spiral', d: SPIRAL })]))),
    ]),
    part('mouth'),
  ]);
}

// The tombstone is drawn in a 300×520 box. The writing on it is HTML laid on
// top (.inscription), so it can wrap and use normal fonts.
function buildTomb() {
  // outline: straight sides, rounded shoulders, an arched top (like frame 4)
  const stone = 'M 30 470 L 30 150 Q 30 118 58 108 Q 72 38 150 30 Q 228 38 242 108 Q 270 118 270 150 L 270 470 Z';
  // a carved border, a little inside the outline
  const border = 'M 48 462 L 48 158 Q 48 134 72 125 Q 86 60 150 52 Q 214 60 228 125 Q 252 134 252 158 L 252 462';
  const mossBack = 'M 0 512 Q 14 478 40 488 Q 58 466 86 484 Q 112 470 140 486 Q 168 468 194 486 Q 222 466 250 484 Q 278 472 300 500 L 300 520 L 0 520 Z';
  const mossFront = 'M 0 520 Q 20 494 52 504 Q 80 490 110 504 Q 140 492 170 506 Q 204 492 236 504 Q 268 494 300 512 L 300 520 Z';
  // a carved line = a dark groove with a thin light edge just below it
  const carve = (d: string) => [
    s('path', { class: 'carve-light', d, transform: 'translate(1.4 1.4)' }),
    s('path', { class: 'carve', d }),
  ];
  return h('div', { class: 'tomb' }, [
    s('svg', { class: 'tomb-art', viewBox: '0 0 300 520' }, [
      s('defs', {}, [
        // light comes from the top left
        s('linearGradient', { id: 'browsy-stone', x1: 0, y1: 0, x2: 0.6, y2: 1 }, [
          s('stop', { offset: 0, 'stop-color': '#d6d5cd' }),
          s('stop', { offset: 1, 'stop-color': '#94938b' }),
        ]),
        s('linearGradient', { id: 'browsy-base', x1: 0, y1: 0, x2: 0, y2: 1 }, [
          s('stop', { offset: 0, 'stop-color': '#aeada5' }),
          s('stop', { offset: 1, 'stop-color': '#6c6b64' }),
        ]),
        // grainy stone texture made from random noise
        s('filter', { id: 'browsy-grain' }, [
          s('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.9, numOctaves: 2, result: 'noise' }),
          s('feColorMatrix', { in: 'noise', type: 'matrix', result: 'grey',
            values: '0.3 0 0 0 0.7  0.3 0 0 0 0.7  0.3 0 0 0 0.7  0 0 0 0 1' }),
          s('feBlend', { in: 'SourceGraphic', in2: 'grey', mode: 'multiply', result: 'mix' }),
          s('feComposite', { in: 'mix', in2: 'SourceGraphic', operator: 'in' }),
        ]),
      ]),
      s('path', { d: stone, fill: '#5b5a54', transform: 'translate(9 0)' }), // the stone's thickness, seen on the right
      s('path', { d: stone, fill: 'url(#browsy-stone)', filter: 'url(#browsy-grain)' }),
      ...carve(border),
      // cracks stay near the edges, so they never run through the writing
      ...carve('M 62 112 L 74 138 L 66 166 L 78 190'),
      ...carve('M 268 236 L 258 266 L 264 292 L 256 330'),
      ...carve('M 34 384 L 50 402 L 44 434'),
      s('rect', { x: 6, y: 460, width: 288, height: 44, rx: 5, fill: 'url(#browsy-base)', filter: 'url(#browsy-grain)' }),
      s('rect', { x: 6, y: 460, width: 288, height: 3, rx: 1.5, fill: 'rgba(255,255,255,.35)' }), // lit top edge of the base
      s('path', { d: mossBack, fill: '#3f5a1f' }),
      s('path', { d: mossFront, fill: '#6b8c32' }),
    ]),
    h('div', { class: 'inscription' }, [
      h('div', { class: 'rip' }, ['RIP']),
      h('div', { class: 'name' }, ['Browsy']),
      h('div', { class: 'divider' }),
      h('div', { class: 'epitaph' }), // your stats, filled in when he dies
      h('div', { class: 'tomb-note' }), // "There will be consequences – Browsy" before the crash
    ]),
  ]);
}

// The full-screen "your browser needs to close" takeover
function buildCrashScreen() {
  const deadFace = buildFace();
  for (const name of PARTS) shape(deadFace.querySelector<SVGPathElement>(`.${name}`)!, SHAPES.dead[name]);
  return h('div', { class: 'crash' }, [
    h('div', { class: 'crash-browsy', 'data-mood': 'dead' }, [h('div', { class: 'glow' }), deadFace]),
    h('div', { class: 'crash-title' }, ['ERROR 2442']),
    h('div', { class: 'crash-text' }, ['Browsy got overwhelmed.']),
    h('div', { class: 'crash-small' }, [
      'STOP CODE: TOO_MUCH_EVERYTHING',
      h('br'),
      h('span', { class: 'crash-stats' }),
    ]),
    h('div', { class: 'crash-count' }),
  ]);
}

type SayOptions = { priority?: number; ms?: number; face?: Face | null };

const Body = (() => {
  const size = CONFIG.size;
  const unit = size / 400; // screen pixels per SVG unit

  // ── build everything inside a shadow root ──
  const host = document.createElement('browsy-host');
  const root = host.attachShadow({ mode: 'open' });
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(BROWSY_CSS);
    root.adoptedStyleSheets = [sheet];
  } catch {
    root.append(h('style', {}, [BROWSY_CSS]));
  }

  const face = buildFace();
  const glow = h('div', { class: 'glow' });
  const squash = h('div', { class: 'squash' }, [glow, face]);
  const bubble = h('div', { class: 'bubble' });
  const grab = h('div', { class: 'grab' }); // where you can click / pick him up
  const browsy = h('div', { class: 'browsy absent' }, [squash, bubble, grab]); // hidden until it gets crowded
  const catImg = h('img', { alt: 'a calming cat' });
  const catCard = h('div', { class: 'cat' }, [catImg]);
  const catArmPath = s('path');
  const catArm = s('svg', { class: 'cat-arm' }, [catArmPath]);
  const tomb = buildTomb();
  const hud = h('pre', { class: 'hud' });
  const crash = buildCrashScreen();
  const frameThin = h('div', { class: 'frame-glow thin' });
  const frameThick = h('div', { class: 'frame-glow thick' });
  const frame = h('div', { class: 'frame absent' }, [frameThin, frameThick]); // the glow around the whole tab
  const stage = h('div', { class: 'stage' }, [frame, catCard, browsy, catArm, tomb, hud, crash]);
  stage.style.setProperty('--size', `${size}px`);
  root.append(stage);
  document.documentElement.append(host);

  const parts = {} as Record<Part, SVGPathElement>;
  for (const name of PARTS) parts[name] = face.querySelector<SVGPathElement>(`.${name}`)!;
  const eyes = face.querySelector<SVGGElement>('.eyes')!;
  const epitaph = tomb.querySelector<HTMLElement>('.epitaph')!;
  const tombNote = tomb.querySelector<HTMLElement>('.tomb-note')!;
  const crashStats = crash.querySelector<HTMLElement>('.crash-stats')!;
  const crashCount = crash.querySelector<HTMLElement>('.crash-count')!;

  // ── motion state ──
  const m = {
    x: innerWidth - size * 0.8,
    y: innerHeight - size * 0.55,
    from: { x: 0, y: 0 } as Point,
    to: null as Point | null, // where he's hopping/walking to (null = standing still)
    moveStart: 0, moveDur: 1, hop: 0, nextMove: performance.now() + 1500,
    landAt: -1e9,
    breath: 0,
    hue: 135,
    eye: { x: 0, y: 0 }, dart: { x: 0, y: 0 }, nextDart: 0,
    blinkUntil: 0, nextBlink: performance.now() + 2000,
    mood: null as Pose | null,
    catShown: false,
    crowd: 0,
    // being touched
    hold: null as { pointer: Point; offset: Point } | null, // carried: follows the mouse
    falling: false, vy: 0,     // dropped: falls down with gravity (px/s)
    swing: 0, swingSpeed: 0,   // hanging from your mouse he swings like a pendulum (degrees)
    boopAt: -1e9,              // when you last booped him (little bounce)
    rip: null as Point | null, // ripping the tab: where he stands (in the middle of the tear)
    dash: null as Point | null, // dying: he goes to the middle of the screen, under the tombstone
    flash: 0,                  // a quick flare of the frame (pokes, death…), fades by itself
    frameHue: -1,              // the frame's colour right now (only redrawn when it really changes)
  };

  // Browsy lives on the right side of the screen. With many tabs open
  // his space gets squeezed — crowding is felt, not counted.
  function zone(crowd: number) {
    const right = innerWidth - size * 0.45; // keep his arms on screen
    const width = Math.max(size * 0.3, innerWidth * 0.28 * (1 - 0.7 * crowd));
    return { minX: right - width, maxX: right, minY: innerHeight * 0.42, maxY: innerHeight - size * 0.38 };
  }

  function planMove(now: number, stress: number, crowd: number) {
    const z = zone(crowd);
    const hop = Math.random() < 0.35 + stress * 0.6; // stressed Browsy hops around more
    m.from = { x: m.x, y: m.y };
    m.to = { x: rand(z.minX, z.maxX), y: rand(z.minY, z.maxY) };
    m.hop = hop ? rand(40, 110) * unit * 2 : 0;
    m.moveDur = hop ? rand(500, 800) - stress * 250 : rand(1800, 3200) - stress * 1200;
    m.moveStart = now;
    m.nextMove = now + m.moveDur + rand(2500, 7000) * (1 - stress * 0.85);
  }

  // ── being touched: a click = boop, press and move = pick him up ──
  // The brain decides how he feels about it (onTouch); the body does the moving.
  type Touch = { kind: 'boop' } | { kind: 'pickup' } | { kind: 'drop'; outside: boolean };
  let touchHandler: (touch: Touch) => void = () => {};
  let press: Point | null = null; // where the mouse went down on him

  grab.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection on the page while you drag him
    grab.setPointerCapture(e.pointerId); // keep getting the mouse, even when it leaves him
    press = { x: e.clientX, y: e.clientY };
  });
  // (double / triple clicks would otherwise select words on the page behind him)
  grab.addEventListener('mousedown', (e) => e.preventDefault());
  grab.addEventListener('pointermove', (e) => {
    if (m.hold) m.hold.pointer = { x: e.clientX, y: e.clientY };
    else if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) pickUp(press);
  });
  grab.addEventListener('pointerup', () => {
    if (m.hold) drop();
    else if (press) boop();
    press = null;
  });
  grab.addEventListener('pointercancel', () => {
    if (m.hold) drop();
    press = null;
  });

  function boop() {
    m.boopAt = performance.now();
    m.blinkUntil = m.boopAt + 120;
    touchHandler({ kind: 'boop' });
  }
  function pickUp(at: Point) {
    m.hold = { pointer: at, offset: { x: m.x - at.x, y: m.y - at.y } }; // keep holding him where you grabbed
    m.to = null; // stop walking
    m.falling = false;
    browsy.classList.add('held');
    Sound.whistleUp();
    touchHandler({ kind: 'pickup' });
  }
  function drop() {
    const z = zone(m.crowd);
    m.hold = null;
    press = null;
    m.falling = true;
    m.vy = 0;
    browsy.classList.remove('held');
    if (m.y < z.maxY - 40) Sound.whistleDown(); // (only if there's a real fall ahead)
    touchHandler({ kind: 'drop', outside: m.x < z.minX || m.x > z.maxX });
  }

  function setMood(mood: Pose) {
    if (mood === m.mood) return;
    m.mood = mood;
    browsy.dataset.mood = mood;
    for (const name of PARTS) shape(parts[name], SHAPES[mood][name]);
  }

  // Where a point of the drawing (in the 400×400 face coordinates) ends up on
  // screen, after the same rotate + scale the CSS applies to .squash.
  // The squash happens around a point low in his body (transform-origin 50% 85%).
  function toScreen(px: number, py: number, sx: number, sy: number, rotDeg: number, left: number, top: number) {
    const oy = 140; // 85% of the box height, measured from the middle, in face units
    const a = (rotDeg * Math.PI) / 180;
    const x = px * sx;
    const y = (py - oy) * sy;
    return {
      x: left + size / 2 + (x * Math.cos(a) - y * Math.sin(a)) * unit,
      y: top + size / 2 + (x * Math.sin(a) + y * Math.cos(a) + oy) * unit,
    };
  }

  // touchable = he's on screen and alive (the brain decides)
  type Look = { stress: number; mood: Mood; dizzy: boolean; crowd: number; pointer: Point; touchable: boolean };

  // Called every frame. `now` is performance.now().
  function update(dt: number, now: number, { stress, mood, dizzy, crowd, pointer, touchable }: Look) {
    m.crowd = crowd;
    browsy.classList.toggle('touchable', touchable);
    if (m.hold && !touchable) drop(); // he can't stay in your hand while he dies

    // A comment can show its own face while the bubble is up (not over the cat or death)
    const showCommentFace = commentFaceName && commentFaceUntil > Date.now() && mood !== 'dead' && mood !== 'chill';
    setMood(m.rip ? 'ripping' : m.hold ? 'held' : showCommentFace ? commentFaceName! : mood);
    browsy.dataset.dizzy = dizzy ? '1' : '';
    const alive = mood !== 'dead';
    const frozen = mood === 'dead' || mood === 'chill';
    const z = zone(crowd);
    let lean = 0; // how far he swings out while you carry him (degrees)

    if (m.hold) {
      // ── carried: follow the mouse (a tiny bit behind it) ──
      const before = m.x;
      const k = 1 - Math.exp(-dt * 18);
      m.x += (m.hold.pointer.x + m.hold.offset.x - m.x) * k;
      m.y += (m.hold.pointer.y + m.hold.offset.y - m.y) * k;
      lean = clamp((m.x - before) / dt / 40, -35, 35); // move right → his body trails to the left
    } else if (m.rip) {
      // ── ripping the tab: rush to the middle of the tear ──
      const k = 1 - Math.exp(-dt * 10);
      m.x += (m.rip.x - m.x) * k;
      m.y += (m.rip.y - m.y) * k;
    } else if (m.dash) {
      // ── dying: stagger to the middle of the screen, where the tombstone will fall ──
      const k = 1 - Math.exp(-dt * 5);
      m.x += (m.dash.x - m.x) * k;
      m.y += (m.dash.y - m.y) * k;
    } else if (m.falling) {
      // ── dropped: fall down to the floor of his corner ──
      m.vy += 2600 * dt; // gravity
      m.y += m.vy * dt;
      if (m.y >= z.maxY) {
        m.y = z.maxY;
        m.falling = false;
        if (m.vy > 400) Sound.thud(); // (a real fall, not a tiny hop)
        m.landAt = now; // landing squash
        m.nextMove = now + rand(600, 1500); // catch his breath, then walk on (or back home)
      }
    } else {
      // ── wander around ──
      if (!frozen && !m.to && now > m.nextMove) planMove(now, stress, crowd);
      if (m.to) {
        const t = Math.min(1, (now - m.moveStart) / m.moveDur);
        const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        m.x = lerp(m.from.x, m.to.x, ease);
        m.y = lerp(m.from.y, m.to.y, ease) - m.hop * Math.sin(Math.PI * t); // hop = an arc
        if (t >= 1) {
          if (m.hop) m.landAt = now;
          m.to = null;
        }
      }
      // Outside his corner (dropped somewhere else, or the window shrank)?
      // His next walk takes him back home. Frozen (dead / holding the cat) → just put him back.
      if (frozen && !m.to) {
        m.x = clamp(m.x, z.minX, z.maxX);
        m.y = clamp(m.y, z.minY, z.maxY);
      }
    }
    // ── the pendulum: springs towards `lean`, and back to upright once you let go ──
    m.swingSpeed += ((lean - m.swing) * 60 - m.swingSpeed * 4) * dt;
    m.swing += m.swingSpeed * dt;

    // ── breathing: calm = slow & deep, stressed = quick & shallow ──
    m.breath += dt * (0.22 + stress * 1.2) * Math.PI * 2;
    const amp = alive ? 0.04 - stress * 0.025 : 0;
    let sx = 1 + Math.sin(m.breath) * amp;
    let sy = 1 + Math.sin(m.breath) * amp * 1.3;
    const sinceLand = now - m.landAt;
    if (sinceLand < 250) { // squash when landing from a hop
      const q = Math.sin((sinceLand / 250) * Math.PI) * 0.18;
      sx += q;
      sy -= q;
    }
    if ((m.to && m.hop) || m.falling) { sx -= 0.04; sy += 0.06; } // stretch in the air
    if (m.hold) { sx -= 0.06; sy += 0.1; } // hanging from your hand: stretched long
    sx *= 1 - 0.15 * crowd; // squeezed by too many tabs

    // ── trembling, wobbling, floating ──
    // (no trembling while he holds the cat: he's calming down)
    const tremble = mood === 'dead' ? 4 : mood === 'chill' ? 0 : Math.max(0, stress - 0.6) * 12;
    const jx = rand(-tremble, tremble);
    const jy = rand(-tremble, tremble);
    const rot = dizzy ? Math.sin(now / 140) * 14 : 0;
    const bob = alive && !m.hold && !m.falling && !m.rip ? Math.sin(now / 900) * 5 : 0;
    const sinceBoop = now - m.boopAt; // booped → a quick little jump
    const boing = sinceBoop < 320 ? Math.sin((sinceBoop / 320) * Math.PI) * 22 * unit * 1.7 : 0;

    const left = m.x - size / 2 + jx;
    const top = m.y - size / 2 + bob + jy - boing;
    browsy.style.transform = `translate3d(${left}px, ${top}px, 0) rotate(${m.swing}deg)`; // swings around where you hold him
    squash.style.transform = `rotate(${rot}deg) scale(${sx}, ${sy})`;

    // ── eyes: follow the mouse a bit, drift when idle, dart when stressed ──
    if (alive) {
      const dx = pointer.x - m.x;
      const dy = pointer.y - m.y;
      const dist = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, dist / 400);
      let tx = (dx / dist) * reach * 8 + Math.sin(now / 1700) * 3;
      let ty = (dy / dist) * reach * 6 + Math.sin(now / 2300) * 2;
      const darting = stress > 0.55;
      if (darting && now > m.nextDart) {
        m.dart = { x: rand(-12, 12), y: rand(-8, 8) };
        m.nextDart = now + rand(150, 600) / stress;
      }
      if (darting) { tx += m.dart.x; ty += m.dart.y; }
      const ek = 1 - Math.exp(-dt * (darting ? 25 : 6));
      m.eye.x += (tx - m.eye.x) * ek;
      m.eye.y += (ty - m.eye.y) * ek;

      if (now > m.nextBlink) {
        m.blinkUntil = now + 130;
        m.nextBlink = now + rand(1500, 6000) * (1 - stress * 0.6);
        if (Math.random() < 0.2) m.nextBlink = now + 280; // sometimes a double-blink
      }
    }
    const [eyeW, eyeH] = (m.mood && EYE_SIZE[m.mood]) ?? [1, 1];
    const blink = alive && now < m.blinkUntil ? 0.1 : eyeH;
    eyes.style.transform = `translate(${m.eye.x}px, ${m.eye.y}px) scale(${eyeW}, ${blink})`;

    // ── colour: green → yellow → red with stress, blue with the cat ──
    const targetHue = mood === 'dead' ? 0 : mood === 'chill' ? 205 : 135 * (1 - stress);
    m.hue += (targetHue - m.hue) * (1 - Math.exp(-dt * 3));
    browsy.style.setProperty('--c', `hsl(${m.hue} 100% 47%)`);

    // ── the frame around the whole tab: only when he's REALLY stressed ──
    // Nothing until he's half-stressed, then a faint yellow → orange → thick red,
    // pulsing with his breathing and flickering near breaking point. Never green or blue:
    // hidden while he's calm or holding the cat.
    const breath = 0.5 + 0.5 * Math.sin(m.breath);           // 0…1, in step with his breathing
    const calming = mood === 'chill';
    const dead = mood === 'dead';
    const shown = dead ? 1 : calming ? 0 : clamp((stress - 0.5) / 0.5, 0, 1); // 0 below half-stressed
    let thin = (dead ? 0.6 : shown * 0.7) * (0.7 + 0.3 * breath);
    let thick = (dead ? 0.3 : calming ? 0 : clamp((stress - 0.65) / 0.35, 0, 1)) * (0.55 + 0.45 * breath);
    if (alive && !calming && stress > 0.8) thin *= 0.8 + Math.random() * 0.4; // flicker
    m.flash *= Math.exp(-dt * 5);
    frameThin.style.opacity = String(Math.min(1, thin + m.flash));
    frameThick.style.opacity = String(Math.min(1, thick + m.flash * 0.8));
    // his colour, but never greener than yellow (only redrawn when it really changes)
    const frameHue = Math.round(Math.min(m.hue, 50) / 4) * 4;
    if (frameHue !== m.frameHue) {
      m.frameHue = frameHue;
      frame.style.setProperty('--fc', `hsl(${frameHue} 100% 50%)`);
    }

    // ── the long arm holding up the cat picture ──
    const catReady = m.catShown && catImg.complete && catImg.naturalWidth > 0;
    catArm.classList.toggle('show', catReady);
    if (catReady) {
      // Start exactly at his shoulder, wherever breathing & squashing have moved it this frame
      const { x: x0, y: y0 } = toScreen(-85, 30, sx, sy, rot, left, top);
      const r = catImg.getBoundingClientRect();
      const x1 = r.right - 8;
      const y1 = clamp(y0, r.top + r.height * 0.3, r.bottom - r.height * 0.1); // reach sideways, like frame 2
      catArmPath.setAttribute('d', `M ${x0} ${y0} Q ${(x0 + x1) / 2} ${Math.max(y0, y1) + 40} ${x1} ${y1}`);
      catArmPath.style.strokeWidth = `${11 * unit}px`;
    }
  }

  // ── speech, typed out letter by letter ──
  let typer = 0;
  let hideTimer = 0;
  let speakingUntil = 0;
  let speakingPriority = 0;
  let commentFaceName: Face | null = null;
  let commentFaceUntil = 0;
  // face: optional expression while he says it ('sad', 'meh', …)
  function say(text: string, { priority = 1, ms = 3500, face = null }: SayOptions = {}) {
    text = text.toLowerCase(); // he never uses capitals — everything he says is lowercase
    const now = Date.now();
    if (now < speakingUntil && priority < speakingPriority) return false; // something more important is being said
    clearInterval(typer);
    clearTimeout(hideTimer);
    const letterMs = 30;
    speakingPriority = priority;
    speakingUntil = now + ms + text.length * letterMs;
    commentFaceName = face;
    commentFaceUntil = face ? speakingUntil : 0;
    bubble.textContent = '';
    bubble.classList.add('show');
    let i = 0;
    typer = setInterval(() => {
      bubble.textContent = text.slice(0, ++i);
      if (i % 3 === 1 && text[i - 1].trim()) Sound.blip(face); // babble while the words appear
      if (i >= text.length) clearInterval(typer);
    }, letterMs);
    hideTimer = setTimeout(hush, ms + text.length * letterMs);
    return true;
  }
  function hush() {
    clearInterval(typer);
    bubble.classList.remove('show');
    speakingUntil = 0;
    commentFaceUntil = 0;
  }

  // ── cat ──
  // The photo is loaded out of sight first, and only then does the card fade in.
  // (The card's size comes from the photo: an empty card would appear as a thin
  // strip in the middle of the screen and jump into place once the photo arrived.)
  let catRequest = 0; // goes up on every show/hide, so a slow photo can't pop up after the cat was put away
  const loadPhoto = (img: HTMLImageElement, src: string) => {
    img.src = src;
    return img.decode().then(() => true, () => false); // true once it's loaded and ready to draw
  };
  async function showCat(src: string, fallbackSrc: string) {
    const request = ++catRequest;
    const photo = new Image();
    // our own photo → else a random cat from the internet → else an emoji cat
    const found = (await loadPhoto(photo, src)) || (await loadPhoto(photo, fallbackSrc));
    if (found) await loadPhoto(catImg, photo.src); // instant: it's already loaded
    if (request !== catRequest) return; // the cat was put away while the photo was loading
    catCard.classList.toggle('emoji', !found);
    catCard.classList.add('show');
    m.catShown = true;
  }
  function hideCat() {
    catRequest++;
    catCard.classList.remove('show');
    m.catShown = false;
  }

  // ── ripping the tab in half ──
  // Hide all of him for a moment (him, his cat, the meters…), e.g. so a
  // screenshot of the page doesn't have any of it in it.
  async function withoutMe<T>(fn: () => Promise<T>) {
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    stage.style.visibility = 'hidden';
    await nextFrame();
    await nextFrame(); // (two frames: the page has really been redrawn without him)
    try {
      return await fn();
    } finally {
      stage.style.visibility = '';
    }
  }

  // `shot` = a screenshot of the page. Two copies of it, cut along a jagged line
  // down the middle, are laid exactly over the real page — then pulled apart.
  async function ripPage(shot: string | null) {
    // Unpack the screenshot before the animation starts, so its first frames don't stutter
    if (shot) {
      const img = new Image();
      img.src = shot;
      await img.decode().catch(() => {});
    }
    const tear: Point[] = []; // the jagged line, from the top to the bottom of the screen (in %)
    for (let i = 0; i <= 22; i++) tear.push({ x: 50 + rand(-1.8, 1.8), y: (i / 22) * 100 });
    const tearPath = tear.map((p) => `${p.x.toFixed(2)}% ${p.y.toFixed(2)}%`);
    const half = (outline: string[], origin: string) => {
      const paper = h('div', { class: 'rip-paper' });
      paper.style.clipPath = `polygon(${outline.join(', ')})`;
      if (shot) paper.style.backgroundImage = `url("${shot}")`;
      paper.style.backgroundSize = `${innerWidth}px ${innerHeight}px`; // (the screenshot includes the scrollbar)
      const edge = s('svg', { class: 'rip-edge', viewBox: '0 0 100 100', preserveAspectRatio: 'none' }, [
        s('polyline', { points: tear.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '), 'vector-effect': 'non-scaling-stroke' }),
      ]);
      const el = h('div', { class: 'rip-half' }, [paper, edge]);
      el.style.transformOrigin = origin;
      return el;
    };
    const left = half(['0% 0%', ...tearPath, '0% 100%'], '25% 60%');
    const right = half(['100% 0%', ...tearPath, '100% 100%'], '75% 60%');
    const page = h('div', { class: 'rip-page' }, [left, right]);
    stage.insertBefore(page, browsy); // under Browsy, over everything else
    m.rip = { x: innerWidth / 2, y: innerHeight * 0.62 }; // he jumps into the middle
    m.to = null;

    // The real page is completely covered now: stop drawing it (big win on heavy pages, videos…).
    // Browsy lives inside <html>, so he says "visible" for himself.
    const html = document.documentElement;
    const pageVisibility = html.style.visibility;
    html.style.visibility = 'hidden';
    host.style.visibility = 'visible';
    try {
      // 1. tension: he tugs, the halves strain against each other
      const tug = (dir: number) => [
        { transform: 'none' },
        { transform: `translateX(${dir * 5}px) rotate(${dir * 0.4}deg)` },
        { transform: `translateX(${dir * 2}px)` },
        { transform: `translateX(${dir * 10}px) rotate(${dir * 0.9}deg)` },
      ];
      Sound.strain();
      await Promise.all([left, right].map((el, i) =>
        el.animate(tug(i ? 1 : -1), { duration: 650, easing: 'ease-in', fill: 'forwards' }).finished));

      // 2. riiip: they fly apart and fall away
      Sound.rip();
      const fly = (dir: number) => [
        { transform: `translateX(${dir * 10}px) rotate(${dir * 0.9}deg)` },
        { transform: `translate(${dir * 65}vw, 40vh) rotate(${dir * 24}deg)` },
      ];
      await Promise.all([left, right].map((el, i) =>
        el.animate(fly(i ? 1 : -1), { duration: 1100, easing: 'cubic-bezier(.45, 0, .8, .4)', fill: 'forwards' }).finished));
    } finally {
      html.style.visibility = pageVisibility; // (still hidden behind the dark background until the tab closes)
      host.style.visibility = '';
    }
  }

  // ── death & revival ──
  // When he dies he goes to the middle of the screen, and the tombstone falls right there
  function dashToMiddle() {
    m.dash = { x: innerWidth / 2, y: innerHeight - size * 0.55 };
    m.to = null;
    m.falling = false;
  }
  function placeTomb(lines: string | null, note: string) {
    const tombW = innerHeight * 0.78 * (300 / 520);
    tomb.style.left = `${(innerWidth - tombW) / 2}px`; // always in the middle of the screen
    // "Typing speed: 80 wpm" → a row with the label on the left and the value on the right
    epitaph.replaceChildren(...(lines ?? '').split('\n').filter(Boolean).map((line) => {
      const colon = line.indexOf(': ');
      const label = colon < 0 ? '' : line.slice(0, colon);
      return h('div', { class: 'stat' }, [h('span', {}, [label]), h('b', {}, [line.slice(colon + 2)])]);
    }));
    tombNote.textContent = note;
  }
  function dropTomb(lines: string | null, note: string, onLand?: () => void) {
    placeTomb(lines, note);
    tomb.className = 'tomb dropping';
    Sound.falling(0.6); // the whistle lasts exactly as long as the fall…
    setTimeout(() => {
      Sound.impact(); // …BOOM
      m.flash = 1;    // (the frame flares with the impact)
      browsy.classList.add('crushed');
      // the impact shakes the whole page
      document.documentElement.animate(
        [{ transform: 'none' }, { transform: 'translate(-10px, 7px)' }, { transform: 'translate(8px, -5px)' },
         { transform: 'translate(-4px, 3px)' }, { transform: 'none' }],
        { duration: 380 }
      );
      onLand?.();
    }, 600);
  }
  function showTombLanded(lines: string | null, note: string) {
    dashToMiddle(); // (he's under it)
    placeTomb(lines, note);
    tomb.className = 'tomb landed';
    browsy.classList.add('crushed');
  }
  function liftTomb(onDone?: () => void) {
    m.dash = null; // free again: he'll walk back to his corner
    tomb.className = 'tomb lifting';
    browsy.classList.remove('crushed');
    browsy.classList.add('booting');
    setTimeout(() => {
      tomb.className = 'tomb';
      browsy.classList.remove('booting');
      onDone?.();
    }, 1100);
  }
  function removeTomb() {
    m.dash = null;
    tomb.className = 'tomb';
    browsy.classList.remove('crushed');
  }

  // Appear (pop in) or leave (fade out)
  function setPresent(present: boolean) {
    browsy.classList.toggle('absent', !present);
    frame.classList.toggle('absent', !present); // the frame comes and goes with him
    if (!present) return hush();
    browsy.classList.add('booting');
    setTimeout(() => browsy.classList.remove('booting'), 900);
  }

  function showCrashScreen(lines: string | null, seconds: number) {
    if (crash.classList.contains('show')) return; // already crashing
    crashStats.textContent = (lines ?? '').replaceAll('\n', ' · ');
    crash.classList.add('show');
    Sound.crashSting(); // BRAAAM… wah wah wah waaah
    let left = seconds;
    const tickDown = () => {
      crashCount.textContent = left > 0 ? `closing your browser in ${left}…` : 'goodbye.';
      if (left > 0 && left <= 3) Sound.beep(); // the last 3 seconds (after the horn and the trombone)
      if (left === 0) Sound.goodbye();
      left--;
    };
    tickDown();
    setInterval(tickDown, 1000);
  }

  return {
    update, say, hush, showCat, hideCat, setPresent,
    dashToMiddle, dropTomb, showTombLanded, liftTomb, removeTomb, showCrashScreen,
    onTouch: (handler: (touch: Touch) => void) => { touchHandler = handler; },
    flinch: () => { m.landAt = performance.now(); }, // the same squash as a hard landing
    flashFrame: (amount: number) => { m.flash = Math.max(m.flash, amount); }, // the frame flares up for a moment
    isHeld: () => !!m.hold,
    withoutMe, ripPage,
    setHidden: (hidden: boolean) => { host.style.display = hidden ? 'none' : ''; },
    showHud: (show: boolean) => hud.classList.toggle('show', show),
    setHud: (text: string) => { hud.textContent = text; },
    remove: () => host.remove(),
  };
})();


// ═════════════════════════════════════════════════════════════
// 4. BRAIN — the main loop. About 60 times per second it:
//   1. reads the senses               (part 2)
//   2. decides if Browsy is here at all (only when it's crowded)
//   3. updates his stress
//   4. decides his mood, what to say, whether to show a cat, close tabs or die
//   5. tells the body to draw it       (part 3)
// ═════════════════════════════════════════════════════════════

const brain = {
  stress: 0,            // 0 = totally calm, 1 = completely overwhelmed
  mode: 'alive' as Mode, // 'alive' → 'dying' → 'dead' → 'crashing' (browser closes)
                        //                    'dead' → 'reviving' → 'alive' (in safe mode)
  present: false,       // is he on screen? (only with CONFIG.appearAtTabs tabs or more)
  wasHere: false,       // was he already around in the last tab? then no "hello" again
  rebooted: false,      // the browser crashed last time → he says something about it
  fragility: 1,         // how easily he gets stressed right now (tabs + network)
  activity: 0,          // how much you're doing right now (weighted sum of the senses)
  rate: 0,              // how fast stress is changing, per second
  overloaded: [] as (keyof Pressure)[], // which senses are above CONFIG.overloaded right now
  deathHeld: 0,         // ms the death conditions have been true in a row
  maxedHeld: 0,         // ms stress has been at max in a row
  episode: freshEpisode(), // timers for the current stress episode (for the dev panel)
  lastMood: null as Mood | null,
  catUntil: 0,          // the cat picture is showing until this time
  lastCatAt: 0,
  dizzyUntil: 0,
  pokes: 0,             // clicks on him in a row (each less than CONFIG.pokeReset after the last)
  pokedAt: 0,           // the last one — while you keep clicking him he can't calm down
  ripping: false,       // he's tearing this tab in half right now
  ripMeter: 0,          // ms of fast scrolling "stored up" — full at CONFIG.ripTime → he rips the tab
  wasStressed: false,
  wasOrange: false,     // he's orange (or worse) right now; calming below CONFIG.orangeReset ends it
  orangeCount: 0,       // how many times he has turned orange (every other time costs you tabs)
  peaks: freshPeaks(),  // your worst numbers recently, carved on the tombstone
  deathLines: null as string | null,
  siteNote: { key: '', mark: 0 }, // which "you've spent X minutes here" was said already
  settings: { debug: false, demo: false, hidden: false, badNet: false, safeDeath: false, mute: false } as Settings,
  loaded: false,        // false until the shared state has been read from storage
};

function freshPeaks() {
  return { mouse: 0, wpm: 0, clicks: 0, scroll: 0, switches: 0 };
}

// A stress "episode" starts when stress rises above 0.2 and ends when it drops below again
function freshEpisode(): Episode {
  return { total: 0, red: 0, maxed: 0, waiting: 0 };
}

// ── EVENT LOG (shown in the dev panel) ──
const devLog: LogEvent[] = [];
let eventId = 0;
function log(kind: EventKind, text: string) {
  devLog.push({ id: ++eventId, t: Date.now(), kind, text });
  if (devLog.length > 80) devLog.shift();
}

const say = (text: string, options?: SayOptions) => {
  if (Body.say(text, options)) log('say', `“${text.replace(/\n/g, ' ')}”`);
};

// "mouse 0.82, clicks 0.40" — the biggest things stressing him right now
function topCauses(p: Pressure) {
  const w = CONFIG.weights;
  return (['mouse', 'typing', 'clicks', 'scroll', 'switching'] as Sense[])
    .map((k) => [k, p[k] * w[k]] as const)
    .filter(([, v]) => v > 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k} ${v.toFixed(2)}`)
    .join(', ');
}

// ready('mouse', 25000) is true at most once every 25 s → stops Browsy repeating himself
const lastSaid: Record<string, number> = {};
function ready(key: string, cooldownMs: number) {
  const now = Date.now();
  if (now - (lastSaid[key] ?? -Infinity) < cooldownMs) return false;
  lastSaid[key] = now;
  return true;
}

// heldFor('typing', condition) → how many ms the condition has been true in a row
const holdStart: Record<string, number> = {};
function heldFor(key: string, condition: boolean) {
  if (!condition) {
    holdStart[key] = 0;
    return 0;
  }
  holdStart[key] ||= Date.now();
  return Date.now() - holdStart[key];
}

// ── PRESENCE: he only shows up when it gets crowded ─────────
function updatePresence(st: Stats) {
  const crowded = st.tabs >= CONFIG.appearAtTabs;
  const wanted = crowded || brain.mode !== 'alive'; // a dying Browsy stays until the end
  if (wanted && !brain.present) arrive(st);
  // He lingers a few seconds after the crowd thins out, so he can finish his sentence
  if (heldFor('leaving', brain.present && !wanted) > CONFIG.leaveDelay) leave();
}

function arrive(st: Stats) {
  brain.present = true;
  Body.setPresent(true);
  Sound.pop();
  log('arrive', `appeared — ${st.tabs} tabs open (needs ${CONFIG.appearAtTabs}+)`);
  if (brain.mode === 'alive') {
    if (brain.rebooted) say('calmed down?\nwe are so back.', { priority: 2, ms: 5000 });
    else if (!brain.wasHere) say(`${st.tabs} tabs…\nworking hard?`, { face: 'meh' });
  }
  brain.rebooted = false;
  brain.wasHere = true;
  saveShared(true);
}

function leave() {
  log('leave', `left — fewer than ${CONFIG.appearAtTabs} tabs`);
  brain.present = false;
  brain.wasHere = false;
  brain.catUntil = 0;
  Body.hideCat();
  Body.setPresent(false);
  saveShared(true);
}

// ── STRESS ───────────────────────────────────────────────────
function updateStress(p: Pressure, dt: number, stillFor: number, now: number) {
  const w = CONFIG.weights;
  const activity =
    p.mouse * w.mouse + p.typing * w.typing + p.clicks * w.clicks +
    p.scroll * w.scroll + p.switching * w.switching;

  // Crowded tabs + bad internet make him fragile: the same activity hurts more.
  // (The network is the live outside condition: same behaviour, worse connection → he breaks sooner.)
  brain.fragility = 1 + p.tabs * CONFIG.tabFragility + p.network * CONFIG.netFragility;
  brain.activity = activity;

  if (activity > CONFIG.comfort && now < brain.catUntil) {
    // Holding up the cat: what you do now doesn't stress him (you can't even see him react).
    // The counter just waits until the cat is gone.
  } else if (activity > CONFIG.comfort) {
    const rise = CONFIG.riseSpeed * (brain.settings.demo ? CONFIG.demoRiseSpeed : 1); // demo mode: faster
    brain.stress += (activity - CONFIG.comfort) * rise * brain.fragility * dt;
  } else {
    let calm = CONFIG.calmSpeed;
    if (stillFor > 3000) calm *= 2;       // real stillness helps the most
    if (now < brain.catUntil) calm *= 2;  // and so does the cat
    if (now - brain.pokedAt < CONFIG.pokeReset) calm = 0; // but not while you keep poking him
    brain.stress -= calm * dt;
  }

  const floor = p.tabs * 0.3; // with lots of tabs open he can never fully relax
  brain.stress = clamp(brain.stress, floor, 1);
}

function trackPeaks(st: Stats) {
  if (brain.stress < 0.2) brain.peaks = freshPeaks(); // forget old peaks once he's calm again
  const pk = brain.peaks;
  pk.mouse = Math.max(pk.mouse, st.mouseSpeed);
  pk.wpm = Math.max(pk.wpm, st.wpm);
  pk.clicks = Math.max(pk.clicks, st.clicks);
  pk.scroll = Math.max(pk.scroll, st.scrollSpeed);
  pk.switches = Math.max(pk.switches, st.switches);
}

// How long has he been red / maxed out / stuck waiting to die in this episode?
function trackEpisode(dt: number) {
  if (brain.stress < 0.2) {
    brain.episode = freshEpisode();
    return;
  }
  const e = brain.episode;
  e.total += dt;
  if (brain.stress > 0.7) e.red += dt;
  if (brain.stress >= 0.98) {
    e.maxed += dt;
    if (brain.overloaded.length < CONFIG.deathFactors) e.waiting += dt; // maxed, but can't die yet
  }
}

// ── REACTIONS: comments, rushing, cat, death ────────────────
function react(p: Pressure, st: Stats, now: number, dt: number) {
  // Typing in a rush → a comment first… keep going and he closes some of your tabs
  const rushingFor = heldFor('rush', st.keysPerSec >= CONFIG.rushKeysPerSec);
  if (rushingFor > 1000 && ready('typing', 45000)) {
    say(pick(['oh, typing violently?\nworking hard?', 'whoa. typing violently?\nworking hard?']), { face: 'meh' });
  }
  if (rushingFor > CONFIG.rushTime && ready('rush', CONFIG.rushCooldown)) {
    log('rush', `typing ${st.keysPerSec.toFixed(1)} keys/s for ${(rushingFor / 1000).toFixed(1)} s → closing ${CONFIG.rushCloseTabs} tabs`);
    closeTabsBecauseRushing();
  }

  // Scrolling way too fast fills his rip meter; it slowly empties when you slow down,
  // so fast bursts add up too. Half full → a warning… full → he rips this tab in half.
  const fastScroll = st.scrollSpeed >= CONFIG.ripScrollSpeed;
  brain.ripMeter = Math.max(0, brain.ripMeter + (fastScroll ? 1 : -CONFIG.ripDrain) * dt * 1000);
  if (brain.ripMeter > CONFIG.ripTime * 0.45 && ready('ripwarn', 15000)) {
    say("stop scrolling!\ni'm warning you.", { face: 'worried', priority: 2 });
    Sound.uhOh();
  }
  if (brain.ripMeter >= CONFIG.ripTime && !brain.ripping) ripThisTab(st);

  if (heldFor('mouse', p.mouse > 0.6) > 400 && ready('mouse', 25000)) {
    say(pick(['whoa, where are we going?', 'slow dooown', "my eyes can't keep up"]), { face: 'worried' });
  }

  // Carried around fast (the mouse sense already adds the stress)
  if (Body.isHeld() && p.mouse > 0.5 && ready('seasick', 10000)) {
    say("i'm getting seasick…", { face: 'worried', priority: 2 });
  }

  if (now < senses.rageUntil && ready('rage', 20000)) {
    say(pick(['ow. ow. ow.', 'click click click click', 'the button heard you']), { face: 'hurt' });
  }

  // Close to the tab limit: a warning for each of the last 3 tabs before it
  const tabsLeft = CONFIG.tabsDeathAt - st.tabs;
  if (tabsLeft > 0 && tabsLeft <= 3 && ready(`tabsLeft${tabsLeft}`, 60000)) {
    say("i can't take this.\nstop this or i'm quitting.", { face: 'worried', priority: 2 });
    Sound.uhOh();
  } else if (st.tabs >= 20 && ready('tabs', 5 * 60000)) {
    say(`${st.tabs} tabs?!\ndo you want me to suffocate?`, { face: 'sad' });
  }

  if (p.network > 0.6 && ready('net', 10 * 60000)) {
    say("i feel dizzy.\nwhat's happening to me?", { face: 'worried' });
  }

  // "oh, you've spent 20 minutes on this website"
  const info = senses.tabInfo;
  if (info?.host) {
    const unitMs = brain.settings.demo ? 1000 : 60000; // demo mode: minutes → seconds
    const spent = (now - info.hostSince) / unitMs;
    const mark = CONFIG.siteMinutes.filter((m) => spent >= m).pop();
    const key = `${info.host}@${info.hostSince}`;
    if (mark && (brain.siteNote.key !== key || brain.siteNote.mark < mark)) {
      brain.siteNote = { key, mark };
      say(`oh, you've spent ${mark} minutes\non ${info.host}`, { ms: 5000, face: 'meh' });
    }
  }

  // The cat: when it gets too much, he calms himself (and you) down
  const catCooldown = brain.settings.demo ? CONFIG.catCooldownDemo : CONFIG.catCooldown;
  if (brain.stress > CONFIG.catAt && !brain.catUntil && now - brain.lastCatAt > catCooldown) showCat();
  if (brain.catUntil && now >= brain.catUntil) {
    brain.catUntil = 0;
    Body.hideCat();
  }

  // Turning orange: he closes a few of your forgotten tabs (every CONFIG.orangeEvery-th time).
  // (Not if he's holding the cat: the cat already cost you tabs.)
  if (brain.stress < CONFIG.orangeReset) brain.wasOrange = false;
  if (brain.stress >= CONFIG.orangeAt && !brain.wasOrange) {
    brain.wasOrange = true;
    if (!brain.catUntil) {
      brain.orangeCount++;
      const closes = (brain.orangeCount - 1) % CONFIG.orangeEvery === 0;
      log('mood', `turned orange (time #${brain.orangeCount}) → ${closes ? 'closing tabs' : 'not this time'}`);
      if (closes) closeForgottenTabs('turned orange', (closed) => say(`there. ${closed} tabs fewer.\nbreathe.`, { priority: 2 }));
    }
    saveShared(true);
  }

  // Death by tabs: at the limit, the tabs alone are too much — however calm you are
  if (st.tabs >= CONFIG.tabsDeathAt) return die(st, `${st.tabs} tabs open (the limit is ${CONFIG.tabsDeathAt})`);

  // Death: stress maxed out AND several things overwhelming him at once (fast),
  // or simply staying at max stress for too long (slow)
  brain.overloaded =(['mouse', 'typing', 'clicks', 'scroll', 'switching', 'tabs'] as const)
    .filter((k) => p[k] > CONFIG.overloaded);
  const maxed = brain.stress >= 0.98 && now >= brain.catUntil; // (he can't die while holding the cat)
  brain.deathHeld = heldFor('death', maxed && brain.overloaded.length >= CONFIG.deathFactors);
  brain.maxedHeld = heldFor('maxed', maxed);
  if (brain.deathHeld > CONFIG.deathHold || brain.maxedHeld > CONFIG.maxedDeath) {
    die(st);
  } else if (maxed && ready('maxed', 15000)) {
    say("i can't… do… this…", { priority: 2, face: 'worried' });
    Sound.uhOh();
  }

  // Relief after a stressful moment
  if (brain.stress > 0.7) brain.wasStressed = true;
  if (brain.wasStressed && brain.stress < 0.3) {
    brain.wasStressed = false;
    say(pick(['phew.', 'ahh. better.', 'thank you.']));
    Sound.sigh();
  }
}

// You've been typing in a rush → he closes the tabs you've forgotten about
function closeTabsBecauseRushing() {
  say("you're rushing!\nbetter watch out.", { priority: 2, face: 'meh' });
  setTimeout(() => closeForgottenTabs('rushing', (closed) => say(`there. ${closed} tabs fewer.\nbreathe.`, { priority: 2 }),
    CONFIG.rushCloseTabs), 2000);
}

// He closes the tabs you've looked at least recently (background.ts does it, one by one).
// How many: CONFIG.closeTabsMin…closeTabsMax, unless a count is given.
function closeForgottenTabs(why: string, afterwards?: (closed: number) => void,
  count = CONFIG.closeTabsMin + Math.floor(Math.random() * (Math.max(CONFIG.closeTabsMin, CONFIG.closeTabsMax) - CONFIG.closeTabsMin + 1))) {
  safely(() =>
    send({ type: 'browsy-close-tabs', count })
      .then((closed: number) => {
        log('rush', `closed ${closed} tabs (${why})`);
        Sound.whooshes(closed); // (the background closed them half a second apart)
        if (closed) afterwards?.(closed);
      })
      .catch(() => {})
  );
}

// You kept scrolling way too fast → he grabs this tab and rips it in half. Then it closes.
async function ripThisTab(st: Stats) {
  brain.ripping = true;
  log('rip', `rip meter full (scrolling ${Math.round(st.scrollSpeed)} px/s) → ripping this tab in half`);
  Body.hush();
  brain.catUntil = 0; // no cat now: he needs both hands
  Body.hideCat();
  // A photo of the page (without him in it) to tear apart. Only the background can take it.
  const shot = await Body.withoutMe(async () => {
    try {
      return (await send({ type: 'browsy-capture' })) as string | null;
    } catch {
      return null; // no photo → he tears a blank page
    }
  });
  say("that's it.\nno more scrolling.", { face: 'hurt', priority: 3 });
  await Body.ripPage(shot);
  safely(() => send({ type: 'browsy-close-tab' }).catch(() => {}));
}

function checkDizzy() {
  const now = Date.now();
  const switches = (senses.tabInfo?.switches ?? []).filter((t) => now - t < CONFIG.switchMemory).length;
  if (!brain.present || brain.mode !== 'alive' || switches < CONFIG.dizzyAt) return;
  brain.dizzyUntil = now + 2500;
  log('dizzy', `${switches} tab switches in the last ${CONFIG.switchMemory / 1000} s`);
  if (ready('dizzy', 20000)) {
    say(pick(['everything is spinning…', 'which tab are we even in?', 'wheee… no. not whee.']), { face: 'worried' });
    Sound.wobble();
    Body.flashFrame(0.4);
  }
}

// ── TOUCHING HIM: boop, poke, pick up, drop ──────────────────
// Gentle is nice for him, rough is stress — like everything else.

// What he says when you keep clicking him: on the 3rd, 5th and 7th click in a row
const POKE_LINES: Record<number, string[]> = {
  3: ['ow. stop poking me.', "hey! i'm not a button."],
  5: ['stop it. please.'],
  7: ['i said stop.'],
};

Body.onTouch((touch) => {
  if (brain.mode !== 'alive' || !brain.present) return;
  const now = Date.now();

  if (touch.kind === 'boop') {
    // Clicks in a row escalate: the n-th one adds n × pokeStress (0.03, 0.06, 0.09 …),
    // so 6 in a row add 0.63 — and from the 8th he's completely overwhelmed.
    brain.pokes = now - brain.pokedAt < CONFIG.pokeReset ? brain.pokes + 1 : 1;
    brain.pokedAt = now;
    const n = brain.pokes;
    brain.stress = Math.min(1, brain.stress + n * CONFIG.pokeStress);

    if (n <= 2) {
      // one or two clicks = a friendly boop
      Sound.boing();
      if (ready('boop', 1200)) {
        log('touch', 'booped');
        if (brain.stress < 0.35) say(pick(['boop.', 'hi!', 'hehe.']), { face: 'happy' });
        else say(pick(['not now…', `${senses.tabInfo?.count ?? 0} tabs…\ni'm trying my best.`]), { face: 'meh' });
      }
    } else {
      // more = poking: it hurts
      Body.flinch();
      Sound.eep(n);
      Body.flashFrame(0.15 + n * 0.05); // each poke flares the frame a bit more
      log('touch', `clicked ${n}× in a row → stress ${brain.stress.toFixed(2)}`);
      if (POKE_LINES[n]) say(pick(POKE_LINES[n]), { face: 'hurt', priority: 2 });
    }
  }

  if (touch.kind === 'pickup') {
    log('touch', 'picked up');
    say('whoa—\nput me down!', { face: 'worried', priority: 2 });
  }

  if (touch.kind === 'drop') {
    log('touch', touch.outside ? 'dropped outside his corner' : 'put down');
    if (touch.outside) say(pick(['hey! be careful.', 'slow dooown!']), { face: 'worried', priority: 2 });
    else Body.hush(); // "put me down!" is done
  }
});

function showCat() {
  const now = Date.now();
  brain.lastCatAt = now;
  brain.catUntil = now + CONFIG.catDuration;
  log('cat', `cat shown at stress ${brain.stress.toFixed(2)}`);
  Body.showCat(chrome.runtime.getURL(pick(CONFIG.catImages)), `https://cataas.com/cat?width=700&r=${now}`);
  Sound.catChime();
  say('woah! slow down.\nbreathe in. breathe out.', { priority: 3, ms: CONFIG.catDuration - 2500 });
  saveShared(true);
  // …and while you look at the cat, a few of your forgotten tabs quietly go
  setTimeout(() => closeForgottenTabs('showing the cat'), 1500);
}

// Your worst moments, carved on the tombstone. A sense only gets a line if it
// was strong enough to stress him (above its "calm" number in config.ts),
// so there's never a "Typing speed: 0 wpm" for something that played no part.
function epitaph(st: Stats) {
  const pk = brain.peaks;
  const net = st.downlink != null ? `${st.downlink} Mbps` : st.rtt != null ? `${Math.round(st.rtt)} ms ping` : 'no internet';
  return [
    `Internet: ${net}`,
    pk.mouse > CONFIG.mouseCalm && `Mouse speed: ${(pk.mouse / 1000).toFixed(1)} px/ms`,
    pk.wpm > CONFIG.typingCalm * 12 && `Typing speed: ${Math.round(pk.wpm)} wpm`, // (wpm = keys per second × 12)
    pk.clicks > CONFIG.clicksCalm && `Clicks: ${pk.clicks} in 3s`,
    pk.scroll > CONFIG.scrollCalm && `Scroll speed: ${(pk.scroll / 1000).toFixed(1)} px/ms`,
    pk.switches > CONFIG.switchesCalm && `Tab switches: ${pk.switches} in ${CONFIG.switchMemory / 1000}s`,
    `Tabs: ${st.tabs}`,
  ].filter(Boolean).join('\n');
}

// The line at the bottom of the tombstone: before a real crash it warns you.
// (Safe mode = no crash, so nothing to warn about.)
const tombNote = () => (brain.settings.safeDeath ? '' : 'There will be consequences\n– Browsy');

function die(st: Stats, reason?: string) {
  const e = brain.episode;
  const why = reason ?? (brain.deathHeld > CONFIG.deathHold ? `overloaded: ${brain.overloaded.join(' + ')}`
    : brain.maxedHeld > CONFIG.maxedDeath ? `at max stress for ${CONFIG.maxedDeath / 1000} s` : 'killed from the popup');
  log('death', `DIED (${why}). This episode lasted ${e.total.toFixed(1)} s — ` +
    `red ${e.red.toFixed(1)} s, at max ${e.maxed.toFixed(1)} s, ` +
    `of which ${e.waiting.toFixed(1)} s stuck waiting for ${CONFIG.deathFactors} overloaded senses`);
  brain.mode = 'dying';
  brain.stress = 1;
  brain.catUntil = 0;
  Body.hideCat();
  Body.hush();
  brain.deathLines = epitaph(st);
  saveShared(true); // tell the other tabs he's gone
  Body.dashToMiddle(); // he staggers to the middle of the screen…
  Sound.dunDunDunn();  // …DUN DUN DUUUNNN
  Body.flashFrame(0.9);
  const crash = !brain.settings.safeDeath;
  if (crash) {
    // background.ts does the crash: close every tab one by one, then the browser.
    // (A web page isn't allowed to close other tabs, but the extension's background is.)
    // We tell it right now and it waits until the tombstone has been up for a while,
    // so the crash still happens if you switch, reload or close this tab meanwhile.
    const delay = 1400 + 600 + CONFIG.crashDelay; // red X eyes + tombstone falling + reading time
    log('crash', `closing every tab in ${(delay / 1000).toFixed(1)} s, then the browser`);
    safely(() => send({ type: 'browsy-crash', lines: brain.deathLines, delay }).catch(() => {}));
  }
  // He goes red with X eyes for a moment… then the tombstone falls on him.
  setTimeout(() => {
    Body.dropTomb(brain.deathLines, tombNote(), () => {
      brain.mode = crash ? 'crashing' : 'dead'; // 'crashing' = no more saving, no reviving
      senses.lastActive = Date.now(); // stillness only counts from now on
    });
  }, 1400);
}

function revive() {
  log('revive', 'revived');
  brain.mode = 'reviving';
  saveShared(true); // tell the other tabs (and a crash that's waiting to start) right away
  Sound.sparkle();
  Body.liftTomb(() => {
    brain.mode = 'alive';
    brain.stress = 0.15;
    brain.peaks = freshPeaks();
    brain.lastCatAt = Date.now(); // no cat straight away
    say('calmed down?\nwe are so back.', { priority: 2 });
    saveShared(true);
  });
}

function moodNow(now: number): Mood {
  if (brain.mode === 'reviving') return 'calm';
  if (brain.mode !== 'alive') return 'dead';
  if (now < brain.catUntil) return 'chill';
  if (brain.stress > 0.7) return 'stressed';
  if (brain.stress > 0.35) return 'uneasy';
  return 'calm';
}

// ── SHARED STATE: it's the same Browsy in every tab ──────────
// The tab you're looking at saves his state; when you switch tabs,
// the new tab picks it up.

const isVisible = () => document.visibilityState === 'visible';
let lastSave = 0;

// leaving = this tab is being hidden right now (you switched away): save one last time
function saveShared(force: boolean, leaving = false) {
  const now = Date.now();
  if (!brain.loaded || (!isVisible() && !leaving) || brain.mode === 'crashing') return;
  if (!force && now - lastSave < 1000) return;
  lastSave = now;
  const mode = brain.mode === 'alive' || brain.mode === 'reviving' ? 'alive' : 'dead';
  safely(() => save({
    browsyState: {
      stress: brain.stress, mode, present: brain.present, rebooted: brain.rebooted,
      deathLines: brain.deathLines, lastCatAt: brain.lastCatAt, siteNote: brain.siteNote, savedAt: now,
      maxedFor: brain.maxedHeld, orangeCount: brain.orangeCount, wasOrange: brain.wasOrange,
    },
  }));
}

async function loadShared() {
  const data = await load(['browsyState', 'tabInfo', 'net', 'browsySettings', 'browsyDevPing']);
  senses.tabInfo = data.tabInfo ?? null;
  senses.net = data.net ?? null;
  devPing = data.browsyDevPing ?? 0;
  applySettings(data.browsySettings);

  const saved = data.browsyState;
  if (saved) {
    const awaySeconds = (Date.now() - saved.savedAt) / 1000;
    brain.stress = Math.max(0, saved.stress - CONFIG.calmSpeed * awaySeconds); // he calmed down while you were away
    brain.lastCatAt = saved.lastCatAt ?? 0;
    brain.siteNote = saved.siteNote ?? brain.siteNote;
    brain.wasHere = !!saved.present;
    brain.rebooted = !!saved.rebooted;
    brain.orangeCount = saved.orangeCount ?? 0;
    brain.wasOrange = saved.wasOrange ?? brain.stress >= CONFIG.orangeAt; // (already orange ≠ turning orange)
    // Still at max stress? Then the "2 seconds at max → dies" countdown carries on
    // where the last tab left it (switching tabs can't save him)
    if (saved.maxedFor && brain.stress >= 0.98) holdStart.maxed = Date.now() - saved.maxedFor;
    if (saved.mode === 'dead' && brain.mode === 'alive') {
      brain.mode = 'dead';
      brain.deathLines = saved.deathLines ?? null;
      Body.showTombLanded(brain.deathLines, tombNote());
      senses.lastActive = Date.now();
    } else if (saved.mode === 'alive' && brain.mode === 'dead') {
      brain.mode = 'alive'; // someone revived him in another tab
      Body.removeTomb();
    }
  }
  brain.loaded = true;
}

function applySettings(settings?: Partial<Settings>) {
  Object.assign(brain.settings, settings);
  Body.setHidden(brain.settings.hidden);
  Body.showHud(brain.settings.debug);
  Sound.setMuted(brain.settings.mute || brain.settings.hidden); // (hidden = silent too)
}

// Buttons in the popup send commands through storage
function runCommand(type?: Command) {
  if (type === 'cat' && brain.mode === 'alive' && brain.present) showCat();
  if (type === 'kill' && brain.mode === 'alive') die(readSenses(0.016, brain.settings).stats);
  if (type === 'revive' && (brain.mode === 'dead' || brain.mode === 'crashing')) revive(); // also stops a crash that hasn't started yet
}

// When you reload the extension, Browsys in already-open tabs lose their
// connection to Chrome. Instead of throwing errors, they quietly leave.
let stopped = false;
function safely<T>(fn: () => T) {
  try {
    if (!chrome.runtime?.id) throw new Error('extension reloaded');
    return fn();
  } catch {
    stopped = true;
    Body.remove();
    Sound.setRumble(0);
  }
}

// ── DEV PANEL: while it's open (it "pings" every few seconds), the tab
// you're looking at sends it a snapshot of Browsy's mind 10× per second.
let devPing = 0;
let lastTelemetry = 0;
let lastSentEvent = 0;

safely(() => chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.tabInfo) {
    senses.tabInfo = changes.tabInfo.newValue as TabInfo;
    if (isVisible()) checkDizzy();
  }
  if (changes.net) senses.net = changes.net.newValue as Net;
  if (changes.browsySettings) applySettings(changes.browsySettings.newValue as Settings);
  if (changes.browsyCommand && isVisible()) runCommand((changes.browsyCommand.newValue as { type?: Command })?.type);
  if (changes.browsyDevPing) {
    if (Date.now() - devPing > 8000) lastSentEvent = 0; // panel just opened → send the whole recent log
    devPing = changes.browsyDevPing.newValue as number;
  }
}));

function sendTelemetry(p: Pressure, st: Stats, stillFor: number, mood: Mood) {
  const now = Date.now();
  if (now - devPing > 8000 || now - lastTelemetry < 100 || !isVisible()) return;
  lastTelemetry = now;
  const events = devLog.filter((e) => e.id > lastSentEvent);
  if (events.length) lastSentEvent = events.at(-1)!.id;
  safely(() => send({
    type: 'browsy-telemetry',
    page: /^https?:$/.test(location.protocol) ? location.hostname.replace(/^www\./, '') : 'New Tab page',
    t: now,
    mode: brain.mode,
    present: brain.present,
    mood,
    stress: brain.stress,
    rate: brain.rate,
    activity: brain.activity,
    fragility: brain.fragility,
    overloaded: brain.overloaded,
    deathHeld: brain.deathHeld,
    maxedHeld: brain.maxedHeld,
    episode: brain.episode,
    pressure: p,
    stats: st,
    stillFor,
    events,
  }).catch(() => {}));
}

// background.ts tells the last open tab to show the crash screen
safely(() => chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'browsy-final') Body.showCrashScreen(msg.lines, CONFIG.crashCountdown);
}));

document.addEventListener('visibilitychange', () => {
  if (stopped) return;
  if (!isVisible()) {
    // You switched away: save exactly how he's doing, so the next tab carries on from here
    // (otherwise quick switching would "lose" his stress every time)
    saveShared(true, true);
    Sound.setRumble(0); // (the tab you go to takes over the rumble)
    return;
  }
  senses.lastActive = Date.now();
  brain.loaded = false; // pause decisions until we've caught up with the other tabs
  // (a tiny wait: the tab you came from is still saving)
  setTimeout(() => safely(() => loadShared().catch(() => {}).finally(() => {
    brain.loaded = true;
    switchedHere();
  })), 80);
});

// Every time you switch to another tab he takes a little hit — so switching
// around a lot (even very fast) adds up and can eventually kill him.
// (The cat can't help here: it stays behind in the tab where it came out.)
function switchedHere() {
  if (brain.mode !== 'alive' || !brain.wasHere) return; // (he has to have been around in the last tab)
  brain.stress = Math.min(1, brain.stress + CONFIG.switchStress);
}

// ── debug meters ──
function bar(v: number) {
  const n = Math.round(clamp(v, 0, 1) * 10);
  return '[' + '#'.repeat(n) + '-'.repeat(10 - n) + ']';
}
function hudText(p: Pressure, st: Stats, stillFor: number) {
  return [
    `BROWSY  ${brain.mode}  ${brain.present ? 'here' : `away (needs ${CONFIG.appearAtTabs}+ tabs)`}`,
    `stress    ${bar(brain.stress)} ${brain.stress.toFixed(2)}`,
    `fragility ×${brain.fragility.toFixed(2)}`,
    '',
    `mouse     ${bar(p.mouse)} ${Math.round(st.mouseSpeed)} px/s`,
    `typing    ${bar(p.typing)} ${Math.round(st.wpm)} wpm (${st.keysPerSec.toFixed(1)}/s)`,
    `clicks    ${bar(p.clicks)} ${st.clicks} in 3s`,
    `scroll    ${bar(p.scroll)} ${Math.round(st.scrollSpeed)} px/s`,
    `rip meter ${bar(brain.ripMeter / CONFIG.ripTime)} (full = he rips the tab)`,
    `switching ${bar(p.switching)} ${st.switches} in ${CONFIG.switchMemory / 1000} s`,
    `tabs      ${bar(p.tabs)} ${st.tabs}`,
    `network   ${bar(p.network)} ${st.rtt == null ? '—' : Math.round(st.rtt) + ' ms'} · ${st.downlink ?? '?'} Mbps`,
    '',
    `still for ${(stillFor / 1000).toFixed(1)} s`,
  ].join('\n');
}

// ── THE LOOP ─────────────────────────────────────────────────
let lastFrame = performance.now();

function tick(frameTime: number) {
  if (stopped || !chrome.runtime?.id) {
    stopped = true;
    Body.remove();
    Sound.setRumble(0);
    return;
  }
  const dt = clamp((frameTime - lastFrame) / 1000, 0.001, 0.1);
  lastFrame = frameTime;
  const now = Date.now();

  const { pressure: p, stats, stillFor } = readSenses(dt, brain.settings);

  const stressBefore = brain.stress;
  if (brain.loaded) {
    updatePresence(stats);
    if (brain.mode === 'alive' && brain.present && brain.ripping) {
      // busy tearing this tab in half — nothing else matters right now
    } else if (brain.mode === 'alive' && brain.present) {
      updateStress(p, dt, stillFor, now);
      trackPeaks(stats);
      react(p, stats, now, dt);
      trackEpisode(dt);
    } else if (brain.mode === 'alive') {
      brain.activity = 0;
      brain.stress = Math.max(0, brain.stress - CONFIG.calmSpeed * dt); // away, resting
    } else if (brain.mode === 'dead' && brain.settings.safeDeath) { // only safe mode can be undone by stillness
      // (not while there are still too many tabs — he'd only die again)
      if (stillFor >= CONFIG.stillToRevive && stats.tabs < CONFIG.tabsDeathAt) revive();
    }
  }
  brain.rate += ((brain.stress - stressBefore) / dt - brain.rate) * (1 - Math.exp(-dt / 0.5)); // smoothed

  const mood = moodNow(now);
  if (mood !== brain.lastMood) {
    if (brain.lastMood) log('mood', `${brain.lastMood} → ${mood}  (${topCauses(p) || 'nothing much — calming down'})`);
    brain.lastMood = mood;
  }

  Body.update(dt, frameTime, {
    stress: brain.stress,
    mood,
    dizzy: now < brain.dizzyUntil,
    crowd: p.tabs,
    pointer: senses.pointer,
    touchable: brain.mode === 'alive' && brain.present && now >= brain.catUntil && !brain.ripping, // not while holding the cat
  });
  // The stress rumble: fades in from about half-stressed, loudest right before he breaks.
  // (Quiet when he's gone, holding the cat, ripping a tab or dying — other sounds take over.)
  const shaking = brain.present && brain.mode === 'alive' && mood !== 'chill' && !brain.ripping;
  Sound.setRumble(shaking ? clamp((brain.stress - 0.45) / 0.55, 0, 1) ** 1.5 : 0);
  if (brain.settings.debug) Body.setHud(hudText(p, stats, stillFor));
  saveShared(false);
  sendTelemetry(p, stats, stillFor, mood);

  requestAnimationFrame(tick);
}

// Start: load the shared state first, then begin the loop
safely(() => loadShared().catch(() => {}).finally(() => {
  brain.loaded = true;
  requestAnimationFrame(tick);
}));

// Lets you poke at him from the DevTools console (and the test scripts):
// type `brain.stress` or `Body.say('hi')` on Browsy's New Tab page.
Object.assign(globalThis, { brain, Body, devLog });


console.log("hello")