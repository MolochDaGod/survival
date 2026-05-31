#!/usr/bin/env node
/**
 * convert-map-icons — decodes Farming Sim DDS (DXT5) map icons to PNG.
 *
 * Reads every *.dds under SRC_DIR, decodes BC3/DXT5 blocks inline (no native
 * tooling required), and writes a 64×64 sRGB PNG via `sharp` into
 * `public/icons/map/`. Skip-list filters out FS-specific filler icons that
 * don't fit the survival MMO world.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC_DIR = 'D:/Games/Models/maps/mapUS/mapIcons';
const OUT_DIR = 'public/icons/map';
const OUT_SIZE = 64;

const SKIP = new Set(['rollerCoaster', 'trainToGiantsSoftware']);

/** Rename FS-specific names to survival-MMO POI ids. */
const RENAME = {
  bga:                          'powerPlant',
  buyingStationLiquidManure:    'fertilizerBuyerLiquid',
  buyingStationManure:          'fertilizerBuyer',
  cementFactory:                'cementFactory',
  coopSilo:                     'granary',
  garbageCan:                   'trashPile',
  gasStation:                   'fuelDepot',
  grainRiverSilo:               'riverGranary',
  houseForSale:                 'shackForSale',
  ironFurnace:                  'smelter',
  ironOreMine:                  'oreMine',
  livestockMarket:              'livestockTrader',
  railroadStorageSilo:          'railSilo',
  sawmill:                      'lumberCamp',
  sellingStationVehicles:       'vehicleDealer',
  townDump:                     'scrapyard',
  trainStation:                 'railhead',
  weighStation:                 'weighPost',
};

// ── DXT5 decode ───────────────────────────────────────────────────────────────

function unpackRGB565(c) {
  const r = ((c >> 11) & 0x1f) * 255 / 31;
  const g = ((c >> 5)  & 0x3f) * 255 / 63;
  const b = ( c        & 0x1f) * 255 / 31;
  return [r | 0, g | 0, b | 0];
}

function decodeDxt5Block(src, off, dst, dstStride, x0, y0, w) {
  // Alpha
  const a0 = src[off], a1 = src[off + 1];
  const a = new Uint8Array(8);
  a[0] = a0; a[1] = a1;
  if (a0 > a1) {
    for (let i = 1; i < 7; i++) a[i + 1] = ((7 - i) * a0 + i * a1 + 3) / 7 | 0;
  } else {
    for (let i = 1; i < 5; i++) a[i + 1] = ((5 - i) * a0 + i * a1 + 2) / 5 | 0;
    a[6] = 0; a[7] = 255;
  }
  let aBits = 0n;
  for (let i = 0; i < 6; i++) aBits |= BigInt(src[off + 2 + i]) << BigInt(i * 8);

  // Color
  const c0 = src[off + 8] | (src[off + 9]  << 8);
  const c1 = src[off + 10] | (src[off + 11] << 8);
  const [r0, g0, b0] = unpackRGB565(c0);
  const [r1, g1, b1] = unpackRGB565(c1);
  const palR = [r0, r1, (2 * r0 + r1) / 3 | 0, (r0 + 2 * r1) / 3 | 0];
  const palG = [g0, g1, (2 * g0 + g1) / 3 | 0, (g0 + 2 * g1) / 3 | 0];
  const palB = [b0, b1, (2 * b0 + b1) / 3 | 0, (b0 + 2 * b1) / 3 | 0];
  const cBits = src[off + 12] | (src[off + 13] << 8) | (src[off + 14] << 16) | (src[off + 15] << 24);

  for (let py = 0; py < 4; py++) {
    for (let px = 0; px < 4; px++) {
      const idx = py * 4 + px;
      const ci = (cBits >>> (idx * 2)) & 0x3;
      const ai = Number((aBits >> BigInt(idx * 3)) & 0x7n);
      const x = x0 + px, y = y0 + py;
      if (x >= w) continue;
      const o = (y * dstStride + x) * 4;
      dst[o]     = palR[ci];
      dst[o + 1] = palG[ci];
      dst[o + 2] = palB[ci];
      dst[o + 3] = a[ai];
    }
  }
}

function decodeDxt5(buf) {
  if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== 'DDS ') throw new Error('not DDS');
  const w = buf.readInt32LE(16);
  const h = buf.readInt32LE(12);
  const fourcc = String.fromCharCode(buf[84], buf[85], buf[86], buf[87]);
  if (fourcc !== 'DXT5') throw new Error('unsupported fourcc: ' + fourcc);
  const dst = Buffer.alloc(w * h * 4);
  let off = 128;
  for (let by = 0; by < h; by += 4) {
    for (let bx = 0; bx < w; bx += 4) {
      decodeDxt5Block(buf, off, dst, w, bx, by, w);
      off += 16;
    }
  }
  return { data: dst, width: w, height: h };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = fs.readdirSync(SRC_DIR).filter((f) => f.toLowerCase().endsWith('.dds'));
  let ok = 0, skipped = 0;
  for (const f of files) {
    const stem = f.replace(/^mapIcon_/i, '').replace(/\.dds$/i, '');
    if (SKIP.has(stem)) { skipped++; continue; }
    const outId = RENAME[stem] ?? stem;
    const buf = fs.readFileSync(path.join(SRC_DIR, f));
    const { data, width, height } = decodeDxt5(buf);
    const outPath = path.join(OUT_DIR, outId + '.png');
    await sharp(data, { raw: { width, height, channels: 4 } })
      .resize(OUT_SIZE, OUT_SIZE, { kernel: 'lanczos3' })
      .png({ compressionLevel: 9 })
      .toFile(outPath);
    ok++;
    console.log(`  ${outId}.png (from ${f})`);
  }
  console.log(`\nDone: ${ok} converted, ${skipped} skipped.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
