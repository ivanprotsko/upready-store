import type { BlockIconName } from "../../shared/icon-name"
import { pickText } from "../../shared/localized-text"
import type { Coordinates, StoreLocation } from "./props"

/** A point as it is drawn: the visitor's words, picked on the server. */
export type DrawnLocation = {
  /** `location-<index in props>`: stable while the template's list is, so the map and the list agree. */
  id: string
  name: string
  address: string
  hours: string | null
  phone: string | null
  note: string | null
  coordinates: Coordinates
  links: { label: string; href: string; icon: BlockIconName }[]
}

/** The point on Yandex Maps, the address of the brief: `pt` takes the longitude first. */
export const yandexMapsHref = ({ lat, lon }: Coordinates) => `https://yandex.ru/maps/?pt=${lon},${lat}&z=16&l=map`

/** `tel:` with the phone's digits and its leading `+`, whatever the shop's spaces, brackets and dashes. */
export const telHref = (phone: string) => `tel:${phone.trim().startsWith("+") ? "+" : ""}${phone.replace(/\D/g, "")}`

/** The points that have a name and an address in the visitor's language (`pickText`: then English, then any). */
export function pickLocations(locations: StoreLocation[], locale: string): DrawnLocation[] {
  return locations.flatMap((location, index) => {
    const name = pickText(location.name, locale)
    const address = pickText(location.address, locale)
    if (!name || !address) return []
    return [
      {
        id: `location-${index}`,
        name,
        address,
        hours: pickText(location.hours, locale),
        phone: location.phone,
        note: pickText(location.note, locale),
        coordinates: location.coordinates,
        links: location.links.flatMap((link) => {
          const label = pickText(link.label, locale)
          return label ? [{ label, href: link.href, icon: link.icon }] : []
        }),
      },
    ]
  })
}

/** How far below the screen the block starts loading the map, so it is drawn by the time it is seen. */
const NEAR_MARGIN = "200px 0px"

/**
 * Calls `onNear` once, when `el` comes within `NEAR_MARGIN` of the screen, and stops watching. A browser
 * without `IntersectionObserver` gets the map at once. Answers the function that stops watching early.
 */
export function watchNear(
  el: Element,
  onNear: () => void,
  Observer: typeof IntersectionObserver | undefined = typeof IntersectionObserver === "undefined"
    ? undefined
    : IntersectionObserver
): () => void {
  if (!Observer) {
    onNear()
    return () => {}
  }
  const observer = new Observer(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      onNear()
    },
    { rootMargin: NEAR_MARGIN }
  )
  observer.observe(el)
  return () => observer.disconnect()
}
