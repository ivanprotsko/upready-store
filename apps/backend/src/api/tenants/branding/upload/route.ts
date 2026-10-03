import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows";
import { MedusaError } from "@medusajs/framework/utils";
import sharp from "sharp";
import { getTenantScope } from "../../tenant-scope";
import { tenantFilePrefix } from "../../../../tenant-files";
import { assertSafeSvg } from "../../../../tenant-files/upload-policy";
import {
  buildIconSet,
  buildMaskableIcon,
  buildMonoIcons,
  type IconSetFiles,
  type IconSetKey,
} from "../../../../tenant-files/icon-set";
import { EMPTY_APP_ICONS, readBranding, type TenantAppIcons } from "../branding";
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
 *
 * t-2026-10-03-61: a `favicon` upload also builds the app-icon set
 * (`tenant-files/icon-set.ts`) and answers its URLs as `app_icons`, next to
 * `file`. Two optional kinds refine that set afterwards and answer only the
 * fields they replace: `favicon_maskable` (the Android icon, the mark already
 * inside the 80% safe zone) and `favicon_mono` (an SVG silhouette for Safari's
 * pinned tab). Like every other kind, nothing is saved
 * here; the panel PUTs the URLs to `/tenants/branding`.
 */

type UploadedFile = { originalname: string; mimetype: string; buffer: Buffer };

const KINDS = ["logo_light", "logo_dark", "favicon", "favicon_maskable", "favicon_mono", "og_image"] as const;
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
  favicon_maskable: 512 * 1024,
  favicon_mono: 512 * 1024,
  og_image: 5 * 1024 * 1024,
};

/** Width/height bounds per kind. A favicon far outside "icon-shaped" is
 * rejected outright rather than silently squeezed into one.
 *
 * t-2026-10-03-61: a raster favicon now starts at 512px, because the 512px
 * app icons render out of it and anything smaller would upscale. An SVG has
 * no pixel size to check and skips this table. `favicon_mono` takes SVG only,
 * so it has no row here. */
const DIMENSION_LIMITS: Record<Exclude<Kind, "favicon_mono">, { minW: number; minH: number; maxW: number; maxH: number }> = {
  logo_light: { minW: 16, minH: 16, maxW: 2000, maxH: 2000 },
  logo_dark: { minW: 16, minH: 16, maxW: 2000, maxH: 2000 },
  favicon: { minW: 512, minH: 512, maxW: 1024, maxH: 1024 },
  favicon_maskable: { minW: 512, minH: 512, maxW: 1024, maxH: 1024 },
  og_image: { minW: 600, minH: 315, maxW: 4000, maxH: 4000 },
};

/** Which `app_icons` field each generated file fills. */
const APP_ICON_FIELDS: Record<IconSetKey, Exclude<keyof TenantAppIcons, "background_color" | "mark_color">> = {
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

const ICON_KINDS = new Set<Kind>(["favicon", "favicon_maskable", "favicon_mono"]);

/** The tenant's primary colour, or white: what goes behind an opaque icon when the master has no
 * field colour of its own. */
const fallbackBackground = async (req: AuthenticatedMedusaRequest, tenantId: string): Promise<string> => {
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const tenant = await tenantModuleService.retrieveTenant(tenantId);

  return readBranding(tenant.metadata as Record<string, unknown> | null).primary_color ?? "#ffffff";
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

  if (kind === "favicon_mono" && extension !== "svg") {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "The one-colour icon has to be an SVG.");
  }

  if (file.buffer.byteLength > MAX_BYTES[kind]) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `The file is larger than ${Math.round(MAX_BYTES[kind] / 1024)} KB.`,
    );
  }

  if (extension === "svg") {
    assertSafeSvg(file.buffer);
  } else if (kind !== "favicon_mono") {
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
  const isSvg = extension === "svg";

  let iconFiles: IconSetFiles = {};
  let backgroundColor: string | null = null;
  let markColor: string | null = null;

  if (ICON_KINDS.has(kind)) {
    if (kind === "favicon") {
      const set = await buildIconSet({
        buffer: file.buffer,
        isSvg,
        fallbackBackground: await fallbackBackground(req, tenant.id),
      });
      iconFiles = set.files;
      backgroundColor = set.backgroundColor;
      markColor = set.markColor;
    } else if (kind === "favicon_maskable") {
      iconFiles = await buildMaskableIcon({
        buffer: file.buffer,
        isSvg,
        fallbackBackground: await fallbackBackground(req, tenant.id),
      });
    } else {
      iconFiles = await buildMonoIcons(file.buffer);

      if (!iconFiles.mask_icon) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "The one-colour icon has to be a shape on a transparent background.",
        );
      }
    }
  }

  const iconKeys = Object.keys(iconFiles) as IconSetKey[];

  // The timestamp is the cache-busting contract (step 7): every upload is a
  // new name, so a changed logo/favicon is a new URL rather than the same
  // path with stale bytes behind a browser or CDN cache. The generated icons
  // share it, so one upload's files sit together in storage.
  const { result } = await uploadFilesWorkflow(req.scope).run({
    input: {
      files: [
        {
          filename: `${prefix}branding-${kind}-${timestamp}.${extension}`,
          mimeType: file.mimetype,
          content: file.buffer.toString("base64"),
          access: "public" as const,
        },
        ...iconKeys.map((key) => ({
          filename: `${prefix}branding-${kind}-${timestamp}-${iconFiles[key]!.name}`,
          mimeType: iconFiles[key]!.mimeType,
          content: iconFiles[key]!.buffer.toString("base64"),
          access: "public" as const,
        })),
      ],
    },
  });

  if (!ICON_KINDS.has(kind)) {
    res.status(200).json({ file: result[0], kind });
    return;
  }

  // `createFiles` answers in the order it was given the files, the original first.
  const appIcons: Partial<TenantAppIcons> =
    kind === "favicon" ? { ...EMPTY_APP_ICONS, background_color: backgroundColor, mark_color: markColor } : {};

  iconKeys.forEach((key, index) => {
    appIcons[APP_ICON_FIELDS[key]] = result[index + 1].url;
  });

  res.status(200).json({ file: result[0], kind, app_icons: appIcons });
};
