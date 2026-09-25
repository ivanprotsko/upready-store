import crypto from "crypto";
import sharp from "sharp";
import {
  BRIA_MODEL,
  PRICE_USD,
  RERENDER_MODEL,
  RERENDER_RESOLUTION,
  type PackshotConfig,
  packshotConfig,
} from "./config";
import { type CutoutEngine, cutoutBria, cutoutLocal, dropSpecks, removeShadow, ringStats, type RingStats, type ShadowCut } from "./cutout";
import { FalError, runFalRequest, toDataUri } from "./fal-queue";
import { alphaBbox, placeOnCanvas } from "./normalize";
import { buildRerenderPrompt } from "./prompt";
import { composeOnWhite } from "./shadow";

/**
 * `runPackshot({ source, options }) → { png, meta }` (t-2026-09-25-n17).
 *
 * Everything that has to be identical across products is computed, not generated:
 * the cutout, the synthetic contact shadow and the placement of the base at
 * `baseline_pct` of a 3:4 canvas on white. The generative model appears only in
 * `mode: "rerender"` (the Packshot Studio behaviour, labelled «форма может
 * измениться» in the panel), and even then its render goes through the same local
 * cutout, shadow and placement, so the base line and the shadow stay deterministic.
 */

export type PackshotOptions = {
  engine: "auto" | CutoutEngine;
  shadow: boolean;
  mode: "exact" | "rerender";
};

export type PackshotStep = "decode" | "rerender" | "cutout" | "clean" | "normalize" | "shadow" | "encode";

export type PackshotMeta = {
  engine_used: CutoutEngine;
  mode: PackshotOptions["mode"];
  shadow: boolean;
  model_ids: string[];
  fal_request_ids: string[];
  source_sha256: string;
  result_sha256: string;
  /** Object on the canvas, `[minX, minY, maxX, maxY]`. */
  object_bbox: [number, number, number, number];
  /** Last canvas row of the object (0-based). */
  base_row: number;
  /** `(base_row + 1) / canvas height × 100`. */
  base_pct: number;
  canvas: [number, number];
  /** A mirror reflection under the product in the picture that was cut out (the render in `rerender`). */
  reflection_detected_in_source: boolean;
  source_ring: RingStats;
  shadow_cut: ShadowCut;
  specks_removed: number;
  /** Share of the cutout's opaque area in its largest island, before specks were removed. */
  main_share: number;
  /** Share of the opaque area in islands under a fifth of the largest (letters, icons, figures). */
  clutter_share: number;
  /** The Bria cutout came from this process's cache (same source seen before), no call was made. */
  cutout_cached: boolean;
  /** Why engine auto left the flood fill for bria, when it did. */
  auto_fallback: string | null;
  scale: number;
  timings_ms: Partial<Record<PackshotStep, number>> & { total: number };
  cost_usd_estimate: number;
};

export class PackshotError extends Error {
  constructor(
    message: string,
    /** `missing_key` answers HTTP 409 in the API; the rest are failures of a running job. */
    readonly code: "missing_key" | "bad_source" | "engine_failed" | "timeout" | "no_object",
  ) {
    super(message);
  }
}

export const MISSING_KEY_MESSAGE =
  "The fal.ai key is not configured on the server (FAL_KEY), so the bria engine and the re-render are unavailable. Pick the local engine for a photo on white, or ask the platform administrator to set the key.";

/**
 * Engine auto falls back from local to bria when more of the opaque area than this
 * lies in small islands around the product (letters, icons, figures). Measured
 * 2026-09-25: two tubes and a box on white 0.002, Ivan's studio renders 0 and 0.012,
 * an infographic card on white 0.429.
 */
const AUTO_MAX_CLUTTER_SHARE = 0.15;

/** Longest side a source is worked at. Larger photos are scaled down first. */
const MAX_SOURCE_SIDE = 4096;

