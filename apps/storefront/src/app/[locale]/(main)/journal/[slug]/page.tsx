import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import {
  getTenantArticle,
  getTenantArticleWithRelated,
  listTenantArticles,
} from "@lib/data/tenant-articles"
import { getRequestBaseURL, getSiteName } from "@lib/data/cookies"
import { buildAlternates } from "@lib/util/alternates"
import { decodeSegment } from "@lib/util/decode-segment"
import { localeUrl } from "@lib/util/json-ld"
import { parseMarkdown } from "@lib/util/markdown"
import { markdownText } from "@lib/util/markdown-text"
import { buildToc } from "@lib/util/markdown-toc"
import { metaDescription } from "@lib/util/meta-description"
import { pageTitle } from "@lib/util/page-title"
import ArticleShare from "@modules/content/components/article-share"
import JsonLd from "@modules/common/components/json-ld"
import MarkdownContent from "@modules/content/components/markdown-content"
import ArticleCover from "@modules/journal/components/article-cover"
import ArticleToc from "@modules/journal/components/article-toc"
import ArticleTocFab from "@modules/journal/components/article-toc-fab"
import { JournalRailSection } from "@modules/journal/components/journal-rail"
import NextArticleLink from "@modules/journal/components/next-article-link"
import { BUTTON_FILLED, BUTTON_OUTLINE, DISPLAY_TITLE } from "@modules/journal/typography"

/**
 * One article of the shop's journal (t10-blog).
 *
 * A draft, an unwritten slug and another tenant's article are all `notFound()`
 * here, because `GET /store/tenant/articles/:slug` answers the same 404 for all
 * three — a visitor must not be able to probe a neighbour's drafts.
 *
 * The body is markdown written by the shop owner, rendered as React elements by
 * `@modules/content/components/markdown-content`, never as HTML
 * (`@lib/util/markdown`'s own note on why). The platform never writes the text:
 * the articles are the owner's.
 *
 * t-2026-10-05-03: laid out after an article of the chrxnasdmds «Журнал здоровья»: the
 * rubric and the title with «Читать далее» to the next article beside them, the excerpt,
 * then the text with a sticky table of contents on its right (a floating button and a
 * bottom sheet under 720 px), two buttons out, and «Читайте также», the rest of the journal
 * starting with the next article. No date, author or reading time is shown: the reference
 * shows none, and the shop's articles carry no byline to show.
 */

type Props = { params: Promise<{ slug: string }> }

/** The whole journal, for the next article and the «Читайте также» rail; the API's own ceiling. */
const JOURNAL_LIMIT = 100

const TITLE_ID = "journal-article-title"

/** Absolute, because an og:image and a JSON-LD image must both resolve off-site. */
const absolute = (base: string, src: string) =>
  /^https?:\/\//.test(src) ? src : `${base}${src.startsWith("/") ? "" : "/"}${src}`

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [params, locale] = await Promise.all([props.params, getLocale()])
  const article = await getTenantArticle(decodeSegment(params.slug))

  if (!article) {
    notFound()
  }

  const base = await getRequestBaseURL()
  // The body is markdown, the same as a content page's: its words, never its markup
  // (t-2026-10-08-13, part A5).
  const description =
    article.seo_description ??
    article.excerpt ??
    metaDescription(markdownText(article.body)) ??
    undefined
  const cover = article.cover_url ? absolute(base, article.cover_url) : null

  return {
    title: await pageTitle(article.seo_title ?? article.title),
    description,
    alternates: await buildAlternates(locale, `/journal/${params.slug}`),
    openGraph: {
      type: "article",
      title: article.seo_title ?? article.title,
      description,
      url: localeUrl(base, locale, `/journal/${params.slug}`),
      publishedTime: article.published_at ?? undefined,
      // b18-blog-full: the byline and the rubric the owner filled in. Absent
      // stays absent — an og:article with the shop's own name where an author
      // goes is a claim nobody made (rule 20a).
      ...(article.author && { authors: [article.author] }),
      ...(article.category && { section: article.category }),
      ...(article.tags.length > 0 && { tags: article.tags }),
      ...(cover && { images: [{ url: cover, alt: article.title }] }),
    },
    ...(cover && {
      twitter: { card: "summary_large_image", images: [cover] },
    }),
  }
}

