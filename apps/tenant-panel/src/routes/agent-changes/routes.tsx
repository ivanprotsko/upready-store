import type { RouteObject } from "react-router-dom"

import { ErrorBoundary } from "../../components/utilities/error-boundary"

// t-2026-10-27-04: the screens of «Изменения агента» under `/agent-changes`:
// the list is the index, a changeset's card opens over it at `:id`. They live
// in this file, not in app.tsx, because app.tsx stays within its recorded
// length (`scripts/file-length-allowlist.json`, t-2026-10-14-55);
// `owner-routes-manifest.test.mjs` and `nav-routes.test.mjs` read them through
// the import in app.tsx.
export const agentChangesChildren: RouteObject[] = [
  {
    path: "",
    errorElement: <ErrorBoundary />,
    lazy: () => import("./changeset-list"),
    children: [
      {
        path: ":id",
        lazy: () => import("./changeset-detail"),
      },
    ],
  },
]
