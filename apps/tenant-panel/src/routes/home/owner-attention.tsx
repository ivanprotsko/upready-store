import { Container, Heading, Text } from "@medusajs/ui"
import { TriangleRightMini } from "@medusajs/icons"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { useOwnerCounters } from "../../components/layout/owner-nav"
import { useTenantPages } from "../../hooks/api/pages"
import { useProducts } from "../../hooks/api/products"
import { usePermissions } from "../../hooks/use-permissions"
import { PAGE_SECTIONS, statusOf } from "../pages/page-sections"

type Row = { key: string; count: number; to: string }

/**
 * «Что сделать сейчас» (o21-owner-panel-ux, P2): the first thing on the first
 * screen. Every row is read from the shop's own data and leads to the screen
 * where the job is done; a shop with nothing waiting says so in words.
 */
export const OwnerAttention = () => {
  const { t } = useTranslation()
  // t-2026-10-07-11: a row is read and shown only to a login that may open
  // the screen it leads to. The counters gate their own reads.
  const { can, allowed } = usePermissions()
  const counters = useOwnerCounters()
  const { pages } = useTenantPages({
    staleTime: 60_000,
    retry: false,
    enabled: can("storefront"),
  })
  const drafts = useProducts(
    { status: ["draft"], limit: 1, fields: "id" },
    { staleTime: 60_000, retry: false, enabled: can("catalog") }
  )

  const emptyPages = pages
    ? PAGE_SECTIONS.filter((section) => {
        const page = pages.find((one) => one.key === section.key)
        return !page || statusOf(page) === "empty"
      }).length
    : 0

  const rows: Row[] = [
    { key: "ordersToPack", count: counters.ordersToPack ?? 0, to: "/orders" },
    { key: "reviewsToModerate", count: counters.reviewsToModerate ?? 0, to: "/reviews" },
    { key: "emptyPages", count: emptyPages, to: "/pages" },
    { key: "draftProducts", count: drafts.count ?? 0, to: "/products?status=draft" },
  ].filter((row) => row.count > 0 && allowed(row.to))

  return (
    <Container className="divide-y p-0" data-testid="owner-attention">
      <div className="px-6 py-4">
        <Heading level="h2">{t("home.attention.title")}</Heading>
        {rows.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">
            {t("home.attention.nothing")}
          </Text>
        ) : null}
      </div>
      {rows.map((row) => (
        <Link
          key={row.key}
          to={row.to}
          className="hover:bg-ui-bg-base-hover transition-fg flex min-h-11 items-center gap-x-3 px-6 py-3 outline-none focus-visible:shadow-borders-focus"
        >
          <span className="bg-ui-tag-orange-bg text-ui-tag-orange-text txt-compact-small-plus min-w-7 rounded-full px-2 py-0.5 text-center tabular-nums">
            {row.count}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <Text size="small" weight="plus">
              {t(`home.attention.${row.key}.title`, { count: row.count })}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              {t(`home.attention.${row.key}.hint`)}
            </Text>
          </div>
          <TriangleRightMini className="text-ui-fg-muted shrink-0 rtl:rotate-180" />
        </Link>
      ))}
    </Container>
  )
}
