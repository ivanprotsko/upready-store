import type { Metadata } from "next"
import { getLocale, getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { isOlavkaShop } from "@lib/data/olavka-shop"
import {
  listTenantArticleCategories,
  listTenantArticles,
  type TenantArticleSummary,
} from "@lib/data/tenant-articles"
import { buildAlternates } from "@lib/util/alternates"
import { getSiteName } from "@lib/data/cookies"
import { pageTitle } from "@lib/util/page-title"
import CategoryRail from "@modules/journal/components/category-rail"
import FeedRow from "@modules/journal/components/feed-row"
import JournalCard from "@modules/journal/components/journal-card"
import JournalHero from "@modules/journal/components/journal-hero"
import Masthead from "@modules/journal/components/masthead"

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
 *
 * t-2026-10-05-03: the front page is composed after the chrxnasdmds «Журнал здоровья»: the
 * masthead, the hero (the newest article and the two after it), the «Лента» row, then one
 * rail per rubric. A rubric (`?category=`) or a later page is the plain grid with paging,
 * under the same masthead. The reference's «Авторы журнала», «Сезонные сборы», «Читают
 * чаще всего» and «Истории» are not drawn: the shop has no data behind them.
 */

const PER_PAGE = 12

/** The whole journal for the front page's rails; the store API's own ceiling. */
const FRONT_LIMIT = 100

/** The hero takes three articles, the «Лента» cards the next three, its title list six more. */
const HERO_SIZE = 3
const FEED_CARDS = 3
const FEED_LIST = 6

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ page?: string; category?: string }>
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
  const [searchParams, t, tOlavka, tSlider, siteName, olavka] = await Promise.all([
    props.searchParams,
    getTranslations("Journal"),
    getTranslations("OlavkaHome.journal"),
    getTranslations("OlavkaHome.slider"),
    getSiteName(),
    isOlavkaShop(),
  ])

  const page = parsePage(searchParams.page)
  // b18-blog-full: the rubric a reader is browsing. A rubric the shop does not
  // use answers an empty feed rather than the whole journal — a stale link must
  // not silently show «everything» and pass it off as the rubric.
  const category = searchParams.category?.trim() || undefined
  const front = !category && page === 1

  const [{ articles, count }, categories] = await Promise.all([
    front
      ? listTenantArticles({ limit: FRONT_LIMIT })
      : listTenantArticles({ limit: PER_PAGE, offset: (page - 1) * PER_PAGE, category }),
    listTenantArticleCategories(),
  ])
  const lastPage = Math.max(1, Math.ceil(count / PER_PAGE))

  /** Keeps the rubric while paging, and drops `page=1` from the address. */
  const feedHref = (next: { page?: number; category?: string | undefined }) => {
    const query = new URLSearchParams()
    if (next.category) query.set("category", next.category)
    if (next.page && next.page > 1) query.set("page", String(next.page))
    const suffix = query.toString()
    return suffix ? `/journal?${suffix}` : "/journal"
  }

  const masthead = (
    <div className="content-container">
      <Masthead
        title={olavka ? tOlavka("title") : t("feedTitle")}
        subtitle={olavka ? tOlavka("subtitle") : t("feedDescription", { siteName })}
      />
    </div>
  )

  if (articles.length === 0 && !category) {
    return (
      <>
        {masthead}
        <div className="content-container pb-16 small:pb-24">
          <p className="text-center text-base text-ui-fg-subtle" data-testid="journal-empty">
            {t("empty")}
          </p>
        </div>
      </>
    )
  }

  if (front) {
    const rest = articles.slice(HERO_SIZE)
    const byCategory = (name: string): TenantArticleSummary[] =>
      articles.filter((article) => article.category === name)

    return (
      <>
        {masthead}
        <div className="content-container flex flex-col gap-16 pb-16 small:gap-24 small:pb-24">
          <JournalHero main={articles[0]} aside={articles.slice(1, HERO_SIZE)} />
          <FeedRow
            title={t("feed")}
            cards={rest.slice(0, FEED_CARDS)}
            list={rest.slice(FEED_CARDS, FEED_CARDS + FEED_LIST)}
          />
          {categories.map((option, index) => (
            <CategoryRail
              key={option.category}
              index={index}
              title={option.category}
              articles={byCategory(option.category)}
              labels={{ previous: tSlider("previous"), next: tSlider("next") }}
            />
          ))}
        </div>
      </>
    )
  }

  return (
    <>
      {masthead}
      <div className="content-container flex flex-col gap-8 pb-16 small:gap-10 small:pb-24">
        {categories.length > 0 ? (
          <nav
            className="flex flex-wrap items-center justify-center gap-2"
            aria-label={t("categories")}
            data-testid="journal-categories"
          >
            <Link
              href={feedHref({ category: undefined })}
              className={`txt-compact-small rounded-full border px-3 py-1 transition-colors ${
                category
                  ? "border-ui-border-base text-ui-fg-subtle hover:text-ui-fg-base"
                  : "border-ui-border-interactive text-ui-fg-base"
              }`}
            >
              {t("allCategories")}
            </Link>
            {categories.map((option) => (
              <Link
                key={option.category}
                href={feedHref({ category: option.category })}
                className={`txt-compact-small rounded-full border px-3 py-1 transition-colors ${
                  option.category === category
                    ? "border-ui-border-interactive text-ui-fg-base"
                    : "border-ui-border-base text-ui-fg-subtle hover:text-ui-fg-base"
                }`}
                aria-current={option.category === category ? "page" : undefined}
                data-testid="journal-category-chip"
              >
                {option.category}
              </Link>
            ))}
          </nav>
        ) : null}

        {articles.length === 0 ? (
          <p className="text-center text-base text-ui-fg-subtle" data-testid="journal-empty">
            {t("empty")}
          </p>
        ) : (
          <ul
            className="grid grid-cols-1 gap-x-6 gap-y-10 xsmall:grid-cols-2 small:grid-cols-3"
            data-testid="journal-list"
          >
            {articles.map((article) => (
              <li key={article.slug} className="flex">
                <JournalCard
                  article={article}
                  sizes="(max-width: 511px) 100vw, (max-width: 1023px) 50vw, 440px"
                />
              </li>
            ))}
          </ul>
        )}

        {lastPage > 1 ? (
          <nav
            className="flex items-center justify-between"
            aria-label={t("pagination")}
            data-testid="journal-pagination"
          >
            {page > 1 ? (
              <Link
                href={feedHref({ page: page - 1, category })}
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
                href={feedHref({ page: page + 1, category })}
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
    </>
  )
}
