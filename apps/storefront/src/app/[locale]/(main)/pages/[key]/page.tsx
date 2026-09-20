import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"

import { getTenantPage } from "@lib/data/tenant-pages"
import { buildAlternates } from "@lib/util/alternates"
import { decodeSegment } from "@lib/util/decode-segment"
import { getSiteName } from "@lib/data/cookies"
import { metaDescription } from "@lib/util/meta-description"
import { pageTitle } from "@lib/util/page-title"
import { parseInline } from "@lib/util/markdown"
import MarkdownContent, { Inline } from "@modules/content/components/markdown-content"

/**
 * One content page of this storefront's tenant, written from the tenant panel
 * (`/pages/:key` there) and published from it. Wave 2, piece 7 of the tenant
 * panel; contract `docs/tenant-panel/api-contract.md`, "Piece 7".
 *
 * Unpublished, unwritten and another tenant's page are all `notFound()` here,
 * because `GET /store/tenant/pages/:key` answers the same 404 for all three —
 * a visitor must not be able to probe a neighbour's drafts.
 *
 * The body is markdown written by the shop owner, rendered as React elements by
 * `@modules/content/components/markdown-content`, never as HTML
 * (`@lib/util/markdown`'s own note on why).
 */

type Props = { params: Promise<{ key: string }> }

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [params, locale, t] = await Promise.all([
    props.params,
    getLocale(),
    getTranslations("TenantPage"),
  ])
  const page = await getTenantPage(decodeSegment(params.key))

  if (!page) {
    notFound()
  }

  return {
    title: await pageTitle(page.seo_title || page.title),
    description:
      metaDescription(page.seo_description, page.body) ??
      t("metaDescription", { title: page.title, siteName: await getSiteName() }),
    alternates: await buildAlternates(locale, `/pages/${params.key}`),
  }
}

export default async function TenantContentPage(props: Props) {
  const [params, t] = await Promise.all([props.params, getTranslations("TenantPage")])
  const page = await getTenantPage(decodeSegment(params.key))

  if (!page) {
    notFound()
  }

  const hasBody = page.body.trim().length > 0

  return (
    <div className="content-container flex flex-col gap-y-6 py-12 max-w-2xl">
      <h1 className="text-2xl-semi text-ui-fg-base">
        <Inline nodes={parseInline(page.title)} />
      </h1>
      {hasBody ? (
        <MarkdownContent source={page.body} />
      ) : (
        <p className="text-base-regular text-ui-fg-subtle">{t("emptyBody")}</p>
      )}
    </div>
  )
}
