import { clx } from "@medusajs/ui"
import { BookOpenText } from "lucide-react"
import Image from "next/image"
import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { resolveImageRef } from "@lib/data/block-image"
import { listTenantArticles } from "@lib/data/tenant-articles"
import { templatePreviewEnabled } from "@lib/templates/preview-header"

import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import { SECTION_TYPE } from "../../shared/section-type"
import type { BlogFeaturedProps } from "./props"

/** One card as drawn: a post of the journal or, on the templates stand only, a preview post. */
type Card = {
  key: string
  href: string
  title: string
  excerpt: string | null
  /** An ISO date or timestamp, the `<time datetime>`. */
  date: string | null
  cover: { url: string; alt: string } | null
}

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ring)]"

/** A fixture's `YYYY-MM-DD` read at local noon, so no time zone moves it to the day before. */
const calendarDate = (value: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value)

const COLUMNS: Record<number, string> = { 2: "small:grid-cols-2", 3: "small:grid-cols-3" }

/** What the browser fetches: the card's share of the viewport at each width. */
const SIZES: Record<number, string> = {
  2: "(min-width: 720px) 50vw, 100vw",
  3: "(min-width: 1024px) 33vw, (min-width: 720px) 50vw, 100vw",
}

/** The latest posts of the shop's journal, newest first, as the `/journal` feed reads them. */
async function journalCards(limit: number): Promise<Card[]> {
  const { articles } = await listTenantArticles({ limit })
  return articles.slice(0, limit).map((article) => ({
    key: article.slug,
    href: `/journal/${encodeURIComponent(article.slug)}`,
    title: article.title,
    excerpt: article.excerpt?.trim() || null,
    date: article.published_at,
    cover: article.cover_url ? { url: article.cover_url, alt: "" } : null,
  }))
}

/** The fixture posts of a template, in the visitor's language, each leading to the feed. */
async function previewCards(posts: BlogFeaturedProps["previewPosts"], limit: number, locale: string): Promise<Card[]> {
  const cards = await Promise.all(
    posts.slice(0, limit).map(async (post, index) => {
      const title = pickText(post.title, locale)
      if (!title) return null
      const picture = post.cover ? await resolveImageRef(post.cover, locale) : null
      return {
        key: `preview-${index}`,
        href: "/journal",
        title,
        excerpt: pickText(post.excerpt, locale),
        date: post.date,
        cover: picture ? { url: picture.url, alt: "" } : null,
      } satisfies Card
    })
  )
  return cards.filter((card): card is Card => card !== null)
}

/**
 * `blog/featured` (t-2026-10-12-33, R1 build list item 12): the latest posts of the shop's journal on the
 * home page, the section six Shopify themes of R1 carry as «From the blog». The posts are the ones the
 * `/journal` feed shows, read through the same loader (`listTenantArticles`), so a draft never shows and the
 * visitor's language is the backend's choice.
 *
 * - One column on a phone, two from 720 px, `columns` (2 or 3) from 1024 px; `limit` posts, 3 to 6.
 * - A card is one link to its article: the cover in a 4:3 frame, as the feed crops it, then the date
 *   (`showDate`), the title and the excerpt (`showExcerpt`, four lines at most). A post with no cover keeps
 *   the frame, drawn on `--muted` with the journal's icon, so a row of cards keeps one shape.
 * - Under the cards, the link to all posts (`showSeeAll`), in the block's own words while it is `lab`. The
 *   shell's header carries no link here: the parser refuses `header.seeAll`.
 *
 * The type stays on the shell's scale (`shared/section-type.ts`) and its 1.15× steps: the date and the
 * excerpt take the see-all link's 16 / 14 px; the title is 20 px below 1024, a step over the 16 px text, and
 * from 1024 the description's 18 px, set apart by weight. At 16 px a layer's display face (Cormorant in
 * `long-morning`) drew the title smaller than the excerpt.
 *
 * No post, nothing drawn. On the templates stand (`STOREFRONT_TEMPLATE_PREVIEW=1`), and only while the journal
 * is empty, the block draws `previewPosts` instead, so the playground and the shots have something to show;
 * a live shop never sees them.
 */
export default async function BlogFeatured({
  header,
  limit,
  columns,
  showDate,
  showExcerpt,
  showSeeAll,
  seeAllLabel,
  previewPosts,
}: BlogFeaturedProps) {
  const locale = await getLocale()
  let cards = await journalCards(limit)
  if (!cards.length && templatePreviewEnabled()) {
    cards = await previewCards(previewPosts, limit, locale)
  }

  if (!cards.length) {
    return null
  }

  const dateFormat = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" })
  const seeAllText = showSeeAll ? pickText(seeAllLabel, locale) : null

  return (
    <BlockSection block="blog/featured" locale={locale} header={header}>
      <ul
        data-role="card-list"
        className={clx(
          "grid grid-cols-1 gap-x-8 gap-y-[var(--layer-space-8,2rem)] min-[720px]:grid-cols-2",
          COLUMNS[columns]
        )}
      >
        {cards.map((card) => (
          <li key={card.key} className="flex">
            <article data-role="card" className="flex w-full">
              <Link
                href={card.href}
                className={clx("group flex w-full flex-col gap-[var(--layer-space-4,1rem)] rounded-[var(--radius)]", focusRing)}
              >
                <div
                  data-role="card-image"
                  data-cover={card.cover ? "image" : "placeholder"}
                  className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius)] bg-[var(--muted)]"
                >
                  {card.cover ? (
                    <Image
                      src={card.cover.url}
                      alt={card.cover.alt}
                      fill
                      sizes={SIZES[columns]}
                      className="object-cover transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                  ) : (
                    <span aria-hidden className="absolute inset-0 flex items-center justify-center text-ui-fg-muted">
                      <BookOpenText className="size-8" strokeWidth={1.5} />
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {showDate && card.date ? (
                    <time dateTime={card.date} className="text-base text-ui-fg-muted small:text-sm">
                      {dateFormat.format(calendarDate(card.date))}
                    </time>
                  ) : null}
                  <h3
                    data-role="card-title"
                    className="text-pretty text-xl font-semibold text-ui-fg-base underline-offset-4 group-hover:underline small:text-lg"
                  >
                    {card.title}
                  </h3>
                  {showExcerpt && card.excerpt ? (
                    <p data-role="description" className="line-clamp-4 max-w-prose text-pretty text-base text-ui-fg-subtle small:text-sm">
                      {card.excerpt}
                    </p>
                  ) : null}
                </div>
              </Link>
            </article>
          </li>
        ))}
      </ul>
      {seeAllText ? (
        <div className="mt-[var(--layer-space-8,2rem)] flex justify-center">
          <Link
            href="/journal"
            data-role="cta-secondary"
            className={clx(
              "inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] px-6 text-ui-fg-base transition-colors hover:bg-[var(--muted)] motion-reduce:transition-none",
              SECTION_TYPE.seeAll,
              focusRing
            )}
          >
            {seeAllText}
          </Link>
        </div>
      ) : null}
    </BlockSection>
  )
}
