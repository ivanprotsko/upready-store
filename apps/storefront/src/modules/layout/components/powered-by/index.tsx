import { clx } from "@medusajs/ui"
import { getTranslations } from "next-intl/server"
import { getTenantHandle } from "@lib/data/cookies"
import { Fragment } from "react"

import Gorgo from "@modules/common/icons/gorgo"
import Medusa from "@modules/common/icons/medusa"
import NextJs from "@modules/common/icons/nextjs"

const ICON_COLOR = "#9ca3af"

const links = [
  { href: "https://gorgojs.com", label: "Gorgo", Icon: Gorgo },
  { href: "https://medusajs.com", label: "Medusa", Icon: Medusa },
  { href: "https://nextjs.org", label: "Next.js", Icon: NextJs },
]

export default async function PoweredBy({
  className,
}: {
  className?: string
}) {
  // A shop on the shared engine is its owner's product, not the starter's: no
  // "Powered by Gorgo & Medusa & Next.js" credit on a tenant storefront. Measured
  // 2026-09-12 on nochlavka.shipshift.dev: a shop created minutes earlier carried
  // four links to foreign products in its footer. A single-store stand keeps the line.
  if ((await getTenantHandle()) !== null) {
    return null
  }

  const t = await getTranslations("Common")

  return (
    <span
      className={clx(
        "flex items-center gap-x-2 txt-compact-small-plus text-ui-fg-muted",
        className
      )}
    >
      {t("poweredBy")}
      {links.map(({ href, label, Icon }, index) => (
        <Fragment key={href}>
          {index > 0 && "&"}
          <a href={href} target="_blank" rel="noreferrer" aria-label={label}>
            <Icon color={ICON_COLOR} />
          </a>
        </Fragment>
      ))}
    </span>
  )
}