export default async function JournalArticle(props: Props) {
  const [params, t, tBreadcrumb, tCommon, tSlider, locale] = await Promise.all([
    props.params,
    getTranslations("Journal"),
    getTranslations("Breadcrumb"),
    getTranslations("Common"),
    getTranslations("OlavkaHome.slider"),
    getLocale(),
  ])
  const [found, journal] = await Promise.all([
    getTenantArticleWithRelated(decodeSegment(params.slug)),
    listTenantArticles({ limit: JOURNAL_LIMIT }),
  ])

  if (!found) {
    notFound()
  }

  const { article, related } = found

  const [base, siteName] = await Promise.all([getRequestBaseURL(), getSiteName()])
  const cover = article.cover_url ? absolute(base, article.cover_url) : null
  const url = localeUrl(base, locale, `/journal/${params.slug}`)

  // The reading order of the journal, from this article on: the next one is «Читать
  // далее», and the rest after it, wrapping round, is «Читайте также». An article the
  // feed does not list (the feed is newest-first and capped) falls back to the backend's
  // related three.
  const articles = journal.articles
  const index = articles.findIndex((item) => item.slug === article.slug)
  const rolled =
    index === -1
      ? related
      : [...articles.slice(index + 1), ...articles.slice(0, index)]
  const next = rolled[0] ?? null

  const toc = buildToc(parseMarkdown(article.body))

  // schema.org/Article. `dateModified` is deliberately absent rather than
  // filled with «now»: this storefront does not know when the text last
  // changed, and a stamped-today date would be a claim, not a fact (rule 20a).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.seo_title ?? article.title,
    inLanguage: article.locale,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    ...(article.excerpt && { description: article.excerpt }),
    ...(article.published_at && { datePublished: article.published_at }),
    ...(cover && { image: [cover] }),
    ...(article.tags.length > 0 && { keywords: article.tags.join(", ") }),
    ...(article.category && { articleSection: article.category }),
    publisher: { "@type": "Organization", name: siteName },
    // The owner's byline when there is one, the shop itself otherwise — which
    // is what an unsigned article on a shop's journal actually means.
    author: article.author
      ? { "@type": "Person", name: article.author }
      : { "@type": "Organization", name: siteName },
  }

  const main = (
    <div className="flex min-w-0 flex-col gap-8 small:gap-10">
      {cover ? (
        <div data-testid="journal-article-cover">
          <ArticleCover
            src={cover}
            aspect="aspect-[16/9]"
            sizes="(max-width: 719px) 100vw, (max-width: 1439px) 70vw, 768px"
            priority
            zoom={false}
          />
        </div>
      ) : null}

      <MarkdownContent source={article.body} variant="article" />

      {article.tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2" data-testid="journal-article-tags">
          {article.tags.map((tag) => (
            <li
              key={tag}
              className="txt-compact-small rounded-full bg-ui-bg-subtle px-3 py-1 text-ui-fg-subtle"
            >
              {tag}
            </li>
          ))}
        </ul>
      ) : null}

      <ArticleShare
        url={url}
        title={article.title}
        labels={{
          share: t("share"),
          copyLink: t("copyLink"),
          linkCopied: t("linkCopied"),
        }}
      />

      <div className="flex flex-col gap-3 pt-2 xsmall:flex-row">
        <Link href="/journal" className={BUTTON_OUTLINE} data-testid="journal-article-to-feed">
          {t("backToFeed")}
        </Link>
        <Link href="/store" className={BUTTON_FILLED} data-testid="journal-article-to-catalog">
          {t("toCatalog")}
        </Link>
      </div>
    </div>
  )

  return (
    <>
      <JsonLd data={jsonLd} />

      <article className="content-container flex flex-col gap-8 py-10 small:gap-10 small:py-14">
        {/* b18-blog-full: breadcrumbs, the same pair the catalogue pages use —
            a reader landing from search needs a way up, and one link «back to the
            feed» is not a path. */}
        <nav
          className="txt-compact-small flex flex-wrap items-center gap-x-2 text-ui-fg-subtle"
          aria-label={tBreadcrumb("home")}
          data-testid="journal-breadcrumbs"
        >
          <Link href="/" className="transition-colors hover:text-ui-fg-base">
            {tBreadcrumb("home")}
          </Link>
          <span aria-hidden>/</span>
          <Link
            href="/journal"
            className="transition-colors hover:text-ui-fg-base"
            data-testid="journal-back-link"
          >
            {t("feedTitle")}
          </Link>
          {article.category ? (
            <>
              <span aria-hidden>/</span>
              <Link
                href={`/journal?category=${encodeURIComponent(article.category)}`}
                className="transition-colors hover:text-ui-fg-base"
              >
                {article.category}
              </Link>
            </>
          ) : null}
        </nav>

        <header className="grid grid-cols-1 gap-x-10 gap-y-3 small:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] small:[align-items:last_baseline]">
          <div className="flex flex-col gap-3">
            {article.category ? (
              <span
                className="text-xs uppercase tracking-wide text-ui-fg-muted"
                data-testid="journal-article-category"
              >
                {article.category}
              </span>
            ) : null}
            <h1
              id={TITLE_ID}
              className={`${DISPLAY_TITLE} text-balance text-ui-fg-base`}
              data-testid="journal-article-title"
            >
              {article.title}
            </h1>
          </div>
          {next ? (
            <NextArticleLink
              href={`/journal/${next.slug}`}
              title={next.title}
              label={t("readNext")}
              titleId={TITLE_ID}
            />
          ) : null}
        </header>

        {article.excerpt ? (
          <p className="max-w-3xl text-base leading-relaxed text-ui-fg-subtle small:text-lg">
            {article.excerpt}
          </p>
        ) : null}

        {toc.length > 0 ? (
          <div className="grid grid-cols-1 gap-y-10 min-[720px]:grid-cols-[minmax(0,1fr)_14rem] min-[720px]:gap-x-8 large:grid-cols-[minmax(0,48rem)_16rem] large:gap-x-16">
            {main}
            <aside className="hidden min-[720px]:block">
              <div className="no-scrollbar sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
                <ArticleToc items={toc} label={t("toc")} />
              </div>
            </aside>
          </div>
        ) : (
          <div className="max-w-3xl">{main}</div>
        )}
      </article>

      {toc.length > 0 ? (
        <ArticleTocFab items={toc} labels={{ toc: t("toc"), close: tCommon("close") }} />
      ) : null}

      <JournalRailSection
        articles={rolled}
        title={t("related")}
        headingId="journal-related-heading"
        labels={{ previous: tSlider("previous"), next: tSlider("next") }}
        data-testid="journal-related"
      />
    </>
  )
}
