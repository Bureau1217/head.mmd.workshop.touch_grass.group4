// ─────────────────────────────────────────────────────────────
// CONFIG — all of Browsy's tuning knobs live here.
// It's shared by content.ts (Browsy on every page), popup.ts (popup +
// dev panel) and background.ts, so every part uses the same numbers.
// With `npm run dev` running, saving this file updates the extension.
// ─────────────────────────────────────────────────────────────

export const CONFIG = {
  size: 240, // how big Browsy is on screen, in pixels

  // PRESENCE: Browsy only shows up when it gets crowded
  appearAtTabs: 15,    // he appears when this many tabs (or more) are open
  leaveDelay: 4000,    // ms he lingers after you close tabs (so he can finish his sentence)

  // SENSES → each one becomes a "pressure" between 0 (fine) and 1 (too much).
  // Below the "Calm" number = no pressure at all. At the "Max" number = 100%.
  mouseCalm: 250,   mouseMax: 1500,   // mouse speed, pixels per second (across the screen in 1 s ≈ 1400)
  typingCalm: 1.5,  typingMax: 5,     // keys per second (1.5 ≈ 18 wpm, 5 ≈ 60 wpm)
  clicksCalm: 1,    clicksMax: 6,     // clicks within the last 3 seconds
  scrollCalm: 100,  scrollMax: 1000,  // scroll speed, pixels per second (one mouse-wheel notch ≈ 100 px)
  switchesCalm: 1,  switchesMax: 3,   // tab switches within the last `switchMemory`
  tabsCalm: 15,     tabsMax: 33,      // open tabs (squeezed thinnest at the limit below)

  rageClicks: 3,       // rage click = this many clicks within 1 second, all on about the same spot

  switchMemory: 10000, // ms a tab switch keeps counting before he forgets it (max 60 s)
  dizzyAt: 3,          // he gets dizzy at this many switches within switchMemory

  // How much each activity counts toward stress
  weights: { mouse: 2.5, typing: 2, clicks: 1, scroll: 2.5, switching: 2 },
  switchStress: 0.05, // …and every time you switch to another tab he takes this little hit (it adds up)

  comfort: 0.6,     // activity below this level lets Browsy calm down
  riseSpeed: 0.06,  // how fast stress climbs when you're "too much"
  calmSpeed: 0.1,   // how fast stress drains (per second) when you're gentle

  // Lots of tabs and a bad internet connection don't stress him directly.
  // They make him FRAGILE: the same behaviour stresses him faster.
  tabFragility: 0.6,
  netFragility: 1.0,

  // DEATH: stress maxed out AND at least this many senses overloaded at once
  deathFactors: 2,
  overloaded: 0.75, // a sense counts as "overloaded" above this pressure
  deathHold: 1500,  // ms both conditions must last before he actually dies
  maxedDeath: 4000, // …or: ms at max stress before he dies anyway (even with just one overloaded sense)
  tabsDeathAt: 33,  // …or: this many open tabs kill him, however calm you are (a warning comes 3 tabs before)

  catAt: 0.7,           // stress level where he pulls out a cat picture
  catDuration: 8000,    // how long the cat stays (ms)
  catCooldown: 120000,  // ms before he can show another cat (2 min)
  catCooldownDemo: 30000, // …the same in demo mode (shorter, so you can show it off)

  // CLOSING TABS: when he pulls out the cat, and every time he turns orange,
  // he closes a few of the tabs you've looked at least recently (between min and max)
  closeTabsMin: 2,
  closeTabsMax: 3,
  orangeAt: 0.7,        // stress where he turns orange (same as catAt: if the cat comes out right then, the cat's tabs count instead)
  orangeEvery: 1,       // closes tabs every time he turns orange (2 = only the 1st, 3rd, 5th… time)
  orangeReset: 0.5,     // he has to calm down below this before turning orange counts again

  // RUSHING: type this fast for this long, and he closes some of your tabs
  rushKeysPerSec: 4,    // 4 letters a second ≈ 48 wpm
  rushTime: 2500,       // ms of rushing before he acts
  rushCloseTabs: 3,     // how many tabs he closes (the ones you looked at least recently)
  rushCooldown: 60000,  // ms before he can do it again

  // RIPPING: scrolling faster than ripScrollSpeed fills up his "rip meter"; it slowly
  // empties again when you slow down, so fast bursts add up too. Half full → a warning.
  // Full → he rips the tab in half (it closes).
  ripScrollSpeed: 600,  // px/s (≈ 6 mouse-wheel notches a second)
  ripTime: 1500,        // the meter is full after this many ms of fast scrolling
  ripDrain: 0.2,        // how fast it empties when you slow down (1 = as fast as it fills)

  stillToRevive: 5000,  // ms of total stillness needed to bring him back (only in safe mode)

  // POKING: clicking him over and over. The n-th click in a row adds n × pokeStress,
  // so it escalates (6 clicks in a row ≈ +0.63 stress). While you keep clicking he
  // can't calm down. A pause longer than pokeReset ms ends the row.
  pokeStress: 0.03,
  pokeReset: 1500,

  // THE CRASH: when he dies, he closes every tab one by one and then shuts
  // the whole browser down. Your tabs do NOT come back — that's the point.
  // Tick "safe mode" in the popup to turn this off while you're working on him.
  crashDelay: 3500,     // ms to read the tombstone before the tabs start closing
  crashCountdown: 7,    // seconds the crash screen shows before the browser closes

  // DEMO MODE (switch in the popup): hyper-sensitive, for showing him off.
  // Mouse, typing, clicks and scrolling count from a fraction of the usual speed,
  // and stress climbs faster. (Rushing and ripping keep their normal numbers.)
  demoSensitivity: 3,   // 3 = he reacts to a third of the usual speed
  demoRiseSpeed: 4,     // stress climbs this many times faster

  // He comments when you've been on one website this long (minutes).
  // In demo mode these become seconds, so you can show it off quickly.
  siteMinutes: [5, 10, 20, 45, 90],

  // Photos he shows to calm down. Drop your own into public/cats/ and list them here.
  catImages: [
    'cats/cat1.jpg',
    'cats/cat2.jpg',
    'cats/cat3.png',
    'cats/cat4.jpg',
    'cats/cat5.jpg',
  ],
};

