import { Fragment, type ReactNode } from "react"

/**
 * Puts a keyed Fragment between a host element (`<div>`, `<header>`…) and
 * children the RSC payload may deliver as lazy references (`"$L…"`): an async
 * Server Component, next-intl's server `Link` (it suspends on the locale), or
 * any element that comes after a row passed 3200 bytes, which Flight defers to
 * a row of its own (46df U-06). Put it where the row is still small, best as
 * the host's first and only child: Flight defers an element only once its row
 * is already past the limit, so a slot that comes first stays in the row.
 *
 * React 19.2, the canary Next 15.5 bundles, hydrates a host element by claiming
 * its DOM node first and reconciling its children after. When a child is a lazy
 * that is still pending, the element suspends and is replayed, and the replay
 * claims again from a cursor already moved inside that node
 * (react/react#37584): every `<div>` below then matches one level too deep and
 * hydration throws #418 on the first tag that differs. It needs the JS early and
 * a row late, so it shows in a browser that has the chunks cached: /checkout in
 * Chromium, 1–2 loads of 10.
 *
 * A Fragment is not a host fiber, so when it suspends and is replayed the cursor
 * stays where it was. The key is what keeps it: Flight drops key-less Fragments.
 */
export default function HydrationSlot({ children }: { children: ReactNode }) {
  return <Fragment key="hydration-slot">{children}</Fragment>
}
