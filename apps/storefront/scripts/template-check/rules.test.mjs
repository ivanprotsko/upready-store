// The verdict half of `pnpm template:check` on plain facts, no browser (t-2026-10-12-33). The measuring half
// runs in a page and is proven by `node scripts/template-check.mjs --self-test` on the two fixtures.
import { describe, expect, it } from "vitest"

import {
  RULES,
  SHARED_PARTS,
  THRESHOLDS,
  allowedRadii,
  applies,
  blockTarget,
  compareWithBaseline,
  evaluateBlock,
  evaluatePages,
  evaluateTarget,
  failureKey,
  followsCanon,
  matchesOnly,
  parseAspect,
  priceTextProblems,
  ratios,
  templatePage,
  withoutShared,
} from "./rules.mjs"

const TYPE_SCALE = [12, 14, 16, 18, 20, 24, 32, 36, 48, 60, 72, 96, 128]

/** A clean page's facts, every list empty or on the scale; a test changes one field. */
function facts(over = {}) {
  return {
    block: false,
    type: { sizes: [{ value: 16, count: 3, samples: ["p"] }, { value: 24, count: 1, samples: ["h2"] }, { value: 32, count: 1, samples: ["h1"] }], weights: [{ value: 400, count: 4, samples: [] }, { value: 600, count: 2, samples: [] }] },
    upper: [],
    lines: [{ el: "p", cpl: 68, width: 560, prose: true }],
    longest: { len: 240, width: 560, el: "p" },
    headings: [{ level: 1, size: 32, el: "h1" }, { level: 2, size: 24, el: "h2" }, { level: 3, size: 16, el: "h3" }],
    roles: { "page-title": [32], "section-title": [24], "card-title": [16, 16], "card-price": [16], price: [] },
    body: 16,
    spacing: [{ value: 16, count: 4, samples: [] }, { value: 32, count: 2, samples: [] }],
    radii: [{ value: 8, count: 2, samples: [] }],
    roleRadii: { card: 8, "card-media": 8, gallery: null },
    radiusVar: null,
    shadows: [],
    frames: [{ role: "card", state: "photo", ratio: 0.75, declared: "3 / 4", bg: "rgb(236, 236, 234)", fit: "contain", w: 150, h: 200 }],
    images: [{ el: "img", alt: "Мёд гречишный", decorative: false, product: true, hardBox: true, shown: true, zero: false }],
    cards: [{ href: "/en/products/med", sig: "card-media>card-title>card-price", surface: true }],
    prices: [{ el: "span[price] «1 355 ₽»", text: "1 355 ₽", numeric: "tabular-nums", weight: "600", size: "16px" }],
    cardTitle: { weight: "400", size: "16px" },
    overflow: { px: 0, offenders: [] },
    hits: [],
    iconRun: 2,
    textAboveFold: 20,
    pageHeight: 2400,
    containerEdges: [40],
    bandGaps: [48],
    footer: { footer: "rgb(31, 77, 58)", page: "rgb(255, 255, 255)" },
    gallery: null,
    drawn: { h: 400, text: 120, media: 1 },
    occluded: [],
    ...over,
  }
}
const ctx = (over = {}) => ({
  on: "page",
  page: "home",
  width: 1280,
  typeScale: TYPE_SCALE,
  errors: [],
  motion: { max: 150, offenders: [{ ms: 150, kind: "transition", el: "button" }] },
  reducedMotion: { max: 0, offenders: [] },
  focus: [{ el: "a", visible: true }],
  contrast: { violations: [] },
  ...over,
})
const failed = (results) => results.filter((r) => r.kind === "gate" && !r.pass).map((r) => r.rule)
const one = (results, id) => results.find((r) => r.rule === id)

