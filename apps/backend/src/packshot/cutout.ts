import crypto from "crypto";
import sharp from "sharp";
import { BRIA_MODEL, type PackshotConfig } from "./config";
import { type FalRun, runFalRequest, toDataUri } from "./fal-queue";
import { detectObjectBase, lastDarkRow, scanBboxes } from "./normalize";

/**
 * Cutout of the product from its background, ported from Packshot Studio
 * (`lib/packshot/cutout.ts`). Two engines: `local` (flood fill of whiteness from
 * the frame edges, free) for near-white backgrounds and `bria` (Bria RMBG 2.0 on
 * fal.ai) for everything else. The output is always an RGBA PNG of the source size.
 */

export type CutoutEngine = "local" | "bria";

export class CutoutError extends Error {}

export type RingStats = {
  /** Darkest channel value found on the border ring. */
  ring_min: number;
  /** Share of the ring whose darkest channel is at least the white threshold, 0–100. */
  ring_white_pct: number;
};

/**
 * The border ring (`ring_pct` of the shorter side, at least 2 px) of the picture
 * flattened on white. Engine `auto` reads it: a ring that is white almost
 * everywhere means a product photographed on white, and the local flood fill
 * removes such a background exactly.
 */
export async function ringStats(input: Buffer, whiteThreshold: number, ringPct: number): Promise<RingStats> {
  const { data, info } = await sharp(input)
    .flatten({ background: "#ffffff" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const ring = Math.max(2, Math.round((Math.min(w, h) * ringPct) / 100));
  let min = 255;
  let white = 0;
  let total = 0;

  for (let y = 0; y < h; y++) {
    const inner = y >= ring && y < h - ring;

    for (let x = 0; x < w; x++) {
      if (inner && x >= ring && x < w - ring) {
        x = w - ring - 1;
        continue;
      }

      const i = (y * w + x) * c;
      const darkest = Math.min(data[i]!, data[i + 1]!, data[i + 2]!);

      if (darkest < min) min = darkest;
      if (darkest >= whiteThreshold) white++;
      total++;
    }
  }

  return { ring_min: min, ring_white_pct: Math.round((1000 * white) / total) / 10 };
}

/**
 * Local cutout for plain white backgrounds: a flood fill of "whiteness" FROM THE
 * FRAME EDGES (a pixel is white when min(R,G,B) ≥ `whiteThreshold`), 4-connected,
 * iterative BFS. A global threshold would not do, since white panels on a label are
 * not connected to the edges and must stay opaque. The alpha edge is feathered by a
 * blur of the mask alone (about 1–2 px), the object itself is not blurred.
 */
export async function cutoutLocal(input: Buffer, whiteThreshold: number): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const pixels = width * height;
  const mask = new Uint8Array(pixels).fill(255); // 255 = object, 0 = background

  const isWhite = (idx: number): boolean => {
    const i = idx * 4;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const darkest = r < g ? (r < b ? r : b) : g < b ? g : b;

    return darkest >= whiteThreshold;
  };

  const queue = new Int32Array(pixels);
  let head = 0;
  let tail = 0;
  const push = (idx: number): void => {
    if (mask[idx] === 0 || !isWhite(idx)) return;
    mask[idx] = 0;
    queue[tail++] = idx;
  };

  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }

  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }

  while (head < tail) {
    const idx = queue[head++]!;
    const x = idx % width;

    if (x > 0) push(idx - 1);
    if (x < width - 1) push(idx + 1);
    if (idx >= width) push(idx - width);
    if (idx < pixels - width) push(idx + width);
  }

  // `toColourspace("b-w")` keeps the blurred mask at one channel; without it sharp
  // expands a 1-channel raw to 3 on output and the indexing below drifts.
  const { data: feathered, info: featherInfo } = await sharp(Buffer.from(mask.buffer), {
    raw: { width, height, channels: 1 },
  })
    .blur(0.8)
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let idx = 0; idx < pixels; idx++) {
    const a = data[idx * 4 + 3]!;
    const f = feathered[idx * featherInfo.channels]!;
    data[idx * 4 + 3] = f < a ? f : a; // an alpha the source already had is never raised
  }

  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/**
 * Bria cutouts of this process, keyed by the sha256 of the picture sent. Bria RMBG
 * is not byte-deterministic on every picture (measured 2026-09-25 on a WB card,
 * `7272439422.jpg`: two calls, 41 521 of 10 497 600 bytes apart, up to 60 levels),
 * so the same source would give two different packshots. The cache makes a repeat
 * of the same source byte-identical and free until the backend restarts.
 */
