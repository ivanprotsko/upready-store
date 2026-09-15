import { clx } from "@medusajs/ui"
import { getSiteBranding } from "@lib/data/tenant-branding"

/**
 * The owner's own footer credit line (t16-owner-branding, step 6): a field,
 * off by default, never a hardcoded string — distinct from `SiteAttribution`
 * next to it, which is upready's own «создание интернет-магазина» line and
 * always present. This one renders nothing unless a tenant turned it on.
 */
export default async function FooterCredit({ className }: { className?: string }) {
  const { footer_credit: credit } = await getSiteBranding()

  if (!credit?.enabled || !credit.text) {
    return null
  }

  return (
    <span
      className={clx("txt-compact-small-plus text-ui-fg-muted whitespace-nowrap", className)}
      data-testid="footer-credit"
    >
      {credit.href ? (
        <a
          href={credit.href}
          target="_blank"
          rel="noopener"
          className="underline underline-offset-2 hover:text-ui-fg-base transition-colors"
        >
          {credit.text}
        </a>
      ) : (
        credit.text
      )}
    </span>
  )
}