/** Decodes any supported picture into an upright 8-bit sRGB PNG, the one form every step reads. */
export async function prepareSource(source: Buffer): Promise<Buffer> {
  try {
    return await sharp(source, { failOn: "error" })
      .rotate()
      .resize(MAX_SOURCE_SIDE, MAX_SOURCE_SIDE, { fit: "inside", withoutEnlargement: true })
      .toColourspace("srgb")
      .png()
      .toBuffer();
  } catch {
    throw new PackshotError("The picture could not be read. Use a JPEG, PNG, WebP or AVIF image.", "bad_source");
  }
}

export type PackshotPlan = {
  /** The engine the cutout of the SOURCE would use in `exact` mode. */
  engine: CutoutEngine;
  mode: PackshotOptions["mode"];
  needs_fal: boolean;
  ring: RingStats;
  source: { width: number; height: number };
  canvas: [number, number];
  baseline_row: number;
  baseline_pct: number;
};

/** Every decision taken before any pixel is generated: what `--dry-run` prints and what the API checks before a 202. */
export async function planPackshot(
  prepared: Buffer,
  options: PackshotOptions,
  config: PackshotConfig = packshotConfig(),
): Promise<PackshotPlan> {
  const ring = await ringStats(prepared, config.cutout.white_threshold, config.cutout.ring_pct);
  const meta = await sharp(prepared).metadata();
  const engine: CutoutEngine =
    options.engine === "auto" ? (ring.ring_white_pct >= config.cutout.auto_ring_white_pct ? "local" : "bria") : options.engine;
  const baseline = Math.round((config.canvas.height * config.safe_area.baseline_pct) / 100);

  return {
    engine,
    mode: options.mode,
    needs_fal: options.mode === "rerender" || engine === "bria",
    ring,
    source: { width: meta.width ?? 0, height: meta.height ?? 0 },
    canvas: [config.canvas.width, config.canvas.height],
    baseline_row: baseline - 1,
    baseline_pct: Math.round((baseline / config.canvas.height) * 100000) / 1000,
  };
}

