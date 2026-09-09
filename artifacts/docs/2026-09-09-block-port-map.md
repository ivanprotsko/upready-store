# Port Map: Composer Block Variants → Storefront React Components

Scout S2 for `t-2026-09-09-02`. Read-only research; the contract JSON is
`artifacts/docs/2026-09-09-composition-contract.json` (schema
`upready.storefront-composition/v1`). Every claim below cites a file:line or a command output;
nothing is from memory.

## 1 · What the composer assembles and from where

The composer (`artifacts/docs/composer/serve.mjs`) is a standalone Node HTTP server. Its
`/data.json` (`serve.mjs:265-268`) is built at REQUEST time by `profilePayload()`
(`serve.mjs:73-121`), reading `apps/backend/src/migration-scripts/data/profiles/<id>/profile.json`,
`theme.json` and `catalog/*.json` straight off disk — not through the Medusa API and not through
`apps/storefront/src/lib/profile/profile.generated.json`. `composePage()`
(`artifacts/docs/composer/lib/page.js:60-67`) concatenates five HTML strings in a fixed order —
header, hero, tiles, listing, footer — each produced by a family's `markup(p)` function in
`lib/blocks.js`/`lib/hero.js`, and wraps them in `storeShell()` (`blocks.js:326-330`), which writes
the mode's CSS custom properties as an inline `style` attribute on a `.store` div. The composer's
"brand" (`sneakers`, `electronics`, `supplements`, `womens-fashion`, `home-goods`) is
`profile.id`; confirmed live via `curl -s http://localhost:8303/data.json` (2026-09-09), which
returns the five ids with product/tile/collection counts matching `serve.mjs` `FRAMES`/`MEDIA`
tables.

