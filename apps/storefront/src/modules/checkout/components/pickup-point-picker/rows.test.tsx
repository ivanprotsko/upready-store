import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { CdekStorePoint } from "@lib/util/cdek"
import type { PochtaStorePoint } from "@lib/util/pochta"
import { cdekRowOf } from "@modules/checkout/components/checkout-cdek-point-sheet/rows"
import { pochtaRowOf } from "@modules/checkout/components/checkout-pochta-point-sheet/rows"

import { PointDetails, PointRow, type PickupPrice, type PickupRow } from "./point-row"

/**
 * t-2026-10-12-03: the rows both carriers draw through the one picker (decision D2) and the
 * row itself, collapsed and expanded (Ivan's items 3.4 and 3.5 of 12.10). Points are shaped
 * after the live answers (`tests/pvz/fixtures.ts`, the stand's Moscow points).
 */

const POCHTA: PochtaStorePoint = {
  index: "129345",
  kind: "pvz",
  name: "Почта Еком",
  address: "ул. Тайнинская, 9",
  city: "Москва",
  region: "г Москва",
  lat: 55.87,
  lng: 37.71,
  work_time: [
    "пн, открыто: 09:00 - 21:00",
    "вт, открыто: 09:00 - 21:00",
    "ср, открыто: 09:00 - 21:00",
    "чт, открыто: 09:00 - 21:00",
    "пт, открыто: 09:00 - 21:00",
    "сб, открыто: 10:00 - 18:00",
    "вс, открыто: 10:00 - 18:00",
  ],
  weight_limit_g: 15000,
  card_payment: true,
  cash_payment: true,
  directions: "Вход с торца здания, рядом с аптекой",
}

const CDEK: CdekStorePoint = {
  code: "MSK65",
  name: "MSK65, Москва, ул. Динамовская",
  type: "PVZ",
  address: "109044, ул. Динамовская, 1А, 110а",
  city: "Москва",
  postal_code: "109044",
  lat: 55.732175,
  lng: 37.66371,
  work_time: "Пн-Пт 10:00-20:00, Сб 10:00-16:00",
  phone: "+79253578826",
  note: "Вход со двора",
  metro: "Пролетарская",
  have_cashless: true,
  is_dressing_room: true,
  weight_max: null,
}

const postcode = (index: string) => `Индекс ${index}`

describe("pochtaRowOf", () => {
  it("leads with the address, then the office and its postcode, then the folded week", () => {
    const row = pochtaRowOf(POCHTA, postcode)
    expect(row.id).toBe("129345")
    expect(row.title).toBe("ул. Тайнинская, 9")
    expect(row.lines).toEqual([
      { icon: "pin", text: "Почта Еком · Индекс 129345" },
      { icon: "clock", text: "пн–пт 09:00 - 21:00; сб–вс 10:00 - 18:00" },
    ])
  })

  it("keeps the directions for the expanded row only", () => {
    expect(pochtaRowOf(POCHTA, postcode).extras).toEqual([
      { text: "Вход с торца здания, рядом с аптекой" },
    ])
    expect(pochtaRowOf({ ...POCHTA, directions: null }, postcode).extras).toEqual([])
  })

  it("draws a Russian Post marker, and none for a point with no coordinates", () => {
    expect(pochtaRowOf(POCHTA, postcode)).toMatchObject({ kind: "post", lat: 55.87, lng: 37.71 })
    expect(pochtaRowOf({ ...POCHTA, lat: 0, lng: 0 }, postcode)).toMatchObject({ lat: null, lng: null })
  })

  it("is found by its postcode and its directions", () => {
    const { searchText } = pochtaRowOf(POCHTA, postcode)
    expect(searchText).toContain("129345")
    expect(searchText).toContain("аптекой")
  })
})

