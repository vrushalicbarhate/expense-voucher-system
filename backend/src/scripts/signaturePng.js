// Generates a small PNG that looks like a handwritten squiggle. Used for demo
// data and tests so no binary fixtures need to be committed.
const zlib = require('zlib');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function makeSignaturePng(seed = 1, w = 280, h = 90) {
  const rows = [];
  const pixels = Array.from({ length: h }, () => new Uint8Array(w).fill(255));
  const freq = 0.06 + (seed % 5) * 0.012;
  for (let x = 10; x < w - 10; x++) {
    const t = x / w;
    const y = Math.round(h / 2 + Math.sin(x * freq) * 18 * (1 - t * 0.5) + Math.sin(x * freq * 2.7 + seed) * 6);
    for (let dy = -1; dy <= 1; dy++) {
      if (pixels[y + dy]) pixels[y + dy][x] = 25;
    }
  }
  for (const row of pixels) rows.push(Buffer.concat([Buffer.from([0]), Buffer.from(row)]));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 0; // 8-bit grayscale
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { makeSignaturePng };
