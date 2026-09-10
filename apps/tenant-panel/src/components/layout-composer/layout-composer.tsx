import type { ReactNode } from "react"
import { Outlet } from "react-router-dom"

import { SingleColumnLayoutComponent } from "../layout/pages/single-column-page/single-column-layout-component"
import { TwoColumnLayoutComponent } from "../layout/pages/two-column-page/two-column-layout-component"
import { LayoutEntry } from "./entry"

// tenant-panel: own replacement for the Admin's LayoutComposer
// (components/layout-composer/layout-composer.tsx). The Admin version resolves
// a named "layout" (single-column/two-column/...) from `@medusajs/admin-shared`,
// injects widgets registered by extensions into each section, and drives a
// dnd-kit edit mode that lets a user reorder/hide entries and save the result
// as a per-user or per-zone layout preference (persisted through
// hooks/use-layout-preference and an admin-only endpoint).
//
// The panel has no extensions (no widgets to inject) and no saved layout
// preferences, so this keeps only what copied screens (product-create,
// product-list, ...) actually rely on: the same prop shape
// (`widgetsZonePrefix`, `preferredLayoutId`, `sections`, `hasOutlet`, plus the
// extra props the Admin passes at some call sites, accepted here and ignored)
// and the same visual markup, reusing the Admin's own
// SingleColumnLayoutComponent/TwoColumnLayoutComponent. No drag-and-drop, no
// widget injection, no edit mode.
export type LayoutComposerProps = {
  /**
   * Corresponds to the page for widget injection zones in the Admin. Kept for
   * call-site compatibility with copied screens; unused (no widgets here).
   */
  widgetsZonePrefix: string
  /**
   * The Admin's layout id (e.g. `CORE_LAYOUT_IDS.SINGLE_COLUMN` or
   * `CORE_LAYOUT_IDS.TWO_COLUMN`). Read only to pick single- vs two-column
   * markup; every other layout id renders as single-column.
   */
  preferredLayoutId: string
  /**
   * Content to render per section: `main`, and `side` (or `sidebar`, the
   * Admin's two-column layout itself reads `sections["side"]`) for a
   * two-column layout.
   */
  sections: Record<string, ReactNode>
  data?: unknown
  /**
   * Whether to render an `Outlet` after the layout, used by nested routes
   * (drawers, dialogs). Defaults to true, matching the Admin.
   */
  hasOutlet?: boolean
  className?: string
  /** Accepted for call-site compatibility with the Admin; unused. */
  customizeId?: string
  controlSize?: string
  disableWidgets?: boolean
  layoutProps?: Record<string, unknown>
}

function LayoutComposerRoot({
  preferredLayoutId,
  sections,
  data,
  hasOutlet = true,
  className,
}: LayoutComposerProps) {
  const isTwoColumn = preferredLayoutId === "core:two-column"
  const side = sections["side"] ?? sections["sidebar"]

  return (
    <>
      {isTwoColumn ? (
        <TwoColumnLayoutComponent
          sections={{ main: sections["main"], side }}
          data={data}
          className={className}
        />
      ) : (
        <SingleColumnLayoutComponent
          sections={{ main: sections["main"] }}
          data={data}
          className={className}
        />
      )}
      {hasOutlet && <Outlet />}
    </>
  )
}

export const LayoutComposer = Object.assign(LayoutComposerRoot, {
  Entry: LayoutEntry,
})
