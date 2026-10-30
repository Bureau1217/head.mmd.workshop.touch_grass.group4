// ─────────────────────────────────────────────────────────────
// SOUND — Browsy's sound effects: dramatic, but goofy.
// There are no sound files: every sound is made right here from a few
// "oscillators" (beeps that can slide up and down) and some noise, with
// the browser's Web Audio API. Change the numbers to change the sounds.
//
// Browsers only allow a page to make sound after you've clicked or typed
// on it — so right after a page opens, the first sounds can be silent.
// ─────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let echoBus: GainNode | null = null; // sounds sent here get a dramatic echo tail
let noiseBuffer: AudioBuffer | null = null;
let gritCurve: Float32Array<ArrayBuffer> | null = null;
let muted = false;

const VOLUME = 0.45; // everything together (0 … 1)

export const setMuted = (value: boolean) => { muted = value; };

// Call on a click or key press: that's when the browser lets us switch the sound on
export function unlock() {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      // everything → master volume → a compressor (so big layered moments don't crackle) → speakers
      const squash = ctx.createDynamicsCompressor();
      squash.threshold.value = -16;
      squash.ratio.value = 6;
      squash.connect(ctx.destination);
      master = ctx.createGain();
      master.gain.value = VOLUME;
      master.connect(squash);
      // the echo: a delay that feeds back into itself, a bit duller every round
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.23;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.4;
      const dull = ctx.createBiquadFilter();
      dull.type = 'lowpass';
      dull.frequency.value = 2200;
      echoBus = ctx.createGain();
      echoBus.gain.value = 0.55;
      echoBus.connect(delay);
      delay.connect(dull).connect(feedback).connect(delay);
      dull.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {
    // no sound on this page — that's fine
  }
}

// Only play when the sound is on (and allowed)
const ready = () => (!muted && ctx?.state === 'running' && master ? ctx : null);

// The loudness over time: a quick start then fading, a held note, or a swell that grows
function envelope(c: AudioContext, t: number, dur: number, vol: number, shape: 'hit' | 'hold' | 'swell') {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  if (shape === 'swell') {
    gain.gain.linearRampToValueAtTime(vol, t + dur * 0.92); // (evenly, so you hear it build from the start)
  } else {
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    if (shape === 'hold') gain.gain.linearRampToValueAtTime(vol * 0.7, t + dur * 0.8);
  }
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return gain;
}

// Where a finished sound goes: the speakers, and maybe the echo too
function out(gain: GainNode, echo: boolean) {
  gain.connect(master!);
  if (echo && echoBus) gain.connect(echoBus);
}

type Tone = {
  type?: OscillatorType; // 'sine' = soft, 'triangle' = flute-ish, 'square' = 8-bit, 'sawtooth' = brassy
  from: number;          // pitch at the start (Hz)
  to?: number;           // pitch at the end — a slide (Hz)
  dur: number;           // seconds
  at?: number;           // start this many seconds from now
  vol?: number;          // 0 … 1
  hold?: boolean;        // a held note (instead of a quick fade)
  swell?: boolean;       // grows louder and louder until the end
  wobble?: number;       // vibrato: how far the pitch wobbles (Hz)
  wobbleSpeed?: number;  // …and how fast (times per second)
  muffle?: number;       // makes it duller: cuts off sound above this pitch (Hz)
  grit?: boolean;        // distorted, like a blown-out movie horn
  echo?: boolean;        // add the dramatic echo tail
};

function tone({ type = 'sine', from, to = from, dur, at = 0, vol = 0.5, hold = false, swell = false,
  wobble = 0, wobbleSpeed = 12, muffle, grit = false, echo = false }: Tone) {
  const c = ready();
  if (!c) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  let sound: AudioNode = osc;
  if (grit) {
    if (!gritCurve) { // squash the wave's peaks → distortion
      gritCurve = new Float32Array(1024);
      for (let i = 0; i < gritCurve.length; i++) gritCurve[i] = Math.tanh(((i / 1024) * 2 - 1) * 4);
    }
    const shaper = c.createWaveShaper();
    shaper.curve = gritCurve;
    sound = sound.connect(shaper);
  }
  if (muffle) {
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = muffle;
    sound = sound.connect(filter);
  }
  const gain = envelope(c, t, dur, vol, swell ? 'swell' : hold ? 'hold' : 'hit');
  sound.connect(gain);
  out(gain, echo);
  if (wobble) {
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = wobbleSpeed;
    depth.gain.value = wobble;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur);
  }
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

