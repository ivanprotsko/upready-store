"use client"

import { clx } from "@medusajs/ui"
import { ExternalLink } from "lucide-react"
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { PickupMapPoint } from "@modules/checkout/components/checkout-pickup-map"

import BlockIcon from "../../shared/block-icon"
import { telHref, watchNear, yandexMapsHref, type DrawnLocation } from "./locations"

/**
 * The storefront's one Yandex map (`checkout-pickup-map`): its 2.1 loader, its key
 * (`NEXT_PUBLIC_YANDEX_MAPS_KEY`), its markers and its flight to the chosen point. Split off and imported only
 * when the block comes near the screen, so a page that never scrolls here loads neither the component nor
 * `api-maps.yandex.ru`.
 */
const PickupMap = lazy(() => import("@modules/checkout/components/checkout-pickup-map"))

export type StoreMapLabels = {
  mapLink: string
  showOnMap: string
  map: string
}

/** A line-high box that centres a 16px icon on the first line of its text: 24px at 16px type, 20px at 14px. */
const ICON_BOX = "flex h-6 shrink-0 items-center small:h-5"

const ACTION =
  "inline-flex min-h-11 items-center gap-2 font-medium text-ui-fg-interactive underline-offset-4 hover:text-ui-fg-interactive-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"

/**
 * The list of points, and the map beside it (from `small`) or under it. The list is the block: every word of
 * a point is in it, and with no map key, or when the loader fails, it stands alone and full width with no empty
 * frame. The map follows the list: «show on the map» puts the red pin on the point and flies there, and a
 * click on a marker marks its card.
 */
export default function StoreMap({
  locations,
  labels,
  withMap,
}: {
  locations: DrawnLocation[]
  labels: StoreMapLabels
  withMap: boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const mapBoxRef = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const [failed, setFailed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const showMap = withMap && !failed

  useEffect(() => {
    const el = rootRef.current
    if (!showMap || near || !el) return
    return watchNear(el, () => setNear(true))
  }, [showMap, near])

  const points = useMemo<PickupMapPoint[]>(
    () =>
      locations.map((location) => ({
        id: location.id,
        lat: location.coordinates.lat,
        lng: location.coordinates.lon,
        kind: "pvz",
        hint: `${location.name}, ${location.address}`,
      })),
    [locations]
  )

  /** Below `small` the map stands under the list: bring it into view, or the flight happens off screen. */
  const showOnMap = useCallback((id: string) => {
    setSelectedId(id)
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    mapBoxRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" })
  }, [])

  const onFailed = useCallback(() => setFailed(true), [])

  const columns = showMap
    ? "xsmall:grid-cols-2 small:grid-cols-1"
    : locations.length === 1
      ? "max-w-xl"
      : locations.length === 2
        ? "xsmall:grid-cols-2"
        : "xsmall:grid-cols-2 small:grid-cols-3"

  return (
    <div
      ref={rootRef}
      className={clx(
        "grid gap-[var(--layer-space-6,1.5rem)]",
        showMap && "small:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] small:items-start"
      )}
    >
      <ul className={clx("grid grid-cols-1 gap-[var(--layer-space-4,1rem)]", columns)}>
        {locations.map((location) => {
          const selected = showMap && location.id === selectedId
          return (
            <li key={location.id} className="min-w-0">
              <article
                data-role="card"
                className={clx(
                  "flex h-full flex-col gap-[var(--layer-space-4,1rem)] rounded-[var(--radius)] border bg-[var(--card)] p-[var(--layer-space-6,1.5rem)] text-[var(--card-foreground)] transition-colors duration-150 motion-reduce:transition-none",
                  selected ? "border-[var(--primary)]" : "border-[var(--border)]"
                )}
              >
                {/* The body grows, so a row of cards ends its actions on one line with no auto margin (QR-SPACE-SCALE). */}
                <div className="flex flex-1 flex-col gap-[var(--layer-space-4,1rem)]">
                  <h3 className="text-pretty text-base font-semibold text-ui-fg-base small:text-lg">{location.name}</h3>

                  <ul data-role="contacts" className="flex flex-col gap-2 text-base text-ui-fg-subtle small:text-sm">
                    <li className="flex items-start gap-2">
                      <span className={ICON_BOX}>
                        <BlockIcon name="map-pin" className="size-4 text-ui-fg-muted" />
                      </span>
                      <span className="min-w-0 text-pretty">{location.address}</span>
                    </li>
                    {location.hours ? (
                      <li className="flex items-start gap-2">
                        <span className={ICON_BOX}>
                          <BlockIcon name="clock" className="size-4 text-ui-fg-muted" />
                        </span>
                        <span className="min-w-0 text-pretty">{location.hours}</span>
                      </li>
                    ) : null}
                    {location.phone ? (
                      <li className="flex items-center gap-2">
                        <BlockIcon name="phone" className="size-4 shrink-0 text-ui-fg-muted" />
                        {/* A 44px target (QR-HIT) that keeps the list's rhythm: the box grows into the gaps. */}
                        <a
                          href={telHref(location.phone)}
                          className="-my-3 inline-flex min-h-11 items-center whitespace-nowrap text-ui-fg-base underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                        >
                          {location.phone}
                        </a>
                      </li>
                    ) : null}
                  </ul>

                  {location.note ? (
                    <p data-role="description" className="text-pretty text-base text-ui-fg-muted small:text-sm">
                      {location.note}
                    </p>
                  ) : null}

                  {location.links.length ? (
                    <ul className="flex flex-wrap gap-2">
                      {location.links.map((link) => (
                        <li key={link.href}>
                          <a
                            data-role="social-link"
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] px-[var(--layer-space-3,0.75rem)] text-base text-ui-fg-base transition-colors duration-150 hover:bg-[var(--muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] motion-reduce:transition-none small:text-sm"
                          >
                            <BlockIcon name={link.icon} className="size-4 shrink-0 text-ui-fg-muted" />
                            {link.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-x-[var(--layer-space-6,1.5rem)] text-base small:text-sm">
                  {showMap ? (
                    <button type="button" aria-pressed={selected} onClick={() => showOnMap(location.id)} className={ACTION}>
                      <BlockIcon name="map-pin" className="size-4 shrink-0" />
                      {labels.showOnMap}
                      <span className="sr-only">: {location.name}</span>
                    </button>
                  ) : null}
                  <a href={yandexMapsHref(location.coordinates)} target="_blank" rel="noopener noreferrer" className={ACTION}>
                    {labels.mapLink}
                    <span className="sr-only">: {location.name}</span>
                    <ExternalLink aria-hidden="true" focusable="false" strokeWidth={1.75} className="size-4 shrink-0" />
                  </a>
                </div>
              </article>
            </li>
          )
        })}
      </ul>

      {showMap ? (
        <div
          ref={mapBoxRef}
          data-role="map"
          role="region"
          aria-label={labels.map}
          className="relative h-[calc(18rem*var(--layer-density,1))] scroll-mt-24 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] small:sticky small:top-24 small:h-[calc(32rem*var(--layer-density,1))]"
        >
          {near ? (
            <Suspense fallback={null}>
              <PickupMap points={points} selectedId={selectedId} onSelect={setSelectedId} onFailed={onFailed} className="h-full w-full" />
            </Suspense>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
