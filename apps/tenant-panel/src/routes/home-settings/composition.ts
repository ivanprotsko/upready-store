// tenant-panel: own file, no Admin counterpart. The vocabulary of the home-page
// document `upready.tenant-home/v1` (docs/tenant-panel/api-contract.md, "Piece
// 8"), transcribed by hand for the panel the same way the backend transcribes it
// in `api/store/storefront-settings/validation.ts` and the storefront in
// `lib/theme/composition.ts`: pnpm-workspace.yaml lists only `apps/**`, so there
// is no shared package the three could import one copy from.
//
// Sources:
//  - the six composition enums and the FORBIDDEN pairs: the storefront's
//    `src/lib/theme/composition.ts`;
//  - the theme preset ids: `THEME_IDS` of the storefront's generated
//    `src/lib/theme/presets.generated.ts`.
//
// t-2026-10-14-01 (panel redesign, G4): this file holds values only. What the
// owner reads for each value — its name and the one line under it — is a key
// of `homeSettings.options.<slot>.<value>` and `homeSettings.why.<slot>.<value>`
// in ru.json/en.json (design-system rule 7); the English column is the
// storefront's own catalog, namespace `Composition`. Raw enum values never
// reach the screen (rule 18e).

/** Every value of every slot, in the order the drawer lists them. */
export const SLOT_VALUES = {
  defaultMode: ["light", "dark"],
  header: ["h1", "h2", "h3", "h4", "h5", "h6"],
  hero: ["none", "g", "h", "j", "k", "l", "m", "ga", "gb"],
  tiles: ["on", "off"],
  listing: ["none", "p1", "p2", "p3", "p4", "p5"],
  footer: ["none", "f1", "f2", "f3", "f4", "f5", "f6", "f7"],
} as const

export type Mode = (typeof SLOT_VALUES.defaultMode)[number]
export type HeaderKey = (typeof SLOT_VALUES.header)[number]
export type HeroKey = (typeof SLOT_VALUES.hero)[number]
export type TilesKey = (typeof SLOT_VALUES.tiles)[number]
export type ListingKey = (typeof SLOT_VALUES.listing)[number]
export type FooterKey = (typeof SLOT_VALUES.footer)[number]

export type StorefrontSettingsInput = {
  defaultMode: Mode
  header: HeaderKey
  hero: HeroKey
  tiles: TilesKey
  listing: ListingKey
  footer: FooterKey
}

export type Slot = keyof StorefrontSettingsInput

/** `THEME_IDS` of the storefront's generated presets file. */
export const THEME_PRESETS = [
  "medusa",
  "electronics",
  "geist",
  "home-goods",
  "sneakers",
  "supplements",
  "womens-fashion",
] as const

export type ThemePreset = (typeof THEME_PRESETS)[number]

/** The five slots of the «Блоки» section, in the order the storefront stacks them. */
export const BLOCK_SLOTS: readonly Exclude<Slot, "defaultMode">[] = ["header", "hero", "tiles", "listing", "footer"]

/**
 * Whether the storefront's hero variant renders `content.hero.image_url`
 * (`home/variants/index.ts`/`hero-*.tsx` on the storefront, transcribed here for the
 * same reason as the rest of this file — no shared package). Shelf (h), Three doors
 * (j), Text only (m) and both galleries (ga, gb) compose their own photographs (three
 * product shots, category tiles, category slides) or carry none at all, and ignore the
 * field outright; Витрина (g), Анонс (k) and В движении (l) all still resolve to
 * `ProfileHero`/`HeroG`, which do render it. A variant that ignores the field must not
 * offer it (t07-catalog-filters-hero: Shelf did, on the Cherkashina tenant's hero).
 */
export const HERO_SUPPORTS_IMAGE: Record<Exclude<HeroKey, "none">, boolean> = {
  g: true,
  h: false,
  j: false,
  k: true,
  l: true,
  m: false,
  ga: false,
  gb: false,
}

export const heroShowsImage = (hero: HeroKey): boolean => hero !== "none" && HERO_SUPPORTS_IMAGE[hero]

/** The variants that do show the picture, for the line that names them. */
export const IMAGE_HEROES = (Object.keys(HERO_SUPPORTS_IMAGE) as Exclude<HeroKey, "none">[]).filter(
  (hero) => HERO_SUPPORTS_IMAGE[hero]
)

export type ForbiddenRule = {
  field: Slot
  value: string
  against: Slot
  againstValue: string
  /** `homeSettings.forbidden.<reason>`: why the pair is refused. */
  reason: "headerAccentHeroAnnounce" | "footerInvertedDark"
}

/** The storefront's `FORBIDDEN`, verbatim. The backend re-checks both pairs and
 *  answers 422; the drawer greys the option here so a save is never attempted. */
