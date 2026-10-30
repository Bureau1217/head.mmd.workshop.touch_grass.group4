// Draws Browsy's toolbar icons (a glowing green ball with two eyes) as PNG files.
// Run from the Grass_Plugin folder:  node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

// ── minimal PNG encoder ──
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, pixel) {
  const row = size * 4 + 1;
  const raw = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) raw.set(pixel(x, y, size), y * row + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits per channel
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Browsy ── (sampled 4×4 times per pixel for smooth edges)
function browsy(px, py, size) {
  let r = 0, g = 0, b = 0, a = 0;
  for (let sy = 0; sy < 4; sy++) {
    for (let sx = 0; sx < 4; sx++) {
      const x = ((px + (sx + 0.5) / 4) / size) * 2 - 1; // -1 … 1
      const y = ((py + (sy + 0.5) / 4) / size) * 2 - 1;
      const d = Math.hypot(x, y);
      const glow = d < 0.6 ? 1 : Math.max(0, 1 - (d - 0.6) / 0.4) ** 1.5;
      const eye = Math.hypot(Math.abs(x) - 0.3, (y + 0.1) * 1.3) < 0.13;
      const [cr, cg, cb] = eye ? [255, 255, 255] : [0, 225, 70];
      const ca = eye ? 1 : glow;
      r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
    }
  }
  return a === 0 ? [0, 0, 0, 0] : [r / a, g / a, b / a, (a / 16) * 255].map(Math.round);
}

for (const size of [16, 48, 128]) {
  writeFileSync(`public/icons/icon${size}.png`, png(size, browsy));
  console.log(`wrote public/icons/icon${size}.png`);
}
