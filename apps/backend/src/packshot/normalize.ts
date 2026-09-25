import sharp from "sharp";
import type { PackshotConfig } from "./config";

/**
 * Normalisation onto the 3:4 canvas, ported from Packshot Studio
 * (`lib/packshot/normalize.ts`). Two things changed on the way.
 *
 * - The input is the cutout (RGBA), not a flattened render, so the object is its
 *   alpha, not "everything darker than 245". Shadow and reflection are already
 *   gone (`removeShadow`), so the lowest opaque row IS the contact line.
 * - The contact shadow is drawn after this step, at output scale (`shadow.ts`).
 *   Its geometry then never depends on the source resolution and is never
 *   resampled, which keeps it identical across products.
 */

export class NormalizeError extends Error {}

export type Bbox = { minX: number; minY: number; maxX: number; maxY: number };

const darkestOf = (data: Buffer, i: number): number => {
  const r = data[i]!;
  const g = data[i + 1]!;
  const b = data[i + 2]!;

  return r < g ? (r < b ? r : b) : g < b ? g : b;
};

/**
 * Object bbox (threshold `objectThr`) over the whole image; shadow bbox
 * (threshold `shadowThr`) only from the object's top down, since a shadow is
 * never above the object. Ported as is.
 */
export function scanBboxes(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  objectThr: number,
  shadowThr: number,
): { object: Bbox | null; shadow: Bbox | null } {
  const empty = (): Bbox => ({ minX: Infinity, minY: Infinity, maxX: -1, maxY: -1 });
  const obj = empty();

  for (let y = 0; y < height; y++) {
    const row = y * width * channels;

    for (let x = 0; x < width; x++) {
      if (darkestOf(data, row + x * channels) >= objectThr) continue;
      if (x < obj.minX) obj.minX = x;
      if (x > obj.maxX) obj.maxX = x;
      if (y < obj.minY) obj.minY = y;
      if (y > obj.maxY) obj.maxY = y;
    }
  }

  if (obj.maxX < 0) return { object: null, shadow: null };

  const sh = empty();

  for (let y = obj.minY; y < height; y++) {
    const row = y * width * channels;

    for (let x = 0; x < width; x++) {
      if (darkestOf(data, row + x * channels) >= shadowThr) continue;
      if (x < sh.minX) sh.minX = x;
      if (x > sh.maxX) sh.maxX = x;
      if (y < sh.minY) sh.minY = y;
      if (y > sh.maxY) sh.maxY = y;
    }
  }

  return { object: obj, shadow: sh.maxX >= 0 ? sh : null };
}

/**
 * Contact line of a dark container with a mirror reflection under it, ported
 * from Packshot Studio. The candidate is the row with the most pixels darker
 * than `contactThr` in the bottom 40 % of the bbox (the lower one on a tie).
 * A reflection is confirmed by two signs together: dark rows continue for more
 * than 3 % of the bbox below the candidate, and the last dark row sits more than
 * 3 % above the bbox bottom (the fading tail of a reflection).
 *
 * The candidate alone can land inside the body of the bottle (measured by the
 * lead on Ivan's shadow reference, 500 px too high on a 4800 px frame), so the
 * caller moves the cut down to the last row that is still genuinely dark
 * (`lastDarkRow`).
 */
export function detectObjectBase(
  data: Buffer,
  width: number,
  channels: number,
  object: Bbox,
  contactThr: number,
): { objBase: number; reflectionDetected: boolean } {
  const bboxH = object.maxY - object.minY + 1;
  const profileStart = object.minY + Math.floor(bboxH / 2);
  const rowDark: number[] = [];

  for (let y = profileStart; y <= object.maxY; y++) {
    const row = y * width * channels;
    let count = 0;

    for (let x = object.minX; x <= object.maxX; x++) {
      if (darkestOf(data, row + x * channels) < contactThr) count++;
    }

    rowDark[y - profileStart] = count;
  }

  const zoneStart = Math.max(profileStart, object.maxY - Math.floor(bboxH * 0.4) + 1);
  let candidate = object.maxY;
  let best = -1;

  for (let y = zoneStart; y <= object.maxY; y++) {
    const count = rowDark[y - profileStart]!;

    if (count >= best) {
      best = count;
      candidate = y;
    }
  }

  let darkRowsBelow = 0;

  for (let y = candidate + 1; y <= object.maxY; y++) {
    if (rowDark[y - profileStart]! > 0) darkRowsBelow++;
  }

  let lastDark = profileStart;

  for (let y = object.maxY; y >= profileStart; y--) {
    if (rowDark[y - profileStart]! > 0) {
      lastDark = y;
      break;
    }
  }

  const fadeTail = object.maxY - lastDark;
  const reflectionDetected = darkRowsBelow > bboxH * 0.03 && fadeTail > bboxH * 0.03;

  return { objBase: reflectionDetected ? candidate : object.maxY, reflectionDetected };
}