type Noise = {
  dur: number; at?: number; vol?: number;
  filter?: BiquadFilterType; from?: number; to?: number; q?: number;
  hold?: boolean; swell?: boolean; echo?: boolean;
};

// 1 second of random hiss (made once), looped by everything that needs noise
function hiss(c: AudioContext) {
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  return src;
}

// A burst of hiss, shaped by a filter — wind, paper, rumble…
function noise({ dur, at = 0, vol = 0.4, filter = 'bandpass', from = 1000, to = from, q = 1, hold = false, swell = false, echo = false }: Noise) {
  const c = ready();
  if (!c) return;
  const t = c.currentTime + at;
  const src = hiss(c);
  const f = c.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  const gain = envelope(c, t, dur, vol, swell ? 'swell' : hold ? 'hold' : 'hit');
  src.connect(f).connect(gain);
  out(gain, echo);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

// A deep drum (timpani): BOOM
function timpani(pitch: number, at = 0, vol = 0.8) {
  tone({ from: pitch, to: pitch * 0.55, dur: 0.9, at, vol, echo: true });
  noise({ filter: 'lowpass', from: 700, to: 100, dur: 0.25, at, vol: vol * 0.5 });
}

// ── the sounds ───────────────────────────────────────────────

// THE STRESS RUMBLE — keeps playing while he's stressed and shaking.
// level 0 = silent … 1 = about to break: louder, rougher and shakier.
// (Built the first time it's needed, then just turned up and down.)
let rumble: { volume: GainNode; low: BiquadFilterNode; hum: OscillatorNode; shake: OscillatorNode; rattle: GainNode } | null = null;
let rumbleLevel = 0;

export function setRumble(level: number) {
  const c = ctx;
  if (!c || !master || c.state !== 'running') return;
  if (muted) level = 0;
  if (Math.abs(level - rumbleLevel) < 0.01 && (level > 0 || rumbleLevel === 0)) return; // (nothing changed)
  rumbleLevel = level;
  if (!rumble) {
    if (level <= 0) return; // not needed yet
    const volume = c.createGain();
    volume.gain.value = 0;
    volume.connect(master);
    // the shaking: a fast wobble in loudness (tremolo)
    const shaker = c.createGain();
    shaker.gain.value = 0.6;
    shaker.connect(volume);
    const shake = c.createOscillator();
    const depth = c.createGain();
    depth.gain.value = 0.4;
    shake.connect(depth).connect(shaker.gain);
    // the rumble itself: hiss with only the low part left
    const low = c.createBiquadFilter();
    low.type = 'lowpass';
    low.Q.value = 1.2;
    hiss(c).connect(low).connect(shaker);
    // a deep hum underneath
    const hum = c.createOscillator();
    hum.type = 'triangle';
    const humVolume = c.createGain();
    humVolume.gain.value = 0.5;
    hum.connect(humVolume).connect(shaker);
    // near breaking point: a nervous chattering rattle
    const chatter = c.createBiquadFilter();
    chatter.type = 'bandpass';
    chatter.frequency.value = 1400;
    chatter.Q.value = 3;
    const rattle = c.createGain();
    rattle.gain.value = 0;
    hiss(c).connect(chatter).connect(rattle).connect(shaker);
    for (const node of [shake, hum]) node.start();
    rumble = { volume, low, hum, shake, rattle };
  }
  // follow the new level smoothly (over ~0.15 s)
  const t = c.currentTime;
  rumble.volume.gain.setTargetAtTime(level * 0.6, t, 0.15);
  rumble.low.frequency.setTargetAtTime(90 + level * 400, t, 0.15); // rougher (brighter) when worse
  rumble.hum.frequency.setTargetAtTime(38 + level * 26, t, 0.15);  // the hum rises
  rumble.shake.frequency.setTargetAtTime(6 + level * 14, t, 0.15); // shakes faster
  rumble.rattle.gain.setTargetAtTime(Math.max(0, level - 0.6) * 0.6, t, 0.15);
}

// He pops into existence
export function pop() {
  tone({ from: 400, to: 1200, dur: 0.07, vol: 0.4 });
  tone({ from: 600, to: 1600, dur: 0.07, at: 0.08, vol: 0.3 });
}

// A babble blip for each few letters he "says" (higher when happy, lower when sad)
export function blip(mood: string | null) {
  const pitch = mood === 'happy' ? 1.3 : mood === 'sad' ? 0.75 : mood === 'hurt' || mood === 'worried' ? 1.1 : 1;
  tone({ type: 'square', from: (420 + Math.random() * 200) * pitch, dur: 0.045, vol: 0.05, muffle: 2500 });
}

// Booped: a cartoon spring
export function boing() {
  tone({ from: 150, to: 600, dur: 0.35, vol: 0.4, wobble: 60, wobbleSpeed: 16 });
}

// Poked: a squeak that gets higher with every poke in a row
export function eep(pokes: number) {
  const up = 1 + pokes * 0.07;
  tone({ type: 'square', from: 950 * up, to: 600 * up, dur: 0.09, vol: 0.12, muffle: 3000 });
  tone({ from: 700 * up, to: 420 * up, dur: 0.13, vol: 0.25 });
}

// Picked up / dropped: the slide whistle
export const whistleUp = () => tone({ from: 350, to: 1300, dur: 0.35, vol: 0.25, wobble: 25, wobbleSpeed: 9 });
export const whistleDown = () => tone({ from: 1300, to: 350, dur: 0.4, vol: 0.22, wobble: 25, wobbleSpeed: 9 });

// Landing on the floor after you drop him
export function thud() {
  tone({ from: 140, to: 50, dur: 0.18, vol: 0.5 });
  noise({ filter: 'lowpass', from: 300, to: 80, dur: 0.12, vol: 0.25 });
}

// The cat comes out: a soft chime and a little "mrrp"
export function catChime() {
  [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.35, at: i * 0.09, vol: 0.15 }));
  tone({ from: 500, to: 900, dur: 0.12, at: 0.45, vol: 0.18 });
  tone({ from: 900, to: 650, dur: 0.16, at: 0.57, vol: 0.18 });
}