describe("the rule table", () => {
  it("keeps the lab's ids, kinds and thresholds", () => {
    expect(RULES).toHaveLength(31)
    expect(RULES.filter((r) => r.kind === "report").map((r) => r.id)).toEqual(["QR-SECTION-RHYTHM", "QR-DENSITY", "QR-TECTONICS"])
    expect(THRESHOLDS.typeRatio).toBe(1.15)
    expect(THRESHOLDS.typeMaxSizes).toBe(8)
    expect(THRESHOLDS.space).toEqual([4, 8, 12, 16, 24, 32, 48, 64, 96, 128])
    expect(THRESHOLDS.measure).toEqual([45, 90])
    expect(THRESHOLDS.hitPx).toBe(44)
    expect(THRESHOLDS.motionMaxMs).toBe(240)
    for (const r of RULES) expect(r.id).toMatch(/^QR-[A-Z-]+$/)
  })

  it("measures the lab's desktop rules at 1280 and its phone rules at 360 only", () => {
    const measure = RULES.find((r) => r.id === "QR-MEASURE")
    const hit = RULES.find((r) => r.id === "QR-HIT")
    expect(applies(measure, { on: "page", width: 1280 })).toBe(true)
    expect(applies(measure, { on: "page", width: 360 })).toBe(false)
    expect(applies(hit, { on: "block", width: 360 })).toBe(true)
    expect(applies(hit, { on: "block", width: 1280 })).toBe(false)
  })
})

describe("measuring helpers", () => {
  it("ratios: neighbours of the distinct values, ascending", () => {
    expect(ratios([14, 12, 13, 12])).toEqual([
      { from: 12, to: 13, ratio: 1.083 },
      { from: 13, to: 14, ratio: 1.077 },
    ])
    expect(ratios([16])).toEqual([])
  })

  it("parseAspect reads the computed aspect-ratio forms", () => {
    expect(parseAspect("3 / 4")).toBe(0.75)
    expect(parseAspect("auto 800 / 600")).toBe(1.333)
    expect(parseAspect("1.5")).toBe(1.5)
    expect(parseAspect("auto")).toBe(null)
  })

  it("priceTextProblems: zero kopecks and the space before ₽", () => {
    expect(priceTextProblems("1 355,00 ₽")).toEqual(["zero kopecks shown", "no no-break space before ₽"])
    expect(priceTextProblems("1 355 ₽")).toEqual([])
    expect(priceTextProblems("$128.99")).toEqual([])
    expect(priceTextProblems("$128.00")).toEqual(["zero kopecks shown"])
  })

  it("followsCanon: a role may be missing, never moved", () => {
    expect(followsCanon("card-media>card-title>card-price")).toBe(true)
    expect(followsCanon("card-media>card-badge>card-title>card-price>card-price-old>card-meta")).toBe(true)
    expect(followsCanon("card-media>card-price>card-title")).toBe(false)
    expect(followsCanon("card-media>card-title>card-meta>card-price")).toBe(false)
  })

  it("allowedRadii puts the page's --radius in place of the lab's --r-md", () => {
    expect([...allowedRadii(null)]).toEqual([0, 6, 8, 12, "pill"])
    expect(allowedRadii(4).has(4)).toBe(true)
    expect(allowedRadii(4).has(8)).toBe(false)
  })
})

