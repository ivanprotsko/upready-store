import sharp from "sharp";
import { encodeIco } from "./ico-encoder";

/**
 * Builds the app-icon set a PWA/iOS/Android/Windows/macOS install needs from
 * the branding uploads (t-2026-10-03-61). `POST /tenants/branding/upload`
 * calls `buildIconSet` for kind `favicon`, `buildMaskableIcon` for the
 * optional `favicon_maskable` master and `buildMonoIcons` for the optional
 * `favicon_mono` one; every other kind is untouched.
 */

export type IconSetKey =
  | "icon_svg"
  | "favicon_ico"
  | "apple_touch_icon"
  | "icon_192"
  | "icon_512"
  | "icon_maskable_512"
  | "mstile_150"
  | "mstile_310"
  | "mask_icon";

export type IconSetFile = { name: string; buffer: Buffer; mimeType: string };

export type IconSetFiles = Partial<Record<IconSetKey, IconSetFile>>;

export type IconSetSource = {
  /** The uploaded file's own bytes, already validated (`assertSafeSvg` or the dimension checks). */
  buffer: Buffer;
  isSvg: boolean;
  /** Painted behind the icons that cannot be transparent when the master has no field of its own
   * (a logo on a transparent canvas): the tenant's primary colour, else white. */
  fallbackBackground: string;
};

export type IconSet = {
  files: IconSetFiles;
  /** The colour behind every opaque icon: the master's own field when it has one, else
   * `fallbackBackground`. The storefront reuses it for `theme_color` and the Windows tile. */
  backgroundColor: string;
};

/** The W3C maskable-icon safe zone: a launcher may crop anything outside the inner 80%. */
const MASKABLE_SAFE_ZONE = 0.8;

/** How much of a Windows tile the white silhouette takes, centred, the rest is the tile colour. */
const TILE_MARK_RATIO = 0.5;

const ICO_SIZES = [16, 32, 48];

const RASTER_SIZE = 1024;

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** Rasterises an SVG once at about 1024px, so every output size downscales from one bitmap. The
 * density is derived from the document's declared size and the result is capped at 1024px, so a
 * document with a huge viewBox cannot turn one upload into a multi-gigabyte render. */