The storefront has no equivalent runtime composer. `apps/storefront/src/lib/profile/index.ts:1-9`
imports `profile.generated.json` as a plain ES module — "not a fetch: nothing on a listing page
may reach the backend or the request context to decide how the page looks, or the page stops being
statically renderable" (comment, same file). Porting any variant means either accepting that
constraint (build-time profile data, as today) or introducing a new runtime read for the slot that
needs live catalog data (hero G/H/L, header H5/H6's category counts) — see §7 fork.

## 2 · Site-wide vs. home-page scope

Confirmed by `apps/storefront/src/app/[locale]/(main)/layout.tsx:26,29`: `<Nav/>` and `<Footer/>`
render once in the `(main)` route-group layout, wrapping every page under it — cart, checkout,
account, product, category, static pages, not just `/`. `header` and `footer` in the contract are
therefore SITE-WIDE settings, matching the task's framing. `hero`, `tiles` and `listing` render
only inside `apps/storefront/src/app/[locale]/(main)/page.tsx:35-57`, the home route.

## 3 · Header family (H1–H6) — site-wide

All six read the same utility data Nav reads today: `listRegions()`, `getCountryCode()`
(`nav/index.tsx:18-21`), plus category data for H2/H5/H6. None call the cart or account APIs
beyond what `CartButton`/the account link already do.

| Key | Label | Markup shows | Data & storefront source | Target component (props) | CSS approach | Asset gap | Est. lines | Risk |
|---|---|---|---|---|---|---|---|---|
| h1 | H1 · Как сейчас | Burger left, wordmark centre, search·region·account·cart right | none beyond today's Nav data | **Already `nav/index.tsx:16-69`** — no change | existing Tailwind + `@medusajs/ui` classes | none | 0 (baseline) | none |
| h2 | H2 · Слева, меню в строку | Wordmark left, up to 4 category links + "All products" centred, utilities right | first 4 top-level categories: `listCategories()` (`lib/data/categories.ts:5`) filtered `!parent_category_id`, same filter `footer/index.tsx:12-14` already uses | new `nav/variants/h2.tsx`, server component, no props (fetches like Nav) | flex row, `justify-center` on nav, reuse `text-ui-fg-subtle`/`hover:text-ui-fg-base` token classes | none | ~90 | medium — >4 categories (electronics, womens-fashion both have 5 tiles) need a truncation rule the composer never had to solve (it hard-slices at 4, `blocks.js:33`) |
| h3 | H3 · Два яруса | Service tier (promo text + "US · EN · USD · Account") over main tier (wordmark left, nav centred, search+cart) | `promoText(locale)` (`lib/profile/index.ts:20-23`), region/account text | new `nav/variants/h3.tsx` | two stacked flex rows, service tier `bg-ui-bg-subtle` analogue of composer's `--muted` | none | ~110 | **high** — the service tier repeats promo copy that `PromoBanner` (`layout/components/promo-banner/index.tsx`) already renders site-wide one element above Nav (`(main)/layout.tsx:23-24`); shipping H3 as-is doubles the promo strip unless PromoBanner is suppressed when header=h3 |
| h4 | H4 · Акцентная | Header painted in brand accent, wordmark left, nav centred, utilities in contrast ink | same as H2 | new `nav/variants/h4.tsx` | reuse the `.bg-ui-button-inverted` bridge already used by K (`globals.css:260-262`) plus `text-ui-contrast-fg-primary` | none | ~90 | medium — **forbidden with hero=k** (contract `validity[0]`); sticky-scroll behaviour on a coloured header is undesigned |
| h5 | H5 · Тонкая + полоса категорий | 52px bar (wordmark, search, cart only) + a scrollable chip row "All N / each category N" | product COUNT per top-level category — `countIn(p, handle)` in the composer is a client-side filter over the whole in-memory catalog (`blocks.js:12`); the storefront has **no loader that returns category product counts** today | new `nav/variants/h5.tsx` + a new count loader (extend `listCategories` query or a dedicated aggregate) | horizontal `overflow-x-auto` pill row, `rounded-full` chips, `border-ui-border-base` | none | ~130 (incl. loader) | medium — new data dependency; horizontal-scroll chip row is a new interaction pattern for this storefront |
| h6 | H6 · Центр + полоса категорий | Same chip row as H5, but the 52/64px bar keeps the wordmark centred (icons-only sides) | same category-count gap as H5 | new `nav/variants/h6.tsx` | as H5; centred bar layout | none | ~130 | medium, plus this variant was authored directly in the composer 2026-09-09 (`blocks.js:153-158`), never isolated on `:8302` — no prior lab acceptance to port against |

## 4 · Hero family (none, G, H, J, K, L, M, GA, GB) — home page only

Today's home hero is `apps/storefront/src/modules/home/components/profile-hero/index.tsx`, a pure
server component reading the single build-time `hero` object from `@lib/profile`
(`profile-hero/index.tsx:1-33`). It already implements three shapes — `FullBleedHero`, `SplitHero`,
`AnnouncementHero` — none of which is driven by live product data.

| Key | Label | Markup shows | Data & storefront source | Target component (props) | CSS approach | Asset gap | Est. lines | Risk |
|---|---|---|---|---|---|---|---|---|
| none | — нет | Nothing | — | `ProfileHero` already returns `null` for a profile with no hero (`profile-hero/index.tsx:22-24`); the composition needs to be able to force this even when `profile.home.hero` is set | — | — | ~5 (a guard in the new switch) | low |
| g | G · Витрина | Split: copy pane (collection eyebrow, product title, subtitle, price+meta, Add-to-bag + "See all X") / product photo | `pickHeadliner()` (`composer/lib/hero.js:6-11`): first product with an image in the bestsellers/foundation collection. Storefront needs `listCollections()` + `listProducts({collection_id, limit:1})` filtered for an image — no existing loader does exactly this | new client-capable component (Add-to-bag needs a cart mutation) | layout resembles today's `SplitHero` (`profile-hero/index.tsx:167-208`) but the content is a live PRODUCT, not the profile's fixed headline/subheadline | none structurally; needs a bestsellers/foundation collection per profile (all five have one, confirmed `data.json` `collections` field) | ~140 | **high** — introduces cart-mutation interactivity into what is today a static server component; needs price formatting (`getProductPrice`, used in `product-preview/index.tsx:31-34`) |
| h | H · Полка | 3-product shelf (images) + flat panel (badge=promo clause, collection title, tagline, "from $X", "Shop {collection}" link) | `pickShelf()` (`hero.js:12-17`): 3 products with images in the lead collection | new component, server-renderable (CTA is a link to `/collections/<handle>`, no cart mutation) | grid `1.15fr .85fr`, panel `bg-ui-bg-subtle`-equivalent; min-price across 3 variants | needs ≥3 images in the lead collection — true for all five profiles per `data.json` counts | ~120 | medium — min-price calc across 3 products, otherwise self-contained |
| j | J · Три двери | 3 large category tiles with item counts | `categoryTiles` (`@lib/profile`) + the same count gap as header H5/H6 | new component, mirrors `CategoryTiles` markup at hero scale | reuse `category-tiles.module.css` patterns | none | ~90 | low to build, but **explicitly rejected in every theme** (`2026-09-09-theme-compositions.md:165-166`: "duplicates the tile row… empties the first screen of product"); low priority unless overridden |
| k | K · Объявление | Flat accent band, eyebrow=brand, headline+subheadline, CTA | `hero.headline/subheadline/cta` from `@lib/profile` | **Already `AnnouncementHero`, `profile-hero/index.tsx:138-165`** — no change | `bg-ui-button-inverted` bridge (`globals.css:260-262`) | none | 0 (baseline) | low; **forbidden with header=h4** |
| l | L · В движении | Full-bleed photo, bottom-left card with product title/subtitle/price/Add-to-bag; profiles with neither a person nor a room frame get an honest "no such frame" panel instead | `frames.person[0] ?? frames.room[0]` — **this table does not exist in the storefront's profile schema at all**. It is hardcoded inside `composer/serve.mjs:43-61` (`FRAMES`), copied from `hero-lab-2/serve.mjs`, and is not part of `apps/backend/.../profile.json` (`theme.json`'s `home.hero` carries one `image` field, not a person/room set — confirmed reading `profiles/sneakers/profile.json:34-46`) | new component + a schema addition (`home.heroFrames.person[]`/`room[]` in `profile.json`, threaded through `build-profile.mjs` into `profile.generated.json`) | photo-plus-floating-card, `box-shadow`, same Add-to-bag interactivity as G | **electronics and supplements have ZERO frames of either kind** (`data.json` `frames.person:[] room:[]` for both) — L is unavailable for those two profiles exactly as it is in the composer | ~150 | **high** — new asset/schema work, cart interactivity, and a real "unavailable" UX state, not just a missing-image fallback |
| m | M · Без hero | Two-line strip (tagline + promo) then a collection-title heading, no image, no CTA | `promoText(locale)`, `listCollections()` filtered `handle==='new-arrivals'` | new small component | plain text block | none | ~40 | low |
| ga | GA · Карусель с соседями | Active slide 84% width with neighbours peeking, arrows+dots, category image + label + count + CTA per slide | category tiles + the count gap (as H5/H6/J); interactive position/resize logic in `moveA()` (`blocks.js:299-313`) is direct DOM manipulation (`translateX`, `clientWidth`), not React state | new **client** component (`useState` for index, `ResizeObserver` or `useLayoutEffect` for slide width) | `overflow:hidden` track, CSS transform transition; composer's exact values (`blocks.css:150-168`) are a reasonable starting point | none beyond tile images, which all profiles have | ~180 | **high** — the most interactive port in the whole corridor; composer's DOM-direct approach (`section.querySelector`) needs a full React re-implementation, not a copy-paste |
| gb | GB · Полосы | Vertical strips, one expanded with copy below, click to switch | same tiles/count data as GA | new client component (click-to-expand state) | `writing-mode: vertical-rl` labels, flex-basis transitions (`blocks.css:169-193`) | none | ~150 | medium-high — CSS-heavy but state is simpler than GA (no position math, just an "active index") |

