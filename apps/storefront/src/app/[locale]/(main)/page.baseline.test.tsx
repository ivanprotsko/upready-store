import { isValidElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The home page with no template is the home page it was before templates existed
 * (t-2026-10-12-33). The snapshot below was written by this test run against the
 * `(main)/page.tsx` of 67430df1, before the template sections were added to it, and is
 * committed in its own commit ahead of that change; the change has to leave every
 * scenario byte-identical. Async Server Component, so no renderer: `await Home()` returns
 * the element tree it composes, and the tree is serialised with each component by name.
 *
 * Every loader the page reads is mocked, and so are the variant registries, so the
 * snapshot is about the page's own composition (which block, in which order, with which
 * props) and not about what each block draws.
 */

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
vi.mock("@lib/profile", () => ({
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

async function renderHome(): Promise<string> {
  const { default: Home } = await import("./page")
  return JSON.stringify(serialise(await Home()), null, 1)
}

const SCENARIOS: Record<string, () => void> = {
  "no settings, no tenant document": () => {},
  "saved composition: hero g, tiles off, listing p3": () => {
    state.settings = { defaultMode: "light", header: "h2", hero: "g", tiles: "off", listing: "p3", footer: "f1" }
  },
  "hero none, listing none": () => {
    state.settings = { defaultMode: "dark", header: "h1", hero: "none", tiles: "on", listing: "none", footer: "f2" }
  },
  "tenant document with hero copy, products and its own order": () => {
    state.settings = { defaultMode: "light", header: "h6", hero: "h", tiles: "on", listing: "p4", footer: "f6" }
    state.home = {
      settings: state.settings,
      updatedAt: "2026-10-12T00:00:00.000Z",
      content: {
        order: ["products", "hero"],
        hero: { title: "Title", subtitle: "", cta_label: "Go", cta_href: "/store", image_url: null },
        products: { kind: "collection", handle: "new" },
      },
    }
  },
  "the olavka shop": () => {
    state.olavka = true
  },
}

describe("home page with no template: unchanged", () => {
  beforeEach(() => {
    state.settings = null
    state.home = null
    state.olavka = false
    state.headers = new Map()
    vi.unstubAllEnvs()
  })
  afterEach(() => vi.unstubAllEnvs())

  for (const [name, arrange] of Object.entries(SCENARIOS)) {
    it(`${name}: the tree matches the one before templates`, async () => {
      arrange()
      expect(await renderHome()).toMatchSnapshot()
    })
  }

  // The preview flag on, a template named, but no flag: the page cannot be told apart.
  for (const [name, arrange] of Object.entries(SCENARIOS)) {
    it(`${name}: a template header without the preview flag changes nothing`, async () => {
      arrange()
      const before = await renderHome()
      state.headers.set("x-template-preview", "long-morning")
      expect(await renderHome()).toBe(before)
    })
  }
})
