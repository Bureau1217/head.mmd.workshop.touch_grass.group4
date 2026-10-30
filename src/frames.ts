// ─────────────────────────────────────────────────────────────
// FRAMES — runs inside the embedded frames of a page (<iframe>s).
// Lots of places you type in are really a frame inside the page:
// Google Docs and Sheets, many editors, chat boxes, embedded forms…
// Browsy only lives in the main page (content.ts), so this tiny script
// just tells him whenever a key is pressed in here.
// ─────────────────────────────────────────────────────────────

// Keys that aren't typing: modifiers, and the ones you scroll / move around with
export const NOT_TYPING = ['Shift', 'Control', 'Alt', 'Meta', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'];

// Is this key press "typing"? (Holding a key down doesn't count either.)
export const isTyping = (e: KeyboardEvent) => !e.repeat && !NOT_TYPING.includes(e.key);

// Only inside a frame — in the main page, content.ts listens itself
if (window !== window.top) {
  addEventListener('keydown', (e) => {
    if (isTyping(e)) window.top?.postMessage({ browsy: 'key' }, '*'); // "a key was pressed in here"
  }, { capture: true, passive: true });
}
