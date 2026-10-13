import { isValidElement, type ReactNode } from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import longMorning from "../../../templates/long-morning/template.json"

/**
 * The home page of a shop that saved a template (t-2026-10-12-33): it is laid out by
 * `TemplateSections` from the document's `content.sections`, and its tree is the very tree
 * the templates stand's preview of the same template builds for the same shop. The harness
 * is `page.baseline.test.tsx`'s, which holds the page with no template to its old tree.
 */

// `TemplateSections` imports the block registry, which lists the header and footer variants by
// reference; they are drawn by the layout, not this page, so named stubs stand in for them.
vi.mock("server-only", () => ({}))
vi.mock("@modules/layout/templates/nav/variants", () => ({ NAV_VARIANTS: {} }))
vi.mock("@modules/layout/templates/footer/variants", () => ({ FOOTER_VARIANTS: {} }))

const state = vi.hoisted(() => ({
  settings: null as Record<string, string> | null,
  home: null as Record<string, unknown> | null,
  olavka: false,
  headers: new Map<string, string>(),
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: string) => (key: string) => `${ns}.${key}`,
  getLocale: async () => "ru",
}))
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => state.headers.get(name) ?? null }),
}))
vi.mock("@lib/data/tenant-home", () => ({
  getEffectiveSettings: async () => state.settings,
  getTenantHome: async () => state.home,
}))
vi.mock("@lib/data/olavka-shop", () => ({ isOlavkaShop: async () => state.olavka }))
vi.mock("@lib/data/cookies", () => ({ getSiteName: async () => "Shop" }))
vi.mock("@lib/data/categories", () => ({
  listCategories: async () => [{ handle: "chairs", name: "Chairs" }],
}))
vi.mock("@lib/util/alternates", () => ({ buildAlternates: async () => ({}) }))
// Partial: blocks of the registry reach `@lib/util/env` through their loaders, which reads `profile`.
vi.mock("@lib/profile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lib/profile")>()),
  categoryTiles: [{ categoryHandle: "chairs", label: "Chairs", image: "/chairs.jpg" }],
}))
vi.mock("@modules/home/components/category-tiles", () => ({
  default: function CategoryTiles() {
    return null
  },
}))
vi.mock("@modules/home/components/home-brands", () => ({
  default: function HomeBrands() {
    return null
  },
}))
vi.mock("@modules/skeletons/templates/skeleton-product-grid", () => ({
  default: function SkeletonProductGrid() {
    return null
  },
}))
vi.mock("@modules/home/components/listing-section", () => ({
  HOME_SECTION_CLASS: "home-section",
}))
vi.mock("@modules/home/variants", () => {
  const named = (name: string) =>
    Object.defineProperty(() => null, "name", { value: name })
  const keys = (prefix: string, list: string[]) =>
    Object.fromEntries(list.map((key) => [key, named(`${prefix}${key.toUpperCase()}`)]))
  return {
    DEFAULT_BLOCK_ORDER: ["hero", "categories", "products"],
    DEFAULT_HERO: "k",
    DEFAULT_LISTING: "p1",
    DEFAULT_TILES: "on",
    HERO_VARIANTS: keys("Hero", ["g", "h", "j", "k", "l", "m", "ga", "gb"]),
    LISTING_VARIANTS: keys("Listing", ["p1", "p2", "p3", "p4", "p5"]),
    OLAVKA_HOME_BLOCKS: {
      olavkaCover: named("OlavkaCover"),
      olavkaNavigation: named("OlavkaNavigation"),
      olavkaHeroSlider: named("OlavkaHeroSlider"),
    },
    OLAVKA_HOME_ORDER: ["olavkaHeroSlider"],
  }
})

function serialise(node: ReactNode): unknown {
  if (Array.isArray(node)) return node.map(serialise)
  if (!isValidElement(node)) return node ?? null
  const { type } = node
  const name =
    typeof type === "string"
      ? type
      : typeof type === "function"
        ? type.name || "Anonymous"
        : String((type as { toString(): string }).toString())
  const { children, ...rest } = (node.props ?? {}) as Record<string, unknown>
  const props: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rest)) {
    props[key] = isValidElement(value) || Array.isArray(value) ? serialise(value as ReactNode) : value
  }
  return { type: name, key: node.key, props, children: serialise(children as ReactNode) }
}

// For a template the page imports the block registry lazily (`@lib/templates/saved`), and that first
// import is cold: it grows with every block, took 2–5 s on a laptop and ran past vitest's 5 s under load
// (t-2026-10-12-33, #397, #398). The page and what it imports for a template load once here, under a
// limit of their own, so each test keeps vitest's 5 s for its own render.
let Home: typeof import("./page").default

async function renderHome(): Promise<string> {
  return JSON.stringify(serialise(await Home()), null, 1)
}

const { palette, fontPair, ...layers } = longMorning.theme

/** The shop's own document, with no template: what the panel's form saves. */
const plainDocument = () => ({
  schema: "upready.tenant-home/v1",
  theme: { preset: "sneakers" },
  settings: longMorning.settings,
  updatedAt: "2026-10-13T00:00:00.000Z",
  content: {
    order: ["products", "hero"],
    hero: { title: "Title", subtitle: "", cta_label: "Go", cta_href: "/store", image_url: null },
    products: { source: "popular" },
  },
})

/** The same document after `POST /tenants/home/template {"id":"long-morning"}`. */
const savedDocument = () => {
  const plain = plainDocument()
  return {
    ...plain,
    theme: { preset: palette, layers },
    content: { ...plain.content, sections: longMorning.sections },
    template: { id: "long-morning", schema: longMorning.schema, fontPair },
  }
}

type Node = { type: string; props: Record<string, unknown>; children: unknown }
const find = (tree: unknown, type: string): Node | null => {
  if (Array.isArray(tree)) {
    for (const node of tree) {
      const hit = find(node, type)
      if (hit) return hit
    }
    return null
  }
  if (!tree || typeof tree !== "object") return null
  const node = tree as Node
  return node.type === type ? node : find(node.children, type)
}

describe("home page with a saved template", () => {
  beforeAll(async () => {
    const [page] = await Promise.all([
      import("./page"),
      import("@lib/templates/saved"),
      import("@modules/blocks/template-sections"),
      import("@lib/templates/catalog"),
    ])
    Home = page.default
  }, 30_000)

  beforeEach(() => {
    state.settings = longMorning.settings
    state.home = null
    state.olavka = false
    state.headers = new Map()
    vi.unstubAllEnvs()
  })
  afterEach(() => vi.unstubAllEnvs())

  it("is laid out by TemplateSections from the saved sections", async () => {
    state.home = savedDocument()
    const sections = find(JSON.parse(await renderHome()), "TemplateSections")
    expect(sections?.props.sections).toEqual(longMorning.sections)
  })

  it("is the tree the preview of the same template builds for the same shop", async () => {
    state.home = savedDocument()
    const saved = await renderHome()

    state.home = plainDocument()
    vi.stubEnv("STOREFRONT_TEMPLATE_PREVIEW", "1")
    state.headers.set("x-template-preview", "long-morning")
    expect(await renderHome()).toBe(saved)
  })

  it("renders as a shop with no template when the saved one no longer validates", async () => {
    state.home = plainDocument()
    const plain = await renderHome()
    expect(find(JSON.parse(plain), "TemplateSections")).toBeNull()

    const broken = savedDocument()
    broken.content = { ...broken.content, sections: [{ block: "hero/zz" }, ...broken.content.sections] }
    state.home = broken
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(await renderHome()).toBe(plain)
    warn.mockRestore()
  })
})