## 5 · Category tiles (on/off) — home page only

One boolean, already fully implemented: `CategoryTiles`
(`apps/storefront/src/modules/home/components/category-tiles/index.tsx`) reads `categoryTiles`
from `@lib/profile` and self-suppresses when the array is empty (`index.tsx:23-25`). Today
`page.tsx:41` renders it unconditionally whenever the profile has tiles; there is no independent
"off" switch. Wiring the composition's `tiles` field means gating that render call in `page.tsx` on
`composition.tiles === "on"` in addition to the existing data check. Est. ~10 lines. Risk: low.

## 6 · Listing family (none, P1–P5) — home page only

Today's home listing is `FeaturedProducts` → `ProductRail`
(`apps/storefront/src/modules/home/components/featured-products/product-rail/index.tsx:9-64`),
and it does **not** match what the composer's own comment claims. `ProductRail` loops **every**
collection (`listCollections()`, no limit) and renders one `<li>` rail per collection with up to 4
products each (`product-rail/index.tsx:23-38`) — several stacked sections, not one grid. The
composer's P1 (`blocks.js:90-92`, comment "Как storefront рендерит сегодня") is a SINGLE grid of 8
products from the one lead (bestsellers/foundation) collection. These are different shapes; the
contract JSON flags this under `fields.listing.values[1].note`. Card content also differs:
`ProductPreview` (`modules/products/components/product-preview/index.tsx:69-102`) shows title +
price + variant option chips, never a `subtitle` — every composer variant that claims a subtitle
line (P1, P3, P5) needs it added to the card, reading `product.subtitle` (present on
`HttpTypes.StoreProduct`, unused today).

