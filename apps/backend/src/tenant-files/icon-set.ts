import sharp from "sharp";
import { encodeIco } from "./ico-encoder";

/**
 * Builds the app-icon set a PWA/iOS/Android/Windows/macOS install needs from
 * one branding upload (t-2026-10-03-61). `POST /tenants/branding/upload`
 * calls this for kind `favicon`; every other kind is untouched.
 */

export type IconSetSource = {
  /** The uploaded file's own bytes, already validated (`assertSafeSvg` or the dimension checks). */
  buffer: Buffer;
  isSvg: boolean;
  /** The tenant's brand colour, or white — used behind every icon that cannot be transparent
   * (apple touch icon, the Windows tiles, the maskable icon's safe-zone padding). */
  backgroundColor: string;
};

export type IconSetFile = { name: string; buffer: Buffer; mimeType: string };

export type IconSetFiles = Partial<
  Record<
    | "icon_svg"
    | "favicon_ico"
    | "apple_touch_icon"
    | "icon_192"
    | "icon_512"
    | "icon_maskable_512"
    | "mstile_150"
    | "mstile_310"
    | "mask_icon",
    IconSetFile
  >
>;

/** The W3C maskable-icon safe zone: a launcher may crop anything outside the inner 80%. */
const MASKABLE_SAFE_ZONE = 0.8;

/** A raster big enough to downscale cleanly to every size below, rendered once so an SVG upload
 * is rasterised a single time rather than once per output size. Caps the render at 1024px on the
 * long side regardless of the SVG's own declared size, so a document with a huge viewBox cannot
 * turn one upload into a multi-gigabyte render. */
const svgRasterBuffer = async (svg: Buffer, targetMax = 1024): Promise<Buffer> => {
  const { width, height } = await sharp(svg).metadata();
  const native = Math.max(width ?? 24, height ?? 24, 1);
  const density = Math.min(Math.round(72 * (targetMax / native)), 9600);
  return sharp(svg, { density }).png().toBuffer();
};

/** Resized to fit `size`×`size`, alpha intact — the plain app icons and the favicon's own frames. */
const transparentSquare = (source: Buffer, size: number): Promise<Buffer> =>
  sharp(source)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

/** Resized onto `background` with no alpha channel — the apple touch icon and the Windows tiles,
 * both of which paint their own chrome around the image and look wrong with a transparent one. */
const flattenSquare = (source: Buffer, size: number, background: string): Promise<Buffer> =>
  sharp(source)
    .resize(size, size, { fit: "contain", background })
    .flatten({ background })
    .png()
    .toBuffer();

/** A maskable icon (W3C spec): the mark fills only the inner safe zone, `background` behind it
 * edge to edge and never transparent — the OS applies its own mask shape (circle, squircle, …)
 * over whatever sits outside the safe zone, so that area has to already look like "background". */
const maskableSquare = (source: Buffer, size: number, background: string): Promise<Buffer> => {
  const inner = Math.round(size * MASKABLE_SAFE_ZONE);
  const padTop = Math.floor((size - inner) / 2);
  const padBottom = Math.ceil((size - inner) / 2);
  const padLeft = Math.floor((size - inner) / 2);
  const padRight = Math.ceil((size - inner) / 2);

  return sharp(source)
    .resize(inner, inner, { fit: "contain", background })
    .extend({ top: padTop, bottom: padBottom, left: padLeft, right: padRight, background })
    .flatten({ background })
    .png()
    .toBuffer();
};

const svgAttr = (tag: string, name: string): string | null => {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? match[1] : null;
};

