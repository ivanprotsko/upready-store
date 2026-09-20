import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows";
import { MedusaError } from "@medusajs/framework/utils";
import sharp from "sharp";
import { getTenantScope } from "../../tenant-scope";
import { tenantFilePrefix } from "../../../../tenant-files";

/**
 * `POST /tenants/branding/upload` (t16-owner-branding, step 2) — logo,
 * favicon and og-image uploads. Separate from `POST /tenants/uploads`
 * (product/hero media) on purpose: this one enforces a mime allow-list, a
 * size cap and a dimension check per `kind`, which the generic upload route
 * cannot without narrowing every other caller of it.
 *
 * Multipart parsing reuses the Admin's own upload middlewares, the same way
 * `/tenants/uploads` does (`src/api/middlewares.ts`); `kind` rides as a plain
 * text field on the same multipart body and lands in `req.body.kind`.
 */

type UploadedFile = { originalname: string; mimetype: string; buffer: Buffer };

const KINDS = ["logo_light", "logo_dark", "favicon", "og_image"] as const;
type Kind = (typeof KINDS)[number];

const isKind = (value: unknown): value is Kind => KINDS.includes(value as Kind);

const ACCEPTED_MIME: Record<string, "svg" | "png" | "webp"> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_BYTES: Record<Kind, number> = {
  logo_light: 2 * 1024 * 1024,
  logo_dark: 2 * 1024 * 1024,
  favicon: 512 * 1024,
  og_image: 5 * 1024 * 1024,
};

/** Width/height bounds per kind. A favicon far outside "icon-shaped" is
 * rejected outright rather than silently squeezed into one. */
const DIMENSION_LIMITS: Record<Kind, { minW: number; minH: number; maxW: number; maxH: number }> = {
  logo_light: { minW: 16, minH: 16, maxW: 2000, maxH: 2000 },
  logo_dark: { minW: 16, minH: 16, maxW: 2000, maxH: 2000 },
  favicon: { minW: 32, minH: 32, maxW: 1024, maxH: 1024 },
  og_image: { minW: 600, minH: 315, maxW: 4000, maxH: 4000 },
};

/**
 * A crude but real guard, not a full sanitizer (the task asks to "validate
 * SVG content or rasterise it", and rasterising a vector logo would defeat
 * the point of shipping one): reject the shapes that turn an <img> upload
 * into script execution — an inline `<script>`, an event-handler attribute,
 * a `javascript:` URI, or `<foreignObject>`, which can carry arbitrary HTML.
 * Anything else in a well-formed SVG document is left untouched.
 */
const SVG_DANGER = /<script|on[a-z]+\s*=|javascript:|<foreignobject/i;

const assertSafeSvg = (buffer: Buffer): void => {
  const text = buffer.toString("utf8");

  if (!text.includes("<svg")) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "The file is not a valid SVG document.");
  }

  if (SVG_DANGER.test(text)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "This SVG carries a script or an event handler and cannot be used as branding.",
    );
  }
};

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const kind = (req.body as { kind?: string } | undefined)?.kind;

  if (!isKind(kind)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `\`kind\` must be one of ${KINDS.join(", ")}.`);
  }

  const files = (req as unknown as { files?: UploadedFile[] }).files;

  if (!files?.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "No file was uploaded");
  }

  const file = files[0];
  const extension = ACCEPTED_MIME[file.mimetype];

  if (!extension) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${file.mimetype} is not accepted here; upload SVG, PNG or WebP.`,
    );
  }

  if (file.buffer.byteLength > MAX_BYTES[kind]) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `The file is larger than ${Math.round(MAX_BYTES[kind] / 1024)} KB.`,
    );
  }

  if (extension === "svg") {
    assertSafeSvg(file.buffer);
  } else {
    const { width, height } = await sharp(file.buffer).metadata();
    const limits = DIMENSION_LIMITS[kind];

    if (!width || !height) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Could not read this image's dimensions.");
    }

    if (width < limits.minW || height < limits.minH) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `This image is ${width}x${height}px; it needs to be at least ${limits.minW}x${limits.minH}px.`,
      );
    }

    if (width > limits.maxW || height > limits.maxH) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `This image is ${width}x${height}px; it can be at most ${limits.maxW}x${limits.maxH}px.`,
      );
    }
  }

  const tenant = await getTenantScope(req);
  const prefix = tenantFilePrefix(tenant.id);

  // The timestamp is the cache-busting contract (step 7): every upload is a
  // new name, so a changed logo/favicon is a new URL rather than the same
  // path with stale bytes behind a browser or CDN cache.
  const { result } = await uploadFilesWorkflow(req.scope).run({
    input: {
      files: [
        {
          filename: `${prefix}branding-${kind}-${Date.now()}.${extension}`,
          mimeType: file.mimetype,
          content: file.buffer.toString("base64"),
          access: "public" as const,
        },
      ],
    },
  });

  res.status(200).json({ file: result[0], kind });
};
