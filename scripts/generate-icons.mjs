import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const BRAND = [40, 100, 90, 255];
const WHITE = [255, 255, 255, 255];

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function render(size, inset = 0, squareBackground = false) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = size / 512;
  const safeInset = Math.round(inset * size);
  const iconBounds = { left: safeInset, top: safeInset, right: size - safeInset, bottom: size - safeInset };
  const outerA = [[0.22, 0.76], [0.41, 0.24], [0.59, 0.24], [0.78, 0.76]];
  const innerA = [[0.39, 0.60], [0.50, 0.37], [0.61, 0.60]];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const centeredX = (x + 0.5) / size;
      const centeredY = (y + 0.5) / size;
      const edgeX = Math.max(0, Math.abs(x + 0.5 - size / 2) - (size / 2 - 112 * scale));
      const edgeY = Math.max(0, Math.abs(y + 0.5 - size / 2) - (size / 2 - 112 * scale));
      const isOutsideRoundedSquare = !squareBackground
        && edgeX * edgeX + edgeY * edgeY > (112 * scale) ** 2;
      let color = isOutsideRoundedSquare ? [0, 0, 0, 0] : BRAND;
      if (!isOutsideRoundedSquare
        && x >= iconBounds.left && x < iconBounds.right
        && y >= iconBounds.top && y < iconBounds.bottom) {
        const outer = insidePolygon(centeredX, centeredY, outerA);
        const inner = insidePolygon(centeredX, centeredY, innerA);
        const crossbar = centeredX >= 0.34 && centeredX <= 0.66 && centeredY >= 0.58 && centeredY <= 0.67;
        if ((outer && !inner) || crossbar) color = WHITE;
      }
      const offset = (y * size + x) * 4;
      pixels.set(color, offset);
    }
  }

  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    rows[rowStart] = 0;
    pixels.copy(rows, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function writeIco(filename, sizes) {
  const images = sizes.map((size) => render(size));
  const directory = Buffer.alloc(6 + sizes.length * 16);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(sizes.length, 4);
  let offset = directory.length;
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16;
    directory[entry] = size === 256 ? 0 : size;
    directory[entry + 1] = size === 256 ? 0 : size;
    directory[entry + 2] = 0;
    directory[entry + 3] = 0;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(images[index].length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += images[index].length;
  });
  await writeFile(path.join(publicDirectory, filename), Buffer.concat([directory, ...images]));
}

await mkdir(publicDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(publicDirectory, 'icon-192.png'), render(192, 0, true)),
  writeFile(path.join(publicDirectory, 'icon-512.png'), render(512, 0, true)),
  writeFile(path.join(publicDirectory, 'icon-maskable-512.png'), render(512, 0.1, true)),
  writeFile(path.join(publicDirectory, 'apple-touch-icon.png'), render(180, 0, true)),
  writeIco('favicon.ico', [16, 32, 48]),
]);
console.log('آیکون‌های PWA و favicon ساخته شدند.');
