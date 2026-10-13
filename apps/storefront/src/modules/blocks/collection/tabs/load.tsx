"use server"

import type { ReactNode } from "react"
import { getLocale } from "next-intl/server"

import { pickText } from "../../shared/localized-text"
import { readSelection } from "../featured/selection"
import TabCards from "./cards"
import { parseTabRequest } from "./props"

/**
 * A tab's cards, on demand (t-2026-10-12-33): the panel calls it the first time a tab other
 * than the first opens. It reads through `collection/featured`'s `readSelection`, the loader
 * the server used for the first paint, so the read is the one the page already put in the data
 * cache, and it answers the cards drawn on the server: `ProductCard` stays a server component.
 *
 * The request comes from the browser and is parsed again; a bad one is refused. Null when the
 * source holds nothing now or the read failed, and the panel goes back to the tab it showed.
 */
export async function loadTabCards(input: unknown): Promise<ReactNode> {
  const request = parseTabRequest(input)
  if (!request.ok) throw new Error(`collection/tabs: ${request.errors.join("; ")}`)
  const { source, limit, columns, previousLabel, nextLabel } = request.value

  const locale = await getLocale()
  try {
    const selection = await readSelection(source, limit)
    if (!selection) return null
    return (
      <TabCards
        products={selection.products}
        columns={columns}
        previousLabel={pickText(previousLabel, locale) ?? ""}
        nextLabel={pickText(nextLabel, locale) ?? ""}
      />
    )
  } catch (error) {
    // A failed read is not an empty source (rule 20a): name it, and keep the tab the panel shows.
    console.error(`collection/tabs: could not read ${JSON.stringify(source)}`, error)
    return null
  }
}
