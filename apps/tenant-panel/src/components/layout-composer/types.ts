import type { ReactNode } from "react"

// tenant-panel: trimmed copy of the Admin's layout-composer/types.ts. The
// Admin's version re-exports `LayoutSection`/`Layouts`/`SectionNameFor` from
// `@medusajs/admin-shared` to key `sections` by the layout's own section ids
// (used for widget injection and saved layout preferences). The panel has no
// widgets and no per-user layout preferences, so `sections` is a plain
// `Record<string, ReactNode>` instead.
export type LayoutComponentProps = {
  sections: Record<string, ReactNode>
  data?: unknown
  className?: string
}