describe("evaluateTarget", () => {
  it("a clean page fails no gate", () => {
    expect(failed(evaluateTarget(facts(), ctx()))).toEqual([])
  })

  it("QR-TYPE-SCALE: off the scale, too close, too many", () => {
    const r = one(
      evaluateTarget(facts({ type: { sizes: [12, 13, 14, 16, 18, 20, 24, 32, 36].map((value) => ({ value, count: 1, samples: [] })), weights: [] } }), ctx()),
      "QR-TYPE-SCALE"
    )
    const sigs = r.failures.map((f) => f.sig)
    expect(sigs).toContain("size 13px off the scale")
    expect(sigs).toContain("sizes 12→13 closer than 1.15")
    expect(sigs).toContain("more than 8 sizes")
  })

  it("QR-HEADING-RANK: one h1 on a page, none required in a block", () => {
    const two = facts({ headings: [{ level: 1, size: 32 }, { level: 1, size: 32 }] })
    expect(failed(evaluateTarget(two, ctx()))).toContain("QR-HEADING-RANK")
    const block = facts({ headings: [{ level: 2, size: 24 }] })
    expect(failed(evaluateTarget(block, ctx({ on: "block" })))).not.toContain("QR-HEADING-RANK")
  })

  it("QR-SECTION-RANK at exactly 1.5 passes, below fails", () => {
    expect(one(evaluateTarget(facts(), ctx()), "QR-SECTION-RANK").pass).toBe(true)
    expect(one(evaluateTarget(facts({ roles: { ...facts().roles, "section-title": [20] } }), ctx()), "QR-SECTION-RANK").pass).toBe(false)
  })

  it("QR-SPACE-SCALE and QR-RADIUS name the off-scale value in the signature", () => {
    const r = evaluateTarget(facts({ spacing: [{ value: 6, count: 2, samples: [] }], radii: [{ value: 3, count: 1, samples: [] }] }), ctx())
    expect(one(r, "QR-SPACE-SCALE").failures[0].sig).toBe("space 6px off the scale")
    expect(one(r, "QR-RADIUS").failures[0].sig).toBe("radius 3px off the tokens")
  })

  it("QR-PRICE: tabular-nums, kopecks and the title's own weight and size", () => {
    const r = one(
      evaluateTarget(facts({ prices: [{ el: "span[price] «1 355,00 ₽»", text: "1 355,00 ₽", numeric: "normal", weight: "400", size: "16px" }] }), ctx()),
      "QR-PRICE"
    )
    expect(r.failures.map((f) => f.sig).sort()).toEqual(
      ["card price set like the card title", "price without tabular-nums: span[price]", "price: no no-break space before ₽", "price: zero kopecks shown"].sort()
    )
  })

  it("QR-EMPTY: a drawn empty frame fails only on an empty-state anchor", () => {
    const empty = facts({ drawn: { h: 240, text: 0, media: 0 } })
    expect(failed(evaluateTarget(empty, ctx({ on: "block", state: "empty" })))).toContain("QR-EMPTY")
    expect(failed(evaluateTarget(empty, ctx({ on: "block", state: "live" })))).not.toContain("QR-EMPTY")
    expect(failed(evaluateTarget(facts({ drawn: { h: 0, text: 0, media: 0 } }), ctx({ on: "block", state: "empty" })))).not.toContain("QR-EMPTY")
  })

  it("QR-MOTION: long durations and motion kept under reduce", () => {
    const r = one(
      evaluateTarget(facts(), ctx({ motion: { max: 300, offenders: [{ ms: 300, kind: "transition", el: "a" }] }, reducedMotion: { max: 300, offenders: [{ ms: 300, kind: "transition", el: "a" }] } })),
      "QR-MOTION"
    )
    expect(r.failures.map((f) => f.sig)).toEqual(["transition 300ms over 240ms", "motion kept under prefers-reduced-motion"])
  })

  it("report rules never gate", () => {
    const r = evaluateTarget(facts({ textAboveFold: 80, bandGaps: [24, 48, 96], footer: { footer: "rgb(255, 255, 255)", page: "rgb(255, 255, 255)" } }), ctx())
    expect(r.filter((x) => x.kind === "report" && !x.pass).map((x) => x.rule).sort()).toEqual(["QR-DENSITY", "QR-SECTION-RHYTHM", "QR-TECTONICS"])
    expect(failed(r)).toEqual([])
  })
})

describe("evaluatePages", () => {
  it("compares roles, ratios, card signatures and radii across a template's pages", () => {
    const home = facts()
    const category = facts({ roles: { ...facts().roles, "page-title": [36] }, roleRadii: { card: 8, "card-media": 6, gallery: null } })
    const product = facts({
      frames: [{ role: "card", state: "photo", ratio: 1, declared: "1 / 1", bg: "x", fit: "contain", w: 1, h: 1 }],
      cards: [{ href: "/en/products/med", sig: "card-media>card-title>card-meta>card-price", surface: true }],
    })
    const r = evaluatePages({ home, category, product })
    expect(r.map((x) => [x.rule, x.pass])).toEqual([
      ["QR-TYPE-ROLE", false],
      ["QR-IMG-ASPECT", false],
      ["QR-CARD-GRAMMAR", false],
      ["QR-RADIUS", false],
    ])
    expect(evaluatePages({ home, category: facts(), product: facts() }).every((x) => x.pass)).toBe(true)
  })
})