const BRIA_CACHE_MAX_BYTES = 256 * 1024 * 1024;
const cacheStore = globalThis as unknown as { __upreadyBriaCutouts?: Map<string, Buffer> };
const briaCache: Map<string, Buffer> = (cacheStore.__upreadyBriaCutouts ??= new Map());

const remember = (key: string, png: Buffer) => {
  briaCache.delete(key);
  briaCache.set(key, png);

  let total = 0;

  for (const value of briaCache.values()) total += value.length;
  for (const [oldest, value] of briaCache) {
    if (total <= BRIA_CACHE_MAX_BYTES || oldest === key) break;
    briaCache.delete(oldest);
    total -= value.length;
  }
};

/** For the unit specs only. */
export const clearBriaCache = () => briaCache.clear();

/**
 * Cutout of any background through `fal-ai/bria/background/remove`. The source
 * goes as a `data:` URI (see `fal-queue.ts`), the answer comes back as bytes and
 * is brought to the source size if the provider returned another one. `run` is
 * null when the cutout came from the cache.
 */
export async function cutoutBria(
  input: Buffer,
  key: string,
  config: PackshotConfig,
): Promise<{ png: Buffer; run: FalRun | null }> {
  const cacheKey = `${BRIA_MODEL}:${crypto.createHash("sha256").update(input).digest("hex")}`;
  const cached = briaCache.get(cacheKey);

  if (cached) {
    return { png: cached, run: null };
  }

  const meta = await sharp(input).metadata();
  const run = await runFalRequest({
    key,
    model: BRIA_MODEL,
    input: { image_url: toDataUri(input, "image/png") },
    timeoutMs: config.fal.timeout_ms,
    pollMs: config.fal.poll_ms,
  });
  const output = run.outputs[0];

  if (!output) {
    throw new CutoutError("Bria returned no image.");
  }

  let png = await sharp(output.buffer).ensureAlpha().png().toBuffer();
  const out = await sharp(png).metadata();

  if (meta.width && meta.height && (out.width !== meta.width || out.height !== meta.height)) {
    png = await sharp(png).resize(meta.width, meta.height, { fit: "fill" }).png().toBuffer();
  }

  remember(cacheKey, png);
  return { png, run };
}

/** Square dilation of a 0/1 mask by `radius` pixels, separable. */
const dilate = (mask: Uint8Array, width: number, height: number, radius: number): Uint8Array => {
  const rows = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);

  for (let y = 0; y < height; y++) {
    const row = y * width;

    for (let x = 0; x < width; x++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;

        if (nx >= 0 && nx < width && mask[row + nx]) {
          rows[row + x] = 1;
          break;
        }
      }
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;

        if (ny >= 0 && ny < height && rows[ny * width + x]) {
          out[y * width + x] = 1;
          break;
        }
      }
    }
  }

  return out;
};

const median = (values: number[]): number => {
  values.sort((a, b) => a - b);

  return values[Math.floor(values.length / 2)] ?? 0;
};

export type ShadowCut = { row: number; method: "dark-base" | "width-bulge" } | null;

/**
 * Drops a shadow or a reflection that came with the cutout: everything below the
 * contact line becomes transparent, and shadow "wings" at the sides of the base are
 * clipped to the silhouette of the body. Ported from Packshot Studio with one change
 * for dark containers.
 *
 * 1. Dark container (`detectObjectBase` confirms a reflection). The contact line is
 *    the last row of the bottom 40 % that still has pixels darker than
 *    `thresholds.dark_base` inside the object's x-range; the dark-row candidate is
 *    only the fallback. The candidate alone cut 500 px of the body of Ivan's
 *    reference bottle (lead's measurement, 2026-09-25).
 * 2. Light container. A contact on white is invisible to the dark profile, but the
 *    contact shadow is WIDER than the body, so the base is the bottom of the bulge of
 *    the alpha-width profile.
 * Neither found, the cutout comes back untouched (the product is not damaged).
 */
