// ─────────────────────────────────────────────────────────────
// POPUP — the page behind Browsy's toolbar icon. It's used twice:
//   • as the small POPUP: switches (meters, demo mode, …) and buttons
//   • as the DEV SIDE PANEL (popup → "open dev panel"): the same switches,
//     plus live graphs of Browsy's mind, an event log and tuning sliders.
// It never talks to Browsy directly: it writes into chrome.storage, and
// every Browsy on every page listens for changes there.
// ─────────────────────────────────────────────────────────────

import {
  CONFIG, CONFIG_DEFAULTS, getPath, load, save,
  type Command, type LogEvent, type Mood, type Pressure, type Sense, type Settings, type Stats,
  type Telemetry, type Tuning,
} from './config';

// Chrome tells us whether this page is open as the toolbar popup.
// Anywhere else (the side panel, or a normal tab) we show the dev panel too.
const isPopup = chrome.extension.getViews({ type: 'popup' }).includes(window);
document.body.classList.toggle('panel', !isPopup);

// $('stressNum') → the element with id="stressNum"
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string | null, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
const fmt = (n: number, digits = 0) => Number(n).toLocaleString('en', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const clock = (t: number) => new Date(t).toLocaleTimeString('en-GB');


// ═════════════════════════════════════════════════════════════
// 1. SWITCHES & BUTTONS (popup and side panel)
// ═════════════════════════════════════════════════════════════

const boxes = document.querySelectorAll<HTMLInputElement>('[data-setting]');
const settingOf = (box: HTMLInputElement) => box.dataset.setting as keyof Settings;

load(['browsySettings']).then(({ browsySettings }) => {
  for (const box of boxes) box.checked = !!browsySettings?.[settingOf(box)];
});

for (const box of boxes) {
  box.addEventListener('change', () => {
    const settings = {} as Settings;
    for (const b of boxes) settings[settingOf(b)] = b.checked;
    save({ browsySettings: settings });
  });
}

// The other one (popup or side panel) may change a switch too → keep both in sync
chrome.storage.onChanged.addListener((changes, area) => {
  const settings = changes.browsySettings?.newValue as Settings | undefined;
  if (area !== 'local' || !settings) return;
  for (const box of boxes) box.checked = !!settings[settingOf(box)];
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-command]')) {
  button.addEventListener('click', () => {
    // "at" makes every click a new change, even when you press the same button twice
    save({ browsyCommand: { type: button.dataset.command as Command, at: Date.now() } });
  });
}

// The dev panel opens as a side panel next to your tabs, so you can watch
// Browsy's mind while you use the page. (We look up the window first, because
// Chrome only allows opening the side panel straight from a click.)
let windowId: number = chrome.windows.WINDOW_ID_CURRENT;
chrome.windows.getCurrent().then((win) => { if (win.id != null) windowId = win.id; });
$('openPanel').addEventListener('click', () => {
  chrome.sidePanel.open({ windowId }).then(() => window.close());
});


// ═════════════════════════════════════════════════════════════
// 2. DEV PANEL (side panel only) — watch Browsy's mind live, and tune him.
// While the panel is open it "pings" chrome.storage every few seconds.
// The Browsy in the tab you're looking at notices, and sends a snapshot
// here 10× per second (see sendTelemetry in content.ts).
// The sliders save changes into chrome.storage, and every Browsy lays
// them over the defaults in config.ts — live, no reload needed.
// ═════════════════════════════════════════════════════════════

type Row = { key: Sense | 'tabs' | 'network'; label: string; color: string; raw: (s: Stats) => string };

// The senses that ADD stress
const SENSES: (Row & { key: Sense })[] = [
  { key: 'mouse', label: 'mouse', color: '#4cc9f0', raw: (s) => `${fmt(s.mouseSpeed)} px/s` },
  { key: 'typing', label: 'typing', color: '#f72585', raw: (s) => `${fmt(s.keysPerSec, 1)} keys/s` },
  { key: 'clicks', label: 'clicks', color: '#ffd166', raw: (s) => `${s.clicks} in 3 s` },
  { key: 'scroll', label: 'scroll', color: '#7bd389', raw: (s) => `${fmt(s.scrollSpeed)} px/s` },
  { key: 'switching', label: 'tab switches', color: '#b388ff', raw: (s) => `${s.switches} in ${CONFIG.switchMemory / 1000} s` },
];
// The ones that make him FRAGILE (stress rises faster)
const FRAGILITY: (Row & { factor: 'tabFragility' | 'netFragility' })[] = [
  { key: 'tabs', label: 'tabs', color: '#9e9e9e', factor: 'tabFragility', raw: (s) => `${s.tabs} open` },
  { key: 'network', label: 'network', color: '#ff8c42', factor: 'netFragility',
    raw: (s) => (s.rtt == null ? 'no ping' : `${fmt(s.rtt)} ms · ${s.downlink ?? '?'} Mbps`) },
];
const ICONS: Record<string, string> = { say: '💬', mood: '🎨', cat: '🐈', rush: '✂️', death: '☠️', crash: '💥', revive: '✨', arrive: '👋', leave: '🚪', dizzy: '😵', touch: '👆', rip: '💢' };
const GRAPH_MARKS = ['cat', 'rush', 'death', 'arrive', 'leave', 'say'];
const HISTORY_MS = 60_000;

type Sample = { t: number; stress: number; mood: Mood; present: boolean; p: Pressure };
let last: (Telemetry & { receivedAt: number }) | null = null; // the latest snapshot from Browsy
let samples: Sample[] = [];  // for the graphs
let events: LogEvent[] = []; // the event log
const openedAt = Date.now();

// ── Receive his snapshots ──
function listenForBrowsy() {
  chrome.runtime.onMessage.addListener((msg: Telemetry) => {
    if (msg?.type !== 'browsy-telemetry') return;
    last = { ...msg, receivedAt: Date.now() };
    samples.push({ t: msg.t, stress: msg.stress, mood: msg.mood, present: msg.present, p: msg.pressure });
    samples = samples.filter((h) => msg.t - h.t < HISTORY_MS);
    for (const e of msg.events) addEvent(e);
  });
}

function addEvent(e: LogEvent) {
  if (events.some((x) => x.t === e.t && x.text === e.text)) return; // already have it
  events.push(e);
  events.sort((a, b) => a.t - b.t);
  if (events.length > 300) events.shift();
  renderLog();
}

// ── Draw everything (10× per second) ──
function browsyColor(s: { present: boolean; mood: Mood; stress: number }, alpha = 1) {
  if (!s.present) return `hsl(0 0% 35% / ${alpha})`;
  if (s.mood === 'dead') return `hsl(0 100% 47% / ${alpha})`;
  if (s.mood === 'chill') return `hsl(205 100% 47% / ${alpha})`;
  return `hsl(${135 * (1 - s.stress)} 100% 47% / ${alpha})`;
}

// The stress levels where something happens. Same value → one label ("cat / red")
function thresholds() {
  const marks: [number, string][] = [[CONFIG.catAt, 'cat'], [0.7, 'red'], [0.98, 'max']];
  const merged: [number, string][] = [];
  for (const [v, label] of marks) {
    const same = merged.find((m) => Math.abs(m[0] - v) < 0.01);
    if (same) same[1] += ` / ${label}`;
    else merged.push([v, label]);
  }
  return merged;
}

function prepCanvas(canvas: HTMLCanvasElement) {
  canvas.dataset.h ||= canvas.getAttribute('height')!;
  const h = Number(canvas.dataset.h);
  const w = canvas.clientWidth;
  const dpr = devicePixelRatio || 1;
  canvas.style.height = `${h}px`;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function drawStressGraph(now: number) {
  const { ctx, w, h } = prepCanvas($<HTMLCanvasElement>('stressGraph'));
  const x = (t: number) => w - ((now - t) / HISTORY_MS) * w;
  const y = (v: number) => 8 + (1 - v) * (h - 16);

  // area under the line, in Browsy's colour at that moment
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (b.t - a.t > 1000) continue; // gap (you were in another tab)
    ctx.fillStyle = browsyColor(b, 0.35);
    ctx.fillRect(x(a.t), y(b.stress), x(b.t) - x(a.t) + 0.7, h - y(b.stress));
  }

  // threshold lines
  ctx.font = '10px system-ui';
  ctx.setLineDash([4, 4]);
  for (const [v, label] of thresholds()) {
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.beginPath();
    ctx.moveTo(0, y(v));
    ctx.lineTo(w, y(v));
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.fillText(label, 4, y(v) - 3);
  }
  ctx.setLineDash([]);

  // the stress line
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  samples.forEach((s, i) => {
    const gap = i && s.t - samples[i - 1].t > 1000;
    if (!i || gap) ctx.moveTo(x(s.t), y(s.stress));
    else ctx.lineTo(x(s.t), y(s.stress));
  });
  ctx.stroke();
  ctx.lineWidth = 1;

  // event markers
  ctx.font = '12px system-ui';
  for (const e of events) {
    if (now - e.t > HISTORY_MS || !GRAPH_MARKS.includes(e.kind)) continue;
    ctx.strokeStyle = e.kind === 'death' ? 'rgba(255,70,70,.8)' : 'rgba(255,255,255,.18)';
    ctx.beginPath();
    ctx.moveTo(x(e.t), 0);
    ctx.lineTo(x(e.t), h);
    ctx.stroke();
    if (e.kind !== 'say') ctx.fillText(ICONS[e.kind], x(e.t) + 2, 13);
  }
}

function drawSenseGraph(now: number) {
  const { ctx, w, h } = prepCanvas($<HTMLCanvasElement>('senseGraph'));
  const x = (t: number) => w - ((now - t) / HISTORY_MS) * w;
  const y = (v: number) => 4 + (1 - v) * (h - 8);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(255,70,70,.45)';
  ctx.beginPath();
  ctx.moveTo(0, y(CONFIG.overloaded));
  ctx.lineTo(w, y(CONFIG.overloaded));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 1.5;
  for (const sense of [...SENSES, FRAGILITY[0]]) {
    ctx.strokeStyle = sense.color;
    ctx.beginPath();
    samples.forEach((s, i) => {
      const gap = i && s.t - samples[i - 1].t > 1000;
      if (!i || gap) ctx.moveTo(x(s.t), y(s.p[sense.key]));
      else ctx.lineTo(x(s.t), y(s.p[sense.key]));
    });
    ctx.stroke();
  }
  ctx.lineWidth = 1;
}

// Rows of bars for "what's stressing him" (built once, updated live)
const rows: Record<string, { row: HTMLElement; fill: HTMLElement; mark: HTMLElement; val: HTMLElement }> = {};
function buildCauses() {
  const box = $('causes');
  const addRow = (sense: Row) => {
    const row = el('div', 'cause');
    const bar = el('div', 'bar');
    const fill = el('div', 'fill');
    const mark = el('div', 'mark');
    fill.style.background = sense.color;
    bar.append(fill, mark);
    const val = el('div', 'val');
    row.append(el('div', 'name', sense.label), bar, val);
    box.append(row);
    rows[sense.key] = { row, fill, mark, val };
  };
  SENSES.forEach(addRow);
  box.append(el('div', 'legend', 'these make him fragile (stress rises faster):'));
  FRAGILITY.forEach(addRow);
  $('senseLegend').append(...[...SENSES, FRAGILITY[0]].map((s) => {
    const item = el('span', null, s.label);
    const swatch = el('i');
    swatch.style.background = s.color;
    item.prepend(swatch);
    return item;
  }), el('span', null, 'red dashed = overloaded'));
}

// Write text with some bold parts: rich(node, ['activity ', ['1.3'], ' vs ...'])
function rich(node: HTMLElement, parts: (string | [string])[]) {
  node.replaceChildren(...parts.map((part) => (Array.isArray(part) ? el('b', null, part[0]) : part)));
}

function render() {
  const now = Date.now();
  const live = last && now - last.receivedAt < 1500;
  $('status').classList.toggle('live', !!live);
  $('statusText').textContent = live && last
    ? `live · ${last.page} · ${last.mode} · ${last.present ? 'here' : `away (needs ${CONFIG.appearAtTabs}+ tabs)`}`
    : 'no signal';
  $('hint').classList.toggle('show', !live && now - openedAt > 2500);
  drawStressGraph(now);
  drawSenseGraph(now);
  $('stressTicks').replaceChildren(...thresholds().map(([v, label]) => {
    const tick = el('span', null, label);
    tick.style.left = `${Math.min(94, v * 100)}%`;
    return tick;
  }));
  if (!last) return;
  const s = last;

  // stress number, mood, rate
  $('stressNum').textContent = s.stress.toFixed(2);
  $('moodChip').textContent = s.present ? s.mood : 'away';
  $('moodChip').style.background = browsyColor(s, 0.45);
  const fill = $('stressFill');
  fill.style.width = `${s.stress * 100}%`;
  fill.style.background = browsyColor(s);
  if (s.rate > 0.005) {
    $('rate').textContent = `▲ +${s.rate.toFixed(2)}/s · max in ${((1 - s.stress) / s.rate).toFixed(1)} s`;
  } else if (s.rate < -0.005) {
    $('rate').textContent = `▼ ${s.rate.toFixed(2)}/s · calming down`;
  } else {
    $('rate').textContent = 'steady';
  }

  // what's stressing him
  const w = CONFIG.weights;
  const contributions = SENSES.map((sense) => s.pressure[sense.key] * w[sense.key]);
  const top = Math.max(...contributions);
  SENSES.forEach((sense, i) => {
    const r = rows[sense.key];
    const p = s.pressure[sense.key];
    r.fill.style.width = `${p * 100}%`;
    r.mark.style.left = `${CONFIG.overloaded * 100}%`;
    r.val.textContent = `${sense.raw(s.stats)} → ${contributions[i].toFixed(2)}`;
    r.row.classList.toggle('over', p > CONFIG.overloaded);
    r.row.classList.toggle('hot', contributions[i] > 0.05 && contributions[i] === top);
  });
  for (const sense of FRAGILITY) {
    const r = rows[sense.key];
    const p = s.pressure[sense.key];
    r.fill.style.width = `${p * 100}%`;
    r.mark.style.display = sense.key === 'tabs' ? '' : 'none'; // tabs can also count as "overloaded"
    r.mark.style.left = `${CONFIG.overloaded * 100}%`;
    r.val.textContent = `${sense.raw(s.stats)} → ×${(1 + p * CONFIG[sense.factor]).toFixed(2)}`;
    r.row.classList.toggle('over', sense.key === 'tabs' && p > CONFIG.overloaded);
  }
  const paused = s.activity > CONFIG.comfort && s.mood === 'chill'; // he's holding the cat
  const rising = s.activity > CONFIG.comfort && !paused;
  rich($('summary'), [
    'activity ', [s.activity.toFixed(2)], ' vs comfort zone ', [CONFIG.comfort.toFixed(2)], ' → stress ',
    [paused ? 'paused (he’s holding the cat)' : rising ? 'rises' : 'falls'],
    rising ? ` at (${s.activity.toFixed(2)} − ${CONFIG.comfort.toFixed(2)}) × ${CONFIG.riseSpeed} × fragility ${s.fragility.toFixed(2)}` : '',
    ' · still for ', [`${(s.stillFor / 1000).toFixed(1)} s`],
  ]);

  // why isn't he dead yet?
  const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const maxed = s.stress >= 0.98;
  const enough = s.overloaded.length >= CONFIG.deathFactors;
  const maxedHeld = s.maxedHeld ?? 0;
  const check = (ok: boolean, text: string) => {
    const li = el('li');
    li.append(el('span', ok ? 'ok' : '', ok ? '●' : '○'), el('span', null, text));
    return li;
  };
  $('checks').replaceChildren(
    check(maxed, `stress at max (≥ 0.98) — now ${s.stress.toFixed(2)}`),
    check(maxed && enough, `fast death: ${CONFIG.deathFactors}+ overloaded senses (> ${CONFIG.overloaded}) for ${sec(CONFIG.deathHold)} — ` +
      `now ${s.overloaded.length}${s.overloaded.length ? ` (${s.overloaded.join(', ')})` : ''}, ${sec(s.deathHeld)} so far`),
    check(maxed, `slow death: at max for ${sec(CONFIG.maxedDeath)} — ${sec(maxedHeld)} so far`),
  );
  const verdict = $('verdict');
  if (s.mode !== 'alive') {
    verdict.textContent = `He's ${s.mode}.`;
  } else if (maxed && !enough) {
    verdict.textContent = `At max! He dies in ${sec(Math.max(0, CONFIG.maxedDeath - maxedHeld))} unless you stop.`;
  } else {
    verdict.textContent = '';
  }
  verdict.classList.toggle('show', !!verdict.textContent);
  const e = s.episode;
  const tile = (value: number, label: string) => {
    const d = el('div');
    d.append(el('b', null, `${value.toFixed(1)} s`), el('span', null, label));
    return d;
  };
  $('episode').replaceChildren(
    tile(e.total, 'this stress episode'),
    tile(e.red, 'red (stress > 0.7)'),
    tile(e.maxed, 'at max'),
    tile(e.waiting, 'at max, 1 sense only'),
  );
}

function renderLog() {
  const list = $('log');
  if (!events.length) return list.replaceChildren(el('li', 'empty', 'nothing yet'));
  list.replaceChildren(...events.slice().reverse().map((e) => {
    const li = el('li', e.kind);
    li.append(el('time', null, clock(e.t)), el('span', null, ICONS[e.kind] ?? '•'), el('span', null, e.text));
    return li;
  }));
}

$('clearLog').addEventListener('click', () => {
  events = [];
  renderLog();
});

// ── Tuning sliders ──
// [config key, label, min, max, step, 'ms' = show as seconds]
type Tunable = [key: string, label: string, min: number, max: number, step: number, unit?: 'ms'];
const TUNABLES: [group: string, items: Tunable[]][] = [
  ['Presence', [
    ['appearAtTabs', 'appears at … tabs (or more)', 1, 40, 1],
    ['leaveDelay', 'lingers after tabs close', 0, 10000, 500, 'ms'],
  ]],
  ['When does a sense start to count?', [
    ['mouseCalm', 'mouse: ignored below (px/s)', 0, 3000, 50],
    ['mouseMax', 'mouse: 100% at (px/s)', 500, 10000, 250],
    ['typingCalm', 'typing: ignored below (keys/s)', 0, 8, 0.5],
    ['typingMax', 'typing: 100% at (keys/s)', 3, 15, 0.5],
    ['clicksCalm', 'clicks: ignored below (per 3 s)', 0, 10, 1],
    ['clicksMax', 'clicks: 100% at (per 3 s)', 3, 30, 1],
    ['rageClicks', 'rage click = clicks in 1 s on one spot', 2, 8, 1],
    ['scrollCalm', 'scroll: ignored below (px/s)', 0, 3000, 50],
    ['scrollMax', 'scroll: 100% at (px/s)', 500, 15000, 250],
    ['switchMemory', 'tab switch keeps counting for', 5000, 60000, 1000, 'ms'],
    ['switchesCalm', 'tab switches: ignored below (in that time)', 0, 10, 1],
    ['switchesMax', 'tab switches: 100% at (in that time)', 2, 20, 1],
    ['dizzyAt', 'dizzy at … switches (in that time)', 2, 10, 1],
    ['tabsCalm', 'tabs: no pressure up to', 0, 40, 1],
    ['tabsMax', 'tabs: 100% at', 10, 100, 1],
  ]],
  ['How much each sense counts', [
    ['weights.mouse', 'mouse', 0, 4, 0.1],
    ['weights.typing', 'typing', 0, 4, 0.1],
    ['weights.clicks', 'clicks', 0, 4, 0.1],
    ['weights.scroll', 'scroll', 0, 4, 0.1],
    ['weights.switching', 'tab switches', 0, 4, 0.1],
    ['switchStress', 'every single tab switch adds stress', 0, 0.2, 0.01],
  ]],
  ['Stress speed', [
    ['comfort', 'comfort zone (activity he tolerates)', 0, 2, 0.05],
    ['riseSpeed', 'how fast stress rises', 0.01, 0.5, 0.01],
    ['calmSpeed', 'how fast he calms down (per s)', 0.01, 0.5, 0.01],
    ['tabFragility', 'tabs make him fragile ×', 0, 2, 0.1],
    ['netFragility', 'bad internet makes him fragile ×', 0, 2, 0.1],
  ]],
  ['Cat', [
    ['catAt', 'shows the cat at stress', 0.1, 1, 0.05],
    ['catDuration', 'cat stays for', 2000, 20000, 500, 'ms'],
    ['catCooldown', 'time between cats', 5000, 300000, 5000, 'ms'],
    ['catCooldownDemo', 'time between cats in demo mode', 5000, 120000, 5000, 'ms'],
  ]],
  ['Closing tabs (cat + turning orange)', [
    ['closeTabsMin', 'closes at least … tabs', 0, 10, 1],
    ['closeTabsMax', '…and at most', 0, 10, 1],
    ['orangeAt', 'turns orange at stress', 0.3, 1, 0.05],
    ['orangeEvery', 'closes tabs every …-th time he turns orange', 1, 5, 1],
    ['orangeReset', 'must calm below this before it counts again', 0, 0.9, 0.05],
  ]],
  ['Death', [
    ['overloaded', 'a sense is "overloaded" above', 0.3, 1, 0.05],
    ['deathFactors', 'overloaded senses needed to die', 1, 5, 1],
    ['deathHold', '…for how long', 0, 5000, 100, 'ms'],
    ['maxedDeath', 'or: at max stress this long → dies anyway', 0, 10000, 250, 'ms'],
    ['tabsDeathAt', 'or: this many open tabs kill him', 6, 100, 1],
    ['stillToRevive', 'stillness to revive (safe mode)', 1000, 15000, 500, 'ms'],
  ]],
  ['Ripping the tab', [
    ['ripScrollSpeed', 'rip meter fills when scrolling faster than (px/s)', 300, 6000, 100],
    ['ripTime', 'the meter is full after', 500, 6000, 100, 'ms'],
    ['ripDrain', 'it empties when you slow down × (1 = as fast as it fills)', 0, 2, 0.1],
  ]],
  ['Poking him', [
    ['pokeStress', 'n-th click in a row adds n × this much stress', 0, 0.1, 0.005],
    ['pokeReset', 'a pause this long ends the row', 500, 4000, 100, 'ms'],
  ]],
  ['Rushing', [
    ['rushKeysPerSec', 'rushing = typing faster than (keys/s)', 2, 12, 0.5],
    ['rushTime', '…for', 1000, 15000, 500, 'ms'],
    ['rushCloseTabs', 'tabs he closes', 0, 10, 1],
    ['rushCooldown', 'time between', 10000, 300000, 5000, 'ms'],
  ]],
  ['Crash', [
    ['crashDelay', 'tombstone shows for', 0, 15000, 500, 'ms'],
    ['crashCountdown', 'crash screen countdown (s)', 1, 10, 1],
  ]],
  ['Demo mode', [
    ['demoSensitivity', 'reacts to 1/… of the usual speed', 1, 6, 0.5],
    ['demoRiseSpeed', 'stress climbs × faster', 1, 5, 0.5],
  ]],
];

type Knob = {
  key: string; input: HTMLInputElement; output: HTMLOutputElement; knob: HTMLElement;
  unit?: 'ms'; step: number; count: HTMLElement; defaultValue: number;
};
let tuning: Tuning = {}; // only the values you changed: { "riseSpeed": 0.2, ... }
const knobs: Knob[] = [];
let saveTimer = 0;

function showValue(value: number, unit: 'ms' | undefined, step: number) {
  if (unit === 'ms') return `${(value / 1000).toFixed(1)} s`;
  return fmt(value, step < 0.1 ? 2 : step < 1 ? 1 : 0);
}

function buildTuning() {
  const box = $('tuning');
  for (const [group, items] of TUNABLES) {
    const details = el('details');
    const summary = el('summary', null, group);
    const count = el('span', 'count');
    summary.append(count);
    details.append(summary);
    for (const [key, label, min, max, step, unit] of items) {
      const knob = el('div', 'knob');
      const input = Object.assign(el('input'), { type: 'range', min: String(min), max: String(max), step: String(step) });
      const output = el('output');
      const undo = Object.assign(el('button', 'undo', '↺'), { title: 'back to default' });
      knob.append(el('label', null, label), input, output, undo);
      details.append(knob);
      const k: Knob = { key, input, output, knob, unit, step, count, defaultValue: getPath(CONFIG_DEFAULTS, key) };
      knobs.push(k);
      input.addEventListener('input', () => setKnob(k, Number(input.value)));
      undo.addEventListener('click', () => setKnob(k, k.defaultValue));
    }
    box.append(details);
  }
  refreshKnobs();
}

function setKnob(k: Knob, value: number) {
  if (value === k.defaultValue) delete tuning[k.key];
  else tuning[k.key] = value;
  refreshKnobs();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save({ browsyTuning: tuning }), 150);
}

