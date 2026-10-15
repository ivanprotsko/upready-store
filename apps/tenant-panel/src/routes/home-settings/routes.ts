import type { RouteObject } from "react-router-dom"

// t-2026-10-14-01 (panel redesign, G4): the nested routes of `/home-settings`.
// The page only reads; each of its sections is edited in its own drawer here.
// They live in this file, not in app.tsx, because app.tsx stays within its
// recorded length (`scripts/file-length-allowlist.json`, t-2026-10-14-55);
// `owner-routes-manifest.test.mjs` reads them through the import in app.tsx.
export const homeSettingsChildren: RouteObject[] = [
  {
    path: "theme/edit",
    lazy: () => import("./home-theme-edit"),
  },
  {
    path: "blocks/edit",
    lazy: () => import("./home-blocks-edit"),
  },
  {
    path: "hero/edit",
    lazy: () => import("./home-hero-edit"),
  },
  {
    path: "banners/create",
    lazy: () => import("./home-banner-create"),
  },
  {
    path: "banners/:bannerId/edit",
    lazy: () => import("./home-banner-edit"),
  },
  {
    path: "products/edit",
    lazy: () => import("./home-products-edit"),
  },
  {
    path: "order/edit",
    lazy: () => import("./home-order-edit"),
  },
]
