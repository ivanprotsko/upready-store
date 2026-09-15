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

export type TenantBranding = {
  logo_light_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  og_image_url: string | null;
  primary_color: string | null;
  shop_name_short: string | null;
  footer_credit: TenantFooterCredit | null;
};

export const EMPTY_BRANDING: TenantBranding = {
  logo_light_url: null,
  logo_dark_url: null,
  favicon_url: null,
  og_image_url: null,
  primary_color: null,
  shop_name_short: null,
  footer_credit: null,
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
  };
};

/** The wire shape both `/tenants/branding` and `/storefront/by-host` answer with. */
export const brandingResponse = (branding: TenantBranding) => ({
  ...branding,
  primary_foreground: branding.primary_color ? bestForeground(branding.primary_color) : null,
  low_contrast: branding.primary_color ? isLowContrast(branding.primary_color) : false,
});

export type TenantBrandingResponse = ReturnType<typeof brandingResponse>;