describe("baseline", () => {
  it("only a failure the baseline does not hold is new; report rules never count", () => {
    const results = [
      {
        target: "template/a/home@1280",
        results: [
          { rule: "QR-SPACE-SCALE", kind: "gate", failures: [{ sig: "space 6px off the scale", detail: "" }, { sig: "space 10px off the scale", detail: "" }] },
          { rule: "QR-DENSITY", kind: "report", failures: [{ sig: "text above the fold outside 12…32", detail: "" }] },
        ],
      },
    ]
    const baseline = new Set([failureKey("template/a/home@1280", "QR-SPACE-SCALE", "space 6px off the scale")])
    const { fresh, inherited, known } = compareWithBaseline(results, baseline)
    expect(known.map((f) => f.sig)).toEqual(["space 6px off the scale"])
    expect(fresh.map((f) => f.sig)).toEqual(["space 10px off the scale"])
    expect(inherited).toEqual([])
  })

  // The baseline as T0b wrote it: long-morning's and ferrite's pages and one block, no key of the new template.
  const shared = new Set([
    failureKey("template/long-morning/home@360", "QR-HIT", "hit area under 44px: a[cart-link]"),
    failureKey("template/ferrite/home@360", "QR-HIT", "hit area under 44px: a[cart-link]"),
    failureKey("template/long-morning/product@1280", "QR-TYPE-SCALE", "size 13px off the scale"),
    failureKey("block/hero/g@360", "QR-MOTION", "transition 300ms over 240ms"),
  ])
  const gate = (target, rule, ...sigs) => ({ target, results: [{ rule, kind: "gate", failures: sigs.map((sig) => ({ sig, detail: sig })) }] })

  it("a new template's page failure the baseline holds for the same page and width of another template is inherited", () => {
    const { fresh, inherited, known } = compareWithBaseline([gate("template/ferma/home@360", "QR-HIT", "hit area under 44px: a[cart-link]")], shared)
    expect(fresh).toEqual([])
    expect(known).toEqual([])
    expect(inherited).toEqual([
      {
        key: "template/ferma/home@360 | QR-HIT | hit area under 44px: a[cart-link]",
        target: "template/ferma/home@360",
        rule: "QR-HIT",
        sig: "hit area under 44px: a[cart-link]",
        detail: "hit area under 44px: a[cart-link]",
        from: ["ferrite", "long-morning"],
      },
    ])
  })

  it("a failure only the new template has is new: another sig, page, width or rule", () => {
    const { fresh, inherited } = compareWithBaseline(
      [
        gate("template/ferma/home@360", "QR-HIT", "hit area under 44px: button[ferma-cta]"),
        gate("template/ferma/category@360", "QR-HIT", "hit area under 44px: a[cart-link]"),
        gate("template/ferma/home@1280", "QR-HIT", "hit area under 44px: a[cart-link]"),
        gate("template/ferma/product@1280", "QR-SPACE-SCALE", "size 13px off the scale"),
      ],
      shared
    )
    expect(inherited).toEqual([])
    expect(fresh.map((f) => f.target)).toEqual(["template/ferma/home@360", "template/ferma/category@360", "template/ferma/home@1280", "template/ferma/product@1280"])
  })

  it("a block owns its failures, even one the baseline holds for a page or another block", () => {
    const { fresh, inherited } = compareWithBaseline(
      [
        gate("block/hero/h@360", "QR-HIT", "hit area under 44px: a[cart-link]"),
        gate("block/hero/h@360", "QR-MOTION", "transition 300ms over 240ms"),
        gate("playground@360", "QR-HIT", "hit area under 44px: a[cart-link]"),
      ],
      shared
    )
    expect(inherited).toEqual([])
    expect(fresh).toHaveLength(3)
  })

  it("a template's own baseline key stays known, not inherited; the whole baseline serves an --only run", () => {
    const run = [gate("template/long-morning/home@360", "QR-HIT", "hit area under 44px: a[cart-link]")]
    expect(compareWithBaseline(run, shared).known).toHaveLength(1)
    expect(compareWithBaseline(run, shared).inherited).toEqual([])
    // ferrite's key alone is enough to call long-morning's same failure inherited.
    const ferriteOnly = new Set([...shared].filter((k) => !k.startsWith("template/long-morning/")))
    expect(compareWithBaseline(run, ferriteOnly).inherited.map((f) => f.from)).toEqual([["ferrite"]])
  })

  it("templatePage reads template page targets only", () => {
    expect(templatePage("template/long-morning/home@360")).toEqual({ template: "long-morning", slot: "home@360" })
    expect(templatePage("template/ferrite/pages@1280")).toEqual({ template: "ferrite", slot: "pages@1280" })
    expect(templatePage("block/hero/g@360")).toBe(null)
    expect(templatePage("block/announcement/text-bar:empty@360")).toBe(null)
    expect(templatePage("playground@1280")).toBe(null)
  })

  it("--only matches a template id, a block id or its anchor", () => {
    expect(matchesOnly({ kind: "template", template: "ferrite" }, ["ferrite"])).toBe(true)
    expect(matchesOnly({ kind: "template", template: "ferrite" }, ["hero/g"])).toBe(false)
    expect(matchesOnly({ kind: "block", block: "hero/g", anchor: "block-hero-g" }, ["hero/g"])).toBe(true)
    expect(matchesOnly({ kind: "block", block: "hero/g", anchor: "block-hero-g" }, ["block-hero-g"])).toBe(true)
    expect(matchesOnly({ kind: "block", block: "announcement/text-bar", anchor: "block-announcement-text-bar-empty" }, ["announcement/text-bar"])).toBe(true)
    expect(matchesOnly({ kind: "block", block: "hero/g", anchor: "block-hero-g" }, [])).toBe(true)
  })
})

