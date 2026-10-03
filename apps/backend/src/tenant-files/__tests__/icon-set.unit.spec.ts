import sharp from "sharp";
import { buildIconSet, buildMaskableIcon, buildMonoIcons, fieldColor, markColor, monoSvg, tileInk } from "../icon-set";

/**
 * Cherkashino's «Ч» (t-2026-10-03-61), inlined rather than read from the design hand-off folder:
 * that folder lives outside this repository and is absent in CI. Full-bleed 1024×1024 masters.
 *
 * - `CH_LOGO_*`, the default: the glyph of Ruslan Display, the header wordmark's typeface, as
 *   outlines, in the wordmark's colours, `#1a1b09` on the page's `#ffffff`.
 * - `CH_*`, the alternative `ch-default`: a geometric «Ч» in white on the theme's `#0a6a52`.
 */
const svg = (body: string) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${body}</svg>`,
    "utf8",
  );

const CH_LOGO_MASTER = svg('<rect width="1024" height="1024" fill="#ffffff"/><path d="M558.5 545.4L558.5 545.4Q554.3 490.1 554.3 410.2Q554.3 330.2 561.6 250.9L561.6 250.9L849.9 250.9Q811.3 444.1 811.3 620.6L811.3 620.6Q811.3 703.2 818.6 773.1L818.6 773.1L589.8 773.1Q574.2 692.7 566.8 629.0L566.8 629.0Q514.6 595.6 387.2 595.6L387.2 595.6Q326.6 595.6 268.1 602.9L268.1 602.9Q197.1 443.1 174.1 250.9L174.1 250.9L440.4 250.9Q440.4 521.4 558.5 545.4Z" fill="#1a1b09"/>');

const CH_LOGO_MASKABLE = svg('<rect width="1024" height="1024" fill="#ffffff"/><path d="M554.0 542.2L554.0 542.2Q550.2 492.2 550.2 419.9Q550.2 347.7 556.9 275.9L556.9 275.9L817.5 275.9Q782.5 450.6 782.5 610.2L782.5 610.2Q782.5 684.8 789.1 748.1L789.1 748.1L582.3 748.1Q568.2 675.3 561.6 617.8L561.6 617.8Q514.4 587.5 399.2 587.5L399.2 587.5Q344.4 587.5 291.5 594.1L291.5 594.1Q227.3 449.7 206.5 275.9L206.5 275.9L447.3 275.9Q447.3 520.5 554.0 542.2Z" fill="#1a1b09"/>');

const CH_LOGO_MONO = svg('<path d="M566.9 551.5L566.9 551.5Q562.0 486.1 562.0 391.6Q562.0 297.2 570.6 203.4L570.6 203.4L911.4 203.4Q865.7 431.8 865.7 640.4L865.7 640.4Q865.7 737.9 874.3 820.6L874.3 820.6L604.0 820.6Q585.5 725.6 576.8 650.3L576.8 650.3Q515.1 610.8 364.5 610.8L364.5 610.8Q292.9 610.8 223.7 619.4L223.7 619.4Q139.8 430.5 112.6 203.4L112.6 203.4L427.4 203.4Q427.4 523.1 566.9 551.5Z" fill="#000000"/>');

const LOGO_FIELD = "#ffffff";
const LOGO_INK = "#1a1b09";

const CH_MASTER = svg(
  '<rect width="1024" height="1024" fill="#0a6a52"/>' +
    '<path d="M212.0 172.0L372.0 172.0L372.0 322.0A140.0 140.0 0 0 0 652.0 322.0L652.0 172.0L812.0 172.0L812.0 852.0L652.0 852.0L652.0 587.3A300.0 300.0 0 0 1 212.0 322.0Z" fill="#ffffff"/>',
);

const CH_MASKABLE = svg(
  '<rect width="1024" height="1024" fill="#0a6a52"/>' +
    '<path d="M263.0 229.8L395.8 229.8L395.8 354.3A116.2 116.2 0 0 0 628.2 354.3L628.2 229.8L761.0 229.8L761.0 794.2L628.2 794.2L628.2 574.5A249.0 249.0 0 0 1 263.0 354.3Z" fill="#ffffff"/>',
);

const CH_MONO = svg(
  '<path d="M167.9 122.0L351.4 122.0L351.4 294.1A160.6 160.6 0 0 0 672.6 294.1L672.6 122.0L856.1 122.0L856.1 902.0L672.6 902.0L672.6 598.4A344.1 344.1 0 0 1 167.9 294.1Z" fill="#000000"/>',
);

const FIELD = "#0a6a52";
const FIELD_RGB = [10, 106, 82];

const rawOf = async (buffer: Buffer) => sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

const cornerOf = async (buffer: Buffer): Promise<number[]> => {
  const { data } = await rawOf(buffer);
  return [data[0], data[1], data[2], data[3]];
};

/** Every frame the ICO's directory points at, decoded as the PNG it is. */
const icoFrames = (ico: Buffer) =>
  Array.from({ length: ico.readUInt16LE(4) }, (_, index) => {
    const entry = ico.subarray(6 + index * 16, 6 + (index + 1) * 16);
    const offset = entry.readUInt32LE(12);
    return ico.subarray(offset, offset + entry.readUInt32LE(8));
  });

describe("buildIconSet from the default master, the wordmark's «Ч» on white", () => {
  let result: Awaited<ReturnType<typeof buildIconSet>>;

  beforeAll(async () => {
    // A fallback the master must override: its own white field wins.
    result = await buildIconSet({ buffer: CH_LOGO_MASTER, isSvg: true, fallbackBackground: "#123456" });
  });

  it("reads the field and the mark colour from the master", () => {
    expect(result.backgroundColor).toBe(LOGO_FIELD);
    expect(result.markColor).toBe(LOGO_INK);
  });

  it("builds every file at its size, opaque where a platform needs it", async () => {
    const expected: Array<[keyof typeof result.files, number, boolean]> = [
      ["apple_touch_icon", 180, false],
      ["icon_192", 192, true],
      ["icon_512", 512, true],
      ["icon_maskable_512", 512, false],
      ["mstile_150", 150, true],
      ["mstile_310", 310, true],
    ];

    for (const [key, size, hasAlpha] of expected) {
      const meta = await sharp(result.files[key]!.buffer).metadata();
      expect([key, meta.width, meta.height, Boolean(meta.hasAlpha)]).toEqual([key, size, size, hasAlpha]);
    }
    expect(await cornerOf(result.files.apple_touch_icon!.buffer)).toEqual([255, 255, 255, 255]);
    expect(await cornerOf(result.files.icon_maskable_512!.buffer)).toEqual([255, 255, 255, 255]);
  });

  it("keeps the whole dark mark of the maskable icon inside the 80% circle", async () => {
    const { data, info } = await rawOf(result.files.icon_maskable_512!.buffer);
    const centre = info.width / 2;
    let markPixels = 0;
    let outside = 0;

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * info.channels] < 128) {
          markPixels += 1;
          if (Math.hypot(x + 0.5 - centre, y + 0.5 - centre) > info.width * 0.4) outside += 1;
        }
      }
    }

    expect(markPixels).toBeGreaterThan(1000);
    expect(outside).toBe(0);
  });

  it("draws the Windows tiles in the mark's colour, since a white one would vanish on the white tile", async () => {
    const { data, info } = await rawOf(result.files.mstile_310!.buffer);
    let inked = 0;

    expect(data[3]).toBe(0);
    for (let offset = 0; offset < data.length; offset += info.channels) {
      if (data[offset + 3] === 255) {
        expect([data[offset], data[offset + 1], data[offset + 2]]).toEqual([0x1a, 0x1b, 0x09]);
        inked += 1;
      }
    }
    expect(inked).toBeGreaterThan(2000);
  });

  it("derives a background-free, one-colour mask-icon", () => {
    const mask = result.files.mask_icon!.buffer.toString("utf8");

    expect(mask).not.toContain("<rect");
    expect(mask).toContain('fill="#000"');
  });
});

describe("buildIconSet from the alternative ch-default master, white on green", () => {
  let result: Awaited<ReturnType<typeof buildIconSet>>;

  beforeAll(async () => {
    result = await buildIconSet({ buffer: CH_MASTER, isSvg: true, fallbackBackground: "#ffffff" });
  });

  it("takes the green field and the white mark from the master", () => {
    expect(result.backgroundColor).toBe(FIELD);
    expect(result.markColor).toBe("#ffffff");
  });

  it("writes a favicon.ico of three real PNG frames, 16, 32 and 48", async () => {
    const frames = icoFrames(result.files.favicon_ico!.buffer);
    const sizes = await Promise.all(frames.map(async (frame) => (await sharp(frame).metadata()).width));

    expect(sizes).toEqual([16, 32, 48]);
    expect(result.files.icon_svg?.buffer).toEqual(CH_MASTER);
  });

  it("paints the apple touch icon and the maskable icon edge to edge in the field colour", async () => {
    expect(await cornerOf(result.files.apple_touch_icon!.buffer)).toEqual([...FIELD_RGB, 255]);
    expect(await cornerOf(result.files.icon_maskable_512!.buffer)).toEqual([...FIELD_RGB, 255]);
  });

  it("draws the Windows tiles as a white silhouette on a transparent tile", async () => {
    const { data, info } = await rawOf(result.files.mstile_150!.buffer);
    let white = 0;

    expect(data[3]).toBe(0);
    for (let offset = 0; offset < data.length; offset += info.channels) {
      if (data[offset + 3] === 255) {
        expect([data[offset], data[offset + 1], data[offset + 2]]).toEqual([255, 255, 255]);
        white += 1;
      }
    }
    expect(white).toBeGreaterThan(500);
  });
});

describe("buildIconSet from other masters", () => {
  it("falls back to the given colour, with a margin, for a logo on a transparent canvas", async () => {
    const logo = svg('<circle cx="512" cy="512" r="500" fill="#ff0000"/>');

    const { files, backgroundColor } = await buildIconSet({ buffer: logo, isSvg: true, fallbackBackground: "#123456" });

    expect(backgroundColor).toBe("#123456");
    expect(await cornerOf(files.apple_touch_icon!.buffer)).toEqual([0x12, 0x34, 0x56, 255]);
    expect(await cornerOf(files.icon_maskable_512!.buffer)).toEqual([0x12, 0x34, 0x56, 255]);
    // The circle itself is a usable silhouette.
    expect(files.mask_icon).toBeDefined();
  });

  it("skips icon.svg and mask-icon for a raster master and tiles the master itself", async () => {
    const png = await sharp({ create: { width: 512, height: 512, channels: 3, background: FIELD } }).png().toBuffer();

    const { files, backgroundColor } = await buildIconSet({ buffer: png, isSvg: false, fallbackBackground: "#ffffff" });

    expect(backgroundColor).toBe(FIELD);
    expect(files.icon_svg).toBeUndefined();
    expect(files.mask_icon).toBeUndefined();
    expect(Boolean((await sharp(files.mstile_310!.buffer).metadata()).hasAlpha)).toBe(false);
    expect(files.icon_512).toBeDefined();
    expect(files.favicon_ico).toBeDefined();
  });

  it("ships no mask-icon when the background is a shape monoSvg cannot recognise", async () => {
    const pathBackground = svg('<path d="M0 0H1024V1024H0Z" fill="#0a6a52"/><circle cx="512" cy="512" r="200" fill="#fff"/>');

    const { files } = await buildIconSet({ buffer: pathBackground, isSvg: true, fallbackBackground: "#ffffff" });

    expect(files.mask_icon).toBeUndefined();
    expect(Boolean((await sharp(files.mstile_150!.buffer).metadata()).hasAlpha)).toBe(false);
  });
});

describe("buildMaskableIcon", () => {
  it("renders a dedicated maskable master at 512, opaque, on its own field", async () => {
    for (const [master, corner] of [
      [CH_LOGO_MASKABLE, [255, 255, 255, 255]],
      [CH_MASKABLE, [...FIELD_RGB, 255]],
    ] as const) {
      const { icon_maskable_512 } = await buildMaskableIcon({ buffer: master, isSvg: true, fallbackBackground: "#123456" });
      const meta = await sharp(icon_maskable_512!.buffer).metadata();

      expect([meta.width, meta.height, Boolean(meta.hasAlpha)]).toEqual([512, 512, false]);
      expect(await cornerOf(icon_maskable_512!.buffer)).toEqual(corner);
    }
  });
});

describe("buildMonoIcons", () => {
  it("turns a dedicated silhouette into Safari's mask-icon and leaves the tiles to the favicon", async () => {
    for (const mono of [CH_LOGO_MONO, CH_MONO]) {
      const files = await buildMonoIcons(mono);

      expect(files.mask_icon!.buffer.toString("utf8")).toContain('fill="#000"');
      expect(files.mask_icon!.buffer.toString("utf8")).not.toContain("#000000");
      expect(Object.keys(files)).toEqual(["mask_icon"]);
    }
  });

  it("returns nothing for a drawing that is not a shape on a transparent canvas", async () => {
    expect(await buildMonoIcons(svg('<path d="M0 0H1024V1024H0Z"/>'))).toEqual({});
  });
});

describe("markColor and tileInk", () => {
  it("finds the mark's colour away from the field", async () => {
    const png = await sharp(CH_LOGO_MASTER).png().toBuffer();

    expect(await markColor(png, LOGO_FIELD)).toBe(LOGO_INK);
  });

  it("inks a tile in the mark's colour only where it reads", () => {
    expect(tileInk("#ffffff", "#1a1b09")).toBe("#1a1b09");
    expect(tileInk("#0a6a52", "#ffffff")).toBe("#ffffff");
    expect(tileInk("#ffffff", "#f4f4f4")).toBe("#000000");
    expect(tileInk("#10201b", null)).toBe("#ffffff");
  });
});

describe("fieldColor", () => {
  it("reads the colour of uniform opaque corners and nothing else", async () => {
    const flat = await sharp({ create: { width: 8, height: 8, channels: 3, background: FIELD } }).png().toBuffer();
    const clear = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();

    expect(await fieldColor(flat)).toBe(FIELD);
    expect(await fieldColor(clear)).toBeNull();
  });
});

describe("monoSvg", () => {
  it("drops a full-canvas background rect and recolours the remaining shapes to black", () => {
    const result = monoSvg(CH_MASTER.toString("utf8"));

    expect(result).not.toContain("<rect");
    expect(result).not.toContain(FIELD);
    expect(result).toContain('fill="#000"');
    expect(result).toContain("<path");
  });

  it("recognises a 100% background rect with single-quoted attributes", () => {
    const result = monoSvg("<svg viewBox='0 0 64 64'><rect width='100%' height='100%' fill='#fff'/><circle r='9' fill='#f00'/></svg>");

    expect(result).not.toContain("<rect");
    expect(result).toContain('<circle r=\'9\' fill="#000"/>');
  });

  it("leaves a shape smaller than the canvas alone, recolouring only its fill", () => {
    const result = monoSvg(
      '<svg viewBox="0 0 100 100" width="100" height="100"><rect x="10" y="10" width="40" height="40" fill="#ff0000"/></svg>',
    );

    expect(result).toContain("<rect");
    expect(result).toContain('fill="#000"');
    expect(result).not.toContain("#ff0000");
  });

  it("leaves fill=\"none\" and fill-rule alone", () => {
    const result = monoSvg(
      '<svg viewBox="0 0 10 10"><path d="M0 0" fill="none" fill-rule="evenodd" stroke="#123456"/></svg>',
    );

    expect(result).toContain('fill="none"');
    expect(result).toContain('fill-rule="evenodd"');
    expect(result).toContain('stroke="#000"');
  });
});