export const FORBIDDEN: readonly ForbiddenRule[] = [
  { field: "header", value: "h4", against: "hero", againstValue: "k", reason: "headerAccentHeroAnnounce" },
  { field: "footer", value: "f6", against: "defaultMode", againstValue: "dark", reason: "footerInvertedDark" },
]

/**
 * Why picking `value` for `field` is blocked right now, given the rest of the
 * document — the reason key the drawer shows under the greyed option. Both
 * directions of every pair are covered: choosing footer f6 while the mode is
 * dark is blocked, and so is choosing dark while the footer is f6.
 */
export const blockedReason = (
  settings: StorefrontSettingsInput,
  field: Slot,
  value: string
): ForbiddenRule["reason"] | null => {
  for (const rule of FORBIDDEN) {
    if (rule.field === field && rule.value === value && settings[rule.against] === rule.againstValue) {
      return rule.reason
    }
    if (rule.against === field && rule.againstValue === value && settings[rule.field] === rule.value) {
      return rule.reason
    }
  }
  return null
}

/** The blocks under the header whose order the owner sets; `homeSettings.blocks.<block>`. */
export const HOME_BLOCKS = ["hero", "categories", "products"] as const
export type HomeBlock = (typeof HOME_BLOCKS)[number]

/**
 * One banner of the storefront's HeroSliders block (t-2026-09-24-n15, backend
 * `api/tenants/home/validators.ts` `HomeBannerSchema`): a picture, four corner
 * texts and ONE link the whole card carries — a product of the shop or a URL.
 */
export type HomeBannerLink =
  | { type: "product"; product_id: string; handle: string }
  | { type: "url"; href: string }

export type HomeBanner = {
  id: string
  image: {
    src: string
    alt: string
    width?: number
    height?: number
    srcset?: Array<{ w: number; url: string }>
  }
  kicker: string
  label: string
  title: string
  button: string
  link: HomeBannerLink
  sort: number
  /**
   * Texts in other languages, keyed by storefront locale (`ru`, `en`). The screen
   * does not edit them yet; every edit spreads the banner, so a save keeps them.
   */
  i18n?: Record<
    string,
    Partial<{ kicker: string; label: string; title: string; button: string; alt: string }>
  >
}

/** Backend caps: `HOME_BANNER_TEXT_MAX`, `HOME_BANNERS_MAX`, `isAllowedBannerHref`. */
export const BANNER_TEXT_MAX = 60
export const BANNER_ALT_MAX = 200
export const BANNERS_MAX = 10
export const isAllowedBannerHref = (href: string): boolean =>
  /^https?:\/\/[^\s]+$/i.test(href) || (/^\/[^\s]*$/.test(href) && !href.startsWith("//"))

/** Backend caps of the first screen's texts (`heroSchema`). */
export const HERO_MAX = { title: 200, subtitle: 500, cta_label: 100, cta_href: 500 } as const
export const PRODUCTS_TITLE_MAX = 200

export type TenantHomeContent = {
  hero: {
    title: string
    subtitle: string
    cta_label: string
    cta_href: string
    image_url: string | null
    /** Copy in other languages; not edited here, kept by every save. */
    i18n?: Record<string, Partial<{ title: string; subtitle: string; cta_label: string }>>
  }
  products:
    | { source: "popular" }
    | { source: "category"; category_id: string; title: string }
  order: HomeBlock[]
  /** Absent on documents saved before the banners existed; treated as `[]`. */
  banners?: HomeBanner[]
}

export type TenantHomeDocument = {
  schema?: string
  theme: { preset: ThemePreset }
  settings: StorefrontSettingsInput
  content: TenantHomeContent
  updatedAt?: string
}

/**
 * What the screen shows a tenant that never saved a document. The composition
 * half repeats the storefront's own "no saved settings" baseline (`DEFAULT_HEADER`
 * h1, `DEFAULT_HERO` k, `DEFAULT_TILES` on, `DEFAULT_LISTING` p1, `DEFAULT_FOOTER`
 * f1 in the storefront's `nav/variants`, `home/variants` and `footer/variants`),
 * so saving one section of an unsaved page leaves the rest looking exactly as it did.
 */
export const DEFAULT_DOCUMENT: TenantHomeDocument = {
  theme: { preset: "medusa" },
  settings: {
    defaultMode: "light",
    header: "h1",
    hero: "k",
    tiles: "on",
    listing: "p1",
    footer: "f1",
  },
  content: {
    hero: { title: "", subtitle: "", cta_label: "", cta_href: "", image_url: null },
    products: { source: "popular" },
    order: ["hero", "categories", "products"],
    banners: [],
  },
}