describe("shared parts", () => {
  // A block showing products with the storefront's ProductCard, at 360: its own text 16 and 24px, the card's unit line 13px.
  const own = { value: 16, count: 3, samples: ["h2"] }
  const card = { value: 13, count: 6, samples: ["span[product-unit] «Small · Large»"] }
  const block = (sizes, over = {}) => facts({ block: true, type: { sizes: [...sizes, { value: 24, count: 1, samples: ["h2"] }], weights: [] }, ...over })
  const at360 = ctx({ on: "block", page: null, width: 360 })
  // The baseline as T0b wrote it for the home listing: the card's debt on block/listing/p1 and p2.
  const baseline = new Set([
    failureKey("block/listing/p1@360", "QR-TYPE-SCALE", "size 13px off the scale"),
    failureKey("block/listing/p2@360", "QR-TYPE-SCALE", "size 13px off the scale"),
    failureKey("block/listing/p1@360", "QR-MOTION", "motion kept under prefers-reduced-motion"),
    failureKey("block/listing/p1@1280", "QR-SPACE-SCALE", "space 6px off the scale"),
  ])
  const run = (target, full, ownFacts, c = at360) => compareWithBaseline([{ target, ...evaluateBlock(full, ownFacts, c) }], baseline)

  it("names ProductCard by the selector of its root", () => {
    expect(SHARED_PARTS.map((p) => [p.name, p.selector])).toEqual([["ProductCard", '[data-testid="product-wrapper"]']])
    expect(blockTarget("block/listing/p1@360")).toEqual({ block: "listing/p1", width: 360 })
    expect(blockTarget("block/announcement/text-bar:empty@1280")).toEqual({ block: "announcement/text-bar:empty", width: 1280 })
    expect(blockTarget("template/ferrite/home@360")).toBe(null)
  })

  it("a block with the card's 13px unit line only: 0 new, 1 inherited from the listing blocks and the card", () => {
    const { fresh, inherited, known } = run("block/collection/featured@360", block([own, card], { shared: ["ProductCard"] }), block([own]))
    expect(fresh).toEqual([])
    expect(known).toEqual([])
    expect(inherited).toEqual([
      {
        key: "block/collection/featured@360 | QR-TYPE-SCALE | size 13px off the scale",
        target: "block/collection/featured@360",
        rule: "QR-TYPE-SCALE",
        sig: "size 13px off the scale",
        detail: "13px ×6, e.g. span[product-unit] «Small · Large»",
        from: ["listing/p1", "listing/p2", "ProductCard"],
        part: "ProductCard",
      },
    ])
  })

  it("a block whose own text is 13px too: the 13px failure stays new", () => {
    const ownSmall = { value: 13, count: 1, samples: ["p.note «Delivery tomorrow»"] }
    const { fresh, inherited } = run("block/collection/featured@360", block([own, card], { shared: ["ProductCard"] }), block([own, ownSmall]))
    expect(inherited).toEqual([])
    expect(fresh.map((f) => `${f.rule} | ${f.sig}`)).toEqual(["QR-TYPE-SCALE | size 13px off the scale"])
  })

  it("a card failure the baseline does not hold, or holds at another width only, is new", () => {
    const spacing = [{ value: 16, count: 4, samples: [] }, { value: 6, count: 32, samples: ["button[wishlist-button]"] }, { value: 10, count: 2, samples: ["span[product-unit]"] }]
    const { fresh, inherited } = run(
      "block/collection/featured@360",
      block([own], { shared: ["ProductCard"], spacing }),
      block([own], { spacing: [{ value: 16, count: 4, samples: [] }] })
    )
    expect(inherited).toEqual([])
    expect(fresh.map((f) => f.sig)).toEqual(["space 6px off the scale", "space 10px off the scale"])
  })

  it("motion, focus and contrast inside the part are left out by the part they name", () => {
    const c = ctx({
      on: "block",
      page: null,
      width: 360,
      reducedMotion: { max: 150, offenders: [{ ms: 150, kind: "transition", el: "button.absolute", part: "ProductCard" }] },
      focus: [{ el: "a", visible: true }, { el: "button[wishlist-button]", visible: false, part: "ProductCard" }],
      contrast: { violations: [{ el: "span[product-unit]", ratio: 3.9, expected: 4.5, part: "ProductCard" }] },
    })
    expect(withoutShared(c)).toMatchObject({ reducedMotion: { max: 0, offenders: [] }, focus: [{ el: "a", visible: true }], contrast: { violations: [] } })
    const { fresh, inherited } = run("block/collection/featured@360", block([own], { shared: ["ProductCard"] }), block([own]), c)
    expect(inherited.map((f) => f.rule)).toEqual(["QR-MOTION"])
    // Focus and contrast inside the card are not in the baseline: the block's run reports them as new.
    expect(fresh.map((f) => f.rule)).toEqual(["QR-CONTRAST", "QR-FOCUS"])
  })

  it("a template page keeps today's rule: a block's baseline key makes nothing on it inherited", () => {
    const page = { ...evaluateBlock(facts({ type: { sizes: [own, card, { value: 32, count: 1, samples: ["h1"] }], weights: [] } }), null, ctx({ width: 360 })) }
    const target = { target: "template/ferma/home@360", ...page, shared: ["ProductCard"], ownFailures: [] }
    const { fresh, inherited } = compareWithBaseline([target], baseline)
    expect(inherited).toEqual([])
    expect(fresh.map((f) => f.sig)).toContain("size 13px off the scale")
  })

  it("a block without a shared part is measured once and owns every failure", () => {
    const r = evaluateBlock(block([own, card], { shared: [] }), block([own]), at360)
    expect(r.shared).toBeUndefined()
    expect(r.ownFailures).toBeUndefined()
    expect(compareWithBaseline([{ target: "block/collection/featured@360", ...r }], baseline).fresh.map((f) => f.sig)).toEqual(["size 13px off the scale"])
  })
})
