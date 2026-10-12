"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { clx } from "@medusajs/ui"

/**
 * The pickup points of one city on a Yandex map (i03-checkout-pvz-map-address-suggest),
 * since t-2026-10-12-03 the one map of both pickers, Russian Post and CDEK. Ivan's item 2
 * (12.10) replaced the Russian Post map, Leaflet over OpenStreetMap tiles, with this one.
 *
 * Mechanics are ported from the reference storefront's `pickup-map-yandex`
 * (chrxnasdmds), the components and the styling are this storefront's own —
 * `@medusajs/ui` tokens, the same sheet the list lives in.
 *
 * Why JS API 2.1 and not 3.0: the key we hold (`IVANPROTSKO_YANDEX_MAP_KEY_ONE`,
 * `NEXT_PUBLIC_YANDEX_MAPS_KEY` here) is a 2.1 key. Measured 2026-09-16 with it:
 * the 2.1 loader answers and `ymaps.Map` works, while `ymaps.suggest` refuses
 * («Suggest is not available») and both HTTP APIs answer 403 «Invalid api key»
 * — this key buys the MAP and nothing else, which is why the address suggest
 * next door is built on CDEK's own directory instead (see
 * `modules/common/components/suggest-input`).
 *
 * The map never owns the selection: the picker does. This component draws the
 * points, reports a click and follows `selectedId` — so the list and the map
 * can never disagree about what the buyer picked.
 */

const SCRIPT_ID = "ymaps-2-1"

/** One promise for the whole app: the loader script is added exactly once. */
let loader: Promise<YMaps> | null = null

/** The slice of the 2.1 API this component uses. */
type YMaps = {
  Map: new (el: HTMLElement, state: unknown, options?: unknown) => YMap
  ObjectManager: new (options: unknown) => YObjectManager
  Placemark: new (coordinates: number[], properties: unknown, options: unknown) => unknown
  ready: (cb: () => void) => void
}

type YMap = {
  behaviors: { disable: (name: string) => void }
  geoObjects: { add: (object: unknown) => void; remove: (object: unknown) => void }
  container: { fitToViewport?: () => void }
  setBounds: (bounds: number[][], options?: unknown) => void
  setCenter: (center: number[], zoom?: number, options?: unknown) => void
  getZoom: () => number
  destroy?: () => void
}

type YObjectManager = {
  add: (collection: unknown) => void
  removeAll: () => void
  getBounds: () => number[][] | null
  setFilter: (filter: (object: { id: string }) => boolean) => void
  objects: {
    events: { add: (event: string, handler: (e: { get: (k: string) => string }) => void) => void }
  }
  clusters: { options: { set: (key: string, value: unknown) => void } }
}

function loadYmaps(apikey: string): Promise<YMaps> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"))
  const injected = (window as unknown as { ymaps?: YMaps }).ymaps
  if (injected?.Map) return Promise.resolve(injected)
  if (loader) return loader

  loader = new Promise<YMaps>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    const el = existing ?? document.createElement("script")
    if (!existing) {
      el.id = SCRIPT_ID
      el.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apikey)}&lang=ru_RU`
      el.async = true
      document.head.appendChild(el)
    }
    el.addEventListener("load", () => {
      const ymaps = (window as unknown as { ymaps?: YMaps }).ymaps
      if (!ymaps) {
        reject(new Error("ymaps"))
        return
      }
      ymaps.ready(() => resolve(ymaps))
    })
    el.addEventListener("error", () => {
      // A failed load must not poison every later attempt: the sheet can be
      // reopened, and the next open should try again rather than replay this
      // rejection forever.
      loader = null
      reject(new Error("api-maps.yandex.ru"))
    })
  })
  return loader
}

/** What a marker stands for; a postamat reads differently from a staffed office. */
export type PickupMapKind = "pvz" | "postamat" | "post"

/** Marker presets of the points that are NOT selected. */
const PRESET_BY_KIND: Record<PickupMapKind, string> = {
  pvz: "islands#greenDotIcon",
  postamat: "islands#blueDotIcon",
  post: "islands#blueDotIcon",
}

/**
 * The selected point: a red Location pin, a teardrop with a dark dot (Ivan's item 3.8 and
 * his Image #4), drawn above every cluster. 28 × 40 px, the tip at the bottom centre.
 *
 * theme-colours allowlist: the pin is the map's own marker, drawn by Yandex over map tiles
 * that follow no shop theme; Ivan's Image #4 fixes its red, the one literal of this file.
 */
const SELECTED_PIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">' +
  // theme-colours allowlist: the red pin of Ivan's Image #4, see SELECTED_PIN_SVG above.
  '<path d="M14 1.2C6.9 1.2 1.2 6.8 1.2 13.8c0 9.4 11.2 22.6 12.1 23.7a.9.9 0 0 0 1.4 0c.9-1.1 12.1-14.3 12.1-23.7C26.8 6.8 21.1 1.2 14 1.2z" fill="#EA4335" stroke="#B3261E" stroke-width="1.4"/>' +
  // theme-colours allowlist: the dark dot of the same pin, Image #4.
  '<circle cx="14" cy="13.8" r="4.6" fill="#7A1712"/>' +
  "</svg>"
const SELECTED_PIN = {
  iconLayout: "default#image",
  iconImageHref: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SELECTED_PIN_SVG)}`,
  iconImageSize: [28, 40],
  iconImageOffset: [-14, -40],
  // Above the clusters and the other markers, so the pin is never hidden under a group.
  zIndex: 1000,
}

