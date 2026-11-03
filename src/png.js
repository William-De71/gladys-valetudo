// -----------------------------------------------------------------------------
// A minimal PNG encoder: 8-bit indexed color, one palette entry may be
// transparent. Enough for the map image of the widget, without an image
// library in the container (node:zlib does the compression).
// -----------------------------------------------------------------------------

import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

/**
 * @description Encode an indexed image.
 * @param {object} image - The image.
 * @param {number} image.width - Width in pixels.
 * @param {number} image.height - Height in pixels.
 * @param {Uint8Array} image.pixels - Palette index of each pixel, row by row.
 * @param {Array<[number, number, number]>} image.palette - RGB colors (256 at most).
 * @param {number} [image.transparent] - Index of the transparent color.
 * @returns {Buffer} The PNG file.
 */
export function encodePng({ width, height, pixels, palette, transparent }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 3; // indexed color
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0; // filter: none
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('PLTE', Buffer.from(palette.flat())),
  ];
  if (Number.isInteger(transparent)) {
    const alpha = Buffer.alloc(transparent + 1, 255);
    alpha[transparent] = 0;
    parts.push(chunk('tRNS', alpha));
  }
  parts.push(chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}
