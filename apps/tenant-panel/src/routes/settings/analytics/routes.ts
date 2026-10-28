import type { RouteObject } from "react-router-dom"

// t-2026-10-14-01 (panel redesign, G1): the screen of `/settings/analytics`
// only reads; its fields are edited in this drawer, the way profile-edit
// hangs under /settings/profile. The drawer lives in this file, not in
// app.tsx, because app.tsx stays within its recorded length
// (`scripts/file-length-allowlist.json`, t-2026-10-14-55).
export const analyticsSettingsChildren: RouteObject[] = [
  {
    path: "edit",
    lazy: () => import("./analytics-edit"),
  },
]
