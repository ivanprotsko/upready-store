# S1c — storefront profile blocks · report

Date 2026-09-07 · stage S1c of the `store-profiles` pilot · worktree
`/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles`, branch `feat/store-profiles`.
Design document: `artifacts/docs/2026-09-07-profile-home-mockup.md` (18 labelled frames, written
before any code).

Every number below was copied from the output of a command run in this session. The commands
themselves are quoted so they can be re-run.

## Files

### Created

| File | What it is |
|---|---|
| `apps/storefront/scripts/build-profile.mjs` | Bakes `<profiles>/<id>/profile.json` + `i18n/*.json` into `src/lib/profile/profile.generated.json`, then hands over to the theme build. Missing profile directory ⇒ profile `default`. |
| `apps/storefront/src/lib/profile/types.ts` | The generated shape. Every profile-driven section is nullable, so an absent section is a type-level fact. |
| `apps/storefront/src/lib/profile/index.ts` | Imports the generated JSON; exports `profile`, `hero`, `categoryTiles`, `promoStrip`, `imageTreatment`, and `promoText(locale)` with the English fallback. |
| `apps/storefront/src/lib/profile/image-treatment.ts` | `layout.imageTreatment` → `data-*` attributes and CSS custom properties. Exports `imageTreatmentAttributes()` for whoever writes the pre-paint script. |
| `apps/storefront/src/lib/profile/image-frame.tsx` | The `ImageFrame` component: aspect / fit / radius / hover, `next/image` with `fill`. |
| `apps/storefront/src/lib/profile/image-frame.module.css` | Local classes for the frame: the hover and reduced-motion branches. |
| `apps/storefront/src/lib/profile/image-frame.globals.css` | Plain stylesheet mapping the `<html>` `data-image-*` attributes onto the custom properties the frame reads. Split out of the module because a `*.module.css` compiles in PURE mode — see "Two things I fixed" below. |
| `apps/storefront/src/lib/profile/profile.generated.json` | Build output, committed so `tsc --noEmit` works on a fresh checkout before `prebuild` has run. |
| `apps/storefront/src/modules/home/components/profile-hero/index.tsx` | The hero, both `full-bleed` and `split`, `next/image` `priority`, CTA as a locale-aware `Link`. |
| `apps/storefront/src/modules/home/components/category-tiles/index.tsx` | The tile grid; column rule 4⇒4, 3/5/6⇒3, <1024px⇒2. |
| `apps/storefront/src/modules/home/components/category-tiles/category-tiles.module.css` | Tile hover: image `scale(1.04)`, border `--border`→`--ring`, arrow fade. Fine pointer only; dropped under `prefers-reduced-motion`. |
| `apps/storefront/tests/profile/playwright.config.ts` | Profile suite config, `testMatch: **/*.pw.ts`, baseURL `http://host.docker.internal:8033`. |
| `apps/storefront/tests/profile/{hero,category-tiles,image-treatment,promo-strip,html-attributes}.pw.ts` | 5 spec files, 14 tests. |
| `apps/storefront/tests/profile/unit/build-profile.test.mjs` | 19 vitest tests for `build-profile.mjs`. |
| `apps/storefront/tests/profile/fixtures/profiles/testshop/**` | The fixture profile: `profile.json`, `theme.json`, `i18n/de.json` (promo override), `i18n/fr.json` (locale file with **no** override, to prove the fallback). |
| `artifacts/docs/2026-09-07-profile-home-mockup.md` | The design document. |

### Changed

| File | Change |
|---|---|
| `apps/storefront/src/app/[locale]/(main)/page.tsx` | Composes `ProfileHero` → `CategoryTiles` → the existing product rail. The old `modules/home/components/hero` is untouched. |
| `apps/storefront/src/modules/layout/components/promo-banner/index.tsx` | Text from `home.promoStrip` with the per-locale override; `enabled: false` removes the strip; falls back to the starter `messages/*.json` copy when the profile carries no strip. |
| `apps/storefront/src/modules/products/components/thumbnail/index.tsx` | When the profile declares `layout.imageTreatment`, the card image renders through `ImageFrame`. With no treatment the existing markup is untouched, so the `default` profile is pixel-identical. |
| `apps/storefront/src/lib/util/env.ts` | `SITE_NAME` falls back to `profile.brand?.name` when `NEXT_PUBLIC_SITE_NAME` is unset. **This file is outside the zone I was given** — the fallback was an explicit requirement and there is nowhere else it can live; three lines, flagged here rather than done silently. |

