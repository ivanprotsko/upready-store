// tenant-panel: own file, no Admin counterpart. The vocabulary of the home-page
// document `upready.tenant-home/v1` (docs/tenant-panel/api-contract.md, "Piece
// 8"), transcribed by hand for the panel the same way the backend transcribes it
// in `api/store/storefront-settings/validation.ts` and the storefront in
// `lib/theme/composition.ts`: pnpm-workspace.yaml lists only `apps/**`, so there
// is no shared package the three could import one copy from.
//
// Sources of each half:
//  - the six composition enums and the FORBIDDEN pairs: the storefront's
//    `src/lib/theme/composition.ts`;
//  - the plain-language English label and the one-line "why" under each option:
//    the storefront's own catalog `apps/storefront/messages/en.json`, namespace
//    `Composition` (the English column of the C1 string set the composition
//    mockup §C1 specifies). Raw enum values never reach the screen (rule 18e);
//  - the theme preset labels: `THEME_LABELS` in the storefront's generated
//    `src/lib/theme/presets.generated.ts`.

export type Mode = "light" | "dark"
export type HeaderKey = "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
export type HeroKey = "none" | "g" | "h" | "j" | "k" | "l" | "m" | "ga" | "gb"
export type TilesKey = "on" | "off"
export type ListingKey = "none" | "p1" | "p2" | "p3" | "p4" | "p5"
export type FooterKey = "none" | "f1" | "f2" | "f3" | "f4" | "f5" | "f6"

export type StorefrontSettingsInput = {
  defaultMode: Mode
  header: HeaderKey
  hero: HeroKey
  tiles: TilesKey
  listing: ListingKey
  footer: FooterKey
}

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

/** `THEME_LABELS`, verbatim. An id never reaches the screen. */
export const THEME_LABELS: Record<ThemePreset, string> = {
  medusa: "Medusa default",
  electronics: "Ferrite",
  geist: "Geist",
  "home-goods": "Long Morning",
  sneakers: "Kerbstone",
  supplements: "Scruple",
  "womens-fashion": "Larchant",
}

export type Option<T extends string> = {
  value: T
  /** What the operator reads in the select. */
  label: string
  /** The one-line description under it — `Composition.<slot>Why.<key>`. */
  why: string
}

export const MODE_OPTIONS: Option<Mode>[] = [
  { value: "light", label: "Light", why: "A visitor who never switched sees the light palette." },
  { value: "dark", label: "Dark", why: "A visitor who never switched sees the dark palette." },
]

export const HEADER_OPTIONS: Option<HeaderKey>[] = [
  {
    value: "h1",
    label: "As it is today",
    why: "Burger menu left, wordmark centre, search, region, account and cart on the right.",
  },
  {
    value: "h2",
    label: "Left, menu in a row",
    why: "Wordmark left, up to four category links centred, utilities on the right.",
  },
  {
    value: "h3",
    label: "Two tiers",
    why: "A slim promo line above a main row with the wordmark, menu and search.",
  },
  {
    value: "h4",
    label: "Accent",
    why: "The header fills with the accent colour, wordmark left, menu centred.",
  },
  {
    value: "h5",
    label: "Slim + category strip",
    why: "A slim bar plus a scrollable row of category chips with product counts.",
  },
  {
    value: "h6",
    label: "Centre + category strip",
    why: "The same category chip row as Slim, but the bar keeps the wordmark centred.",
  },
]

export const HERO_OPTIONS: Option<HeroKey>[] = [
  { value: "none", label: "None", why: "No hero — the page opens straight into the next section." },
  {
    value: "g",
    label: "Showcase",
    why: "A split hero: a product's photo beside its title, price and an add-to-bag button.",
  },
  {
    value: "h",
    label: "Shelf",
    why: "A three-product shelf beside a panel naming the collection and its starting price.",
  },
  {
    value: "j",
    label: "Three doors",
    why: "Three large category tiles with item counts, in place of a hero image.",
  },
  {
    value: "k",
    label: "Announcement",
    why: "A flat accent band with a headline, subheadline and one call to action.",
  },
  {
    value: "l",
    label: "In motion",
    why: "A full-bleed photo with a floating card for one product in the bottom-left corner.",
  },
  {
    value: "m",
    label: "No hero, text only",
    why: "No image — a two-line tagline strip above the first collection's heading.",
  },
  {
    value: "ga",
    label: "Carousel with neighbours",
    why: "A carousel of category slides, the active one wider, with neighbours peeking in.",
  },
  {
    value: "gb",
    label: "Stripes",
    why: "Vertical category stripes; the selected one expands to show its own copy.",
  },
]