export async function removeShadow(
  cutout: Buffer,
  thresholds: PackshotConfig["thresholds"],
): Promise<{ png: Buffer; cut: ShadowCut; reflectionDetected: boolean }> {
  const { data, info } = await sharp(cutout).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  // The dark profile reads a copy flattened on white, since the RGB under
  // transparent pixels of a Bria cutout may be black.
  const flat = await sharp(cutout).flatten({ background: "#ffffff" }).raw().toBuffer({ resolveWithObject: true });
  const { object } = scanBboxes(flat.data, width, height, flat.info.channels, thresholds.object, thresholds.shadow);

  if (!object) {
    throw new CutoutError("No product was found: the cutout is fully white or transparent.");
  }

  const awLeft = new Int32Array(height).fill(-1);
  const awRight = new Int32Array(height).fill(-1);
  let alphaTop = -1;
  let alphaBottom = -1;

  for (let y = 0; y < height; y++) {
    const row = y * width;

    for (let x = 0; x < width; x++) {
      if (data[(row + x) * 4 + 3]! < 128) continue;
      if (awLeft[y]! < 0) awLeft[y] = x;
      awRight[y] = x;
    }

    if (awLeft[y]! >= 0) {
      if (alphaTop < 0) alphaTop = y;
      alphaBottom = y;
    }
  }

  if (alphaBottom < 0) {
    throw new CutoutError("The cutout is fully transparent: there is no product to keep.");
  }

  const aw = (y: number): number => (awLeft[y]! < 0 ? 0 : awRight[y]! - awLeft[y]! + 1);
  const bboxH = alphaBottom - alphaTop + 1;
  const zoneStart = Math.max(alphaTop, alphaBottom - Math.floor(bboxH * 0.4) + 1);
  const refRows = Math.max(8, Math.floor(bboxH * 0.03));
  const refWidths: number[] = [];

  for (let y = Math.max(alphaTop, zoneStart - refRows); y < zoneStart; y++) refWidths.push(aw(y));

  const bodyWidth = refWidths.length ? median(refWidths) : aw(zoneStart);
  const { objBase, reflectionDetected } = detectObjectBase(
    flat.data,
    width,
    flat.info.channels,
    object,
    thresholds.contact,
  );

  let cutBase: number;
  let method: "dark-base" | "width-bulge";

  if (reflectionDetected) {
    // The dark-row candidate lands inside the body on some bottles and inside the
    // reflection on others; the last genuinely dark row of the bottom 40 % does not.
    const minPixels = Math.max(3, Math.round((object.maxX - object.minX + 1) * 0.005));
    const objectH = object.maxY - object.minY + 1;
    const dark = lastDarkRow(
      flat.data,
      width,
      flat.info.channels,
      object,
      object.maxY - Math.floor(objectH * 0.4) + 1,
      thresholds.dark_base,
      minPixels,
    );

    cutBase = dark >= 0 ? dark : objBase;
    method = "dark-base";
  } else {
    let maxAw = 0;

    for (let y = zoneStart; y <= alphaBottom; y++) if (aw(y) > maxAw) maxAw = aw(y);

    if (bodyWidth > 0 && maxAw >= bodyWidth * 1.06) {
      const nearMax = maxAw - Math.max(4, Math.round(maxAw * 0.005));

      cutBase = zoneStart;
      for (let y = zoneStart; y <= alphaBottom; y++) if (aw(y) >= nearMax) cutBase = y;
      method = "width-bulge";
    } else {
      return { png: cutout, cut: null, reflectionDetected };
    }
  }

  if (cutBase >= alphaBottom) {
    return { png: cutout, cut: null, reflectionDetected };
  }

  // Shadow wings: rows above the base where the alpha is wider than the body are
  // clamped to the body's silhouette.
  let wingStart = cutBase;

  while (wingStart - 1 >= zoneStart && aw(wingStart - 1) > bodyWidth * 1.02) wingStart--;

  if (cutBase - wingStart <= bboxH * 0.12 && wingStart > alphaTop) {
    const ls: number[] = [];
    const rs: number[] = [];

    for (let y = Math.max(alphaTop, wingStart - refRows); y < wingStart; y++) {
      if (awLeft[y]! >= 0) {
        ls.push(awLeft[y]!);
        rs.push(awRight[y]!);
      }
    }

    if (ls.length) {
      const bodyL = median(ls);
      const bodyR = median(rs);

      for (let y = wingStart; y <= Math.min(cutBase, height - 1); y++) {
        const row = y * width;

        for (let x = 0; x < width; x++) {
          if (x >= bodyL && x <= bodyR) continue;
          data[(row + x) * 4 + 3] = 0;
        }
      }
    }
  }

  const FEATHER = 2; // rows of fading alpha under the base, so the cut leaves no hard line

  for (let y = cutBase + 1; y < height; y++) {
    const below = y - cutBase;
    const keep = below > FEATHER ? 0 : 1 - below / (FEATHER + 1);
    const row = y * width;

    for (let x = 0; x < width; x++) {
      const i = (row + x) * 4 + 3;
      data[i] = keep === 0 ? 0 : Math.round(data[i]! * keep);
    }
  }

  return {
    png: await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer(),
    cut: { row: cutBase, method },
    reflectionDetected,
  };
}

