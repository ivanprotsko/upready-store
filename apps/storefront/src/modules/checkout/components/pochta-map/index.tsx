"use client"

import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

import type { PochtaStorePoint } from "@lib/util/pochta"

/**
 * Russian Post pickup points on an OpenStreetMap map (46df-pochta).
 *
 * Leaflet with OSM tiles, so no map key is involved. The component touches
 * `window` on import, so the sheet loads it through `next/dynamic` with
 * `ssr: false` and it never runs on the server. Points are drawn as circle
 * markers, not the default pin images, whose URLs a bundler rewrites into
 * broken paths.
 *
 * The map never owns the selection, the same rule `checkout-pickup-map`
 * follows: it draws the points, reports a click and follows `selectedIndex`.
 */

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

const BASE_STYLE: L.CircleMarkerOptions = {
  radius: 7,
  color: "#ffffff",
  weight: 2,
  fillColor: "#0a4ea3",
  fillOpacity: 0.9,
}
const SELECTED_STYLE: L.CircleMarkerOptions = {
  radius: 11,
  color: "#ffffff",
  weight: 3,
  fillColor: "#d6001c",
  fillOpacity: 1,
}

export type PochtaMapProps = {
  points: PochtaStorePoint[]
  selectedIndex: string | null
  onSelect: (point: PochtaStorePoint) => void
  className?: string
}

export default function PochtaMap({ points, selectedIndex, onSelect, className }: PochtaMapProps) {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef<Record<string, L.CircleMarker>>({})
  const onSelectRef = useRef(onSelect)

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    if (!elementRef.current || mapRef.current) return
    const map = L.map(elementRef.current, { zoomControl: true, attributionControl: true })
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map)
    map.setView([55.751, 37.618], 10)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    // The sheet animates open, so the first measured size is often zero; a
    // resize observer keeps the tiles filling the box on every layout change.
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(elementRef.current)
    return () => {
      observer.disconnect()
      map.remove()
      mapRef.current = null
      layerRef.current = null
      markersRef.current = {}
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    markersRef.current = {}
    const located = points.filter((point) => point.lat && point.lng)
    for (const point of located) {
      const marker = L.circleMarker([point.lat, point.lng], BASE_STYLE)
      marker.bindTooltip(point.address || point.name, { direction: "top" })
      marker.on("click", () => onSelectRef.current(point))
      marker.addTo(layer)
      markersRef.current[point.index] = marker
    }
    if (located.length === 1) {
      map.setView([located[0].lat, located[0].lng], 15)
    } else if (located.length > 1) {
      map.fitBounds(L.latLngBounds(located.map((point) => [point.lat, point.lng] as L.LatLngTuple)), {
        padding: [24, 24],
        maxZoom: 15,
      })
    }
  }, [points])

  useEffect(() => {
    const map = mapRef.current
    for (const [index, marker] of Object.entries(markersRef.current)) {
      marker.setStyle(index === selectedIndex ? SELECTED_STYLE : BASE_STYLE)
      if (index === selectedIndex) {
        marker.bringToFront()
        if (map) map.panTo(marker.getLatLng())
      }
    }
  }, [selectedIndex, points])

  return <div ref={elementRef} className={className} data-testid="pochta-map" />
}
