import { clx } from "@medusajs/ui"
import { getSiteAttribution } from "@lib/data/attribution"
import HydrationSlot from "@modules/common/components/hydration-slot"

/**
 * «создание интернет-магазина — upready» in the footer, the anchor being a link
 * to us (`t-2026-09-12-footer-attribution`).
 *
 * It replaces `PoweredBy`, which credited the starter's own stack — Gorgo, Medusa
 * and Next.js — on a shop that belongs to its owner, and which hid itself below
 * `lg` on top of that. This line is the point of the task, so it renders at every
 * width; the footer's bottom bar stacks on a narrow screen instead
 * (`artifacts/docs/2026-09-12-storefront-wave2-mockup.md` §1.2).
 *
 * Neither half is a translated UI string: the anchor is an SEO keyword picked per
 * shop and the brand is a name, so both come from data rather than
 * `messages/*.json` (the same rule `SITE_NAME` already follows).
 */
export default function SiteAttribution(props: { className?: string }) {
  // Async, so a lazy row in the RSC payload, and every footer puts it straight
  // into a `<div>`: the slot keeps that lazy off the `<div>`'s own children
  // (46df U-06, HydrationSlot).
  return (
    <HydrationSlot>
      <SiteAttributionContent {...props} />
    </HydrationSlot>
  )
}

async function SiteAttributionContent({
  className,
}: {
  className?: string
}) {
  const { anchor, href, brand, rel } = await getSiteAttribution()

  return (
    <span
      className={clx(
        "txt-compact-small-plus text-ui-fg-muted whitespace-nowrap",
        className
      )}
      data-testid="site-attribution"
    >
      <a
        href={href}
        target="_blank"
        rel={rel}
        className="underline underline-offset-2 hover:text-ui-fg-base transition-colors"
      >
        {anchor}
      </a>
      {` — ${brand}`}
    </span>
  )
}
