// ─────────────────────────────────────────────────────────────
// BACKGROUND — runs once for the whole browser (not once per page).
// It watches things a single web page can't see:
//   • how many tabs are open and how often you switch between them
//   • which website you're on, and since when
//   • how healthy the internet connection is (ping + speed)
// It writes everything into chrome.storage, where every Browsy can read it.
// It's also Browsy's hands: only the background is allowed to close tabs.
// ─────────────────────────────────────────────────────────────

import { CONFIG, load, save, type Message, type TabInfo } from './config'; // same CONFIG as the pages

const SWITCH_MEMORY = 60_000; // remember tab switches from the last minute
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const closeTab = (tab: chrome.tabs.Tab) => (tab.id == null ? undefined : chrome.tabs.remove(tab.id).catch(() => {}));

// Chrome can fire several tab events at the same moment. This queue makes
// them run one after another so they don't overwrite each other's changes.
let queue = Promise.resolve();
const enqueue = (job: () => Promise<void>) => (queue = queue.then(() => job()).catch(console.error));

// "https://www.youtube.com/watch?v=…" → "youtube.com". Browser pages (chrome://…) → ""
function hostOf(url?: string) {
  try {
    const u = new URL(url ?? '');
    return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}

async function updateTabInfo({ switched = false } = {}) {
  const now = Date.now();
  const { tabInfo: old } = await load(['tabInfo']);
  const info: TabInfo = old ?? { count: 0, switches: [], host: '', hostSince: now };

  info.count = (await chrome.tabs.query({})).length;

  if (switched) info.switches.push(now);
  info.switches = info.switches.filter((t) => now - t < SWITCH_MEMORY);

  // Remember when you arrived on the current website
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const host = hostOf(active?.url);
  if (host !== info.host) {
    info.host = host;
    info.hostSince = now;
  }

  await save({ tabInfo: info });
}

chrome.tabs.onActivated.addListener(() => {
  enqueue(() => updateTabInfo({ switched: true }));
  if (Date.now() - lastNetCheck > 10_000) measureNetwork();
});
chrome.tabs.onCreated.addListener(() => enqueue(updateTabInfo));
chrome.tabs.onRemoved.addListener(() => enqueue(updateTabInfo));
chrome.tabs.onUpdated.addListener((_tabId, change) => {
  if (change.url) enqueue(updateTabInfo); // you navigated somewhere new
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) enqueue(() => updateTabInfo({ switched: true }));
});

// ── Network: the live outside condition ──────────────────────
// We time a tiny request to Google (it returns an empty "204" response)
// and read Chrome's own speed estimate. A slow ping + low speed = congestion.

let lastNetCheck = 0;

async function ping() {
  const start = performance.now();
  try {
    await fetch(`https://www.gstatic.com/generate_204?t=${Date.now()}`, { mode: 'no-cors', cache: 'no-store' });
    return performance.now() - start;
  } catch {
    return null; // offline, or the request failed
  }
}

async function measureNetwork() {
  lastNetCheck = Date.now();
  await ping(); // the first request also sets up the connection, so we time the second one
  const rtt = await ping();
  // Mbps (Chrome caps this at 10). TypeScript doesn't know navigator.connection, so we describe it.
  const connection = (navigator as { connection?: { downlink?: number } }).connection;
  const downlink = connection?.downlink ?? null;
  await save({ net: { rtt, downlink, at: Date.now() } });
}

// Re-check the network every 30 seconds
chrome.alarms.get('net').then((alarm) => {
  if (!alarm) chrome.alarms.create('net', { periodInMinutes: 0.5 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'net') measureNetwork();
});

// ── Messages from Browsy ──────────────────────────────────────
// A web page isn't allowed to close tabs, so Browsy asks us to do it.

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  const tab = sender.tab;
  if (!tab) return; // only Browsy on a page asks us things
  if (msg?.type === 'browsy-crash') crashBrowser(tab, msg.lines, msg.delay);
  if (msg?.type === 'browsy-close-tabs') {
    closeForgottenTabs(tab, msg.count).then(sendResponse);
    return true; // "I'll answer later" (once the tabs are closed)
  }
  // RIPPING: a photo of the tab you see, for him to tear in half… then the tab goes
  if (msg?.type === 'browsy-capture') {
    chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 85 })
      .then(sendResponse, () => sendResponse(null)); // no photo → he tears a blank page instead
    return true;
  }
  if (msg?.type === 'browsy-close-tab') closeTab(tab);
});

