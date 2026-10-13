// The pure half of `pnpm template:sbs` on plain values (t-2026-10-12-33): which pairs, which names, which labels.
// The browser half is proven by a run on a stand.
import { describe, expect, it } from "vitest"

import {
  COLUMN,
  LAB_LABEL,
  MAX_BYTES,
  categoryPaths,
  composeHtml,
  composeWidth,
  labShot,
  oversize,
  planPairs,
  productPaths,
  sheetHtml,
} from "./plan.mjs"

const LAB = ["index", "catalog", "product"].flatMap((page) => ["desktop", "mobile"].map((kind) => `uhod-${page}-${kind}.webp`))

describe("planPairs", () => {
  it("pairs each page at 1280, 768 and 360 with the lab's desktop, desktop and mobile shot", () => {
    const { pairs, notices } = planPairs("uhod", LAB)
    expect(notices).toEqual([])
    expect(pairs.map((p) => [p.file, p.lab])).toEqual([
      ["sbs-home-1280.jpg", "uhod-index-desktop.webp"],
      ["sbs-home-768.jpg", "uhod-index-desktop.webp"],
      ["sbs-home-360.jpg", "uhod-index-mobile.webp"],
      ["sbs-category-1280.jpg", "uhod-catalog-desktop.webp"],
      ["sbs-category-768.jpg", "uhod-catalog-desktop.webp"],
      ["sbs-category-360.jpg", "uhod-catalog-mobile.webp"],
      ["sbs-product-1280.jpg", "uhod-product-desktop.webp"],
      ["sbs-product-768.jpg", "uhod-product-desktop.webp"],
      ["sbs-product-360.jpg", "uhod-product-mobile.webp"],
    ])
  })

  it("labels each column and each pair, and says on the 768 pair alone that the lab has no 768", () => {
    const { pairs } = planPairs("uhod", LAB)
    for (const pair of pairs) expect(pair.labels).toEqual({ lab: "lab 16.09", storefront: "storefront ?template=uhod" })
    expect(pairs.map((p) => p.title)).toContain("category, 768 px")
    expect(pairs.filter((p) => p.note).map((p) => [p.file, p.note])).toEqual([
      ["sbs-home-768.jpg", "the lab has no 768 shot: its desktop shot beside it"],
      ["sbs-category-768.jpg", "the lab has no 768 shot: its desktop shot beside it"],
      ["sbs-product-768.jpg", "the lab has no 768 shot: its desktop shot beside it"],
    ])
    expect(pairs.map((p) => p.column)).toEqual([640, 512, 360, 640, 512, 360, 640, 512, 360])
  })

  it("keeps the storefront alone where one lab shot is missing, and names the file", () => {
    const { pairs, notices } = planPairs("uhod", LAB.filter((f) => f !== "uhod-catalog-mobile.webp"))
    expect(notices).toEqual([])
    const pair = pairs.find((p) => p.file === "sbs-category-360.jpg")
    expect(pair.lab).toBeNull()
    expect(pair.note).toBe("no lab shot uhod-catalog-mobile.webp")
  })

  it("gives a template with no lab shots its three pages alone and one line saying so", () => {
    const { pairs, notices } = planPairs("long-morning", LAB)
    expect(pairs).toHaveLength(9)
    expect(pairs.every((p) => p.lab === null && p.note === null)).toBe(true)
    expect(notices).toEqual(["long-morning has no lab shots in artifacts/docs/store-templates-lab/shots: the storefront alone, home, category and product."])
  })
})

describe("labShot and composeWidth", () => {
  it("names the lab's shot the way the lab saved it", () => {
    expect(labShot("moda", "catalog", 1280)).toBe("moda-catalog-desktop.webp")
    expect(labShot("moda", "catalog", 768)).toBe("moda-catalog-desktop.webp")
    expect(labShot("moda", "catalog", 360)).toBe("moda-catalog-mobile.webp")
  })

  it("is both columns and the gap, or the storefront's column alone", () => {
    const [withLab] = planPairs("uhod", LAB).pairs
    const [alone] = planPairs("opt", LAB).pairs
    expect(composeWidth(withLab)).toBe(16 + 640 + 8 + 640 + 16)
    expect(composeWidth(alone)).toBe(16 + 640 + 16)
    expect(COLUMN[360]).toBe(360)
  })
})

