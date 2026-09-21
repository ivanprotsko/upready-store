import path from "path";
import { MedusaError } from "@medusajs/framework/utils";

/**
 * What an owner may put into public storage, and how the backend serves it
 * (architecture review 2026-09-21, finding S-4).
 *
 * The local file provider writes into `static/`, and the framework serves that
 * directory from the engine's own host with the type the FILE NAME asks for.
 * So the name decides what a browser does with the file, not the type the
 * caller claimed, and both are checked here.
 */

/** The pictures a browser only ever paints. */
const RASTER: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/avif": [".avif"],
  "image/heic": [".heic"],
  "image/heif": [".heif", ".heic"],
};

const SVG_MIME = "image/svg+xml";

export const RASTER_EXTENSIONS = new Set(Object.values(RASTER).flat());

/**
 * A crude but real guard, not a full sanitizer: reject the shapes that turn an
 * <img> upload into script execution, an inline `<script>`, an event-handler
 * attribute, a `javascript:` URI, or `<foreignObject>`, which can carry
 * arbitrary HTML. Anything else in a well-formed SVG document is left untouched.
 */
const SVG_DANGER = /<script|on[a-z]+\s*=|javascript:|<foreignobject/i;

export const assertSafeSvg = (buffer: Buffer): void => {
  const text = buffer.toString("utf8");

  if (!text.includes("<svg")) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "The file is not a valid SVG document.");
  }

  if (SVG_DANGER.test(text)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "This SVG carries a script or an event handler and cannot be uploaded.",
    );
  }
};

type UploadedFile = { originalname: string; mimetype: string; buffer: Buffer };

/**
 * `POST /tenants/uploads` takes pictures: the raster types above, and an SVG
 * that passes `assertSafeSvg` (the panel's media form offers SVG). Everything
 * else is refused, a page and a script first of all.
 */
export const assertUploadIsAPicture = (file: UploadedFile): void => {
  const extension = path.extname(file.originalname).toLowerCase();
  const extensions = file.mimetype === SVG_MIME ? [".svg"] : RASTER[file.mimetype];

  if (!extensions) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${file.mimetype} is not accepted here; upload JPEG, PNG, GIF, WebP, AVIF, HEIC or SVG.`,
    );
  }

  if (!extensions.includes(extension)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `The name "${file.originalname}" does not match the type ${file.mimetype}.`,
    );
  }

  if (file.mimetype === SVG_MIME) {
    assertSafeSvg(file.buffer);
  }
};

/**
 * Headers of a file served from `static/`. `nosniff` holds the browser to the
 * declared type. Whatever is not a raster picture (a drawing, a CSV export, a
 * page somebody stored before the upload learned to refuse it) goes out as a
 * download: opening its address runs nothing, and an `<img>` still paints it,
 * because a browser ignores `Content-Disposition` on a picture it embeds.
 */
export const staticFileHeaders = (filePath: string): Record<string, string> => {
  const headers: Record<string, string> = { "X-Content-Type-Options": "nosniff" };

  if (!RASTER_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    headers["Content-Disposition"] = "attachment";
  }

  return headers;
};