export const TILES_OPTIONS: Option<TilesKey>[] = [
  { value: "on", label: "On", why: "A row of category tiles under the hero." },
  { value: "off", label: "Off", why: "No category tiles on the home page." },
]

export const LISTING_OPTIONS: Option<ListingKey>[] = [
  { value: "none", label: "None", why: "No listing — the page ends after the hero and tiles." },
  {
    value: "p1",
    label: "Grid of 4",
    why: "One collection, four columns, eight products, title and price shown.",
  },
  {
    value: "p2",
    label: "Dense 6",
    why: "All products, six columns, a dense grid of twelve, title and price only.",
  },
  {
    value: "p3",
    label: "Spec list",
    why: "A row list with image, title, a spec line and price for each product.",
  },
  {
    value: "p4",
    label: "Wall",
    why: "A three-column masonry wall of nine products, image, title and price.",
  },
  {
    value: "p5",
    label: "Editorial",
    why: "One large lead product beside four smaller ones, editorial layout.",
  },
]

export const FOOTER_OPTIONS: Option<FooterKey>[] = [
  { value: "none", label: "None", why: "No footer." },
  {
    value: "f1",
    label: "Four columns",
    why: "Four columns: brand, categories, collections and info links.",
  },
  {
    value: "f2",
    label: "One row",
    why: "One row: wordmark and every link inline, with a legal line below.",
  },
  {
    value: "f3",
    label: "Giant wordmark",
    why: "Link rows above a giant wordmark, sized to fit the width.",
  },
  {
    value: "f4",
    label: "Inverted, with newsletter",
    why: "Inverted colours: a newsletter form beside categories and collections.",
  },
  { value: "f5", label: "Terms as tiles", why: "Three fact cards above the usual columns." },
  {
    value: "f6",
    label: "Inverted giant wordmark",
    why: "Link rows above an inverted, giant wordmark.",
  },
]

export type ForbiddenRule = {
  field: keyof StorefrontSettingsInput
  value: string
  against: keyof StorefrontSettingsInput
  againstValue: string
  reason: string
}

/** The storefront's `FORBIDDEN`, verbatim. The backend re-checks both pairs and
 *  answers 422; the screen greys the option here so a save is never attempted. */
export const FORBIDDEN: readonly ForbiddenRule[] = [
  {
    field: "header",
    value: "h4",
    against: "hero",
    againstValue: "k",
    reason:
      "Header Accent and hero Announcement both fill their bar with the accent, nothing between.",
  },
  {
    field: "footer",
    value: "f6",
    against: "defaultMode",
    againstValue: "dark",
    reason:
      "Footer Inverted giant wordmark turns light on a dark page — reads as detached, not a foundation.",
  },
]

/**
 * Why picking `value` for `field` is blocked right now, given the rest of the
 * document — the reason the select shows beside the greyed option. Both
 * directions of every pair are covered: choosing footer f6 while the mode is
 * dark is blocked, and so is choosing dark while the footer is f6.
 */
export const blockedReason = (
  settings: StorefrontSettingsInput,
  field: keyof StorefrontSettingsInput,
  value: string
): string | null => {
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

export const HOME_BLOCKS = ["hero", "categories", "products"] as const
export type HomeBlock = (typeof HOME_BLOCKS)[number]

export const BLOCK_LABELS: Record<HomeBlock, string> = {
  hero: "Hero",
  categories: "Category tiles",
  products: "Products",
}

export type TenantHomeContent = {
  hero: {
    title: string
    subtitle: string
    cta_label: string
    cta_href: string
    image_url: string | null
    /** The dark version of `image_url` (`specs/store-profiles/MODE-IMAGE-PAIRS.md`).
     *  Optional: a document saved before this field existed simply has no key, and both
     *  modes then show `image_url`. */
    image_url_dark?: string | null
  }
  products:
    | { source: "popular" }
    | { source: "category"; category_id: string; title: string }
  order: HomeBlock[]
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
 * so saving the form unchanged leaves the storefront looking exactly as it did.
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
    hero: {
      title: "",
      subtitle: "",
      cta_label: "",
      cta_href: "",
      image_url: null,
      image_url_dark: null,
    },
    products: { source: "popular" },
    order: ["hero", "categories", "products"],
  },
}
