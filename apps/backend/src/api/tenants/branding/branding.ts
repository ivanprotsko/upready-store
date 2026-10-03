import { bestForeground, isLowContrast, isValidHexColor } from "./contrast";

/**
 * The tenant's brand identity (t16-owner-branding): logo, favicon, og image,
 * primary colour and the footer credit line. Lives in `tenant.metadata.branding`,
 * the same convention `attribution`/`seo_verification` already use
 * (`api/storefront/by-host/attribution.ts`, `api/tenants/seo-verification/route.ts`)
 * rather than a new model+migration — one JSON document, merged field by field on
 * every write so a route never clobbers a field it does not know about.
 *
 * Every URL here is a storage key handed back by `POST /tenants/branding/upload`,
 * which names each upload `branding-<kind>-<timestamp>.<ext>` — a NEW name every
 * time, so a changed logo is a new URL rather than the same path with stale bytes
 * behind a cache (step 7 of the task).
 */
export type TenantFooterCredit = {
  enabled: boolean;
  text: string;
  href: string | null;
};

/**
 * The app-icon set `POST /tenants/branding/upload` builds from a `favicon` upload
 * (t-2026-10-03-61, `tenant-files/icon-set.ts`): every size a PWA, iOS, Android, Windows or macOS
 * install asks for. `favicon_url` stays the single original upload; a tenant with no set (nothing
 * uploaded since this task) has `null` here, and the storefront falls back to `favicon_url` alone,
 * as before. `background_color` is the colour behind the opaque icons, the master's own field when
 * it has one; the storefront uses it for the manifest and the Windows tile when the shop set no
 * primary colour. `mark_color` is the mark's own colour, which Safari's pinned tab takes when the
 * field is lighter than the mark.
 */
export type TenantAppIcons = {
  icon_svg_url: string | null;
  favicon_ico_url: string | null;
  apple_touch_icon_url: string | null;
  icon_192_url: string | null;
  icon_512_url: string | null;
  icon_maskable_512_url: string | null;
  mstile_150_url: string | null;
  mstile_310_url: string | null;
  mask_icon_url: string | null;
  background_color: string | null;
  mark_color: string | null;
};

export const EMPTY_APP_ICONS: TenantAppIcons = {
  icon_svg_url: null,
  favicon_ico_url: null,
  apple_touch_icon_url: null,
  icon_192_url: null,
  icon_512_url: null,
  icon_maskable_512_url: null,
  mstile_150_url: null,
  mstile_310_url: null,
  mask_icon_url: null,
  background_color: null,
  mark_color: null,
};

export type TenantBranding = {
  logo_light_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  og_image_url: string | null;
  primary_color: string | null;
  shop_name_short: string | null;
  footer_credit: TenantFooterCredit | null;
  app_icons: TenantAppIcons | null;
};

export const EMPTY_BRANDING: TenantBranding = {
  logo_light_url: null,
  logo_dark_url: null,
  favicon_url: null,
  og_image_url: null,
  primary_color: null,
  shop_name_short: null,
  footer_credit: null,
  app_icons: null,
};

const str = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

/**
 * `tenant.metadata.branding` as stored, defensively read: a value nobody
 * expects (an old row, a manual edit) is dropped in favour of the safe default
 * rather than thrown on, because a shop with a malformed field must still
 * render (rule 20, the same posture `resolveAttribution` takes on `metadata`).
 */
export const readBranding = (metadata: Record<string, unknown> | null | undefined): TenantBranding => {
  const raw = (metadata?.branding ?? null) as Partial<TenantBranding> | null;

  if (!raw || typeof raw !== "object") {
    return EMPTY_BRANDING;
  }

  const credit = raw.footer_credit as Partial<TenantFooterCredit> | null | undefined;

  return {
    logo_light_url: str(raw.logo_light_url),
    logo_dark_url: str(raw.logo_dark_url),
    favicon_url: str(raw.favicon_url),
    og_image_url: str(raw.og_image_url),
    primary_color: isValidHexColor(raw.primary_color) ? (raw.primary_color as string) : null,
    shop_name_short: str(raw.shop_name_short),
    footer_credit:
      credit && typeof credit === "object"
        ? { enabled: Boolean(credit.enabled), text: str(credit.text) ?? "", href: str(credit.href) }
        : null,
    app_icons: readAppIcons(raw.app_icons),
  };
};

const readAppIcons = (raw: unknown): TenantAppIcons | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const source = raw as Partial<TenantAppIcons>;

  return {
    icon_svg_url: str(source.icon_svg_url),
    favicon_ico_url: str(source.favicon_ico_url),
    apple_touch_icon_url: str(source.apple_touch_icon_url),
    icon_192_url: str(source.icon_192_url),
    icon_512_url: str(source.icon_512_url),
    icon_maskable_512_url: str(source.icon_maskable_512_url),
    mstile_150_url: str(source.mstile_150_url),
    mstile_310_url: str(source.mstile_310_url),
    mask_icon_url: str(source.mask_icon_url),
    background_color: isValidHexColor(source.background_color) ? (source.background_color as string) : null,
    mark_color: isValidHexColor(source.mark_color) ? (source.mark_color as string) : null,
  };
};

/**
 * The `app_icons` a `PUT /tenants/branding` leaves behind (t-2026-10-03-61). The set is built from
 * one favicon upload, so it follows that favicon: a body naming `app_icons` sets them, and a body
 * that clears or replaces `favicon_url` without naming them drops the old set, which would
 * otherwise keep painting the previous icon everywhere except the one `<link>` `favicon_url` feeds.
 */
export const mergeAppIcons = (
  body: { favicon_url?: string | null; app_icons?: Partial<TenantAppIcons> | null },
  current: TenantBranding,
): TenantAppIcons | null => {
  if (body.app_icons !== undefined) {
    return body.app_icons ? readAppIcons(body.app_icons) : null;
  }

  if (body.favicon_url !== undefined && body.favicon_url !== current.favicon_url) {
    return null;
  }

  return current.app_icons;
};

/** The wire shape both `/tenants/branding` and `/storefront/by-host` answer with. */
export const brandingResponse = (branding: TenantBranding) => ({
  ...branding,
  primary_foreground: branding.primary_color ? bestForeground(branding.primary_color) : null,
  low_contrast: branding.primary_color ? isLowContrast(branding.primary_color) : false,
});

export type TenantBrandingResponse = ReturnType<typeof brandingResponse>;