describe("cdekRowOf", () => {
  it("leads with CDEK's name of the office, then the address, the metro and the hours", () => {
    const row = cdekRowOf(CDEK)
    expect(row.id).toBe("MSK65")
    expect(row.title).toBe("MSK65, Москва, ул. Динамовская")
    expect(row.lines).toEqual([
      { icon: "pin", text: "109044, ул. Динамовская, 1А, 110а" },
      { text: "Пролетарская" },
      { icon: "clock", text: "Пн-Пт 10:00-20:00, Сб 10:00-16:00" },
    ])
  })

  it("keeps the phone and the note for the expanded row only", () => {
    expect(cdekRowOf(CDEK).extras).toEqual([{ text: "+79253578826" }, { text: "Вход со двора" }])
    expect(cdekRowOf({ ...CDEK, phone: null, note: null }).extras).toEqual([])
  })

  it("tells a postamat from a staffed office on the map", () => {
    expect(cdekRowOf(CDEK).kind).toBe("pvz")
    expect(cdekRowOf({ ...CDEK, type: "POSTAMAT" }).kind).toBe("postamat")
  })

  it("is found by its metro", () => {
    expect(cdekRowOf(CDEK).searchText).toContain("Пролетарская")
  })
})

const PRICE: PickupPrice = { label: "361,00 ₽ · 3–5 дней", loading: false, failed: null }

const renderRow = (row: PickupRow, selected: boolean, price: PickupPrice = PRICE) =>
  renderToStaticMarkup(
    <ul>
      <PointRow row={row} selected={selected} onSelect={() => {}} testIdPrefix="pochta-point">
        {selected ? (
          <PointDetails
            row={row}
            price={price}
            chosen={false}
            choosing={false}
            error={null}
            chooseLabel="Выбрать"
            chosenLabel="Выбран"
            onChoose={() => {}}
            testIdPrefix="pochta-point"
            place="row"
          />
        ) : null}
      </PointRow>
    </ul>
  )

/** The «Выбрать» button of a rendered row, its opening tag and its text. */
const chooseButton = (html: string) =>
  html.match(/<button[^>]*data-testid="pochta-point-choose"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? ""

describe("PointRow", () => {
  const pochta = pochtaRowOf(POCHTA, postcode)
  const cdek = cdekRowOf(CDEK)

  it("3.4: a collapsed row carries no «Выбрать» and no details", () => {
    for (const row of [pochta, cdek]) {
      const html = renderRow(row, false)
      expect(html).not.toContain("Выбрать")
      expect(html).not.toContain('data-selected="true"')
      expect(html).toContain('aria-expanded="false"')
      expect(html).not.toContain(row.extras[0].text)
    }
  })

  it("3.4: the selected row expands in place with the details, the price and «Выбрать»", () => {
    const html = renderRow(pochta, true)
    expect(html).toContain('data-selected="true"')
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain("Вход с торца здания, рядом с аптекой")
    expect(html).toContain("361,00 ₽ · 3–5 дней")
    expect(chooseButton(html)).toContain("Выбрать")
    expect(chooseButton(html)).not.toMatch(/\sdisabled=""/)
  })

  it("3.5: the row runs edge to edge and its padding sits inside, on the background", () => {
    const html = renderRow(cdek, true)
    const li = html.match(/<li[^>]*>/)?.[0] ?? ""
    expect(li).toContain("bg-ui-bg-subtle")
    expect(li).not.toMatch(/(?<![\w-])-?m[xs]?-\S+|(?<![\w-])p[xs]-/)
    expect(html).toMatch(/<button[^>]*class="[^"]*px-4[^"]*small:px-6/)
    expect(html).toMatch(/<div class="px-4 pb-4 small:px-6">/)
  })

  it("keeps «Выбрать» off while the point's price is being fetched or failed", () => {
    const loading = renderRow(pochta, true, { label: null, loading: true, failed: null })
    expect(loading).toContain("…")
    expect(chooseButton(loading)).toMatch(/\sdisabled=""/)

    const failed = renderRow(pochta, true, { label: null, loading: false, failed: "Не удалось" })
    expect(failed).toContain("Не удалось")
    expect(chooseButton(failed)).toMatch(/\sdisabled=""/)
  })
})
