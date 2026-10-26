import type { ReactNode } from "react"

import { SECTION_TITLE } from "@modules/journal/typography"

/**
 * The heading of a section of the journal page (t-2026-10-05-03), after the chrxnasdmds
 * journal: a small-caps title, a hairline to the far edge, and an optional slot on the right
 * (a rail's arrows).
 */
export default function SectionHeader({
  title,
  id,
  children,
}: {
  title: string
  id?: string
  children?: ReactNode
}) {
  return (
    <div className="flex items-center gap-4 small:gap-6">
      <h2 id={id} className={`${SECTION_TITLE} text-ui-fg-base`}>
        {title}
      </h2>
      <span aria-hidden className="h-px flex-1 bg-ui-border-base" />
      {children}
    </div>
  )
}