// "Uh-oh" — warnings
export function uhOh() {
  tone({ type: 'triangle', from: 620, dur: 0.16, vol: 0.35 });
  tone({ type: 'triangle', from: 466, dur: 0.3, at: 0.2, vol: 0.35, wobble: 12, wobbleSpeed: 7 });
}

// Everything is spinning
export function wobble() {
  tone({ from: 520, dur: 0.9, vol: 0.22, hold: true, wobble: 140, wobbleSpeed: 6 });
  tone({ type: 'triangle', from: 780, dur: 0.9, vol: 0.1, hold: true, wobble: 200, wobbleSpeed: 9 });
}

// Relief: a little sigh
export const sigh = () => noise({ filter: 'lowpass', from: 1400, to: 200, dur: 0.6, vol: 0.15 });

// Rushing: one whoosh for every tab he closes (they close half a second apart)
export function whooshes(count: number) {
  for (let i = 0; i < count; i++) noise({ from: 400, to: 2400, q: 0.8, dur: 0.3, at: i * 0.5, vol: 0.3 });
}

// ── RIPPING THE TAB ──
// While he tugs (0.65 s): the paper creaks and stretches, he groans — louder and louder…
export function strain() {
  noise({ from: 250, to: 1900, q: 9, dur: 0.68, vol: 0.6, swell: true });                     // paper stretching, higher and higher
  tone({ type: 'sawtooth', from: 55, to: 115, dur: 0.68, vol: 0.35, muffle: 320, swell: true }); // a low groan: he's pulling hard
  tone({ from: 500, to: 2000, dur: 0.68, vol: 0.09, swell: true });                            // the tension whine
  [0.12, 0.3, 0.45, 0.56].forEach((at) =>                                                     // the fibres starting to pop
    noise({ from: 2500 + Math.random() * 2500, q: 3, dur: 0.03, at, vol: 0.35 }));
}
// …then it SNAPS: a big movie hit, and the long RRRIIIIP as the halves fly away (1.1 s)
export function rip() {
  [130.8, 155.6, 196, 261.6].forEach((f) => // a dark chord, all at once
    tone({ type: 'sawtooth', from: f, to: f * 0.97, dur: 1, vol: 0.15, muffle: 2400, echo: true }));
  tone({ from: 95, to: 28, dur: 1.1, vol: 0.9, echo: true });                                  // BOOM
  let t = 0; // RRRRIIIIP: lots of tiny crackles, loud and fast at first, then slowing down
  for (let i = 0; i < 55; i++) {
    noise({ from: 1200 + Math.random() * 4000, q: 1.5, dur: 0.03 + Math.random() * 0.05, at: t, vol: 0.9 * (1 - i / 75) });
    t += 0.008 + i * 0.0005 + Math.random() * 0.012;
  }
  noise({ from: 3200, to: 500, q: 0.6, dur: 1.4, vol: 0.5, hold: true, echo: true });          // the long tear underneath
  noise({ filter: 'lowpass', from: 300, to: 2600, dur: 1.1, at: 0.2, vol: 0.4, hold: true });  // whoosh: the halves flying off
  tone({ from: 60, to: 30, dur: 0.9, at: 0.85, vol: 0.6, echo: true });                        // …and an aftershock
}