function refreshKnobs() {
  for (const k of knobs) {
    const value = tuning[k.key] ?? k.defaultValue;
    k.input.value = String(value);
    k.output.textContent = showValue(value, k.unit, k.step);
    k.knob.classList.toggle('changed', k.key in tuning);
    k.knob.title = `default: ${showValue(k.defaultValue, k.unit, k.step)}`;
  }
  for (const k of knobs) {
    const changed = knobs.filter((other) => other.count === k.count && other.key in tuning).length;
    k.count.textContent = changed ? `· ${changed} changed` : '';
  }
}

$('resetAll').addEventListener('click', () => {
  tuning = {};
  refreshKnobs();
  save({ browsyTuning: tuning });
});

// A text you can paste to Claude: what you changed + what happened
function reportText() {
  const lines = ['Browsy tuning — values I changed (default → mine):'];
  const changed = Object.entries(tuning);
  if (!changed.length) lines.push('  (none, all defaults)');
  for (const [key, value] of changed) lines.push(`  ${key}: ${getPath(CONFIG_DEFAULTS, key)} → ${value}`);
  const death = events.filter((e) => e.kind === 'death').at(-1);
  lines.push('', 'Last death:', death ? `  ${death.text}` : '  (none yet)');
  lines.push('', 'Recent log:');
  for (const e of events.slice(-25)) lines.push(`  ${clock(e.t)} ${e.kind}: ${e.text}`);
  return lines.join('\n');
}

$('copy').addEventListener('click', async () => {
  const text = reportText();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = Object.assign(el('textarea'), { value: text });
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  $('copied').textContent = 'copied ✓';
  setTimeout(() => { $('copied').textContent = ''; }, 2000);
});

// ── start the dev panel (not in the small popup) ──
if (!isPopup) {
  // Tell Browsy we're watching
  const ping = () => save({ browsyDevPing: Date.now() });
  ping();
  setInterval(ping, 4000);
  listenForBrowsy();

  buildCauses();
  load(['browsyTuning']).then(({ browsyTuning }) => {
    tuning = browsyTuning ?? {};
    buildTuning();
  });
  setInterval(render, 100);
  render();
}