// RUSHING: close the tabs you've looked at least recently, one by one
async function closeForgottenTabs(browsyTab: chrome.tabs.Tab, count: number) {
  const tabs = await chrome.tabs.query({ windowType: 'normal' });
  const victims = tabs
    .filter((t) => t.id !== browsyTab.id && !t.active)
    .sort((a, b) => (a.lastAccessed ?? 0) - (b.lastAccessed ?? 0))
    .slice(0, count);
  for (const tab of victims) {
    await closeTab(tab);
    await wait(500);
  }
  return victims.length;
}

// THE CRASH: when Browsy dies he takes the browser down with him
let crashing = false;

async function crashBrowser(diedIn: chrome.tabs.Tab, lines: string | null, delay: number) {
  if (crashing) return;
  crashing = true;
  try {
    await wait(delay); // let the tombstone sink in first
    // Revived from the popup in the meantime? Then never mind.
    if ((await load(['browsyState'])).browsyState?.mode !== 'dead') return;

    // Browsy's tab goes last and shows the crash screen. If you closed it, the tab you're on does.
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const stillOpen = diedIn.id == null ? null : await chrome.tabs.get(diedIn.id).catch(() => null);
    const browsyTab = stillOpen ?? active ?? diedIn;
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });

    // 1. Close the tabs one by one: other windows first, then this window
    //    from the farthest tab inwards. Browsy's own tab goes last.
    const otherWindows = windows.filter((w) => w.id !== browsyTab.windowId).flatMap((w) => w.tabs ?? []);
    const thisWindow = (windows.find((w) => w.id === browsyTab.windowId)?.tabs ?? [])
      .filter((t) => t.id !== browsyTab.id)
      .sort((a, b) => Math.abs(b.index - browsyTab.index) - Math.abs(a.index - browsyTab.index));
    const victims = [...otherWindows, ...thisWindow];
    const gap = Math.min(450, Math.max(150, 5000 / victims.length)); // lots of tabs → close them faster
    for (const tab of victims) {
      await closeTab(tab);
      await wait(gap);
    }

    // Next time the browser opens, Browsy wakes up alive again (your tabs don't).
    // (Saved after the other tabs are gone, so none of them can overwrite it.)
    await save({ browsyState: { stress: 0, mode: 'alive', savedAt: Date.now(), rebooted: true } });

    // 2. The crash screen on the last tab… then lights out
    const final: Message = { type: 'browsy-final', lines };
    if (browsyTab.id != null) await chrome.tabs.sendMessage(browsyTab.id, final).catch(() => {}); // Browsy on a website
    await chrome.runtime.sendMessage(final).catch(() => {});                                       // Browsy on our New Tab page
    await wait(CONFIG.crashCountdown * 1000 + 400);
    for (const w of await chrome.windows.getAll()) {
      if (w.id != null) await chrome.windows.remove(w.id).catch(() => {}); // closing the last window quits the browser
    }
  } finally {
    crashing = false; // even if something went wrong, the next death can crash again
  }
}

// Fresh start whenever the browser opens or the extension is (re)installed
async function freshStart() {
  await chrome.storage.local.remove('tabInfo');
  enqueue(updateTabInfo);
  measureNetwork();
}
chrome.runtime.onStartup.addListener(freshStart);
chrome.runtime.onInstalled.addListener(() => carryOverOldName().finally(freshStart));

// He used to be called "Webby", then "Tabsy". Switches and sliders saved under
// an old name are moved to the new one, so safe mode doesn't silently turn off.
// (Only needed once — safe to delete after everyone has the renamed version.)
async function carryOverOldName() {
  const renamed: [oldKey: string, newKey: string][] = [
    ['webbySettings', 'browsySettings'], ['webbyTuning', 'browsyTuning'],
    ['tabsySettings', 'browsySettings'], ['tabsyTuning', 'browsyTuning'], // newer, so these win
  ];
  const oldKeys = renamed.map(([oldKey]) => oldKey);
  const old = await chrome.storage.local.get(oldKeys);
  for (const [oldKey, newKey] of renamed) {
    if (oldKey in old) await chrome.storage.local.set({ [newKey]: old[oldKey] });
  }
  await chrome.storage.local.remove(oldKeys);
}
