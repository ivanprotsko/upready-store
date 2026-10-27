import { t } from "i18next"
import type { RouteObject } from "react-router-dom"

import { ErrorBoundary } from "../../components/utilities/error-boundary"

// t-2026-10-20-45: the screen of «Аналитика магазина» under `/analytics`. It
// lives in this file, not in app.tsx, because app.tsx stays within its
// recorded length (`scripts/file-length-allowlist.json`, t-2026-10-14-55);
// `owner-routes-manifest.test.mjs` reads it through the import in app.tsx.
export const shopAnalyticsChildren: RouteObject[] = [
  {
    index: true,
    handle: { breadcrumb: () => t("shopAnalytics.title") },
    errorElement: <ErrorBoundary />,
    lazy: () => import("./index"),
  },
]
