import sharp from "sharp";
import { buildIconSet, monoSvg } from "../icon-set";

/**
 * Cherkashino's own default favicon master (t-2026-10-03-61, Fable's design hand-off,
 * `memory/lead-upready-store/.../fixes/t-2026-10-03-61/design/ch-default/master.svg`), inlined
 * here rather than read from that path: the memory tree is outside this repository and is not
 * present in CI or in another clone. Full-bleed 1024×1024, background `#0a6a52`, the mark in white.
 */
const CHERKASHINO_MASTER_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">' +
    '<rect width="1024" height="1024" fill="#0a6a52"/>' +
    '<path d="M212.0 172.0L372.0 172.0L372.0 322.0A140.0 140.0 0 0 0 652.0 322.0L652.0 172.0L812.0 172.0L812.0 852.0L652.0 852.0L652.0 587.3A300.0 300.0 0 0 1 212.0 322.0Z" fill="#ffffff"/>' +
    "</svg>",
  "utf8",
);

const BACKGROUND = "#0a6a52";

const pngFixture = (size: number, color: { r: number; g: number; b: number }): Promise<Buffer> =>
  sharp({ create: { width: size, height: size, channels: 3, background: color } })
    .png()
    .toBuffer();

describe("buildIconSet", () => {
  it("builds every size from an SVG master, plus icon.svg and a background-free mask-icon", async () => {
    const files = await buildIconSet({
      buffer: CHERKASHINO_MASTER_SVG,
      isSvg: true,
      backgroundColor: BACKGROUND,
    });

    expect(files.icon_svg?.buffer).toEqual(CHERKASHINO_MASTER_SVG);
    expect(files.mask_icon?.mimeType).toBe("image/svg+xml");
    const maskSvg = files.mask_icon?.buffer.toString("utf8") ?? "";
    expect(maskSvg).not.toContain(BACKGROUND);
    expect(maskSvg).toContain('fill="#000"');

    const sizes: Array<[keyof typeof files, number, boolean]> = [
      ["apple_touch_icon", 180, false],
      ["icon_192", 192, true],
      ["icon_512", 512, true],
      ["icon_maskable_512", 512, false],
      ["mstile_150", 150, false],
      ["mstile_310", 310, false],
    ];

    for (const [key, size, hasAlpha] of sizes) {
      const file = files[key];
      expect(file).toBeDefined();
      const meta = await sharp(file!.buffer).metadata();
      expect(meta.width).toBe(size);
      expect(meta.height).toBe(size);
      expect(meta.format).toBe("png");
      expect(Boolean(meta.hasAlpha)).toBe(hasAlpha);
    }

    // The ICO carries all three favicon frames, each a real PNG.
    const ico = files.favicon_ico!.buffer;
    expect(ico.readUInt16LE(2)).toBe(1); // ICONDIR type
    expect(ico.readUInt16LE(4)).toBe(3); // 16/32/48
  });

  it("flattens the apple touch icon and the Windows tiles onto the background colour, no alpha", async () => {
    const files = await buildIconSet({
      buffer: CHERKASHINO_MASTER_SVG,
      isSvg: true,
      backgroundColor: BACKGROUND,
    });

    for (const key of ["apple_touch_icon", "mstile_150", "mstile_310", "icon_maskable_512"] as const) {
      const { data, info } = await sharp(files[key]!.buffer)
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true });
      const corner = [data[0], data[1], data[2], data[3]];
      expect(corner).toEqual([10, 106, 82, 255]); // #0a6a52, fully opaque
      expect(info.channels).toBeGreaterThan(0);
    }
  });

  it("skips icon.svg and mask-icon for a raster (PNG) upload", async () => {
    const png = await pngFixture(512, { r: 10, g: 106, b: 82 });
    const files = await buildIconSet({ buffer: png, isSvg: false, backgroundColor: BACKGROUND });

    expect(files.icon_svg).toBeUndefined();
    expect(files.mask_icon).toBeUndefined();
    expect(files.icon_512).toBeDefined();
    expect(files.favicon_ico).toBeDefined();
  });
});

describe("monoSvg", () => {
  it("drops a full-canvas background rect and recolours the remaining shapes to black", () => {
    const result = monoSvg(CHERKASHINO_MASTER_SVG.toString("utf8"));

    expect(result).not.toContain("<rect");
    expect(result).not.toContain(BACKGROUND);
    expect(result).toContain('fill="#000"');
    expect(result).toContain("<path");
  });

  it("leaves a shape smaller than the canvas alone, recolouring only its fill", () => {
    const svg =
      '<svg viewBox="0 0 100 100" width="100" height="100">' +
      '<rect x="10" y="10" width="40" height="40" fill="#ff0000"/>' +
      "</svg>";

    const result = monoSvg(svg);

    expect(result).toContain("<rect");
    expect(result).toContain('fill="#000"');
    expect(result).not.toContain("#ff0000");
  });

  it("leaves fill=\"none\" alone", () => {
    const svg = '<svg viewBox="0 0 10 10"><path d="M0 0" fill="none" stroke="#123456"/></svg>';

    const result = monoSvg(svg);

    expect(result).toContain('fill="none"');
    expect(result).toContain('stroke="#000"');
  });
});
