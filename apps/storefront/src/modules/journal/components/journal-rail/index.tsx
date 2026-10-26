import { getTranslations } from "next-intl/server"

import { listTenantArticles, type TenantArticleSummary } from "@lib/data/tenant-articles"
import JournalCard from "@modules/journal/components/journal-card"

import { JOURNAL_RAIL_LIMIT, journalRailCopies } from "./layout"
import JournalRailTrack from "./track"
import styles from "./journal-rail.module.css"

/**
 * The card's rendered width for `srcset`: half the window with two cards in a row, a third
 * from 720, a quarter from 961, and never wider than a quarter of the 1440 container.
 */
const CARD_SIZES =
  "(max-width: 719px) 50vw, (max-width: 960px) 33vw, (max-width: 1440px) 25vw, 340px"

const HEADING_ID = "journal-rail-heading"

/**
 * «Журнал здоровья» · the home page (ask d11e; first ordered by Ivan on 2026-09-25 with his
 * frame of the old Cherkashina shop's block): the shop's newest journal articles as a rail
 * of cards under a heading with two round arrows. A card opens the article.
 *
 * The data is the shop's own journal (`/store/tenant/articles`, the feed of `/journal`),
 * so the block follows what the owner publishes in the panel. A shop with no published
 * article renders nothing, the same rule the navigation's «Журнал» entry follows.
 *
 * t-2026-10-05-03: the rail is every shop's, not the Olavka shops' alone. The Olavka shops
 * keep their «Журнал здоровья» title; any other shop names it the way its navigation does,
 * «Журнал» (`Journal.feedTitle`).
 *
 * The rhythm is the home page's own (`HOME_SECTION_CLASS`), and the heading is the one the
 * listing sections draw (`ListingSectionHeader`). The section itself is the whole window
 * wide: only the heading row sits in `content-container`, the cards run to the edges.
 */
export default async function JournalRail({ olavka = false }: { olavka?: boolean }) {
  const [{ articles }, tOlavka, tJournal, tSlider] = await Promise.all([
    listTenantArticles({ limit: JOURNAL_RAIL_LIMIT }),
    getTranslations("OlavkaHome.journal"),
    getTranslations("Journal"),
    getTranslations("OlavkaHome.slider"),
  ])

  if (!articles.length) {
    return null
  }

  return (
    <JournalRailSection
      articles={articles}
      title={olavka ? tOlavka("title") : tJournal("feedTitle")}
      headingId={HEADING_ID}
      labels={{ previous: tSlider("previous"), next: tSlider("next") }}
    />
  )
}

/**
 * The rail itself, for a list the caller already has: the home page's newest articles, or
 * an article page's «Читайте также» (the rest of the journal, starting with the next one).
 * An empty list renders nothing.
 */
export function JournalRailSection({
  articles,
  title,
  headingId,
  labels,
  "data-testid": dataTestid = "journal-rail",
}: {
  articles: Pick<TenantArticleSummary, "slug" | "title" | "excerpt" | "cover_url" | "category">[]
  title: string
  headingId: string
  labels: { previous: string; next: string }
  "data-testid"?: string
}) {
  if (!articles.length) {
    return null
  }

  const copies = journalRailCopies(articles.length)

  return (
    <section
      className={`${styles.rail} py-10 small:py-14`}
      aria-labelledby={headingId}
      data-testid={dataTestid}
    >
      <JournalRailTrack
        heading={
          <h2
            id={headingId}
            className="text-xl font-semibold tracking-[-0.02em] text-ui-fg-base small:text-2xl"
          >
            {title}
          </h2>
        }
        setSize={articles.length}
        loop={copies.length > 1}
        labels={labels}
      >
        {copies.flatMap((copy) =>
          articles.map((article) => {
            const clone = copy !== "real"
            return (
              <li
                key={`${copy}-${article.slug}`}
                className={styles.item}
                data-copy={copy}
                aria-hidden={clone || undefined}
              >
                <JournalCard
                  article={article}
                  sizes={CARD_SIZES}
                  clone={clone}
                  data-testid={clone ? "journal-card-clone" : "journal-card"}
                />
              </li>
            )
          })
        )}
      </JournalRailTrack>
    </section>
  )
}
