import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * t-2026-10-12-03, Ivan's items 1, 2, 3.1–3.8 of 12.10 on the picker as a whole. The picker
 * is a client component inside a headless-ui dialog, which this suite has no DOM to open
 * (no @testing-library/react in this package, see `login-render.test.ts`), so what each item
 * changed is asserted on the source, the convention `checkout-shipping-section/remarks.test.ts`
 * uses; the reducer and the rows are tested by behaviour next door, and the browser pass
 * (report of the task) shows every item on the stand.
 */

const read = (path: string) => readFileSync(join(__dirname, path), "utf8")
const picker = read("index.tsx")
const map = read("../checkout-pickup-map/index.tsx")
const modal = read("../checkout-modal/index.tsx")
const pochtaSheet = read("../checkout-pochta-point-sheet/index.tsx")
const cdekSheet = read("../checkout-cdek-point-sheet/index.tsx")
const pkg = JSON.parse(read("../../../../../package.json")) as {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

describe("one picker for both carriers (D2)", () => {
  it("both sheets draw through the shared picker, each with its own rows and fetch", () => {
    expect(pochtaSheet).toMatch(/<PickupPointPicker<PochtaStorePoint>/)
    expect(pochtaSheet).toMatch(/fetchPochtaPoints\(/)
    expect(pochtaSheet).toMatch(/pochtaRowOf\(/)
    expect(cdekSheet).toMatch(/<PickupPointPicker<CdekStorePoint>/)
    expect(cdekSheet).toMatch(/fetchCdekPoints\(/)
    expect(cdekSheet).toMatch(/rowOf=\{cdekRowOf\}/)
  })
})

describe("item 1: a dialog with margins on a desktop", () => {
  it("is a centred dialog smaller than the screen, rounded, with the overlay around it", () => {
    expect(picker).toMatch(/picker=\{mapAvailable \? "split" : "list"\}/)
    expect(modal).toMatch(/small:h-\[calc\(100dvh-4rem\)\] small:rounded-xl/)
    expect(modal).toMatch(/picker === "split" && "small:w-\[calc\(100vw-4rem\)\] small:max-w-\[1600px\]"/)
    expect(modal).not.toMatch(/small:w-screen/)
  })

  it("keeps the list on the left third and the map on the right two thirds, down to the bottom", () => {
    expect(picker).toMatch(/small:grid-cols-\[minmax\(0,1fr\)_minmax\(0,2fr\)\]/)
    expect(picker).toMatch(/small:col-start-2 small:row-start-1 small:row-end-3/)
  })
})

describe("item 2: the Yandex map instead of Leaflet", () => {
  it("has no Leaflet left in the storefront", () => {
    expect(pkg.dependencies.leaflet).toBeUndefined()
    expect(pkg.devDependencies["@types/leaflet"]).toBeUndefined()
    expect(existsSync(join(__dirname, "../pochta-map"))).toBe(false)
    for (const source of [picker, map, pochtaSheet, cdekSheet]) {
      expect(source).not.toMatch(/from "leaflet"|import\("leaflet"\)|leaflet\/dist/)
      expect(source).not.toMatch(/tile\.openstreetmap\.org/)
    }
  })

  it("draws both carriers on the one Yandex 2.1 map", () => {
    expect(picker).toMatch(/<CheckoutPickupMap/)
    expect(map).toMatch(/api-maps\.yandex\.ru\/2\.1\//)
  })
})

describe("items 3.1–3.3: the phone layout", () => {
  it("3.1, 3.2: the head, the tabs and the fields stay put, only the list scrolls", () => {
    expect(modal).toMatch(/"flex h-dvh max-h-none w-screen flex-col overflow-hidden/)
    expect(picker).toMatch(/grid-rows-\[auto_auto_minmax\(0,1fr\)\]/)
    expect(picker).toMatch(/className="relative h-full overflow-y-auto overscroll-contain"/)
    expect(picker).toMatch(/role="tablist"/)
    expect(picker).toMatch(/t\("tabList"\) : t\("tabMap"\)/)
  })

  it("3.3: titles both carriers «Выберите пункт выдачи»", () => {
    expect(picker).toMatch(/title=\{t\("pickerHeading"\)\}/)
    const ru = JSON.parse(read("../../../../../messages/ru.json")) as Record<string, Record<string, string>>
    expect(ru.CdekPoint.pickerHeading).toBe("Выберите пункт выдачи")
  })
})

describe("items 3.4–3.8", () => {
  it("3.4: no separate card over the list; the selected row carries the details", () => {
    expect(picker).not.toMatch(/point-card"/)
    expect(picker).toMatch(/\{isSelected \? details\(entry, "row"\) : null\}/)
  })

  it("3.6: the phone's map card has an xmark that clears the selection", () => {
    expect(picker).toMatch(/data-testid=\{`\$\{prefix\}-map-card`\}/)
    expect(picker).toMatch(/onClick=\{\(\) => dispatch\(\{ type: "clear" \}\)\}/)
  })

  it("3.6.2: no card on or under the map on a desktop", () => {
    expect(picker).toMatch(/className="absolute inset-x-0 bottom-0 p-3 small:hidden"/)
  })

  it("3.7: no «Найдено пунктов выдачи: N» line", () => {
    for (const source of [picker, pochtaSheet, cdekSheet]) expect(source).not.toMatch(/"found"/)
    const en = JSON.parse(read("../../../../../messages/en.json")) as Record<string, Record<string, string>>
    expect(en.CdekPoint.found).toBeUndefined()
  })

  it("3.8: the selected point is a red Location pin, kept out of the clusters", () => {
    expect(map).toMatch(/fill="#EA4335"/)
    expect(map).toMatch(/iconLayout: "default#image"/)
    expect(map).toMatch(/om\.setFilter\(\(object\) => object\.id !== \(hit \? hit\.id : null\)\)/)
    expect(map).not.toMatch(/islands#blackDotIcon/)
  })
})