// ── DEATH ──
// DUN DUN DUUUUNNN — brass in three layers, a drum on every "dun", a cymbal on the last
export function dunDunDunn() {
  const brass = (f: number, at: number, dur: number, hold = false) => {
    const bend = hold ? 0.94 : 1; // the long note sags at the end (that's the goofy part)
    tone({ type: 'sawtooth', from: f, to: f * bend, dur, at, vol: 0.32, hold, muffle: 1600, wobble: hold ? 5 : 0, wobbleSpeed: 5.5, echo: true });
    tone({ type: 'sawtooth', from: f / 2, to: (f / 2) * bend, dur, at, vol: 0.28, hold, muffle: 900, echo: true });
    tone({ type: 'square', from: f * 1.5, to: f * 1.5 * bend, dur, at, vol: 0.07, hold, muffle: 2200 });
  };
  brass(196, 0, 0.24);
  timpani(98, 0);
  brass(196, 0.32, 0.24);
  timpani(98, 0.32);
  brass(155.6, 0.64, 2.2, true);
  timpani(77.8, 0.64, 1);
  noise({ filter: 'highpass', from: 5000, dur: 2.2, at: 0.64, vol: 0.16, echo: true }); // cymbal crash
}

// The tombstone falls: the whistle of something HEAVY, and air rushing louder and louder…
export function falling(seconds: number) {
  tone({ from: 2400, to: 300, dur: seconds, vol: 0.22, echo: true });
  noise({ filter: 'lowpass', from: 150, to: 700, dur: seconds, vol: 0.4, swell: true });
}
// …and hits the ground: BOOM, crunch, a long rumble, little stones bouncing
export function impact() {
  tone({ from: 70, to: 24, dur: 1.5, vol: 1, echo: true });                      // the deep boom
  tone({ type: 'triangle', from: 150, to: 40, dur: 0.5, vol: 0.6 });              // the punch
  noise({ filter: 'lowpass', from: 1400, to: 60, dur: 0.9, vol: 0.8 });           // crunch
  noise({ filter: 'lowpass', from: 220, to: 50, dur: 2.4, vol: 0.45, echo: true }); // rumble
  for (let i = 0; i < 10; i++) {                                                   // pebbles
    noise({ from: 2500 + Math.random() * 3000, q: 4, dur: 0.03, at: 0.15 + Math.random() * 0.9, vol: 0.2 });
  }
}

// The crash screen: a giant movie horn — BRAAAM — and then, of course, the sad trombone
export function crashSting() {
  [55, 82.4, 110].forEach((f) =>
    tone({ type: 'sawtooth', from: f, to: f * 0.98, dur: 2.2, vol: 0.3, hold: true, muffle: 700, grit: true, echo: true }));
  noise({ filter: 'lowpass', from: 400, to: 80, dur: 2, vol: 0.4 });
  const notes = [233, 220, 207.7, 196]; // wah wah wah waaah
  notes.forEach((f, i) => {
    const last = i === notes.length - 1;
    tone({ type: 'sawtooth', from: f, to: last ? f * 0.94 : f * 0.98, dur: last ? 1.2 : 0.38, at: 1.7 + i * 0.42,
      vol: 0.25, hold: true, muffle: 900, wobble: last ? 6 : 0, wobbleSpeed: 5 });
  });
}
// …a beep each second at the end of the countdown, and a low buzz for "goodbye."
export const beep = () => tone({ type: 'square', from: 880, dur: 0.08, vol: 0.07, muffle: 3000 });
export const goodbye = () => tone({ type: 'square', from: 220, to: 110, dur: 0.6, vol: 0.1, muffle: 1500, wobble: 8, wobbleSpeed: 20 });

// Back to life: a sparkle
export function sparkle() {
  [1047, 1319, 1568, 2093].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.25, at: i * 0.07, vol: 0.13 }));
}
