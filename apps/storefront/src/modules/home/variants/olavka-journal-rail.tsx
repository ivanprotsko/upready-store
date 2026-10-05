import { getTranslations } from "next-intl/server"

import { listTenantArticles } from "@lib/data/tenant-articles"
import JournalCard from "@modules/journal/components/journal-card"

import { JOURNAL_RAIL_LIMIT, journalRailCopies } from "./olavka-journal-rail-layout"
import OlavkaJournalRailTrack from "./olavka-journal-rail-track"
import styles from "./olavka-journal-rail.module.css"

/**
 * The card's rendered width for `srcset`: half the window with two cards in a row, a third
 * from 720, a quarter from 961, and never wider than a quarter of the 1440 container.
 */
const CARD_SIZES =
  "(max-width: 719px) 50vw, (max-width: 960px) 33vw, (max-width: 1440px) 25vw, 340px"

const HEADING_ID = "olavka-journal-rail-heading"

/**
 * «Журнал здоровья» · Olavka home (ask d11e; first ordered by Ivan on 2026-09-25 with his
 * frame of the old Cherkashina shop's block): the shop's newest journal articles as a rail
 * of cards under a heading with two round arrows. A card opens the article.
 *
 * The data is the shop's own journal (`/store/tenant/articles`, the feed of `/journal`),
 * so the block follows what the owner publishes in the panel. A shop with no published
 * article renders nothing, the same rule the navigation's «Журнал» entry follows.
 *
 * The rhythm is the home page's own (`HOME_SECTION_CLASS`), and the heading is the one the
 * listing sections draw (`ListingSectionHeader`). The section itself is the whole window
 * wide: only the heading row sits in `content-container`, the cards run to the edges.
 */
export default async function OlavkaJournalRail() {
  const [{ articles }, t, tSlider] = await Promise.all([
    listTenantArticles({ limit: JOURNAL_RAIL_LIMIT }),
    getTranslations("OlavkaHome.journal"),
    getTranslations("OlavkaHome.slider"),
  ])

  if (!articles.length) {
    return null
  }

  const copies = journalRailCopies(articles.length)

  return (
    <section
      className={`${styles.rail} py-10 small:py-14`}
      aria-labelledby={HEADING_ID}
      data-testid="olavka-journal-rail"
    >
      <OlavkaJournalRailTrack
        heading={
          <h2
            id={HEADING_ID}
            className="text-xl font-semibold tracking-[-0.02em] text-ui-fg-base small:text-2xl"
          >
            {t("title")}
          </h2>
        }
        setSize={articles.length}
        loop={copies.length > 1}
        labels={{ previous: tSlider("previous"), next: tSlider("next") }}
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
                  data-testid={clone ? "olavka-journal-card-clone" : "olavka-journal-card"}
                />
              </li>
            )
          })
        )}
      </OlavkaJournalRailTrack>
    </section>
  )
}