## Decisions that differ from the brief, and why

1. **The promo strip is not composed into `page.tsx`.** It is already rendered by
   `app/[locale]/(main)/layout.tsx` (line 24), i.e. above the nav on every page. Adding a second
   copy to the home page would show the same strip twice. The profile therefore changes what the
   strip says, not where it lives. `(main)/layout.tsx` is untouched.
2. **The per-locale promo override lives in the profile directory's `i18n/<locale>.json`, not in
   `profile.json`.** `specs/store-profiles/store-profile.schema.json` seals the root
   (`additionalProperties: false`) and has no `i18n` property, so an `i18n` key inside `profile.json`
   would fail schema validation. `build-profile.mjs` reads `i18n/<locale>.json` and picks up
   `home.promoStrip.text`; a locale file without that path contributes nothing and falls back to
   English. **If the schema was meant to carry the override inline, the schema needs a new property
   and this reader needs one line changed.**
3. **`CategoryTiles` takes its heading as a prop** instead of calling `next-intl`, so nothing in the
   component reaches the request context. `page.tsx` passes the already-translated
   `CategoryMenu.title`, which exists in all 36 locale files (checked `de`/`ru`/`ja`:
   `"Kategorien"` / `"Категории"` / `"カテゴリー"`). No new message key was added, so
   `messages/*.json` is untouched.
4. **Playwright specs are named `*.pw.ts`, not `*.spec.ts`.** `test:unit` runs vitest with its
   default include (`**/*.{test,spec}.*`) and would otherwise try to collect the browser specs.
5. **`ImageFrame` is applied to the listing thumbnail only, not to the PDP gallery.**
   `modules/products/components/image-gallery/` is outside my file zone. See "Not verified" below
   for the exact edit that is left.

## package.json script entries the orchestrator must add

To `apps/storefront/package.json`:

```json
"profile:build": "node scripts/build-profile.mjs",
"predev": "node scripts/build-profile.mjs",
"prebuild": "node scripts/build-profile.mjs",
"test:profile": "docker run --rm --add-host=host.docker.internal:host-gateway -v \"$PWD/../..\":/work -w /work/apps/storefront -e PROFILE_URL mcr.microsoft.com/playwright:v1.63.0-noble npx playwright test --config tests/profile/playwright.config.ts"
```

**`predev`/`prebuild` are not enough on their own — measured, not assumed.** A probe package with
`prefoo`/`foo` in `/…/scratchpad/prepost`:

```
--- pnpm 8.12.0 (the pnpm on PATH) ---     > echo FOO-RAN      FOO-RAN
--- pnpm 10.11.1 (packageManager pin) ---  > echo PRE-RAN      PRE-RAN
                                           > echo FOO-RAN      FOO-RAN
--- npm for contrast ---                   > echo PRE-RAN      PRE-RAN
                                           > echo FOO-RAN      FOO-RAN
```

