#!/usr/bin/env node
/**
 * diff.mjs — pixel diff between two PNGs.
 *
 * Usage: node scripts/diff.mjs <a.png> <b.png>
 * Prints {"diffPct": number, "w": number, "h": number} to stdout.
 * If the two images differ in size, the smaller one is zero-padded
 * (top-left aligned) to the larger's dimensions and a "note" field says so.
 */

import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

function pad(png, w, h) {
  if (png.width === w && png.height === h) return png;
  const out = new PNG({ width: w, height: h });
  out.data.fill(0);
  PNG.bitblt(png, out, 0, 0, png.width, png.height, 0, 0);
  return out;
}

function main() {
  const [aPath, bPath] = process.argv.slice(2);
  if (!aPath || !bPath) {
    throw new Error("usage: node scripts/diff.mjs <a.png> <b.png>");
  }

  const a = PNG.sync.read(readFileSync(aPath));
  const b = PNG.sync.read(readFileSync(bPath));

  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  const sizeDiffers = a.width !== b.width || a.height !== b.height;

  const aPadded = pad(a, w, h);
  const bPadded = pad(b, w, h);
  const outDiff = new PNG({ width: w, height: h });

  const diffPixels = pixelmatch(aPadded.data, bPadded.data, outDiff.data, w, h, {
    threshold: 0.1,
  });

  const totalPixels = w * h;
  const diffPct = totalPixels === 0 ? 0 : (diffPixels / totalPixels) * 100;

  const result = { diffPct: Number(diffPct.toFixed(4)), w, h };
  if (sizeDiffers) {
    result.note = `size mismatch: ${aPath} ${a.width}x${a.height} vs ${bPath} ${b.width}x${b.height}, padded to ${w}x${h}`;
  }

  console.log(JSON.stringify(result));
}

main();