/**
 * A crude one-colour conversion for Safari's pinned-tab `mask-icon`: every `fill`/`stroke` value
 * that isn't `none` becomes black, so browser renders it in the ONE colour it picks itself and the
 * source colours never show anyway. `assertSafeSvg` already required the document to carry no
 * script and no event handler before this ever sees it.
 *
 * The favicon master this builds from is full-bleed (a background `<rect>` behind the mark, so it
 * also works as a plain favicon) — recolouring that rect to black too would ink the ENTIRE canvas,
 * since Safari paints every filled shape and leaves only true negative space transparent. A `<rect>`
 * that exactly covers the canvas is therefore dropped rather than recoloured, on the assumption that
 * it is that background plate and not part of the mark; everything else is left in place, flat
 * shapes recoloured black. A photographic or gradient-heavy upload still flattens to a silhouette,
 * the same outcome any mask-icon conversion gives one.
 */
export const monoSvg = (svg: string): string => {
  const svgTag = svg.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const viewBox = svgTag.match(/viewBox\s*=\s*"0\s+0\s+([\d.]+)\s+([\d.]+)"/i);
  const canvasWidth = svgAttr(svgTag, "width") ?? viewBox?.[1] ?? null;
  const canvasHeight = svgAttr(svgTag, "height") ?? viewBox?.[2] ?? null;

  const withoutBackgroundRect = svg.replace(/<rect\b[^>]*\/?>/gi, (tag) => {
    const x = Number(svgAttr(tag, "x") ?? "0");
    const y = Number(svgAttr(tag, "y") ?? "0");
    const isFullCanvas =
      canvasWidth !== null &&
      canvasHeight !== null &&
      svgAttr(tag, "width") === canvasWidth &&
      svgAttr(tag, "height") === canvasHeight &&
      x === 0 &&
      y === 0;

    return isFullCanvas ? "" : tag;
  });

  return withoutBackgroundRect
    .replace(/(fill|stroke)(\s*=\s*)"(?!\s*none\s*")[^"]*"/gi, '$1$2"#000"')
    .replace(/(fill|stroke)(\s*:\s*)(?!none\b)[^;"'}]+/gi, "$1$2#000");
};

const ICO_SIZES = [16, 32, 48];

export const buildIconSet = async ({ buffer, isSvg, backgroundColor }: IconSetSource): Promise<IconSetFiles> => {
  const rasterSource = isSvg ? await svgRasterBuffer(buffer) : buffer;

  const [icoFrames, apple180, icon192, icon512, maskable512, tile150, tile310] = await Promise.all([
    Promise.all(ICO_SIZES.map((size) => transparentSquare(rasterSource, size))),
    flattenSquare(rasterSource, 180, backgroundColor),
    transparentSquare(rasterSource, 192),
    transparentSquare(rasterSource, 512),
    maskableSquare(rasterSource, 512, backgroundColor),
    flattenSquare(rasterSource, 150, backgroundColor),
    flattenSquare(rasterSource, 310, backgroundColor),
  ]);

  const files: IconSetFiles = {
    favicon_ico: {
      name: "favicon.ico",
      buffer: encodeIco(ICO_SIZES.map((size, index) => ({ size, png: icoFrames[index] }))),
      mimeType: "image/x-icon",
    },
    apple_touch_icon: { name: "apple-touch-icon.png", buffer: apple180, mimeType: "image/png" },
    icon_192: { name: "icon-192.png", buffer: icon192, mimeType: "image/png" },
    icon_512: { name: "icon-512.png", buffer: icon512, mimeType: "image/png" },
    icon_maskable_512: { name: "icon-maskable-512.png", buffer: maskable512, mimeType: "image/png" },
    mstile_150: { name: "mstile-150.png", buffer: tile150, mimeType: "image/png" },
    mstile_310: { name: "mstile-310.png", buffer: tile310, mimeType: "image/png" },
  };

  if (isSvg) {
    files.icon_svg = { name: "icon.svg", buffer, mimeType: "image/svg+xml" };
    files.mask_icon = {
      name: "mask-icon.svg",
      buffer: Buffer.from(monoSvg(buffer.toString("utf8")), "utf8"),
      mimeType: "image/svg+xml",
    };
  }

  return files;
};
