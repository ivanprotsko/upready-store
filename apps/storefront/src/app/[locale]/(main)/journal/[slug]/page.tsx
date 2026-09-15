import type { Metadata } from "next"
import Image from "next/image"
import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { getTenantArticle } from "@lib/data/tenant-articles"
import { getRequestBaseURL, getSiteName } from "@lib/data/cookies"
import { buildAlternates } from "@lib/util/alternates"
import { localeUrl } from "@lib/util/json-ld"
import { metaDescription } from "@lib/util/meta-description"
import { pageTitle } from "@lib/util/page-title"
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
  const article = await getTenantArticle(params.slug)

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
      ...(cover && { images: [{ url: cover, alt: article.title }] }),
    },
    ...(cover && {
      twitter: { card: "summary_large_image", images: [cover] },
    }),
  }
}

export default async function JournalArticle(props: Props) {
  const [params, t, locale] = await Promise.all([
    props.params,
    getTranslations("Journal"),
    getLocale(),
  ])
  const article = await getTenantArticle(params.slug)

  if (!article) {
    notFound()
  }

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
    publisher: { "@type": "Organization", name: siteName },
    author: { "@type": "Organization", name: siteName },
  }

  const dateFormat = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="content-container flex flex-col gap-y-6 py-12 max-w-2xl">
      <JsonLd data={jsonLd} />

      <Link
        href="/journal"
        className="txt-compact-small text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
        data-testid="journal-back-link"
      >
        {t("backToFeed")}
      </Link>

      <div className="flex flex-col gap-y-2">
        {article.published_at ? (
          <time dateTime={article.published_at} className="txt-compact-small text-ui-fg-muted">
            {dateFormat.format(new Date(article.published_at))}
          </time>
        ) : null}
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
    </div>
  )
}