/**
 * Removes specks: opaque islands (alpha ≥ 128, 4-connected) smaller than
 * `minShare` of the largest one, together with their feathered rim. A stray badge
 * fragment or a letter Bria kept would otherwise stretch the bbox and shrink the
 * product on the canvas. A second real object (a box next to its jar) is far above
 * the share and stays.
 */
export async function dropSpecks(
  cutout: Buffer,
  minShare = 0.015,
): Promise<{ png: Buffer; removed: number; main_share: number; clutter_share: number }> {
  const { data, info } = await sharp(cutout).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const pixels = width * height;
  const label = new Int32Array(pixels);
  const areas: number[] = [0];
  const queue = new Int32Array(pixels);

  for (let start = 0; start < pixels; start++) {
    if (label[start] !== 0 || data[start * 4 + 3]! < 128) continue;

    const id = areas.length;
    let head = 0;
    let tail = 0;
    let area = 0;

    label[start] = id;
    queue[tail++] = start;

    while (head < tail) {
      const idx = queue[head++]!;
      const x = idx % width;
      area++;

      const visit = (n: number) => {
        if (label[n] === 0 && data[n * 4 + 3]! >= 128) {
          label[n] = id;
          queue[tail++] = n;
        }
      };

      if (x > 0) visit(idx - 1);
      if (x < width - 1) visit(idx + 1);
      if (idx >= width) visit(idx - width);
      if (idx < pixels - width) visit(idx + width);
    }

    areas.push(area);
  }

  const largest = Math.max(0, ...areas);
  const opaque = areas.reduce((sum, area) => sum + area, 0);
  // Share of the opaque area in the largest island: near 1 for a product on white,
  // far below it for a card with figures and text around the product.
  const mainShare = opaque ? Math.round((largest / opaque) * 1000) / 1000 : 0;
  // Share of the opaque area in islands under a fifth of the largest one: letters,
  // icons and figures around the product. A second real object (a tube next to its
  // box) is larger than that and does not count.
  const clutter = areas.reduce((sum, area) => (area < largest * 0.2 ? sum + area : sum), 0);
  const clutterShare = opaque ? Math.round((clutter / opaque) * 1000) / 1000 : 0;
  const dropped = new Set<number>();

  for (let id = 1; id < areas.length; id++) {
    if (areas[id]! < largest * minShare) dropped.add(id);
  }

  if (dropped.size === 0) {
    return { png: cutout, removed: 0, main_share: mainShare, clutter_share: clutterShare };
  }

  // A dropped speck goes with its feathered rim (alpha under 128 within 3 px of it).
  // Semi-transparent parts of the product itself, glass for one, are left alone.
  const RIM = 3;
  const keptNear = dilate(
    Uint8Array.from(label, (id) => (id > 0 && !dropped.has(id) ? 1 : 0)),
    width,
    height,
    RIM,
  );
  const droppedNear = dilate(
    Uint8Array.from(label, (id) => (dropped.has(id) ? 1 : 0)),
    width,
    height,
    RIM,
  );

  for (let idx = 0; idx < pixels; idx++) {
    const own = label[idx]!;

    if (dropped.has(own) || (own === 0 && droppedNear[idx] && !keptNear[idx])) {
      data[idx * 4 + 3] = 0;
    }
  }

  return {
    png: await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer(),
    removed: dropped.size,
    main_share: mainShare,
    clutter_share: clutterShare,
  };
}