pnpm 8.12.0 skips `pre` scripts; pnpm 10.11.1 (this repo's `packageManager` pin) runs them. So on a
machine whose `pnpm` is 8.x the profile would silently never be built. Add to the **repo-root
`.npmrc`** (outside my zone) next to `auto-install-peers=true`:

```
enable-pre-post-scripts=true
```

Alternatively, inline the call — `"build": "node scripts/build-profile.mjs && next build"` — and drop
the `pre*` entries; do one or the other, not both, or the script runs twice under pnpm 10.

## `data-*` attributes for the pre-paint allow-list

Set on `<html>`. `src/lib/profile/image-frame.module.css` already consumes them; the mapping is
also exported from `src/lib/profile/image-treatment.ts` as `imageTreatmentAttributes()`.

| Attribute | Allowed values | CSS custom property it sets | Value |
|---|---|---|---|
| `data-image-aspect` | `1-1`, `4-5`, `3-4` | `--image-aspect` | `1 / 1`, `4 / 5`, `3 / 4` |
| `data-image-fit` | `cover`, `contain` | `--image-fit` | `cover`, `contain` |
| `data-image-radius` | `none`, `md`, `lg` | `--image-radius` | `0px`, `0.5rem`, `0.75rem` |
| `data-image-hover` | `none`, `second-image`, `zoom` | `--image-hover-scale` | `1`, `1`, `1.04` |

Values are hyphenated (`4-5`, not `4:5`) so they are safe unquoted in a selector. Each property has a
second fallback baked inline from `profile.generated.json`, so the treatment works today, before the
pre-paint script exists — that is what the green `image-treatment.pw.ts` run measures.

## Static render — the grep, verbatim

```
### 1. cookies()/headers() in the S1c files
$ grep -rn 'cookies\s*(\|headers\s*(\|next/headers' lib/profile \
    modules/home/components/profile-hero modules/home/components/category-tiles \
    modules/products/components/thumbnail 'app/[locale]/(main)/page.tsx'
  (no match — 0 hits)

### 2. cookies()/headers() across the whole card render path
$ grep -rn 'next/headers\|cookies()\|headers()' \
    modules/products/components/product-preview modules/products/components/thumbnail \
    modules/home/components/featured-products lib/profile
  (no match — 0 hits)
```

**But the path is not statically renderable today, and that pre-dates S1c.** The same grep widened to
request-scoped helpers:

```
### 3. request-scoped calls the path pulls in transitively
modules/products/components/product-preview/index.tsx:8:import { getLocale } from "next-intl/server"
modules/products/components/product-preview/index.tsx:30:  const locale = await getLocale()
modules/home/components/featured-products/index.tsx:2:import { getCountryCode } from "@lib/data/cookies"
modules/home/components/featured-products/index.tsx:10:  const countryCode = await getCountryCode()
modules/home/components/featured-products/product-rail/index.tsx:7:import { getTranslations } from "next-intl/server"
modules/home/components/featured-products/product-rail/index.tsx:14:  const t = await getTranslations()

### where those bottom out
lib/data/cookies.ts:2:import { cookies as nextCookies } from "next/headers"
i18n/request.ts:3:import { cookies } from "next/headers"
i18n/request.ts:15:    const cookieStore = await cookies()
```

`i18n/routing.ts` sets `localePrefix: { mode: "never" }`, so `requestLocale` is empty for an
unprefixed URL and `i18n/request.ts` falls through to the `_medusa_locale` cookie. Any component
calling `getLocale`/`getTranslations` therefore opts the route out of static rendering. `ProductPreview`
does, and so does the root layout. **None of this is new in S1c and none of it is in my file zone** —
what S1c adds (`ProfileHero`, `CategoryTiles`, `ImageFrame`, `Thumbnail`, `lib/profile`) reads only
the baked JSON and adds no request-scoped call: that is what greps 1 and 2 measure. Making the
listing genuinely static is a separate change to `i18n/request.ts` and `product-preview`.

## Tests

### Unit — `pnpm --filter @dtc/gorgo-medusa-storefront test:unit`

```
 Test Files  3 passed (3)
      Tests  43 passed (43)          rc=[0]
```

3 files because the theme agent's suite now runs alongside mine. S1c's own file, run alone with
`pnpm exec vitest run tests/profile/unit/build-profile.test.mjs`:

```
 Test Files  1 passed (1)
      Tests  19 passed (19)          rc=[0]
```

Reverse runs — each breaks what a test guards, then restores. After every restore, `diff` against a
pristine copy printed `identical`.

| # | What was broken | RED | GREEN after restore |
|---|---|---|---|
| A | `if (!existsSync(profilePath))` → `if (false && …)`: the missing-profile fallback | `rc=[1]` · `Tests 1 failed \| 18 passed (19)` | `rc=[0]` · `Tests 19 passed (19)` |
| B | `tiles.map(…)` → `tiles.slice(0, 1).map(…)` | `rc=[1]` · `Tests 2 failed \| 17 passed (19)` | `rc=[0]` · `Tests 19 passed (19)` |
| C | `readLocaleOverrides` returns `{}` unconditionally | `rc=[1]` · `Tests 2 failed \| 17 passed (19)` | `rc=[0]` · `Tests 19 passed (19)` |

### Browser — Playwright 1.63.0 in Docker, against the fixture profile on port 8033

```
$ docker run --rm --add-host=host.docker.internal:host-gateway \
    -v "<worktree>":/work -w /work/apps/storefront \
    mcr.microsoft.com/playwright:v1.63.0-noble \
    npx playwright test --config tests/profile/playwright.config.ts
  1 skipped
  13 passed (1.3m)      rc=[0]
```

14 tests in 5 spec files; the one skip is `html-attributes.pw.ts` (see below). The storefront under
test was built with
`NEXT_PUBLIC_STORE_PROFILE=testshop STORE_PROFILES_DIR=tests/profile/fixtures/profiles node scripts/build-profile.mjs`
→ `profile "testshop" (source: backend) · hero: full-bleed · tiles: 4 · aspect: 3:4`, then served by
`NEXT_DIST_DIR=.next-profile next dev -p 8033`. Counted in the response body with `grep -o … | wc -l`:

```
data-testid="category-tile"      4
data-category-handle=            apparel, recovery-slides, road, trail-runners
data-hero-layout=                "full-bleed"
data-image-aspect=               4 x "3:4"
promo text                       Free shipping over $120 · 30-day returns
data-promo-source=               "profile"
```

Reverse runs, one per spec file:

| # | What was broken | RED | GREEN after restore |
|---|---|---|---|
| D | hero headline hardcoded instead of `{hero.headline}` | `rc=[1]` · `1 failed / 3 passed` | `rc=[0]` · `4 passed (10.9s)` |
| E | `categoryTiles.map` → `categoryTiles.slice(0, 2).map` | `rc=[1]` · `2 failed / 2 passed` | `rc=[0]` · `4 passed (12.4s)` |
| F | `ASPECT_RATIO["3:4"]` → `"1 / 1"`, leaving the attribute correct | `rc=[1]` · `1 failed / 2 passed` | `rc=[0]` · `3 passed (5.3s)` |
| G | `{profileMessage ?? t("message")}` → `{t("message")}` | `rc=[1]` · `2 failed` | `rc=[0]` · `2 passed (14.7s)` |

Run F is the one worth reading twice: breaking only the *ratio* left `data-image-aspect` correct, so
the attribute test stayed green while the computed-shape test went red. That is the evidence that the
second assertion earns its keep — an attribute no CSS consumes would have passed the first one.

One assertion was written wrong and corrected against reality rather than kept: `priority` does not
put `fetchpriority="high"` on the `<img>` in dev (measured — the attribute appears only on a
`rel="preload" as="script"` link). It now asserts the effect that is actually observable: the hero
image carries no `loading="lazy"` while 8 images below it do.

The skipped test is `html-attributes.pw.ts`, which asserts the `data-image-*` attributes on `<html>`.
S1b's pre-paint script sets those. It is `test.skip` with the reason written into the file rather than
deleted, so unskipping it at S7 is a one-line change.

## Machine checks

| Check | Result |
|---|---|
| `NEXT_DIST_DIR=.next-profile pnpm --filter @dtc/gorgo-medusa-storefront lint` | `rc=[0]` · `✔ No ESLint warnings or errors` |
| `pnpm --filter @dtc/gorgo-medusa-storefront exec tsc --noEmit` (before any `next build` existed) | `rc=[0]`, no output — 0 errors |
| `pnpm --filter @dtc/gorgo-medusa-storefront exec tsc --noEmit` (after a build generated `.next-profile/types`) | `rc=[1]` · **1 error, in a pre-existing file S1c never touched** — see below |
| `NEXT_DIST_DIR=.next-profile pnpm --filter @dtc/gorgo-medusa-storefront build` | `rc=[1]` · `✓ Compiled successfully in 29.2s`, then the same one type error |

### The one failure, and why it is not S1c's

```
src/app/[locale]/(main)/collections/[handle]/page.tsx
Type error: Page "src/app/[locale]/(main)/collections/[handle]/page.tsx" does not match the
required types of a Next.js Page.  "PRODUCT_LIMIT" is not a valid Page export field.
```

Measured, not assumed:

* the file is unmodified — `git status --short` on it prints nothing, and its last commit is
  `20610a9 2026-08-31 feat: add translated meta descriptions and structured data`;
* `apps/storefront/package.json` is unmodified and the `pnpm-lock.yaml` diff on this branch contains
  no `next` version line, so Next is the same 15.5.21 as on `dev`;
* **the export is dead code.** `export const PRODUCT_LIMIT = 12` also exists at
  `src/modules/store/templates/paginated-products.tsx:8`, and every consumer
  (`skeleton-product-grid`, `collections/templates`, `categories/templates`) imports it from *there*.
  Nothing imports it from the page.

**Fix, one line, zero behavioural change: delete line 25 of
`src/app/[locale]/(main)/collections/[handle]/page.tsx`.** I did not make it — that file is outside
the zone I was given. It blocks `next build` and `tsc` for every agent on this worktree, so it wants
doing before S7.

Note the ordering trap this exposes: `tsc --noEmit` only sees the error once a build has generated
`.next*/types/**`, which `tsconfig.json`'s `include` covers. A clean checkout types-checks green and
then fails at build time.

## Two things I fixed that were mine but arrived broken

1. `src/lib/profile/image-frame.module.css` originally carried the `html[data-image-*]` rules as
   `:global(...)` selectors. Turbopack dev accepted that; `next build` does not — css-loader compiles
   a `*.module.css` in PURE mode, where a top-level rule with no local class fails with
   "Selector … is not pure". Another agent split the global half out into
   `image-frame.globals.css`, which was the right diagnosis, but kept the `:global()` wrapper — and a
   plain stylesheet has no CSS-modules compiler, so Turbopack rejected it outright
   (`'global' is not recognized as a valid pseudo-class`) and every route returned 500. I removed the
   wrappers: a plain stylesheet is already global. `GET /en -> 200`, `GET /en/store -> 200` after,
   and `next build` reports `✓ Compiled successfully`.
2. `apps/storefront/next-env.d.ts` kept being rewritten to point at `.next-profile/types/routes.d.ts`
   — Next regenerates it on every `dev` and `build`, so it flipped back once after I first restored
   it. Restored again with `git checkout --` after my server on 8033 was stopped; `git status` on it
   is clean as of the end of this session. **It will flip again**: the theme agent's server on 8031
   and the main checkout's on 8027 write the same file. Check it immediately before committing.

## What I could NOT verify

1. **The real `sneakers` profile.** It does not exist yet —
   `apps/backend/src/migration-scripts/data/profiles/` is still absent, so `build-profile.mjs` warns
   and falls back to `default`, which is itself one of the behaviours under test. Every browser
   assertion above ran against the `testshop` fixture. What only gets its true run at S7: the real
   headline and tile count, the real media URLs through `STORE_MEDIA_BASE_URL`, the real aspect, and
   the German promo override against a real `i18n/de.json`.
2. **`STORE_MEDIA_BASE_URL` end to end.** The fixture run left it unset, so media resolved to
   `/media/…` on the storefront's own origin and the images 404 (the DOM assertions do not depend on
   the bytes). The join is unit-tested in both directions, but no run has fetched a real image from
   the backend's media host, and `next.config.js` `remotePatterns` currently allows only
   `http://localhost` plus the S3 hosts — another media host needs a row added there.
