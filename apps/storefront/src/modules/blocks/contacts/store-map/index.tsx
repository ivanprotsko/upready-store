import { getLocale } from "next-intl/server"

import BlockSection from "../../shared/block-section"
import { pickText, type LocalizedText } from "../../shared/localized-text"
import { pickLocations } from "./locations"
import { MAP_LABEL, MAP_LINK_LABEL, SHOW_ON_MAP_LABEL, type ContactsStoreMapProps } from "./props"
import StoreMap from "./store-map"

/**
 * `contacts/store-map` (t-2026-10-12-33, R2 build list item 13): the shop's own shops and pick-up points, each
 * with its address, hours, phone and a link to Yandex Maps, and the points on a Yandex map. Measured against the
 * R2 catalogue's `contacts` and `store-locations` rows (`artifacts/research/2026-10-13-templates-insales-tilda`).
 *
 * The server picks the visitor's words and drops a point with no name or address in them; no point left, nothing
 * is drawn. The map needs the storefront's key (`NEXT_PUBLIC_YANDEX_MAPS_KEY`, the checkout map's): without it
 * the list stands alone, each point with its «Открыть в Яндекс Картах» link. The list and the map: `./store-map.tsx`.
 */
export default async function ContactsStoreMap({
  header,
  locations,
  mapLinkLabel,
  showOnMapLabel,
  mapLabel,
}: ContactsStoreMapProps) {
  const locale = await getLocale()
  const drawn = pickLocations(locations, locale)
  if (drawn.length === 0) {
    return null
  }
  const words = (text: LocalizedText, fallback: LocalizedText) =>
    pickText(text, locale) ?? pickText(fallback, locale) ?? ""

  return (
    <BlockSection block="contacts/store-map" locale={locale} header={header}>
      <StoreMap
        locations={drawn}
        withMap={Boolean(process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY)}
        labels={{
          mapLink: words(mapLinkLabel, MAP_LINK_LABEL),
          showOnMap: words(showOnMapLabel, SHOW_ON_MAP_LABEL),
          map: words(mapLabel, MAP_LABEL),
        }}
      />
    </BlockSection>
  )
}