/**
 * The last row between `fromY` and `object.maxY` that still holds at least
 * `minPixels` pixels darker than `darkThr` inside the object's x-range, or -1.
 */
export function lastDarkRow(
  data: Buffer,
  width: number,
  channels: number,
  object: Bbox,
  fromY: number,
  darkThr: number,
  minPixels: number,
): number {
  for (let y = object.maxY; y >= fromY; y--) {
    const row = y * width * channels;
    let count = 0;

    for (let x = object.minX; x <= object.maxX; x++) {
      if (darkestOf(data, row + x * channels) < darkThr && ++count >= minPixels) return y;
    }
  }

  return -1;
}

/** Bbox of the pixels whose alpha is at least `minAlpha` (RGBA raw). */
export function alphaBbox(data: Buffer, width: number, height: number, minAlpha = 16): Bbox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const row = y * width;

    for (let x = 0; x < width; x++) {
      if (data[(row + x) * 4 + 3]! < minAlpha) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

export type Placement = {
  /** RGBA canvas of `canvas` size, the object alone on a transparent ground. */
  png: Buffer;
  canvas: [number, number];
  scale: number;
  /** Object bbox in the source cutout, `[minX, minY, maxX, maxY]`. */
  source_bbox: [number, number, number, number];
  /** Where the object landed on the canvas, `[left, top, width, height]` in pixels. */
  placed: [number, number, number, number];
  /** Canvas row of the pixel edge the base stands on (`round(H × baseline_pct / 100)`). */
  baseline: number;
};

/**
 * Crops the cutout to its alpha bbox, scales it by the tighter of the safe area's
 * width and height, and pastes it with the object centred on X and its lowest
 * opaque row ending exactly on the baseline.
 */
export async function placeOnCanvas(cutout: Buffer, config: PackshotConfig): Promise<Placement> {
  const { width: W, height: H } = config.canvas;
  const sa = config.safe_area;
  const { data, info } = await sharp(cutout).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const box = alphaBbox(data, info.width, info.height);

  if (!box) {
    throw new NormalizeError("The cutout is fully transparent: no product was found in the picture.");
  }

  const objW = box.maxX - box.minX + 1;
  const objH = box.maxY - box.minY + 1;
  const saLeft = (W * sa.margin_left_pct) / 100;
  const saRight = W - (W * sa.margin_right_pct) / 100;
  const saTop = (H * sa.margin_top_pct) / 100;
  const baseline = Math.round((H * sa.baseline_pct) / 100);

  // Tall objects meet the height of the safe area, wide ones its width.
  const scale = Math.min((saRight - saLeft) / objW, (baseline - saTop) / objH);
  const scaledW = Math.max(1, Math.round(objW * scale));
  const scaledH = Math.max(1, Math.round(objH * scale));

  const scaled = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: box.minX, top: box.minY, width: objW, height: objH })
    .resize(scaledW, scaledH, { kernel: "lanczos3", fit: "fill" })
    .png()
    .toBuffer();

  const left = Math.round(W / 2 - scaledW / 2);
  const top = baseline - scaledH;

  if (left < 0 || top < 0 || left + scaledW > W) {
    throw new NormalizeError("The product does not fit the canvas; check the PACKSHOT_* safe area settings.");
  }

  const png = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: scaled, left, top }])
    .png()
    .toBuffer();

  return {
    png,
    canvas: [W, H],
    scale: Math.round(scale * 10000) / 10000,
    source_bbox: [box.minX, box.minY, box.maxX, box.maxY],
    placed: [left, top, scaledW, scaledH],
    baseline,
  };
}
