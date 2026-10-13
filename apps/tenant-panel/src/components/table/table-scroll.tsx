import { clx } from "@medusajs/ui"
import { PropsWithChildren } from "react"

/**
 * t-2026-10-13-30: the one container every hand-rolled `<Table>` of the panel
 * sits in. A table wider than its card scrolls sideways inside the card; the
 * page itself stays put. Without it the shell's `main` scrolls instead, and on
 * a phone the whole screen (heading, card, form) slides off the left edge, as
 * Ivan saw on /courses at 390 px.
 *
 * `min-w-0` lets the box shrink inside a flex parent, `max-w-full` keeps it
 * from growing past one, and `overscroll-x-contain` stops a swipe that reaches
 * the table's end from carrying on to the page. The shared `_DataTable` has
 * the same guard built in, so this is for `Table` of @medusajs/ui used
 * directly. `src/__tests__/table-scroll.test.mjs` fails a route that renders
 * one outside it.
 */
export const TABLE_SCROLL =
  "w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]"

export const TableScroll = ({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) => {
  return (
    <div className={clx(TABLE_SCROLL, className)} data-table-scroll="">
      {children}
    </div>
  )
}