| Key | Label | Markup shows | Data & storefront source | Target component (props) | CSS approach | Asset gap | Est. lines | Risk |
|---|---|---|---|---|---|---|---|---|
| none | — нет | Nothing | — | gate the `<FeaturedProducts/>` call in `page.tsx:51` on `composition.listing !== "none"` | — | — | ~5 | low |
| p1 | P1 · Сетка 4 | One collection heading + "see all", 4-col grid, 8 products, full caption (title, subtitle, price) | lead collection = bestsellers/foundation, 8 products with `subtitle` — a NEW single-collection loader, not `ProductRail`'s all-collections loop | new component (or a materially rewritten `ProductRail`); see the shape mismatch above | Tailwind grid `grid-cols-4`, close to `product-rail`'s existing grid classes (`product-rail/index.tsx:55`) | none | ~80 | medium — mostly a data-shape change, not a visual one |
| p2 | P2 · Плотная 6 | "All N products", 6-col grid, 12 items, minimal caption (title+price only) | all products with an image, first 12 — `listProducts` with a plain limit, no collection filter | new component | `grid-cols-6`, smaller card variant (`.card-p.min`, `blocks.css:60-61`) | none | ~70 | low |
| p3 | P3 · Список | Row list: image, title, subtitle, spec line (variant/colour counts), price, "Add to bag" | lead collection, 6 products; spec line needs variant count + colour-option value count — `product.variants.length` and a colour option filter, same pattern `product-preview/index.tsx:52-56` already computes for chips | new component | flex rows, `border-b` dividers (`blocks.css:67-78`) | none | ~110 | medium — spec-line computation is new but mirrors existing color-chip code |
| p4 | P4 · Стена | 3-column CSS `columns` masonry, 9 products, image + title + price only | all products with an image, first 9 | new component | CSS `columns: 3`, `break-inside: avoid` (`blocks.css:79-86`) — a layout technique not used elsewhere in this storefront | none | ~80 | low-medium — masonry via CSS columns is new but self-contained |
| p5 | P5 · Редакционная | One large lead product (image, title, subtitle, price, Add-to-bag) + 4 small products | lead collection, 5 products, first one becomes the lead | new component; lead card needs Add-to-bag (cart mutation) | CSS grid `2x2` lead span (`blocks.css:87-97`) | none | ~110 | medium-high — the one listing variant that needs cart interactivity |

## 7 · Footer family (none, F1–F6) — site-wide

All read the same data `Footer` reads today: `listCategories()` filtered top-level, `listCollections()`
(`footer/index.tsx:11-15`). F4's newsletter form and F5's fact cards are the only variants needing
new markup beyond that; F5 additionally needs the promo string split into clauses
(`clauses(p)`, `blocks.js:13`, i.e. `p.promo.split(" · ")` — the storefront equivalent is
`promoStrip.text.split(" · ")`, since `promoText()` returns one string).

