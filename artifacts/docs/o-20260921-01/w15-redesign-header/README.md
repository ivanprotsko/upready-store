# W15 · redesign-olavka: Header, Navigation, Cover, HeroSlider after Figma 227-8180 (t-2026-09-24-n15)

Order o-20260921-01, branch `redesign-olavka` (cut from dev 6b6a0d31, never merged by the worker).
Shop: «Оксана Черкашина» (tenant `cherkashino`, host `olavka-com.localhost`), storefront on :8233 against
Ivan's stand backend :9121 (read-only).

URL: http://olavka-com.localhost:8233/ru (also /ru/store, /ru/account; 390 wide for mobile).

## Status

| Stage | Commit | State |
|---|---|---|
| Groundwork, no mockup yet | 7e2631b1 | h7 header + Cover / Navigation / HeroSlider wired and rendering with real tenant data; layout neutral, to be reshaped after the Figma node |
| Demo clean-up after Ivan's first look | (see git log) | The composed hero k no longer renders under the new blocks (Cover takes its place; tiles and listing stay); the slider is three category slides, the shop's promo is shown once, in the Cover. **The header is visually = h2 until the mockup arrives** — no design was invented for it. |

Figma node `227-8180` of `2zPDDEfMdYM1tbv5xKfnLX` was NOT readable while this was built: the Superset browser
pane hits Figma's login wall and the stored REST token answers 401/403. `figma/` stays empty until a PNG export
or access arrives; the lead asked Ivan for one (poll 19).

## What is where

- `apps/storefront/src/modules/layout/templates/nav/variants/h7.tsx` — the new header variant; `variants/index.ts`
  carries the branch-local `DEMO_HEADER = "h7"` switch that `nav/index.tsx` renders ahead of the saved
  `settings.header` (h2 on this tenant). The composition contract (`HeaderKey`, panel picker, backend enum,
  `composition-contract.json`) is untouched.
- `apps/storefront/src/modules/home/variants/olavka-cover.tsx`, `olavka-navigation.tsx`, `olavka-hero-slider.tsx`
  (+ `olavka-hero-slider-carousel.tsx` client island, `olavka-hero-slider.module.css`), types in `olavka-types.ts`,
  data in `apps/storefront/src/lib/data/olavka-home.ts`. `home/variants/index.ts` `DEMO_HOME_ORDER` renders the three
  above the tenant's own composed blocks from `(main)/page.tsx`.
- HeroSlider data: the tenant document has no `slides` field, so the list is assembled from real data (three top-level
  categories illustrated by one of their own product thumbnails; the tenant's hero is the Cover, not a slide). TODO for the panel:
  a slides editor whose rows map onto `OlavkaHeroSlide`.
- Strings `OlavkaHome.slider.*` exist in `messages/en.json` and `messages/ru.json`; the other 34 catalogs are a
  Locale-stage TODO (`scripts/messages-fill-from-en.mjs`).

## Screenshots

- `groundwork-ru-1440.png`, `groundwork-ru-390.png` — /ru at commit 7e2631b1, top of page (Playwright, Chromium).

## Checks at 7e2631b1

- `npx tsc --noEmit` — clean.
- `npx vitest run src/modules/layout src/lib/tenant src/lib/theme` — 11 files, 106 tests passed.
- `npx next lint --file …` on the 11 touched files — no warnings or errors.
- `npx next build` (into `.next-build`, `NEXT_DIST_DIR`) — exit 0: compiled in 4.3 min on the loaded machine, types and lint
  passed, middleware 39.5 kB. The custom dist dir makes Next rewrite `tsconfig.json`/`next-env.d.ts`; both reverted, not committed.
- Draft PR for diff visibility: https://github.com/ivanprotsko/upready-store/pull/153 (never merged by the worker).

## Token report

See the bottom of this file; updated with every report to the lead.

- 2026-09-24 21:58 WITA — claude-fable-5-1: calls 27 · in 684 · cacheWrite 169k · cacheRead 3.1M · out 46k → $7.47; TOTAL $7.47 API-equivalent