export type PickupMapPoint = {
  id: string
  lat: number | null
  lng: number | null
  kind: PickupMapKind
  /** The hover hint: the point's address. */
  hint: string
}

type Props = {
  points: PickupMapPoint[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** The key is missing or the loader failed: the picker then shows its list alone. */
  onFailed?: () => void
  className?: string
  /** Shown over the map when the city has no points at all. */
  emptyHint?: string
}

export default function CheckoutPickupMap({
  points,
  selectedId,
  onSelect,
  onFailed,
  className,
  emptyHint,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<YMap | null>(null)
  const omRef = useRef<YObjectManager | null>(null)
  const ymapsRef = useRef<YMaps | null>(null)
  const pinRef = useRef<unknown>(null)
  /**
   * A view the map could not take yet because its box had no size: the mobile «Карта» tab
   * is `display: none` while the list is shown, and bounds fitted into a zero box land on
   * the whole world (measured on the stand 12.10: CDEK's 126 Moscow points in one cluster
   * over Eurasia). The resize observer applies it once the box has a size.
   */
  const pendingRef = useRef<"fit" | "selected" | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  const apikey = process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY ?? ""

  /**
   * A point with no coordinates cannot be drawn. CDEK answers with them for
   * every point measured so far (142 of 142 in Moscow, 2026-09-16), but a
   * missing pair must not push the marker to Null Island.
   */
  const located = useMemo(
    () => points.filter((point) => typeof point.lat === "number" && typeof point.lng === "number"),
    [points]
  )

  /** Fresh handlers without rebuilding the map on every render. */
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect
  const failedRef = useRef(onFailed)
  failedRef.current = onFailed
  const pointsRef = useRef(located)
  pointsRef.current = located
  const selectedRef = useRef(selectedId)
  selectedRef.current = selectedId

  /**
   * `prefers-reduced-motion`: the flight to a chosen point is the only
   * animation here, so honouring the setting means a jump instead of a glide.
   */
  const flightDuration = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return 600
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600
  }, [])

  const hasSize = () => {
    const el = containerRef.current
    return !!el && el.clientWidth > 0 && el.clientHeight > 0
  }

  /** Frames the city's points. */
  const fit = useCallback(() => {
    const map = mapRef.current
    const bounds = omRef.current?.getBounds()
    if (!map || !bounds) return
    map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 40 })
  }, [])

  /** Flies to the selected point, close enough to see its street. */
  const flyToSelected = useCallback(
    (animate: boolean) => {
      const map = mapRef.current
      const hit = pointsRef.current.find((point) => point.id === selectedRef.current)
      if (!map || !hit) return
      map.setCenter([hit.lat as number, hit.lng as number], Math.max(map.getZoom(), 14), {
        duration: animate ? flightDuration() : 0,
      })
    },
    [flightDuration]
  )

  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    if (!container) return
    if (!apikey) {
      setFailed(true)
      failedRef.current?.()
      return
    }

    loadYmaps(apikey)
      .then((ymaps) => {
        if (cancelled || !containerRef.current) return

        ymapsRef.current = ymaps
        const map = new ymaps.Map(
          containerRef.current,
          { center: [55.75, 37.62], zoom: 9, controls: ["zoomControl"] },
          { suppressMapOpenBlock: false }
        )
        mapRef.current = map
        // The map sits inside a scrollable sheet: taking the wheel would trap
        // the buyer's scroll on a control they only glance at.
        map.behaviors.disable("scrollZoom")

        const om = new ymaps.ObjectManager({
          clusterize: true,
          gridSize: 64,
          clusterDisableClickZoom: false,
          geoObjectOpenBalloonOnClick: false,
        })
        om.clusters.options.set("preset", "islands#invertedDarkGreenClusterIcons")
        map.geoObjects.add(om)
        omRef.current = om

        om.objects.events.add("click", (event) => {
          const id = event.get("objectId")
          if (pointsRef.current.some((point) => point.id === id)) selectRef.current(id)
        })

        setReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setFailed(true)
        failedRef.current?.()
      })

    return () => {
      cancelled = true
      mapRef.current?.destroy?.()
      mapRef.current = null
      omRef.current = null
      pinRef.current = null
      setReady(false)
    }
  }, [apikey])

  // Points in, city framed.
  useEffect(() => {
    const om = omRef.current
    const map = mapRef.current
    if (!om || !map || !ready) return

    om.removeAll()
    om.add({
      type: "FeatureCollection",
      features: located.map((point) => ({
        type: "Feature",
        // Stable id: the click handler finds the point by it.
        id: point.id,
        // JS API 2.1 takes [latitude, longitude] — the reverse of GeoJSON.
        // Swapping them puts every pickup point in the Indian Ocean.
        geometry: { type: "Point", coordinates: [point.lat, point.lng] },
        properties: {
          hintContent: point.hint,
        },
        options: {
          preset: PRESET_BY_KIND[point.kind],
        },
      })),
    })

    if (!located.length) return
    // A preselected point (the cart's own, decision D9) is flown to by the selection
    // effect; framing the city here would undo that flight.
    if (located.some((point) => point.id === selectedRef.current)) return
    if (hasSize()) {
      fit()
      pendingRef.current = null
    } else {
      pendingRef.current = "fit"
    }
  }, [located, ready, fit])

  // Selection: the red pin, drawn on its own above the clusters, and the flight to it.
  useEffect(() => {
    const ymaps = ymapsRef.current
    const om = omRef.current
    const map = mapRef.current
    if (!ymaps || !om || !map || !ready) return

    if (pinRef.current) {
      map.geoObjects.remove(pinRef.current)
      pinRef.current = null
    }
    const hit = located.find((point) => point.id === selectedId)
    // The selected point leaves the object manager while it is selected: inside a cluster
    // the pin would be one more number in a circle.
    om.setFilter((object) => object.id !== (hit ? hit.id : null))
    if (!hit) return

    const pin = new ymaps.Placemark(
      [hit.lat as number, hit.lng as number],
      { hintContent: hit.hint },
      SELECTED_PIN
    )
    map.geoObjects.add(pin)
    pinRef.current = pin

    if (hasSize()) {
      flyToSelected(true)
      pendingRef.current = null
    } else {
      pendingRef.current = "selected"
    }
  }, [selectedId, located, ready, flyToSelected])

  // The picker changes the map's size: a tab switch on mobile, a window resize.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      mapRef.current?.container?.fitToViewport?.()
      if (!hasSize() || !pendingRef.current) return
      if (pendingRef.current === "selected") flyToSelected(false)
      else fit()
      pendingRef.current = null
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [fit, flyToSelected])

  if (failed) return null

  return (
    <div
      className={clx("relative overflow-hidden bg-ui-bg-subtle", className)}
      data-testid="pickup-map"
    >
      <div ref={containerRef} className="h-full w-full" />

      {ready && located.length === 0 && emptyHint && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
          <div className="mx-auto w-fit rounded-rounded bg-ui-bg-base px-3 py-2 txt-small text-ui-fg-muted shadow-elevation-card-rest">
            {emptyHint}
          </div>
        </div>
      )}
    </div>
  )
}