| Key | Label | Markup shows | Data & storefront source | Target component (props) | CSS approach | Asset gap | Est. lines | Risk |
|---|---|---|---|---|---|---|---|---|
| none | — нет | Nothing | — | gate `<Footer/>` in `(main)/layout.tsx:29` | — | — | ~5 | low |
| f1 | F1 · Четыре колонки | Brand+tagline, categories, collections, info links; legal row (© + "Powered by") | as today | **Already `footer/index.tsx:9-134`** — no change | existing classes | none | 0 (baseline) | none |
| f2 | F2 · Одна строка | Two lines: wordmark + all links inline, then legal row on a muted plane | same category/collection lists, flattened into one row | new `footer/variants/f2.tsx` | `bg-ui-bg-subtle`, `flex-wrap` link row (`blocks.css:121-124`) | none | ~60 | low |
| f3 | F3 · Гигантский wordmark | Link rows above, then the wordmark full-width in the display font, auto-shrunk to fit, legal row below | brand wordmark text (`SITE_NAME` or the profile's own wordmark text) | new `footer/variants/f3.tsx`, **client** (needs the fit-to-width measurement composer does in `afterRender`, `lib/page.js:73-82`, via `getComputedStyle`/`scrollWidth`) | `font-size` in JS after measuring, `overflow:hidden` | none | ~90 | medium — the auto-shrink is a real client effect, not CSS alone; must run after web-font load the way `afterRender` waits on `document.fonts.ready` |
| f4 | F4 · Инверсия с рассылкой | Inverted-colour columns: newsletter form + tagline (left), categories/collections/info (right) | as F1, plus a subscribe form (no existing newsletter endpoint found in `lib/data/`) | new `footer/variants/f4.tsx` | `bg-ui-fg-base`/inverted token pairing, same direction as F6 below | needs a real subscribe action — none exists in this storefront today (flagged, not solved, here) | ~100 | medium-high — the only footer variant requiring new backend/API surface, not just markup |
| f5 | F5 · Условия плитками | 3 fact cards (from promo clauses) above brand+categories+collections columns, legal row | promo clauses (≥2 required — composer's own family filter, `blocks.js:180`), categories, collections | new `footer/variants/f5.tsx` | card grid `grid-cols-3` (`blocks.css:137-142`) | fails gracefully to fewer cards if a profile has <3 clauses (all five have 3, per `promo` field format in `data.json`) | ~90 | low |
| f6 | F6 · Инверсия с гигантским wordmark | Link rows, then inverted-plane giant wordmark, legal row | same as F3 plus inversion | new `footer/variants/f6.tsx`, same auto-shrink client effect as F3 | `bg-ui-fg-base` inversion (`blocks.css:203-209`) | none structurally; **forbidden on `defaultMode: "dark"`** (contract `validity[1]`) — authored directly in the composer 2026-09-09, `blocks.js:271-275`, never isolated on `:8302` | ~90 | medium — same client effect as F3, plus the dark-mode validity rule must be enforced wherever the operator picks it |

## 8 · Per-profile primary defaults (from `versions.json`)

The five "Основная" (primary) saved versions, one per profile — the alternates are in the contract
JSON's `alternates` block for reference:

| Profile | defaultMode | header | hero | tiles | listing | footer | Saved version id |
|---|---|---|---|---|---|---|---|
| sneakers (Kerbstone) | dark | h5 | l | off | p2 | f3 | `v-20260909-kerbstone-drop` |
| electronics (Ferrite) | dark | h3 | k | on | p3 | f5 | `v-20260909-ferrite-instrument` |
| supplements (Scruple) | light | h6 | k | off | p3 | f6 | `v-20260909-scruple-apteka` |
| womens-fashion (Larchant) | light | h6 | g | off | p4 | f6 | `v-20260909-larchant-zhurnal` |
| home-goods (Long Morning) | light | h2 | h | on | p4 | f4 | `v-20260909-long-morning-utrenniy-stol` |

Source: `artifacts/docs/composer/versions.json`, entries whose `note` starts with "Основная." The
`mode` field of each spec matches that profile's own `theme.defaultMode`
(`profiles/<id>/profile.json`), confirmed for sneakers (`profile.json:31`, `"defaultMode": "dark"`).

## 9 · Switch-component wiring: one proposed shape

None of this exists yet; the following is a proposal, not a finding. One switch component per
slot, each a thin server component (client only where the variant itself needs it — G/L/P5 for
Add-to-bag, F3/F6 for the auto-shrink, GA/GB for the carousel) that reads the composition and
dispatches:

```tsx
// modules/layout/templates/nav/index.tsx (becomes the switch)
export default async function Nav() {
  const composition = await getComposition() // new: server-side config read, see §10 below
  switch (composition.header) {
    case "h1": return <NavH1 />
    case "h2": return <NavH2 />
    // …
  }
}
```

Each variant component keeps today's Nav's props shape (none — every current header/footer/hero
component is a zero-prop server component that fetches its own data), so the switch itself needs no
prop-drilling contract beyond the single `composition` object. `hero`/`tiles`/`listing` switches
live in `page.tsx` the same way. This mirrors how `ProfileHero` already dispatches on
`hero.layout` (`profile-hero/index.tsx:21-33`) — the pattern is not new to this codebase, only its
data source changes from a baked profile field to a runtime composition read.

## 10 · Open forks

| Question | Options | Recommendation |
|---|---|---|
| Where does the composition (`defaultMode` + 5 block keys) live at runtime, so it is server-side and shown to ALL visitors rather than per-browser? Nothing in this codebase does that today — `profile.generated.json` is build-time, and mode/theme axes are `localStorage`-only (`lib/theme/apply.ts:15-25`) | (a) a new small JSON/SQLite store on disk, read per-request; (b) a Medusa backend setting (custom API route + module), read via the SDK the way regions are; (c) reuse `profile.generated.json` and require a rebuild+redeploy per change | Out of this scout's scope (S2 = port map only) — flag for whichever scout covers persistence; (a) is cheapest and matches rule 18b (registries are JSON/SQLite), but a JSON file read per-request on every page load needs a cache-invalidation story the settings panel doesn't have yet |
| Must header and footer apply site-wide, or could the composition be scoped to the home route only? | (a) site-wide, matching how Nav/Footer already render in `(main)/layout.tsx`; (b) home-only, leaving other routes on the H1/F1 baseline | (a) — Ivan's order text says "the composition version of EACH home-page block", but header/footer are structurally site-wide components today; splitting them to render differently on `/` vs. everywhere else would be a bigger, uninstructed change than porting the variant itself |
| Must the composer's mobile (390px) layouts be ported alongside desktop? | (a) yes, every new component ships both breakpoints from the start; (b) desktop first, mobile as a follow-up | `2026-09-09-theme-compositions.md:195-198` confirms all 10 primary/alternate desktop picks were also measured at 390px with no layout breaks except the giant wordmark (F3/F6) shrinking to 44px — the mobile CSS already exists in `blocks.css`/`hero.css` as `body[data-width="mobile"]` rules cited throughout §3-§7 above, so porting both together is not materially more work than desktop alone; recommend (a) |
| P1's mismatch with today's `ProductRail` (§6) — fix `ProductRail` to match the composer's single-grid P1, or keep `ProductRail`'s all-collections loop as a distinct, unlabelled shape and add a true P1 alongside it? | (a) treat `ProductRail`'s current shape as an unlabelled 6th listing option kept for compatibility; (b) rename/repurpose `ProductRail` itself into P1 | (b) — the task states "P1 = FeaturedProducts" as the storefront's baseline; reconciling the mismatch by building a real single-collection P1 (as this table's P1 row does) rather than carrying an extra unlabelled shape keeps the contract's five listing values exhaustive |
| `q-composer-cards-from-mock-or-code` (still open per `2026-09-09-theme-compositions.md:222-226`): are upready.dev showcase cards shot from the composer mock now, or only after these components exist in code? | (a) shoot cards from the composer now; (b) wait for the port, then shoot from `landing-shots/shoot.mjs` against real stands | Not this scout's call — surfaced here because it directly gates whether the components in this table are needed before or after Ivan's order point 2 (deploy + clickable cards) |

## 11 · Risk summary

Highest risk, in order: **GA carousel** (full client re-implementation of DOM-direct position math),
**hero L** (new asset schema, zero frames for 2 of 5 profiles, cart interactivity), **hero G / listing
P5** (first cart-mutating hero/listing content in this codebase), **header H3** (promo-strip
duplication unless `PromoBanner` is suppressed), **footer F4** (needs a newsletter endpoint that does
not exist). Lowest risk: H1/K/tiles-on/F1 (already shipped), M, listing P2/P4, footer F2/F5.
