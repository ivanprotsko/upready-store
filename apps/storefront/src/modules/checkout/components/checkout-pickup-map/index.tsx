"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { clx } from "@medusajs/ui"

import type { CdekStorePoint } from "@lib/util/cdek"

/**
 * The pickup points of one city on a Yandex map (i03-checkout-pvz-map-address-suggest).
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
 * The map never owns the selection: the sheet does. This component draws the
 * points, reports a click and follows `selectedCode` — so the list and the map
 * can never disagree about what the buyer picked.
 */

const SCRIPT_ID = "ymaps-2-1"

/** One promise for the whole app: the loader script is added exactly once. */
let loader: Promise<YMaps> | null = null

/** The slice of the 2.1 API this component uses. */
type YMaps = {
  Map: new (el: HTMLElement, state: unknown, options?: unknown) => YMap
  ObjectManager: new (options: unknown) => YObjectManager
  ready: (cb: () => void) => void
}

type YMap = {
  behaviors: { disable: (name: string) => void }
  geoObjects: { add: (object: unknown) => void }
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
  objects: {
    events: { add: (event: string, handler: (e: { get: (k: string) => string }) => void) => void }
    getById: (id: string) => unknown
    setObjectOptions: (id: string, options: unknown) => void
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

/** Marker presets: a postamat reads differently from a staffed office. */
const PRESET_BY_TYPE: Record<string, string> = {
  POSTAMAT: "islands#blueDotIcon",
  PVZ: "islands#greenDotIcon",
}
const PRESET_DEFAULT = "islands#violetDotIcon"
const PRESET_SELECTED = "islands#blackDotIcon"

type Props = {
  points: CdekStorePoint[]
  selectedCode: string | null
  onSelect: (point: CdekStorePoint) => void
  className?: string
  /** Shown over the map when the city has no points at all. */
  emptyHint?: string
  /** Shown instead of the map when the key is missing or the loader fails. */
  failedHint?: string
}

export default function CheckoutPickupMap({
  points,
  selectedCode,
  onSelect,
  className,
  emptyHint,
  failedHint,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<YMap | null>(null)
  const omRef = useRef<YObjectManager | null>(null)
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
  const pointsRef = useRef(located)
  pointsRef.current = located

  /**
   * `prefers-reduced-motion`: the flight to a chosen point is the only
   * animation here, so honouring the setting means a jump instead of a glide.
   */
  const flightDuration = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return 600
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600
  }, [])

  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    if (!container) return
    if (!apikey) {
      setFailed(true)
      return
    }

    loadYmaps(apikey)
      .then((ymaps) => {
        if (cancelled || !containerRef.current) return

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
          const hit = pointsRef.current.find((point) => point.code === id)
          if (hit) selectRef.current(hit)
        })

        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      mapRef.current?.destroy?.()
      mapRef.current = null
      omRef.current = null
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
        id: point.code,
        // JS API 2.1 takes [latitude, longitude] — the reverse of GeoJSON.
        // Swapping them puts every pickup point in the Indian Ocean.
        geometry: { type: "Point", coordinates: [point.lat, point.lng] },
        properties: {
          hintContent: point.name,
        },
        options: {
          preset: PRESET_BY_TYPE[point.type] ?? PRESET_DEFAULT,
        },
      })),
    })

    if (!located.length) return
    const bounds = om.getBounds()
    if (bounds) map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 40 })
  }, [located, ready])

  // Selection: highlight and fly.
  useEffect(() => {
    const om = omRef.current
    const map = mapRef.current
    if (!om || !map || !ready) return

    for (const point of located) {
      if (!om.objects.getById(point.code)) continue
      om.objects.setObjectOptions(point.code, {
        preset:
          point.code === selectedCode
            ? PRESET_SELECTED
            : PRESET_BY_TYPE[point.type] ?? PRESET_DEFAULT,
      })
    }

    const hit = located.find((point) => point.code === selectedCode)
    if (hit) {
      map.setCenter([hit.lat as number, hit.lng as number], Math.max(map.getZoom(), 14), {
        duration: flightDuration(),
      })
    }
  }, [selectedCode, located, ready, flightDuration])

  // The sheet changes the map's size: a tab switch on mobile, a window resize.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => mapRef.current?.container?.fitToViewport?.())
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (failed) {
    return (
      <div
        className={clx(
          "flex items-center justify-center bg-ui-bg-subtle p-6 text-center txt-small text-ui-fg-muted",
          className
        )}
        data-testid="pickup-map-failed"
      >
        {failedHint}
      </div>
    )
  }

  return (
    <div
      className={clx("relative overflow-hidden bg-ui-bg-subtle", className)}
      data-testid="pickup-map"
    >
      <div ref={containerRef} className="h-full w-full" />

      {ready && located.length === 0 && emptyHint && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
          <div className="mx-auto w-fit rounded-rounded bg-ui-bg-base/90 px-3 py-2 txt-small text-ui-fg-muted shadow-elevation-card-rest">
            {emptyHint}
          </div>
        </div>
      )}
    </div>
  )
}