const sha256 = (buffer: Buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

const failFal = (err: unknown): never => {
  if (err instanceof PackshotError) throw err;

  const message = err instanceof Error ? err.message : String(err);

  if (err instanceof FalError && / after \d+ s$/.test(message)) {
    throw new PackshotError(`The image service did not answer in time. ${message}`, "timeout");
  }

  throw new PackshotError(`The image service failed. ${message}`, "engine_failed");
};

export async function runPackshot({
  source,
  options,
  falKey,
  onStep,
  config = packshotConfig(),
}: {
  source: Buffer;
  options: PackshotOptions;
  falKey?: string;
  /** Called when a step starts, with a progress share 0–100 for the panel. */
  onStep?: (step: PackshotStep, progress: number) => void;
  config?: PackshotConfig;
}): Promise<{ png: Buffer; meta: PackshotMeta }> {
  const t0 = Date.now();
  const timings: Partial<Record<PackshotStep, number>> = {};
  let mark = Date.now();
  const step = (name: PackshotStep, progress: number) => {
    onStep?.(name, progress);
    mark = Date.now();
    return () => {
      timings[name] = (timings[name] ?? 0) + Date.now() - mark;
    };
  };

  const models: string[] = [];
  let cutoutCached = false;
  const requestIds: string[] = [];
  let cost = 0;

  let done = step("decode", 5);
  const prepared = await prepareSource(source);
  const plan = await planPackshot(prepared, options, config);
  done();

  if (plan.needs_fal && !falKey) {
    throw new PackshotError(MISSING_KEY_MESSAGE, "missing_key");
  }

  // The picture the cutout reads: the source itself, or its re-render on white.
  let cutFrom = prepared;
  let engine = plan.engine;
  let ring = plan.ring;

  if (options.mode === "rerender") {
    done = step("rerender", 10);

    const seed = parseInt(sha256(prepared).slice(0, 8), 16) & 0x7fffffff;
    const run = await runFalRequest({
      key: falKey!,
      model: RERENDER_MODEL,
      input: {
        prompt: buildRerenderPrompt(),
        image_urls: [toDataUri(prepared, "image/png")],
        aspect_ratio: "3:4",
        resolution: RERENDER_RESOLUTION,
        output_format: "png",
        num_images: 1,
        seed,
      },
      timeoutMs: config.fal.timeout_ms,
      pollMs: config.fal.poll_ms,
    }).catch(failFal);

    models.push(RERENDER_MODEL);
    requestIds.push(run.requestId);
    cost += PRICE_USD[RERENDER_MODEL] ?? 0;
    cutFrom = await prepareSource(run.outputs[0]!.buffer);
    done();

    // The render is meant to be on white; the cutout engine is chosen on the render.
    const renderPlan = await planPackshot(cutFrom, { ...options, mode: "exact" }, config);
    engine = renderPlan.engine;
    ring = renderPlan.ring;
  }

  done = step("cutout", options.mode === "rerender" ? 55 : 20);

  const bria = async (from: Buffer): Promise<Buffer> => {
    if (!falKey) throw new PackshotError(MISSING_KEY_MESSAGE, "missing_key");

    const { png, run } = await cutoutBria(from, falKey, config).catch(failFal);

    models.push(BRIA_MODEL);

    if (run) {
      requestIds.push(run.requestId);
      cost += PRICE_USD[BRIA_MODEL] ?? 0;
    } else {
      cutoutCached = true;
    }

    return png;
  };

  let specks = await dropSpecks(engine === "bria" ? await bria(cutFrom) : await cutoutLocal(cutFrom, config.cutout.white_threshold));
  let autoFallback: string | null = null;

  // Engine auto chose the flood fill because the border is white, but a white card
  // can still carry figures and text around the product. When too much of the
  // opaque area lies in small islands, the flood fill kept the layout, not a
  // product, and Bria cuts the product out of it instead.
  if (options.engine === "auto" && engine === "local" && specks.clutter_share > AUTO_MAX_CLUTTER_SHARE && falKey) {
    autoFallback = `local kept ${Math.round(specks.clutter_share * 100)} % of the opaque area in small islands around the product, bria used instead`;
    engine = "bria";
    specks = await dropSpecks(await bria(cutFrom));
  }

  done();

  done = step("clean", 65);

  let cleaned: Awaited<ReturnType<typeof removeShadow>>;

  try {
    cleaned = await removeShadow(specks.png, config.thresholds);
  } catch {
    throw new PackshotError(
      `No product was found in the picture${engine === "local" ? " (the local engine only removes a white background, try bria)" : ""}.`,
      "no_object",
    );
  }

  done();

  done = step("normalize", 75);
  const placement = await placeOnCanvas(cleaned.png, config).catch((err: Error) => {
    throw new PackshotError(err.message, "no_object");
  });
  done();

  done = step("shadow", 85);
  const { png } = await composeOnWhite(placement.png, config.shadow, options.shadow);
  done();

  done = step("encode", 95);
  const raw = await sharp(placement.png).raw().toBuffer({ resolveWithObject: true });
  const box = alphaBbox(raw.data, raw.info.width, raw.info.height)!;
  done();

  const [W, H] = placement.canvas;

  return {
    png,
    meta: {
      engine_used: engine,
      mode: options.mode,
      shadow: options.shadow,
      model_ids: models,
      fal_request_ids: requestIds,
      source_sha256: sha256(source),
      result_sha256: sha256(png),
      object_bbox: [box.minX, box.minY, box.maxX, box.maxY],
      base_row: box.maxY,
      base_pct: Math.round(((box.maxY + 1) / H) * 100000) / 1000,
      canvas: [W, H],
      reflection_detected_in_source: cleaned.reflectionDetected,
      source_ring: ring,
      shadow_cut: cleaned.cut,
      specks_removed: specks.removed,
      main_share: specks.main_share,
      clutter_share: specks.clutter_share,
      auto_fallback: autoFallback,
      cutout_cached: cutoutCached,
      scale: placement.scale,
      timings_ms: { ...timings, total: Date.now() - t0 },
      cost_usd_estimate: Math.round(cost * 1000) / 1000,
    },
  };
}
