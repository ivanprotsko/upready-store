import crypto from "crypto";
import sharp from "sharp";

/**
 * Read-only measurement of a finished packshot, the acceptance instrument
 * (`scripts/packshot/measure.mjs` prints it). It reads the picture alone, never
 * the pipeline's meta, so it checks the placement rather than repeating it.
 *
 * The base line comes from the synthetic shadow. The ellipse is centred on the
 * contact line and is wider than the object (width ratio 1.15), so a few columns at
 * each side of the object hold nothing but shadow, and in those columns the shadow
 * is symmetric about its centre row. The median midpoint of those runs is the
 * contact line, whatever the colour of the product (a white jar on white included).
 * A picture without a shadow falls back to its last non-white row.
 *
 * Definitions: `base_row` is the last row of the object (0-based), `base_pct` is
 * `(base_row + 1) / height × 100`, the share of the height above the contact line.
 */

export type PackshotMeasure = {
  width: number;
  height: number;
  ring_min: number;
  base_row: number;
  base_pct: number;
  method: "shadow-midline" | "last-row" | "empty";
  /** Bbox of the pixels darker than 250 above the contact line, `[minX, minY, maxX, maxY]`. */
  bbox: [number, number, number, number] | null;
  /** Pixels more than 2 rows below the base that a neutral shadow cannot explain (a reflection would). */
  below_base_foreign: number;
  sha256: string;
};

const NON_WHITE = 253;
const OBJECT = 250;

export async function measurePackshot(
  file: Buffer,
  { shadowOpacity = 0.35 }: { shadowOpacity?: number } = {},
): Promise<PackshotMeasure> {
  const sha256 = crypto.createHash("sha256").update(file).digest("hex");
  const { data, info } = await sharp(file).flatten({ background: "#ffffff" }).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const at = (x: number, y: number) => (y * w + x) * c;
  const minOf = (i: number) => Math.min(data[i]!, data[i + 1]!, data[i + 2]!);
  const chromaOf = (i: number) => Math.max(data[i]!, data[i + 1]!, data[i + 2]!) - minOf(i);

  const ring = Math.max(2, Math.round(Math.min(w, h) * 0.01));
  let ringMin = 255;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y >= ring && y < h - ring && x >= ring && x < w - ring) {
        x = w - ring - 1;
        continue;
      }

      ringMin = Math.min(ringMin, minOf(at(x, y)));
    }
  }

  const first = new Int32Array(w).fill(-1);
  const last = new Int32Array(w).fill(-1);
  const count = new Int32Array(w);
  const neutral = new Uint8Array(w).fill(1);

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = at(x, y);

      if (minOf(i) >= NON_WHITE) continue;
      if (first[x]! < 0) first[x] = y;
      last[x] = y;
      count[x]!++;
      if (chromaOf(i) > 3) neutral[x] = 0;
    }
  }

  let bottom = -1;

  for (let x = 0; x < w; x++) bottom = Math.max(bottom, last[x]!);

  if (bottom < 0) {
    return { width: w, height: h, ring_min: ringMin, base_row: -1, base_pct: 0, method: "empty", bbox: null, below_base_foreign: 0, sha256 };
  }

  // Shadow-only columns: one short, contiguous, neutral run near the bottom.
  const midpoints: number[] = [];

  for (let x = 0; x < w; x++) {
    if (first[x]! < 0 || !neutral[x]) continue;

    const run = last[x]! - first[x]! + 1;

    if (run > h * 0.1 || run < 3 || count[x] !== run || last[x]! < bottom - h * 0.1) continue;
    midpoints.push((first[x]! + last[x]! + 1) / 2);
  }

  let baseRow: number;
  let method: PackshotMeasure["method"];

  if (midpoints.length >= 3) {
    midpoints.sort((a, b) => a - b);
    baseRow = Math.round(midpoints[Math.floor(midpoints.length / 2)]!) - 1;
    method = "shadow-midline";
  } else {
    baseRow = bottom;
    method = "last-row";
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y <= Math.min(baseRow, h - 1); y++) {
    for (let x = 0; x < w; x++) {
      if (minOf(at(x, y)) >= OBJECT) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // The shadow over white is neutral and never darker than 255 × (1 − opacity).
  const floor = 255 * (1 - shadowOpacity) - 6;
  let foreign = 0;

  for (let y = baseRow + 3; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = at(x, y);
      const m = minOf(i);

      if (m >= NON_WHITE) continue;
      if (chromaOf(i) > 6 || m < floor) foreign++;
    }
  }

  return {
    width: w,
    height: h,
    ring_min: ringMin,
    base_row: baseRow,
    base_pct: Math.round(((baseRow + 1) / h) * 100000) / 1000,
    method,
    bbox: maxX < 0 ? null : [minX, minY, maxX, maxY],
    below_base_foreign: foreign,
    sha256,
  };
}
