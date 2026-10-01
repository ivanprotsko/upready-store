import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-01-checkout-ivan-3 #4: Leaflet 1.9's default attribution prefix is
 * a flag-icon link to leafletjs.com, which read as a political statement on a
 * Russia-facing storefront (Ivan: «флаг украины в правом нижнем углу»). This
 * suite has no DOM/renderer for a real Leaflet map (`login-render.test.ts`
 * holds the same constraint for client components), so the regression is
 * pinned on the source the way that suite does; the rendered result — no
 * `svg` inside `.leaflet-control-attribution` — is a Playwright/manual check
 * on the stand.
 */
const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, "index.tsx"), "utf8")

describe("PochtaMap attribution: no flag icon", () => {
  it("overrides the default Leaflet prefix with a plain text link", () => {
    expect(source).toContain(
      'map.attributionControl.setPrefix(\'<a href="https://leafletjs.com">Leaflet</a>\')'
    )
  })

  it("sets the prefix right after the map is created, before any tile layer can draw its own control", () => {
    const mapIndex = source.indexOf("L.map(elementRef.current")
    const prefixIndex = source.indexOf("attributionControl.setPrefix(")
    expect(mapIndex).not.toBe(-1)
    expect(prefixIndex).toBeGreaterThan(mapIndex)
  })

  it("keeps the OpenStreetMap credit the tile licence requires", () => {
    expect(source).toContain("OpenStreetMap")
    expect(source).toContain("openstreetmap.org/copyright")
  })
})
