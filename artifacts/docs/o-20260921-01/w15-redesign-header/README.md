# W15 · redesign-olavka: Header, Navigation, Cover, HeroSlider after Figma 227-8180 (t-2026-09-24-n15)

Order o-20260921-01, branch `redesign-olavka` (cut from dev 6b6a0d31, never merged by the worker).
Shop: «Оксана Черкашина» (tenant `cherkashino`, host `olavka-com.localhost`), storefront on :8233 against
Ivan's stand backend :9121 (read-only).

URL: http://olavka-com.localhost:8233/ru (also /ru/store, /ru/account; 390 wide for mobile).

## Status

| Stage | Commit | State |
|---|---|---|
| Groundwork, no mockup yet | 7e2631b1 | h7 header + Cover / Navigation / HeroSlider wired and rendering with real tenant data; layout neutral, to be reshaped after the Figma node |
| Demo clean-up after Ivan's first look | 589cda70 | The composed hero k no longer renders under the new blocks (Cover takes its place; tiles and listing stay); the slider is three category slides, the shop's promo is shown once, in the Cover. The header was visually = h2 at that point — no design was invented for it. |
| Figma pass | 872f8ad2 | All four components rebuilt after the node: h7 (227:9557 `initial`), Cover (227:9296), Navigation (227:9297), HeroSliders (227:9298); three typefaces of the node loaded through `next/font/google` (`lib/theme/olavka-fonts.ts`); slider = the tenant's course products. Evidence re-shot (`apps/storefront/docs/evidence/t-2026-09-24-n15/`). |

Figma access arrived on 2026-09-25 (new token, read through the REST API; never printed or committed).
`figma/` holds the node's own PNG exports (scale 2) of the four master components, the reference the
components were built against: `227-9557-header-set@2x.png`, `227-9296-cover@2x.png`,
`227-9297-navigation@2x.png`, `227-9298-hero-sliders@2x.png`.

## Node → code (what was taken from Figma, what had no data)

- Header 227:9557 has two variants, `initial` (built) and `scrolled` (24px wordmark inside a pill — not built,
  Ivan's states come later). Leading: burger disc → `SideMenu`; country + currency pills → `RegionSelect
  variant="pills"` (language stays a tab in the same dialog; the node shows no language control). Main:
  wordmark Ruslan Display 32px → `SiteLogo` (the tenant's `shop_name_short` or name — the shop puts «Олавка»
  into the panel, nothing is hard-coded). Trailing: heart disc NOT built (no wishlist exists); account disc;
  «Корзина» pill → `CartDropdown variant="pill"`; chat disc → `/contact`. Search and the light/dark toggle are
  not on the node and left the bar (search is the first pill of Navigation; the toggle lives in the bottom nav).
- Cover 227:9296: PT Serif Italic 32px / 44.8, first line bold. Line 1 = shop name; line 2 = the tenant home
  document's `hero.title` standing in for the node's tagline (no `tagline` field in the document yet — TODO
  panel).
- Navigation 227:9297: search pill + tinted pills, the node's own fill/ink/shadow triplets keyed by category
  slug (`olavka-navigation.tsx` `TINTS`), alphabetical order as drawn. The node's «Курсы» pill has no route
  behind it (no courses listing page) — not drawn, open question.
- HeroSliders 227:9298: banner 800×320, neighbours 280, radius 48, 3px white inner border, 48px arrows, 8px
  dots; labels «BannerLabel» (Roboto Flex uppercase; L = title bottom-left, m = tag top-right / button
  bottom-right / kicker top-left). Slides = the tenant's course products (`metadata.digital`, cover from
  `metadata.cover.src`), 2 on the stand. The date kicker has no data field — not drawn until the panel has one.
- No mobile/tablet frame in the file: 768 and 390 are adaptations (stated in the evidence report).

## What is where

- `apps/storefront/src/modules/layout/templates/nav/variants/h7.tsx` (+ `h7.module.css`) — the new header variant; `variants/index.ts`
  carries the branch-local `DEMO_HEADER = "h7"` switch that `nav/index.tsx` renders ahead of the saved
  `settings.header` (h2 on this tenant). The composition contract (`HeaderKey`, panel picker, backend enum,
  `composition-contract.json`) is untouched.
- `apps/storefront/src/modules/home/variants/olavka-cover.tsx`, `olavka-navigation.tsx`, `olavka-hero-slider.tsx`
  (+ `olavka-hero-slider-carousel.tsx` client island, `olavka-hero-slider.module.css`), types in `olavka-types.ts`,
  data in `apps/storefront/src/lib/data/olavka-home.ts`. `home/variants/index.ts` `DEMO_HOME_ORDER` renders the three
  above the tenant's own composed blocks from `(main)/page.tsx`.
- HeroSlider data: the tenant document has no `slides` field, so the list is the tenant's course products (real
  data); a slides editor in the panel is the TODO on `OlavkaHeroSlide`.
- Small reusable additions, default behaviour unchanged: `RegionSelect variant="pills"`, `CartDropdown`/`CartButton`
  `variant="pill"`, `SideMenu buttonClassName`; `app/layout.tsx` adds the Olavka font variables (branch-local). TODO for the panel:
  a slides editor whose rows map onto `OlavkaHeroSlide`.
- Strings `OlavkaHome.slider.*` exist in `messages/en.json` and `messages/ru.json`; the other 34 catalogs are a
  Locale-stage TODO (`scripts/messages-fill-from-en.mjs`).

## Screenshots

- `groundwork-ru-1440.png`, `groundwork-ru-390.png` — /ru at commit 7e2631b1, top of page (Playwright, Chromium).

## Checks at 872f8ad2 (Figma pass)

- `npx tsc --noEmit` — clean; `npx next lint --file …` on the 13 touched files — clean.
- `npx vitest run src/modules/layout src/lib/tenant src/lib/theme` — 11 files, 106 tests passed.
- `npx next build` (NEXT_DIST_DIR=.next-build) — exit 0 (fonts self-hosted through next/font at build time).
- Evidence (rule 27f): `apps/storefront/docs/evidence/t-2026-09-24-n15/`, 46 PNG re-shot from the live :8233 render at 872f8ad2.

## Checks at 7e2631b1 (groundwork)

- `npx tsc --noEmit` — clean.
- `npx vitest run src/modules/layout src/lib/tenant src/lib/theme` — 11 files, 106 tests passed.
- `npx next lint --file …` on the 11 touched files — no warnings or errors.
- `npx next build` (into `.next-build`, `NEXT_DIST_DIR`) — exit 0: compiled in 4.3 min on the loaded machine, types and lint
  passed, middleware 39.5 kB. The custom dist dir makes Next rewrite `tsconfig.json`/`next-env.d.ts`; both reverted, not committed.
- Draft PR for diff visibility: https://github.com/ivanprotsko/upready-store/pull/153 (never merged by the worker).

## Token report

See the bottom of this file; updated with every report to the lead.

- 2026-09-24 21:58 WITA — claude-fable-5-1: calls 27 · in 684 · cacheWrite 169k · cacheRead 3.1M · out 46k → $7.47; TOTAL $7.47 API-equivalent
