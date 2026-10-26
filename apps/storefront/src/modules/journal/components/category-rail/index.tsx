import type { TenantArticleSummary } from "@lib/data/tenant-articles"
import JournalCard from "@modules/journal/components/journal-card"

import CategoryRailTrack from "./track"

/**
 * One rubric of the journal as a rail of cards (t-2026-10-05-03), after the chrxnasdmds
 * category rails: one and a half cards in a row on a phone, two and a half from 512 px,
 * a little over three from 1024, so the next card always peeks. The card is the journal's
 * own (`JournalCard`) without the excerpt, as in the reference.
 */
export default function CategoryRail({
  title,
  articles,
  index,
  labels,
}: {
  title: string
  articles: Pick<TenantArticleSummary, "slug" | "title" | "excerpt" | "cover_url" | "category">[]
  /** The rail's place on the page, for a unique heading id. */
  index: number
  labels: { previous: string; next: string }
}) {
  if (articles.length === 0) return null
  const headingId = `journal-rubric-${index}`

  return (
    <section aria-labelledby={headingId} data-testid="category-rail">
      <CategoryRailTrack title={title} headingId={headingId} labels={labels}>
        {articles.map((article) => (
          <li
            key={article.slug}
            className="flex w-[calc((100%-(var(--n)-1)*1.5rem)/var(--n))] shrink-0 snap-start"
          >
            <JournalCard
              article={article}
              excerpt={false}
              sizes="(max-width: 511px) 66vw, (max-width: 1023px) 40vw, 440px"
              data-testid="category-rail-card"
            />
          </li>
        ))}
      </CategoryRailTrack>
    </section>
  )
}
