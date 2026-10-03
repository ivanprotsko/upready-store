import sharp from "sharp";
import { buildIconSet, buildMaskableIcon, buildMonoIcons, fieldColor, monoSvg } from "../icon-set";

/**
 * Cherkashino's default «Ч» (t-2026-10-03-61, the design hand-off's `ch-default` master, maskable
 * and mono drawings), inlined rather than read from the hand-off folder: that folder lives outside
 * this repository and is absent in CI. Full-bleed 1024×1024, field `#0a6a52`, the mark in white.
 */
const svg = (body: string) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${body}</svg>`,
    "utf8",
  );

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

describe("buildIconSet from Cherkashino's full-bleed SVG master", () => {
  let result: Awaited<ReturnType<typeof buildIconSet>>;

  beforeAll(async () => {
    // White fallback, the way a shop with no primary colour calls it: the master's own green
    // field has to win anyway.
    result = await buildIconSet({ buffer: CH_MASTER, isSvg: true, fallbackBackground: "#ffffff" });
  });

  it("takes the background from the master's own field, not the fallback", () => {
    expect(result.backgroundColor).toBe(FIELD);
  });

  it("builds every file, at its size, with alpha only where a platform wants it", async () => {
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
      expect([key, meta.format, meta.width, meta.height, Boolean(meta.hasAlpha)]).toEqual([
        key,
        "png",
        size,
        size,
        hasAlpha,
      ]);
    }

    expect(result.files.icon_svg?.buffer).toEqual(CH_MASTER);
    expect(result.files.mask_icon?.mimeType).toBe("image/svg+xml");
  });

  it("writes a favicon.ico of three real PNG frames, 16, 32 and 48", async () => {
    const frames = icoFrames(result.files.favicon_ico!.buffer);
    const sizes = await Promise.all(frames.map(async (frame) => (await sharp(frame).metadata()).width));

    expect(sizes).toEqual([16, 32, 48]);
  });

  it("paints the apple touch icon and the maskable icon edge to edge in the field colour", async () => {
    expect(await cornerOf(result.files.apple_touch_icon!.buffer)).toEqual([...FIELD_RGB, 255]);
    expect(await cornerOf(result.files.icon_maskable_512!.buffer)).toEqual([...FIELD_RGB, 255]);
  });

  it("keeps the whole mark of the maskable icon inside the 80% safe-zone circle", async () => {
    const { data, info } = await rawOf(result.files.icon_maskable_512!.buffer);
    const centre = info.width / 2;
    const radius = info.width * 0.4;
    let markPixels = 0;
    let outside = 0;

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const offset = (y * info.width + x) * info.channels;
        // The white letter, as opposed to the green field.
        if (data[offset] > 128) {
          markPixels += 1;
          if (Math.hypot(x + 0.5 - centre, y + 0.5 - centre) > radius) {
            outside += 1;
          }
        }
      }
    }

    expect(markPixels).toBeGreaterThan(1000);
    expect(outside).toBe(0);
  });

  it("draws the Windows tiles as a white silhouette on a transparent tile", async () => {
    const { data, info } = await rawOf(result.files.mstile_150!.buffer);

    expect(data[3]).toBe(0);
    let white = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      if (data[offset + 3] === 255) {
        expect([data[offset], data[offset + 1], data[offset + 2]]).toEqual([255, 255, 255]);
        white += 1;
      }
    }
    expect(white).toBeGreaterThan(500);
  });

  it("derives a background-free, one-colour mask-icon", () => {
    const mask = result.files.mask_icon!.buffer.toString("utf8");

    expect(mask).not.toContain("<rect");
    expect(mask).not.toContain(FIELD);
    expect(mask).toContain('fill="#000"');
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
    const { icon_maskable_512 } = await buildMaskableIcon({
      buffer: CH_MASKABLE,
      isSvg: true,
      fallbackBackground: "#ffffff",
    });
    const meta = await sharp(icon_maskable_512!.buffer).metadata();

    expect([meta.width, meta.height, Boolean(meta.hasAlpha)]).toEqual([512, 512, false]);
    expect(await cornerOf(icon_maskable_512!.buffer)).toEqual([...FIELD_RGB, 255]);
  });
});

describe("buildMonoIcons", () => {
  it("turns a dedicated silhouette into a mask-icon and two white tiles", async () => {
    const files = await buildMonoIcons(CH_MONO);

    expect(files.mask_icon!.buffer.toString("utf8")).toContain('fill="#000"');
    expect(files.mask_icon!.buffer.toString("utf8")).not.toContain("#000000");
    expect((await sharp(files.mstile_310!.buffer).metadata()).width).toBe(310);
  });

  it("returns nothing for a drawing that is not a shape on a transparent canvas", async () => {
    expect(await buildMonoIcons(svg('<path d="M0 0H1024V1024H0Z"/>'))).toEqual({});
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
