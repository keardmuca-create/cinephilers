import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// Red "C" on a white rounded square — the brand favicon.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#ffffff"/>
  <text x="50" y="50" text-anchor="middle" dominant-baseline="central" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="78" fill="hsl(348,83%,47%)">C</text>
</svg>`;

const buf = Buffer.from(svg);

async function png(size) {
  return sharp(buf, { density: 384 }).resize(size, size).png().toBuffer();
}

function buildIco(images) {
  // images: [{ size, data }]
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  const datas = [];
  images.forEach((img, i) => {
    const d = dir.subarray(i * 16, i * 16 + 16);
    d.writeUInt8(img.size >= 256 ? 0 : img.size, 0); // width
    d.writeUInt8(img.size >= 256 ? 0 : img.size, 1); // height
    d.writeUInt8(0, 2); // palette
    d.writeUInt8(0, 3); // reserved
    d.writeUInt16LE(1, 4); // planes
    d.writeUInt16LE(32, 6); // bpp
    d.writeUInt32LE(img.data.length, 8); // size
    d.writeUInt32LE(offset, 12); // offset
    offset += img.data.length;
    datas.push(img.data);
  });
  return Buffer.concat([header, dir, ...datas]);
}

async function main() {
  // PWA / apple icons
  const sizes = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 };
  for (const [name, size] of Object.entries(sizes)) {
    const data = await png(size);
    await writeFile(path.join(ROOT, 'public', name), data);
    console.log('wrote public/' + name);
  }

  // favicon.ico (16/32/48 embedded PNGs)
  const icoImgs = await Promise.all([16, 32, 48].map(async (s) => ({ size: s, data: await png(s) })));
  const ico = buildIco(icoImgs);
  await writeFile(path.join(ROOT, 'src', 'app', 'favicon.ico'), ico);
  console.log('wrote src/app/favicon.ico');
}

main().catch((e) => { console.error(e); process.exit(1); });