const rasteriseSvg = async (svg: Buffer): Promise<Buffer> => {
  const { width, height } = await sharp(svg).metadata();
  const native = Math.max(width ?? 24, height ?? 24, 1);
  const density = Math.min(Math.max(Math.round(72 * (RASTER_SIZE / native)), 1), 9600);

  return sharp(svg, { density })
    .resize(RASTER_SIZE, RASTER_SIZE, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
};

const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;

/**
 * The master's own field colour: the four corner pixels, when all of them are opaque and the
 * same colour (within a few levels of rounding). A full-bleed master such as Cherkashino's green
 * square answers its green; a logo on a transparent canvas, or a gradient, answers `null`.
 */
export const fieldColor = async (raster: Buffer): Promise<string | null> => {
  const { data, info } = await sharp(raster).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => {
    const offset = (y * info.width + x) * info.channels;
    return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
  };
  const corners = [
    pixel(0, 0),
    pixel(info.width - 1, 0),
    pixel(0, info.height - 1),
    pixel(info.width - 1, info.height - 1),
  ];
  const [first] = corners;

  const uniform = corners.every(
    (corner) => corner[3] === 255 && corner.every((channel, index) => Math.abs(channel - first[index]) <= 8),
  );

  return uniform ? toHex(first[0], first[1], first[2]) : null;
};

/** Resized to fit `size`×`size`, alpha intact: the favicon frames and the `any`-purpose icons. */
const transparentSquare = (source: Buffer, size: number): Promise<Buffer> =>
  sharp(source).resize(size, size, { fit: "contain", background: TRANSPARENT }).png().toBuffer();

/**
 * The image scaled to `scale` of a `size`×`size` square, centred on `background`, no alpha
 * channel. At `scale` 1 a full-bleed master simply fills the square; below 1 the margin is the
 * same colour as the master's own field, so the seam does not show.
 */
const opaqueSquare = async (source: Buffer, size: number, background: string, scale = 1): Promise<Buffer> => {
  const inner = Math.round(size * scale);
  const mark = await sharp(source).resize(inner, inner, { fit: "contain", background: TRANSPARENT }).png().toBuffer();
  // `composite` always hands back an alpha channel, even over an opaque base, so the alpha is
  // dropped in a second pass: iOS paints black behind any transparency an apple touch icon has.
  const composed = await sharp({ create: { width: size, height: size, channels: 3, background } })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toBuffer();

  return sharp(composed).flatten({ background }).png().toBuffer();
};

/**
 * A white silhouette on a transparent tile, the shape Windows expects: it paints
 * `msapplication-TileColor` behind it itself. `mono` is a black-on-transparent raster.
 */
const whiteTile = async (mono: Buffer, size: number): Promise<Buffer> => {
  const inner = Math.round(size * TILE_MARK_RATIO);
  const mark = await sharp(mono)
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
    .ensureAlpha()
    .negate({ alpha: false })
    .png()
    .toBuffer();

  return sharp({ create: { width: size, height: size, channels: 4, background: TRANSPARENT } })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toBuffer();
};

const svgAttr = (tag: string, name: string): string | null => {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match ? match[1] : null;
};

/**
 * A one-colour conversion for Safari's pinned-tab `mask-icon` and the Windows tile: every `fill`
 * and `stroke` that is not `none` becomes black. Safari reads only the shape and paints it in the
 * colour the page names, so the source colours never show anyway. `assertSafeSvg` has already
 * refused a document with a script or an event handler before this sees it.
 *
 * A favicon master is usually full-bleed, a background `<rect>` behind the mark. Recolouring that
 * rect would ink the whole canvas, so a `<rect>` at the origin that covers the canvas (its width
 * and height equal the document's, or `100%`) is dropped instead. Any other background shape is
 * not recognised here; `isUsableSilhouette` then rejects the result.
 */
export const monoSvg = (svg: string): string => {
  const svgTag = svg.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const viewBox = svgTag.match(/viewBox\s*=\s*["']\s*0[\s,]+0[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i);
  const canvasWidth = svgAttr(svgTag, "width") ?? viewBox?.[1] ?? null;
  const canvasHeight = svgAttr(svgTag, "height") ?? viewBox?.[2] ?? null;
  const covers = (value: string | null, canvas: string | null) =>
    value === "100%" || (value !== null && canvas !== null && Number(value) === Number(canvas));

  const withoutBackground = svg.replace(/<rect\b[^>]*>(\s*<\/rect>)?/gi, (tag) => {
    const atOrigin = Number(svgAttr(tag, "x") ?? "0") === 0 && Number(svgAttr(tag, "y") ?? "0") === 0;
    const fullCanvas = covers(svgAttr(tag, "width"), canvasWidth) && covers(svgAttr(tag, "height"), canvasHeight);

    return atOrigin && fullCanvas ? "" : tag;
  });

  return withoutBackground
    .replace(/\b(fill|stroke)(\s*=\s*)(["'])(?!\s*none\s*\3)[^"']*\3/gi, '$1$2"#000"')
    .replace(/\b(fill|stroke)(\s*:\s*)(?!none\b)[^;"'}]+/gi, "$1$2#000");
};

/**
 * A silhouette is only worth shipping when it is a shape on a transparent canvas: transparent
 * corners, and something opaque in between. A master whose background is not a plain `<rect>`
 * fails this after `monoSvg`, and the set then goes without a `mask-icon` rather than with a
 * solid black square.
 */
const isUsableSilhouette = async (raster: Buffer): Promise<boolean> => {
  const { data, info } = await sharp(raster)
    .resize(64, 64, { fit: "contain", background: TRANSPARENT })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
  const last = info.width - 1;
  const cornersClear = [alpha(0, 0), alpha(last, 0), alpha(0, last), alpha(last, last)].every((value) => value === 0);
  let inked = false;

  for (let index = 3; index < data.length; index += info.channels) {
    if (data[index] > 0) {
      inked = true;
      break;
    }
  }

  return cornersClear && inked;
};

/** `mask-icon.svg` and the two white Windows tiles out of one black silhouette, or nothing when
 * the silhouette is not usable. */
const monoFiles = async (silhouetteSvg: string): Promise<IconSetFiles> => {
  const svg = Buffer.from(silhouetteSvg, "utf8");
  const raster = await rasteriseSvg(svg);

  if (!(await isUsableSilhouette(raster))) {
    return {};
  }

  const [tile150, tile310] = await Promise.all([whiteTile(raster, 150), whiteTile(raster, 310)]);

  return {
    mask_icon: { name: "mask-icon.svg", buffer: svg, mimeType: "image/svg+xml" },
    mstile_150: { name: "mstile-150.png", buffer: tile150, mimeType: "image/png" },
    mstile_310: { name: "mstile-310.png", buffer: tile310, mimeType: "image/png" },
  };
};

export const buildIconSet = async ({ buffer, isSvg, fallbackBackground }: IconSetSource): Promise<IconSet> => {
  const raster = isSvg ? await rasteriseSvg(buffer) : buffer;
  const field = await fieldColor(raster);
  const backgroundColor = field ?? fallbackBackground;
  // A full-bleed master already carries its own margin; a bare logo gets one, so iOS's squircle
  // and the Windows tile do not clip it.
  const opaqueScale = field ? 1 : MASKABLE_SAFE_ZONE;

  const [icoFrames, apple180, icon192, icon512, maskable512, mono] = await Promise.all([
    Promise.all(ICO_SIZES.map((size) => transparentSquare(raster, size))),
    opaqueSquare(raster, 180, backgroundColor, opaqueScale),
    transparentSquare(raster, 192),
    transparentSquare(raster, 512),
    opaqueSquare(raster, 512, backgroundColor, MASKABLE_SAFE_ZONE),
    isSvg ? monoFiles(monoSvg(buffer.toString("utf8"))) : Promise.resolve<IconSetFiles>({}),
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
  };

  if (isSvg) {
    files.icon_svg = { name: "icon.svg", buffer, mimeType: "image/svg+xml" };
  }

  if (mono.mask_icon) {
    Object.assign(files, mono);
  } else {
    // No silhouette (a raster master, or a background shape `monoSvg` cannot recognise): the tile
    // is the master itself on its own colour.
    const [tile150, tile310] = await Promise.all([
      opaqueSquare(raster, 150, backgroundColor, opaqueScale),
      opaqueSquare(raster, 310, backgroundColor, opaqueScale),
    ]);
    files.mstile_150 = { name: "mstile-150.png", buffer: tile150, mimeType: "image/png" };
    files.mstile_310 = { name: "mstile-310.png", buffer: tile310, mimeType: "image/png" };
  }

  return { files, backgroundColor };
};

/**
 * The optional dedicated maskable master: the owner already placed the mark inside the 80% safe
 * zone, so it is only resized to 512 (cropped to a square from the centre) and flattened onto its
 * own field, or `fallbackBackground` where it has none.
 */
export const buildMaskableIcon = async ({ buffer, isSvg, fallbackBackground }: IconSetSource): Promise<IconSetFiles> => {
  const raster = isSvg ? await rasteriseSvg(buffer) : buffer;
  const background = (await fieldColor(raster)) ?? fallbackBackground;
  const maskable = await sharp(raster)
    .resize(512, 512, { fit: "cover" })
    .flatten({ background })
    .png()
    .toBuffer();

  return { icon_maskable_512: { name: "icon-maskable-512.png", buffer: maskable, mimeType: "image/png" } };
};

/**
 * The optional dedicated one-colour master (SVG only): Safari's `mask-icon` and the white Windows
 * tiles. Recoloured through `monoSvg` all the same, so a silhouette drawn in a brand colour still
 * comes out as the single black shape Safari expects. Empty when the drawing is not a shape on a
 * transparent canvas.
 */
export const buildMonoIcons = (svg: Buffer): Promise<IconSetFiles> => monoFiles(monoSvg(svg.toString("utf8")));
