/**
 * Numbers of the packshot pipeline (t-2026-09-25-n17). Ported from Ivan's Packshot
 * Studio (`nextjs-utils/apps/web/lib/packshot/config.ts`, `DEFAULT_CONFIG`) as code
 * constants: there is no data directory and no JSON file on disk. Every number that
 * decides how a product sits on the canvas has an env override, read on each call so
 * a test or a stand can change it without a rebuild.
 *
 * | env                          | default | meaning                                            |
 * |------------------------------|---------|----------------------------------------------------|
 * | PACKSHOT_CANVAS_W / _H       | 1620 / 2160 | output canvas, 3:4                             |
 * | PACKSHOT_BASELINE_PCT        | 88      | contact line of the product, % of canvas height    |
 * | PACKSHOT_MARGIN_LEFT_PCT     | 10      | safe area, % of canvas width                       |
 * | PACKSHOT_MARGIN_RIGHT_PCT    | 10      |                                                    |
 * | PACKSHOT_MARGIN_TOP_PCT      | 12      | safe area, % of canvas height                      |
 * | PACKSHOT_WHITE_THRESHOLD     | 245     | local cutout: a pixel is background when min(R,G,B) ≥ this |
 * | PACKSHOT_AUTO_RING_WHITE_PCT | 99      | engine auto: local when this share of the border ring is white |
 * | PACKSHOT_SHADOW_OPACITY      | 0.35    | alpha at the centre of the contact shadow          |
 * | PACKSHOT_SHADOW_WIDTH_RATIO  | 1.15    | shadow width = object width × ratio                |
 * | PACKSHOT_SHADOW_HEIGHT_RATIO | 0.06    | shadow height = object width × ratio               |
 * | PACKSHOT_SHADOW_OFFSET_Y_RATIO | 0     | shadow centre below the base, × object height      |
 * | PACKSHOT_FAL_TIMEOUT_MS      | 300000  | hard deadline of one fal.ai queue request          |
 */

export type PackshotConfig = {
  canvas: { width: number; height: number };
  safe_area: {
    margin_left_pct: number;
    margin_right_pct: number;
    margin_top_pct: number;
    baseline_pct: number;
  };
  /** min(R,G,B) below `object` is the product, below `shadow` still a shadow, below `contact` a dark row. */
  thresholds: { object: number; shadow: number; contact: number; dark_base: number };
  cutout: { white_threshold: number; ring_pct: number; auto_ring_white_pct: number };
  shadow: { opacity: number; width_ratio: number; height_ratio: number; offset_y_ratio: number };
  fal: { poll_ms: number; timeout_ms: number };
};

const envNumber = (name: string, fallback: number, min: number, max: number): number => {
  const raw = process.env[name];

  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);

  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
};

export const packshotConfig = (): PackshotConfig => ({
  canvas: {
    width: Math.round(envNumber("PACKSHOT_CANVAS_W", 1620, 64, 8192)),
    height: Math.round(envNumber("PACKSHOT_CANVAS_H", 2160, 64, 8192)),
  },
  safe_area: {
    margin_left_pct: envNumber("PACKSHOT_MARGIN_LEFT_PCT", 10, 0, 45),
    margin_right_pct: envNumber("PACKSHOT_MARGIN_RIGHT_PCT", 10, 0, 45),
    margin_top_pct: envNumber("PACKSHOT_MARGIN_TOP_PCT", 12, 0, 45),
    baseline_pct: envNumber("PACKSHOT_BASELINE_PCT", 88, 50, 100),
  },
  // `dark_base` is the lead's measurement on Ivan's shadow reference (2026-09-25). The
  // bottom ring of a dark bottle is darker than 120 and the mirror reflection under it
  // never is, so the last row that still holds such pixels is the real contact line.
  thresholds: { object: 245, shadow: 250, contact: 200, dark_base: 120 },
  cutout: {
    white_threshold: envNumber("PACKSHOT_WHITE_THRESHOLD", 245, 128, 255),
    ring_pct: 1,
    auto_ring_white_pct: envNumber("PACKSHOT_AUTO_RING_WHITE_PCT", 99, 50, 100),
  },
  shadow: {
    opacity: envNumber("PACKSHOT_SHADOW_OPACITY", 0.35, 0, 1),
    width_ratio: envNumber("PACKSHOT_SHADOW_WIDTH_RATIO", 1.15, 0.1, 3),
    height_ratio: envNumber("PACKSHOT_SHADOW_HEIGHT_RATIO", 0.06, 0.005, 1),
    offset_y_ratio: envNumber("PACKSHOT_SHADOW_OFFSET_Y_RATIO", 0, -0.5, 0.5),
  },
  fal: {
    poll_ms: 1500,
    timeout_ms: envNumber("PACKSHOT_FAL_TIMEOUT_MS", 300_000, 10_000, 1_800_000),
  },
});

/** Background removal for any background (Bria RMBG 2.0 on fal.ai). */
export const BRIA_MODEL = "fal-ai/bria/background/remove";

/** Full re-render of the product, the Packshot Studio behaviour. The shape may change. */
export const RERENDER_MODEL = "fal-ai/nano-banana-pro/edit";

/**
 * The resolution asked of the re-render. 2K costs the same as 1K and gives the
 * normaliser a source close to the canvas size instead of upscaling a 1K frame.
 */
export const RERENDER_RESOLUTION = "2K";

/**
 * USD per call, read from the model pages on 2026-09-25, not written from memory:
 * fal.ai/models/fal-ai/bria/background/remove «At $0.018 per generation»;
 * fal.ai/models/fal-ai/nano-banana-pro/edit «$0.15 per image … 4K outputs will be
 * charged at double the standard rate» (1K and 2K $0.15, 4K $0.30). This is an
 * estimate for the meta, not a bill. The fal dashboard is the ledger.
 */
export const PRICE_USD: Record<string, number> = {
  [BRIA_MODEL]: 0.018,
  [RERENDER_MODEL]: 0.15,
};

/** The platform-wide fal.ai key, from the backend process env only. */
export const falKey = (): string | undefined => {
  const key = process.env.FAL_KEY?.trim();

  return key ? key : undefined;
};
