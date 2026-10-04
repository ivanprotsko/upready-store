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
} as const

export type TenantIconFile = (typeof TENANT_ICON_FILES)[keyof typeof TENANT_ICON_FILES]

export const tenantIconFileOf = (pathname: string): TenantIconFile | null =>
  (TENANT_ICON_FILES as Record<string, TenantIconFile>)[pathname] ?? null

/**
 * The build's own icon, served at `/icon.svg` for a shop that uploaded none — what the deleted
 * `app/icon.svg` file used to be.
 */
export const BUILD_ICON_SVG = `<svg width="600" height="645" viewBox="0 0 600 645" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M523.867 104.699L377.75 20.6709C329.942 -6.89031 271.361 -6.89031 223.553 20.6709L76.762 104.699C29.6275 132.26 0 183.349 0 237.8V406.528C0 461.651 29.6275 512.068 76.762 539.629L222.879 624.329C270.687 651.89 329.269 651.89 377.077 624.329L523.194 539.629C571.002 512.068 599.956 461.651 599.956 406.528V237.8C601.303 183.349 571.675 132.26 523.867 104.699ZM300.315 472.406C217.492 472.406 150.157 405.184 150.157 322.5C150.157 239.816 217.492 172.594 300.315 172.594C383.137 172.594 451.145 239.816 451.145 322.5C451.145 405.184 383.81 472.406 300.315 472.406Z" fill="#18181B"/>
</svg>
`

/**
 * Where a root icon request goes:
 * - `redirect`: the tenant's own file, the same URL its `<link>` tags carry (`lib/tenant/icons.ts`);
 * - `build-svg`: the build's icon, only for `/icon.svg` of a shop with nothing uploaded;
 * - `none`: an empty 404 — never a page rendered in place of an image.
 *
 * `/icon.svg` falls back to the single `favicon_url` of an upload from before the icon set existed,
 * the file that shop's `<link rel="icon">` already points at; the raster files do not, since that
 * upload can be an SVG and `/favicon.ico` or the iOS home-screen icon would then be the wrong type.
 */
export type TenantIconTarget =
  | { kind: "redirect"; url: string }
  | { kind: "build-svg" }
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
      return redirect(set?.icon_svg_url) ?? redirect(branding.favicon_url) ?? { kind: "build-svg" }
    default:
      return { kind: "none" }
  }
}