3. **The `<html>` `data-image-*` attributes.** Asserted only by the skipped spec. The CSS that
   consumes them is in place and shipped; nothing sets them yet.
4. **The PDP gallery.** `ImageFrame` is wired into the listing thumbnail only.
   `src/modules/products/components/image-gallery/` is outside my zone; it needs the same swap under
   an `if (imageTreatment)` guard.
5. **Human-eyes acceptance (rule 27d).** The seven criteria at the end of the mock-up are not closed
   by anything above. Nobody has looked at the rendered page — and the fixture's images are 404s, so
   the hero and the tiles were never seen with real art.
6. **`apps/storefront/tsconfig.json`** has two writers: its `include` gained both
   `.next-theme/types/**` and `.next-profile/types/**` from the two dev servers. I left it alone
   rather than clobber the theme agent's line — the orchestrator should reconcile it, and neither
   scratch dist dir belongs in a commit.

## Verified since the first draft of this report

* **The theme build hand-off works.** `scripts/build-themes.mjs` landed while I was testing, and
  `node scripts/build-profile.mjs` now prints, in one run:
  ```
  [build-profile] profile "default" (source: default) -> src/lib/profile/profile.generated.json · hero: none · tiles: 0 · aspect: none
  31 keys, 0 missing (2 presets x 2 modes)
  wrote …/src/styles/themes.css (347 lines)
  wrote …/src/lib/theme/presets.generated.ts
  wrote …/src/lib/theme/fonts.generated.ts (no profile fonts; typography unchanged)
  rc=[0]
  ```
  It took the `node scripts/build-themes.mjs` branch because `themes:build` is still not in
  `package.json` — so both branches of the graceful degradation are now exercised: the skip branch
  (printed earlier, when neither existed) and the file branch. The `pnpm run themes:build` branch has
  still never run.
