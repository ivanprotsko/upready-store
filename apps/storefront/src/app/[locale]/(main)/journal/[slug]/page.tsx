import type { Metadata } from "next"
import Image from "next/image"
import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { getTenantArticle, getTenantArticleWithRelated } from "@lib/data/tenant-articles"
import { getRequestBaseURL, getSiteName } from "@lib/data/cookies"
import { buildAlternates } from "@lib/util/alternates"
import { decodeSegment } from "@lib/util/decode-segment"
import { localeUrl } from "@lib/util/json-ld"
import { metaDescription } from "@lib/util/meta-description"
import { pageTitle } from "@lib/util/page-title"
import ArticleShare from "@modules/content/components/article-share"
import JsonLd from "@modules/common/components/json-ld"
import MarkdownContent from "@modules/content/components/markdown-content"

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
 */

type Props = { params: Promise<{ slug: string }> }

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
  const description =
    article.seo_description ?? article.excerpt ?? metaDescription(article.body) ?? undefined
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
  const [params, t, tBreadcrumb, locale] = await Promise.all([
    props.params,
    getTranslations("Journal"),
    getTranslations("Breadcrumb"),
    getLocale(),
  ])
  const found = await getTenantArticleWithRelated(decodeSegment(params.slug))

  if (!found) {
    notFound()
  }

  const { article, related } = found

  const [base, siteName] = await Promise.all([getRequestBaseURL(), getSiteName()])
  const cover = article.cover_url ? absolute(base, article.cover_url) : null
  const url = localeUrl(base, locale, `/journal/${params.slug}`)

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

  const dateFormat = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="content-container flex flex-col gap-y-6 py-12 max-w-2xl">
      <JsonLd data={jsonLd} />

      {/* b18-blog-full: breadcrumbs, the same pair the catalogue pages use —
          a reader landing from search needs a way up, and one link «back to the
          feed» is not a path. */}
      <nav
        className="txt-compact-small text-ui-fg-subtle flex flex-wrap items-center gap-x-2"
        aria-label={tBreadcrumb("home")}
        data-testid="journal-breadcrumbs"
      >
        <Link href="/" className="hover:text-ui-fg-base transition-colors">
          {tBreadcrumb("home")}
        </Link>
        <span aria-hidden>/</span>
        <Link
          href="/journal"
          className="hover:text-ui-fg-base transition-colors"
          data-testid="journal-back-link"
        >
          {t("feedTitle")}
        </Link>
        {article.category ? (
          <>
            <span aria-hidden>/</span>
            <Link
              href={`/journal?category=${encodeURIComponent(article.category)}`}
              className="hover:text-ui-fg-base transition-colors"
            >
              {article.category}
            </Link>
          </>
        ) : null}
      </nav>

      <div className="flex flex-col gap-y-2">
        <div className="txt-compact-small text-ui-fg-muted flex flex-wrap items-center gap-x-2">
          {article.published_at ? (
            <time dateTime={article.published_at}>
              {dateFormat.format(new Date(article.published_at))}
            </time>
          ) : null}
          {article.published_at ? <span aria-hidden>·</span> : null}
          <span data-testid="journal-article-reading-time">
            {t("readingTime", { minutes: article.reading_minutes })}
          </span>
          {article.author ? (
            <>
              <span aria-hidden>·</span>
              <span data-testid="journal-article-author">{article.author}</span>
            </>
          ) : null}
        </div>
        <h1 className="text-2xl-semi text-ui-fg-base" data-testid="journal-article-title">
          {article.title}
        </h1>
        {article.excerpt ? (
          <p className="text-base-regular text-ui-fg-subtle">{article.excerpt}</p>
        ) : null}
      </div>

      {cover ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-rounded bg-ui-bg-subtle">
          <Image
            src={cover}
            alt={article.title}
            fill
            sizes="(max-width: 768px) 100vw, 672px"
            className="object-cover"
            priority
            data-testid="journal-article-cover"
          />
        </div>
      ) : null}

      <MarkdownContent source={article.body} />

      {article.tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2 pt-4" data-testid="journal-article-tags">
          {article.tags.map((tag) => (
            <li
              key={tag}
              className="txt-compact-small text-ui-fg-subtle bg-ui-bg-subtle rounded-full px-3 py-1"
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

      {related.length > 0 ? (
        <section className="border-ui-border-base border-t pt-8" data-testid="journal-related">
          <h2 className="text-base-semi text-ui-fg-base">{t("related")}</h2>
          <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-6 small:grid-cols-3">
            {related.map((item) => (
              <li key={item.slug}>
                <Link
                  href={`/journal/${item.slug}`}
                  className="group flex flex-col gap-y-2"
                  data-testid="journal-related-card"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-rounded bg-ui-bg-subtle">
                    {item.cover_url ? (
                      <Image
                        src={absolute(base, item.cover_url)}
                        alt={item.title}
                        fill
                        sizes="(max-width: 640px) 100vw, 224px"
                        className="object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                    ) : null}
                  </div>
                  <span className="txt-compact-small text-ui-fg-muted">
                    {t("readingTime", { minutes: item.reading_minutes })}
                  </span>
                  <span className="text-base-semi text-ui-fg-base group-hover:text-ui-fg-interactive transition-colors">
                    {item.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