describe("composeHtml", () => {
  it("draws the pair's title, its note and both columns under their labels", () => {
    const pair = planPairs("uhod", LAB).pairs[1]
    const html = composeHtml(pair, { lab: "data:image/webp;base64,AAA", storefront: "data:image/png;base64,BBB" })
    expect(html).toContain("<h1>home, 768 px</h1>")
    expect(html).toContain("the lab has no 768 shot")
    expect(html.indexOf(`<figcaption>${LAB_LABEL}</figcaption>`)).toBeLessThan(html.indexOf("<figcaption>storefront ?template=uhod</figcaption>"))
    expect(html).toContain('src="data:image/webp;base64,AAA"')
    expect(html).toContain("width: 512px")
  })

  it("draws the storefront alone when the pair has no lab shot", () => {
    const pair = planPairs("opt", LAB).pairs[0]
    const html = composeHtml(pair, { lab: null, storefront: "data:image/png;base64,BBB" })
    expect(html).not.toContain(LAB_LABEL)
    expect(html.match(/<figure>/g)).toHaveLength(1)
  })
})

describe("sheetHtml", () => {
  const facts = {
    id: "uhod",
    title: "Косметика и уход",
    date: "2026-10-13",
    commit: "abc1234",
    base: "http://localhost:8130",
    host: "globex.shipshift.dev",
    locale: "ru",
    paths: { home: "/ru", category: "/ru/categories/the-kitchen", product: "/ru/products/cross-back-apron" },
  }

  it("shows every pair by its file name in the same folder, so it opens from the repository", () => {
    const { pairs } = planPairs("uhod", LAB)
    const html = sheetHtml({ ...facts, pairs })
    const srcs = [...html.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1])
    expect(srcs).toEqual(pairs.map((p) => p.file))
    expect(srcs.every((src) => !src.includes("/") && !src.includes(":"))).toBe(true)
    expect(html).toContain("<h2>home, 1280 px</h2>")
    expect(html).toContain("uhod, «Косметика и уход»: the 16.09 lab beside the storefront")
    expect(html).toContain("/ru/categories/the-kitchen")
  })

  it("lists the notices and the problems", () => {
    const { pairs, notices } = planPairs("opt", LAB)
    const html = sheetHtml({ ...facts, id: "opt", title: "opt", pairs, notices, problems: ["/ru/products/x answered 500 at 360 px"] })
    expect(html).toContain("opt has no lab shots")
    expect(html).toContain("answered 500")
    expect(html).toContain("<h1>opt: the 16.09 lab")
  })

  it("escapes what it is given", () => {
    const html = sheetHtml({ ...facts, title: `<b>"x"</b>`, pairs: [] })
    expect(html).toContain("«&lt;b&gt;&quot;x&quot;&lt;/b&gt;»")
  })
})

describe("oversize", () => {
  it("names each pair over 400 KB and no other", () => {
    expect(MAX_BYTES).toBe(400_000)
    expect(oversize([
      { file: "sbs-home-360.jpg", bytes: 412_345 },
      { file: "sbs-home-1280.jpg", bytes: 400_000 },
    ])).toEqual(["sbs-home-360.jpg is 413 KB, over 400 KB"])
  })
})

describe("categoryPaths and productPaths", () => {
  it("keeps the category and product pages, first seen first, once each", () => {
    const links = ["/ru", "/ru/categories/the-kitchen", "/ru/products/cross-back-apron", "/ru/categories/bath", "/ru/categories/the-kitchen", "/ru/store", "/ru/products/cross-back-apron", "/ru/products/mug"]
    expect(categoryPaths(links)).toEqual(["/ru/categories/the-kitchen", "/ru/categories/bath"])
    expect(productPaths(links)).toEqual(["/ru/products/cross-back-apron", "/ru/products/mug"])
  })
})
