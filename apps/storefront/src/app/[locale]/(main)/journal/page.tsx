import type { Metadata } from "next"
import Image from "next/image"
import { getLocale, getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { listTenantArticles } from "@lib/data/tenant-articles"
import { buildAlternates } from "@lib/util/alternates"
import { getSiteName } from "@lib/data/cookies"
import { pageTitle } from "@lib/util/page-title"

/**
 * The shop's journal feed (t10-blog). This platform's shops are «магазины-
 * журналы»: the articles are what brings search and AI traffic to the catalog,
 * so the feed is a first-class page of the storefront rather than a footer
 * link.
 *
 * Renders inside the tenant's own theme by construction — it is a route of the
 * `(main)` group, whose layout carries the header, the footer and the theme
 * the shop owner chose.
 *
 * A shop with no published article still answers 200 with an empty-state line
 * rather than a 404: the URL is part of the storefront, and the navigation
 * simply does not link it until there is something to read
 * (`hasPublishedArticles`).
 */

const PER_PAGE = 12

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata(_props: Props): Promise<Metadata> {
  const [locale, t, siteName] = await Promise.all([
    getLocale(),
    getTranslations("Journal"),
    getSiteName(),
  ])

  return {
    title: await pageTitle(t("feedTitle")),
    description: t("feedDescription", { siteName }),
    alternates: await buildAlternates(locale, "/journal"),
  }
}

/** A page number the visitor typed is data, not a promise: 0, -3 and "abc" all mean page 1. */
const parsePage = (raw: string | undefined): number => {
  const parsed = Number.parseInt(raw ?? "", 10)
  return Number.isFinite(parsed) && parsed > 1 ? parsed : 1
}

export default async function JournalFeed(props: Props) {
  const [searchParams, t, locale] = await Promise.all([
    props.searchParams,
    getTranslations("Journal"),
    getLocale(),
  ])

  const page = parsePage(searchParams.page)
  const { articles, count } = await listTenantArticles({
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  })
  const lastPage = Math.max(1, Math.ceil(count / PER_PAGE))

  const dateFormat = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="content-container py-12">
      <h1 className="text-2xl-semi text-ui-fg-base" data-testid="journal-heading">
        {t("feedTitle")}
      </h1>

      {articles.length === 0 ? (
        <p className="text-base-regular text-ui-fg-subtle mt-6" data-testid="journal-empty">
          {t("empty")}
        </p>
      ) : (
        <ul
          className="mt-8 grid grid-cols-1 gap-x-6 gap-y-10 small:grid-cols-2 medium:grid-cols-3"
          data-testid="journal-list"
        >
          {articles.map((article) => (
            <li key={article.slug}>
              <Link
                href={`/journal/${article.slug}`}
                className="group flex flex-col gap-y-3"
                data-testid="journal-card"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-rounded bg-ui-bg-subtle">
                  {article.cover_url ? (
                    <Image
                      src={article.cover_url}
                      alt={article.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  ) : null}
                </div>
                <div className="flex flex-col gap-y-1">
                  {article.published_at ? (
                    <time
                      dateTime={article.published_at}
                      className="txt-compact-small text-ui-fg-muted"
                    >
                      {dateFormat.format(new Date(article.published_at))}
                    </time>
                  ) : null}
                  <h2 className="text-base-semi text-ui-fg-base group-hover:text-ui-fg-interactive transition-colors">
                    {article.title}
                  </h2>
                  {article.excerpt ? (
                    <p className="txt-compact-small text-ui-fg-subtle line-clamp-3">
                      {article.excerpt}
                    </p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {lastPage > 1 ? (
        <nav
          className="mt-12 flex items-center justify-between"
          aria-label={t("pagination")}
          data-testid="journal-pagination"
        >
          {page > 1 ? (
            <Link
              href={page === 2 ? "/journal" : `/journal?page=${page - 1}`}
              className="txt-compact-small text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
            >
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="txt-compact-small text-ui-fg-muted">
            {t("pageOf", { page, lastPage })}
          </span>
          {page < lastPage ? (
            <Link
              href={`/journal?page=${page + 1}`}
              className="txt-compact-small text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
            >
              {t("next")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  )
}