// ─────────────────────────────────────────────────────────────
// TYPES — the "shapes" of the data Browsy's parts pass around.
// TypeScript checks every file against these, so if one part sends
// something the other part doesn't expect, the build tells you.
// ─────────────────────────────────────────────────────────────

export type Mood = 'calm' | 'uneasy' | 'stressed' | 'chill' | 'dead';
export type Face = 'sad' | 'meh' | 'worried' | 'hurt' | 'happy'; // extra faces for single comments
export type Mode = 'alive' | 'dying' | 'dead' | 'crashing' | 'reviving';
export type Sense = 'mouse' | 'typing' | 'clicks' | 'scroll' | 'switching'; // the ones that ADD stress

// Each sense as a number from 0 (fine) to 1 (too much)
export type Pressure = Record<Sense | 'tabs' | 'network', number>;

// The raw numbers behind the pressures
export type Stats = {
  mouseSpeed: number;  // px/s
  scrollSpeed: number; // px/s
  keysPerSec: number;
  wpm: number;
  clicks: number;      // in the last 3 s
  tabs: number;
  switches: number;    // in the last CONFIG.switchMemory
  rtt: number | null;      // ping in ms (null = offline)
  downlink: number | null; // Mbps
};

export type Settings = { debug: boolean; demo: boolean; hidden: boolean; badNet: boolean; safeDeath: boolean; mute: boolean };
export type Command = 'cat' | 'kill' | 'revive';
export type TabInfo = { count: number; switches: number[]; host: string; hostSince: number };
export type Net = { rtt: number | null; downlink: number | null; at: number };
export type Episode = { total: number; red: number; maxed: number; waiting: number };
export type EventKind = 'say' | 'mood' | 'cat' | 'rush' | 'death' | 'crash' | 'revive' | 'arrive' | 'leave' | 'dizzy' | 'touch' | 'rip';
export type LogEvent = { id: number; t: number; kind: EventKind; text: string };
export type Tuning = Record<string, number>; // only the changed values: { "riseSpeed": 0.2, "weights.mouse": 1.5 }

