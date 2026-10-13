import { getLocale } from "next-intl/server"

import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import type { SectionHeader } from "../../shared/section-header"
import { readSelection } from "../featured/selection"
import TabCards from "./cards"
import type { CollectionTabsProps } from "./props"
import CollectionTabsPanel from "./tabs"

/**
 * `collection/tabs` (t-2026-10-12-33, R1 build list item 15): «Хиты / Новинки / Скидки» in one
 * section, the InSales home widget of five of its themes. Each tab is a label over a source of
 * `collection/featured`'s shape (a category, a collection, the newest of the catalogue) and a
 * `limit`, read through that block's `readSelection`, and drawn in that block's carousel.
 *
 * - Every source is read on the server, so a tab with no product is dropped before the first
 *   paint and each tab knows where its «see all» leads. The read lands in the data cache.
 * - Only the first tab's cards are drawn on the server; the panel loads another tab's when it
 *   opens (`load.tsx`), from that cache.
 * - The tabs follow the WAI-ARIA tab pattern (`tabs.tsx`).
 * - One tab left: the section `collection/featured` draws for it, in its carousel, with no tab
 *   row; the heading is the template's or the tab's label, «see all» in the header leads to
 *   the tab's source unless the template gives its own link.
 * - No tab left: nothing.
 */
export default async function CollectionTabs({
  header,
  tabs,
  columns,
  seeAllLabel,
  previousLabel,
  nextLabel,
}: CollectionTabsProps) {
  const locale = await getLocale()

  const selections = await Promise.all(
    tabs.map(async ({ source, limit }) => {
      try {
        return await readSelection(source, limit)
      } catch (error) {
        // A failed read is not an empty source (rule 20a): name it, and leave the tab out.
        console.error(`collection/tabs: could not read ${JSON.stringify(source)}`, error)
        return null
      }
    })
  )
  const filled = tabs.flatMap((tab, index) => {
    const selection = selections[index]
    const label = pickText(tab.label, locale)
    return selection && label ? [{ tab, label, selection }] : []
  })
  if (!filled.length) return null

  const [first] = filled
  const arrows = {
    previousLabel: pickText(previousLabel, locale) ?? "",
    nextLabel: pickText(nextLabel, locale) ?? "",
  }
  const firstCards = <TabCards products={first.selection.products} columns={columns} {...arrows} />

  if (filled.length === 1) {
    const shellHeader: SectionHeader = {
      eyebrow: header?.eyebrow ?? {},
      heading: header && pickText(header.heading, locale) ? header.heading : first.tab.label,
      description: header?.description ?? {},
      seeAll: header?.seeAll ?? { href: first.selection.href, label: seeAllLabel },
    }
    return (
      <BlockSection block="collection/tabs" locale={locale} header={shellHeader}>
        {firstCards}
      </BlockSection>
    )
  }

  return (
    <BlockSection block="collection/tabs" locale={locale} header={header}>
      <CollectionTabsPanel
        tabs={filled.map(({ tab, label, selection }) => ({
          label,
          href: selection.href,
          request: { source: tab.source, limit: tab.limit, columns, previousLabel, nextLabel },
        }))}
        first={firstCards}
        label={pickText(header?.heading, locale)}
        seeAllLabel={pickText(seeAllLabel, locale) ?? ""}
      />
    </BlockSection>
  )
}
