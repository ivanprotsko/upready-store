import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows";
import { MedusaError } from "@medusajs/framework/utils";
import sharp from "sharp";
import { getTenantScope } from "../../tenant-scope";
import { tenantFilePrefix } from "../../../../tenant-files";
import { assertSafeSvg } from "../../../../tenant-files/upload-policy";
import { buildIconSet, type IconSetFiles } from "../../../../tenant-files/icon-set";
import { readBranding, type TenantAppIcons } from "../branding";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";

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
 * rejected outright rather than silently squeezed into one.
 *
 * t-2026-10-03-61: `favicon`'s floor moved from 32 to 512 — `buildIconSet`
 * below renders `icon-512`/`icon-maskable-512` out of this same upload, and a
 * raster master under 512px would upscale into a soft, blocky result at that
 * size. An SVG master has no pixel size to check at all (the `extension ===
 * "svg"` branch below skips this block entirely), so it is unaffected. */
const DIMENSION_LIMITS: Record<Kind, { minW: number; minH: number; maxW: number; maxH: number }> = {
  logo_light: { minW: 16, minH: 16, maxW: 2000, maxH: 2000 },
  logo_dark: { minW: 16, minH: 16, maxW: 2000, maxH: 2000 },
  favicon: { minW: 512, minH: 512, maxW: 1024, maxH: 1024 },
  og_image: { minW: 600, minH: 315, maxW: 4000, maxH: 4000 },
};

/** Which `app_icons` field each generated file fills, in the order `buildIconSet` returns them. */
const APP_ICON_FIELDS: Record<keyof IconSetFiles, keyof TenantAppIcons> = {
  icon_svg: "icon_svg_url",
  favicon_ico: "favicon_ico_url",
  apple_touch_icon: "apple_touch_icon_url",
  icon_192: "icon_192_url",
  icon_512: "icon_512_url",
  icon_maskable_512: "icon_maskable_512_url",
  mstile_150: "mstile_150_url",
  mstile_310: "mstile_310_url",
  mask_icon: "mask_icon_url",
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
  const timestamp = Date.now();

  // The timestamp is the cache-busting contract (step 7): every upload is a
  // new name, so a changed logo/favicon is a new URL rather than the same
  // path with stale bytes behind a browser or CDN cache. The icon set below
  // reuses the same timestamp, so one upload's files land together.
  const uploads = [
    {
      filename: `${prefix}branding-${kind}-${timestamp}.${extension}`,
      mimeType: file.mimetype,
      content: file.buffer.toString("base64"),
      access: "public" as const,
    },
  ];

  // t-2026-10-03-61: a `favicon` upload also builds the full PWA/iOS/Android/
  // Windows/macOS icon set (`buildIconSet`) and uploads every file alongside
  // the original — one `favicon_url` becomes a dozen sized, purpose-built
  // files rather than one image stretched everywhere. The tenant's own brand
  // colour backs every icon that cannot be transparent (the apple touch icon,
  // the Windows tiles, the maskable icon's safe-zone padding); a shop with no
  // colour set yet gets white rather than failing the upload over it.
  let iconSetOrder: (keyof IconSetFiles)[] = [];

  if (kind === "favicon") {
    const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
    const fullTenant = await tenantModuleService.retrieveTenant(tenant.id);
    const backgroundColor =
      readBranding(fullTenant.metadata as Record<string, unknown> | null).primary_color ?? "#ffffff";

    const iconSet = await buildIconSet({
      buffer: file.buffer,
      isSvg: extension === "svg",
      backgroundColor,
    });

    iconSetOrder = Object.keys(iconSet) as (keyof IconSetFiles)[];

    for (const key of iconSetOrder) {
      const iconFile = iconSet[key]!;
      uploads.push({
        filename: `${prefix}branding-${timestamp}-${iconFile.name}`,
        mimeType: iconFile.mimeType,
        content: iconFile.buffer.toString("base64"),
        access: "public" as const,
      });
    }
  }

  const { result } = await uploadFilesWorkflow(req.scope).run({ input: { files: uploads } });

  const response: { file: typeof result[0]; kind: Kind; app_icons?: Partial<TenantAppIcons> } = {
    file: result[0],
    kind,
  };

  if (iconSetOrder.length > 0) {
    const appIcons: Partial<TenantAppIcons> = {};
    iconSetOrder.forEach((key, index) => {
      appIcons[APP_ICON_FIELDS[key]] = result[index + 1].url;
    });
    response.app_icons = appIcons;
  }

  res.status(200).json(response);
};