// What the tab you're looking at saves, so the next tab is the same Browsy
export type SavedState = {
  stress: number;
  mode: 'alive' | 'dead';
  savedAt: number;
  present?: boolean;
  rebooted?: boolean; // the browser crashed last time
  deathLines?: string | null;
  lastCatAt?: number;
  siteNote?: { key: string; mark: number };
  maxedFor?: number; // ms he's been at max stress so far (so switching tabs doesn't restart the countdown)
  orangeCount?: number; // how many times he has turned orange (every other time costs you tabs)
  wasOrange?: boolean;  // he's still orange (switching tabs mustn't count as turning orange again)
};

// Everything kept in chrome.storage.local — shared by every tab, the popup and the background
export type Stored = {
  browsyTuning: Tuning;     // dev panel sliders
  browsySettings: Settings; // popup switches
  browsyCommand: { type: Command; at: number }; // popup buttons
  browsyState: SavedState;
  browsyDevPing: number;    // the dev panel is open (it "pings" every few seconds)
  tabInfo: TabInfo;        // written by background.ts
  net: Net;                // written by background.ts
};

// A snapshot of Browsy's mind, sent 10× per second to the dev panel
export type Telemetry = {
  type: 'browsy-telemetry';
  page: string;
  t: number;
  mode: Mode;
  present: boolean;
  mood: Mood;
  stress: number;
  rate: number;
  activity: number;
  fragility: number;
  overloaded: (keyof Pressure)[];
  deathHeld: number;
  maxedHeld: number;
  episode: Episode;
  pressure: Pressure;
  stats: Stats;
  stillFor: number;
  events: LogEvent[];
};

// Messages between the pages and background.ts
export type Message =
  | Telemetry
  | { type: 'browsy-close-tabs'; count: number } // page → background: "close a few tabs"
  | { type: 'browsy-capture' }   // page → background: "take a screenshot of this tab" (answers with an image)
  | { type: 'browsy-close-tab' } // page → background: "close this tab" (after ripping it)
  | { type: 'browsy-crash'; lines: string | null; delay: number } // page → background: "crash everything in `delay` ms"
  | { type: 'browsy-final'; lines: string | null }; // background → last tab: "show the crash screen"

// ── Typed shortcuts for chrome.storage and messages ──
// load(['tabInfo', 'net']) → { tabInfo?: TabInfo, net?: Net }
export const load = <K extends keyof Stored>(keys: K[]) =>
  chrome.storage.local.get<Partial<Pick<Stored, K>>>(keys);
export const save = (values: Partial<Stored>) => chrome.storage.local.set(values);
export const send = (message: Message) => chrome.runtime.sendMessage(message);

// getPath(CONFIG, 'weights.mouse') → CONFIG.weights.mouse
export const getPath = (obj: object, path: string): any =>
  path.split('.').reduce<any>((o, key) => o?.[key], obj);

// ── Live tuning from the dev panel ──
// The sliders in the dev panel save changed values into chrome.storage
// (e.g. { "riseSpeed": 0.2, "weights.mouse": 1.5 }). Every Browsy lays
// them over the defaults above, live — no reload needed.
export const CONFIG_DEFAULTS = structuredClone(CONFIG);

function applyTuning(tuning: Tuning | undefined) {
  const fresh = structuredClone(CONFIG_DEFAULTS);
  for (const [path, value] of Object.entries(tuning ?? {})) {
    const keys = path.split('.');
    const last = keys.pop()!;
    const target = keys.reduce<any>((obj, key) => obj?.[key], fresh);
    if (target && last in target) target[last] = value;
  }
  Object.assign(CONFIG, fresh);
}

try {
  load(['browsyTuning']).then((data) => applyTuning(data.browsyTuning)).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.browsyTuning) applyTuning(changes.browsyTuning.newValue as Tuning);
  });
} catch {
  // extension was reloaded — this old page can't reach storage any more
}
