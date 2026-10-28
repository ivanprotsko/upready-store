import { Link } from "@i18n/navigation"
import type { TenantArticleSummary } from "@lib/data/tenant-articles"
import ArticleCover from "@modules/journal/components/article-cover"
import SectionHeader from "@modules/journal/components/section-header"
import { EYEBROW } from "@modules/journal/typography"

type FeedArticle = Pick<TenantArticleSummary, "slug" | "title" | "excerpt" | "cover_url" | "category">

/**
 * The «Лента» row of the journal page (t-2026-10-05-03), after the chrxnasdmds feed row: a
 * column of titles alone, and beside it the next articles as compact cards, a 4:3 cover on
 * the left and the text on the right.
 *
 * The reference had a third column, «Читают чаще всего». The shop keeps no read counts, so
 * that column is not drawn (`content-contract.md`), and its width goes to the two others:
 * four columns of titles, eight of cards, instead of three, six and three.
 */
export default function FeedRow({
  title,
  list,
  cards,
}: {
  title: string
  list: FeedArticle[]
  cards: FeedArticle[]
}) {
  if (list.length === 0 && cards.length === 0) return null

  return (
    <section className="flex flex-col gap-6 small:gap-8" aria-labelledby="journal-feed-heading" data-testid="journal-feed">
      <SectionHeader id="journal-feed-heading" title={title} />
      <div className="grid grid-cols-1 items-start gap-8 small:grid-cols-12 small:gap-10">
        {list.length > 0 ? (
          <ul className="flex flex-col divide-y divide-ui-border-base small:col-span-4">
            {list.map((article) => (
              <li key={article.slug} className="py-3 first:pt-0 last:pb-0">
                <Link
                  href={`/journal/${article.slug}`}
                  className="group flex flex-col gap-2 rounded-rounded"
                  data-testid="journal-feed-item"
                >
                  {article.category ? (
                    <span className={`${EYEBROW} text-ui-fg-muted`}>{article.category}</span>
                  ) : null}
                  <h3 className="text-base font-medium leading-snug text-ui-fg-base transition-colors group-hover:text-ui-fg-interactive">
                    {article.title}
                  </h3>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {cards.length > 0 ? (
          <ul className={`flex flex-col gap-5 small:gap-6 ${list.length > 0 ? "small:col-span-8" : "small:col-span-12"}`}>
            {cards.map((article) => (
              <li key={article.slug}>
                <Link
                  href={`/journal/${article.slug}`}
                  className="group grid grid-cols-12 gap-4 rounded-rounded small:gap-5"
                  data-testid="journal-feed-card"
                >
                  <div className="col-span-5">
                    <ArticleCover
                      src={article.cover_url}
                      aspect="aspect-[4/3]"
                      sizes="(max-width: 1023px) 40vw, 260px"
                    />
                  </div>
                  <div className="col-span-7 flex flex-col gap-2">
                    {article.category ? (
                      <span className={`${EYEBROW} text-ui-fg-muted`}>{article.category}</span>
                    ) : null}
                    <h3 className="text-balance text-base font-medium leading-snug text-ui-fg-base transition-colors group-hover:text-ui-fg-interactive small:text-lg">
                      {article.title}
                    </h3>
                    {article.excerpt ? (
                      <p className="line-clamp-2 text-sm leading-relaxed text-ui-fg-subtle">
                        {article.excerpt}
                      </p>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}
