import sharp from "sharp";

/**
 * Synthetic product photos for the packshot specs, drawn from SVG so every run
 * gets the same pixels. Coordinates are in pixels of a `width × height` frame.
 */

export const svgPicture = async (width: number, height: number, body: string, background = "#ffffff"): Promise<Buffer> =>
  sharp(
    Buffer.from(
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${background}"/>
        ${body}
      </svg>`,
    ),
  )
    .png()
    .toBuffer();

/** A tall dark bottle, 300 × 800, standing at row 1000 of a 900 × 1200 white frame. */
export const tallBottle = () =>
  svgPicture(900, 1200, `<rect x="300" y="200" width="300" height="800" rx="40" fill="#1e3a8a"/>`);

/** A wide flat box, 800 × 200, standing at row 700 of a 900 × 1200 white frame. */
export const wideBox = () =>
  svgPicture(900, 1200, `<rect x="50" y="500" width="800" height="200" fill="#b45309"/>`);

/**
 * A dark amber bottle (bottom row 899) with a mirror reflection fading under it
 * and a soft contact shadow, the shape of Ivan's shadow reference. The reflection
 * never gets darker than min channel 150, the bottle body is far below 120.
 */
export const darkBottleWithReflection = () =>
  svgPicture(
    900,
    1200,
    `<defs>
      <linearGradient id="refl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgb(190,160,150)"/>
        <stop offset="100%" stop-color="rgb(255,255,255)"/>
      </linearGradient>
      <radialGradient id="sh"><stop offset="0%" stop-color="#000" stop-opacity="0.3"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse cx="450" cy="900" rx="200" ry="14" fill="url(#sh)"/>
    <rect x="300" y="900" width="300" height="200" fill="url(#refl)"/>
    <rect x="300" y="200" width="300" height="700" fill="rgb(70,35,15)"/>`,
  );

/**
 * A white jar with a grey rim (bottom row 899) standing in a contact shadow that
 * is wider than the jar: the light-container path of `removeShadow`.
 */
export const whiteJarWithShadow = () =>
  svgPicture(
    900,
    1200,
    `<defs>
      <radialGradient id="sh"><stop offset="0%" stop-color="#000" stop-opacity="0.45"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse cx="450" cy="895" rx="260" ry="30" fill="url(#sh)"/>
    <rect x="250" y="400" width="400" height="500" fill="rgb(190,190,190)"/>
    <rect x="256" y="406" width="388" height="488" fill="rgb(232,232,232)"/>
    <rect x="300" y="550" width="300" height="150" fill="rgb(200,30,30)"/>`,
  );

export const decode = async (png: Buffer) => sharp(png).raw().toBuffer({ resolveWithObject: true });
