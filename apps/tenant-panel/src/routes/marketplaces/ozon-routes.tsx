import { t } from "i18next"
import type { RouteObject } from "react-router-dom"

import { ErrorBoundary } from "../../components/utilities/error-boundary"

// t-2026-10-16-37: the screens of «Ozon» under `/marketplaces/ozon`, in place
// of the stub of 2026-10-05. «Подключение» (the Client-Id and API key fields)
// is the index, then the Wildberries screens, which read the marketplace from
// the address (`common/use-route-marketplace.ts`). Read only: the Ozon
// transport sends nothing but registered reads. Reviews and analytics stay
// Wildberries-only, see the Ozon entry of the sidebar in `nav-model.ts`.
//
// The paths are absolute so that a search for an address finds it here. They
// live in this file, not in app.tsx, because app.tsx stays within its recorded
// length (`scripts/file-length-allowlist.json`, t-2026-10-14-55);
// `owner-routes-manifest.test.mjs` and `nav-routes.test.mjs` read them through
// the import in app.tsx.
export const ozonChildren: RouteObject[] = [
  {
    index: true,
    errorElement: <ErrorBoundary />,
    lazy: () => import("./mp-connection"),
  },
  {
    path: "/marketplaces/ozon/products",
    handle: { breadcrumb: () => t("mp.products.title") },
    errorElement: <ErrorBoundary />,
    lazy: () => import("./mp-products"),
  },
  {
    path: "/marketplaces/ozon/products/:id",
    handle: { breadcrumb: () => t("mp.products.title") },
    errorElement: <ErrorBoundary />,
    lazy: () => import("./mp-products/detail"),
  },
  {
    path: "/marketplaces/ozon/price-stock",
    handle: { breadcrumb: () => t("mp.priceStock.title") },
    errorElement: <ErrorBoundary />,
    lazy: () => import("./mp-price-stock"),
  },
  {
    path: "/marketplaces/ozon/orders",
    handle: { breadcrumb: () => t("mp.orders.title") },
    errorElement: <ErrorBoundary />,
    lazy: () => import("./mp-orders"),
  },
  {
    path: "/marketplaces/ozon/orders/:id",
    handle: { breadcrumb: () => t("mp.orders.title") },
    errorElement: <ErrorBoundary />,
    lazy: () => import("./mp-orders/detail"),
  },
  {
    path: "/marketplaces/ozon/sync",
    handle: { breadcrumb: () => t("mp.sync.title") },
    errorElement: <ErrorBoundary />,
    lazy: () => import("./mp-sync"),
  },
]
