import sharp from "sharp";
import type { PackshotConfig } from "./config";
import { alphaBbox } from "./normalize";

/**
 * Synthetic contact shadow, ported from Packshot Studio (`lib/packshot/shadow.ts`).
 * Never a generated one: an SVG ellipse with a radial gradient of black goes under
 * the alpha bbox base of the object, and the object is composited ON TOP of it.
 *
 * Geometry, with the object bbox `objW × objH` and its base `maxY + 1`:
 *   cx = bbox centre, cy = base + offset_y_ratio × objH,
 *   rx = objW × width_ratio / 2, ry = objW × height_ratio / 2.
 * With `offset_y_ratio = 0` the ellipse is centred on the contact line, so its
 * lower half is the only thing below the base. `measure.ts` reads the base back
 * from exactly that symmetry.
 */

export class ShadowError extends Error {}

export type ShadowGeometry = { cx: number; cy: number; rx: number; ry: number };

export const shadowGeometry = (
  box: { minX: number; minY: number; maxX: number; maxY: number },
  cfg: PackshotConfig["shadow"],
): ShadowGeometry => {
  const objW = box.maxX - box.minX + 1;
  const objH = box.maxY - box.minY + 1;

  return {
    cx: (box.minX + box.maxX + 1) / 2,
    cy: box.maxY + 1 + cfg.offset_y_ratio * objH,
    rx: (objW * cfg.width_ratio) / 2,
    ry: (objW * cfg.height_ratio) / 2,
  };
};

const shadowSvg = (width: number, height: number, g: ShadowGeometry, opacity: number): Buffer =>
  // stop-opacity rather than rgba() in stop-color: every SVG renderer reads it the same way
  Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g">
          <stop offset="0%" stop-color="#000000" stop-opacity="${opacity}"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${g.cx}" cy="${g.cy}" rx="${g.rx}" ry="${g.ry}" fill="url(#g)"/>
    </svg>`,
  );

/**
 * Final frame: white ground, the shadow (when `withShadow`), the object on top.
 * The PNG is RGB (three channels) and carries no metadata, so the same input
 * gives the same bytes.
 */
export async function composeOnWhite(
  placed: Buffer,
  cfg: PackshotConfig["shadow"],
  withShadow: boolean,
): Promise<{ png: Buffer; geometry: ShadowGeometry | null }> {
  const { data, info } = await sharp(placed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const box = alphaBbox(data, width, height);

  if (!box) {
    throw new ShadowError("The cutout is fully transparent: there is nothing to put a shadow under.");
  }

  const geometry = withShadow ? shadowGeometry(box, cfg) : null;
  const layers = [
    ...(geometry ? [{ input: shadowSvg(width, height, geometry, cfg.opacity), left: 0, top: 0 }] : []),
    { input: placed, left: 0, top: 0 },
  ];

  // A separate pass drops the alpha band: in one sharp pipeline the band
  // operations run BEFORE composite and the alpha would survive.
  const composed = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
    .composite(layers)
    .png()
    .toBuffer();
  const png = await sharp(composed)
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();

  return { png, geometry };
}
