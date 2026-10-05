import type { TenantBranding } from "./branding"

/**
 * The root icon URLs a browser or a crawler asks for by convention, not through a `<link>`
 * (t-2026-10-04-21): `/favicon.ico`, `/icon.svg` and `/apple-touch-icon.png`. One process answers
 * for every shop by Host, so a static file cannot carry a tenant's icon: `src/middleware.ts`
 * rewrites each of them to `app/tenant-icon/[file]/route.ts`, which answers from this table.
 *
 * Before this, `/icon.svg` was the build's own `app/icon.svg` on every shop whatever its branding,
 * and `/favicon.ico`/`/apple-touch-icon.png` had no file at all, so `app/[locale]` rendered them
 * as a home page: 200 text/html, the starter theme's texts, and on a host the middleware never saw
 * (`favicon.ico` was excluded from its matcher) the build's site name in `<title>`.
 */
export const TENANT_ICON_FILES = {
  "/favicon.ico": "favicon-ico",
  "/icon.svg": "icon-svg",
  "/apple-touch-icon.png": "apple-touch-icon",
  // Next's own file-convention name for the same icon (`app/apple-icon.png`), which a crawler
  // or an audit asks for by name. No page links it, and without this entry `[locale]` rendered
  // it as a page: 200 text/html on both Черкашино sites (t-2026-10-04-19, F09). It is the
  // same 180×180 picture, so it answers with the tenant's apple-touch icon.
  "/apple-icon.png": "apple-touch-icon",
} as const

export type TenantIconFile = (typeof TENANT_ICON_FILES)[keyof typeof TENANT_ICON_FILES]

export const tenantIconFileOf = (pathname: string): TenantIconFile | null =>
  (TENANT_ICON_FILES as Record<string, TenantIconFile>)[pathname] ?? null

/**
 * Where a root icon request goes:
 * - `redirect`: the tenant's own file, the same URL its `<link>` tags carry (`lib/tenant/icons.ts`);
 * - `placeholder`: the standard placeholder (`./placeholder-icon.ts`), only for `/icon.svg` of a
 *   shop with nothing uploaded. Until ask-20261006-021217-bd59 this was the build's own icon, the
 *   starter theme's mark, on every such shop;
 * - `none`: an empty 404 — never a page rendered in place of an image.
 *
 * `/icon.svg` falls back to the single `favicon_url` of an upload from before the icon set existed,
 * the file that shop's `<link rel="icon">` already points at; the raster files do not, since that
 * upload can be an SVG and `/favicon.ico` or the iOS home-screen icon would then be the wrong type.
 */
export type TenantIconTarget =
  | { kind: "redirect"; url: string }
  | { kind: "placeholder" }
  | { kind: "none" }

export const resolveTenantIcon = (file: string, branding: TenantBranding): TenantIconTarget => {
  const set = branding.app_icons
  const redirect = (url: string | null | undefined): TenantIconTarget | null =>
    url ? { kind: "redirect", url } : null

  switch (file) {
    case "favicon-ico":
      return redirect(set?.favicon_ico_url) ?? { kind: "none" }
    case "apple-touch-icon":
      return redirect(set?.apple_touch_icon_url) ?? { kind: "none" }
    case "icon-svg":
      return redirect(set?.icon_svg_url) ?? redirect(branding.favicon_url) ?? { kind: "placeholder" }
    default:
      return { kind: "none" }
  }
}
