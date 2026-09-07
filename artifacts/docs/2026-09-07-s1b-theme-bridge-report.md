# S1b — theme bridge, presets, pre-paint and fonts (T0h.1–T0h.5)

Worktree `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles`, branch
`feat/store-profiles`, storefront on `:8031` with `NEXT_DIST_DIR=.next-theme`, pilot backend
on `:9023`. Every number below was copied out of a command's output; the command that
produced it is named next to it.

## Headline

| | |
|---|---|
| preset variables covered | **113** (the brief said 88 — see below) |
| bridge rows | **26 mapped / 59 diverged / 28 open** |
| canon tokens per preset per mode | **31 keys, 0 missing** (2 presets × 2 modes) |
| geist-kit commit vendored | **`b0e687b`** |
| `themes:build` determinism | byte-identical on a second run (`diff` exit 0) |
| four-page pixel delta, bridge vs vendor | **0 / 469 / 621 / 0 px** — max **0.0606 %**, budget 0.1 % |
| run-to-run noise floor (control vs control) | **0 px on all four pages** |
| unit tests | **43 passed**, of which **24** are mine |
| reverse runs | **13 / 13** RED when broken, GREEN when restored |
| `tsc --noEmit` | **0 errors** |
| `next lint` | **clean** |
| `next build` | **exit 0** |

## The recount: 113, not 88

The brief's 88 is the colour half of the preset. Read out of the installed
`@medusajs/ui-preset@2.19.0` by running its own Tailwind plugin with a stub API
(`apps/storefront/scripts/extract-theme-sources.mjs`) and counting what it passes to
`addBase`:

```
tag 30, bg 20, button 12, contrast 9, fg 9, border 8            = 88  (colors.light/.dark)
elevation 7, buttons 6, borders 6, details 4, alpha 2           = 25  (effects.light/.dark)
                                                          total = 113
```

`:root` and the dark block carry the identical key set (113 each, verified by set
comparison). `apps/storefront/tailwind.config.js` sets `darkMode: "class"`, so the plugin
emits `.dark { … }` rather than a `prefers-color-scheme` block; both branches spread the
same `colors.dark`/`effects.dark` objects, and re-running the extractor against the
`"class"` branch produced identical counts. All 113 are covered — the build script throws
on a variable with no row, so the preset cannot gain one silently.

## T0h.1 — `specs/design-system/token-map.json`

One row per variable: `canonToken`, `status`, `bridge`, the `vendor` value, the
`effective` value, and for diverged rows the solved derivation plus `medusaResidual`.

**mapped (26)** — the canon token's value already equals what the storefront renders, in
both modes, so the bridge is a plain `var(--canon)` and the row is pixel-exact:
`--bg-base --bg-base-hover --bg-subtle --bg-field-component --bg-disabled --bg-interactive
--fg-base --fg-subtle --fg-muted --fg-on-color --fg-on-inverted --fg-interactive --fg-error
--border-base --border-interactive --border-error --elevation-card-rest --elevation-flyout
--elevation-modal --tag-blue-icon --tag-green-icon --tag-purple-icon --tag-red-icon
--tag-orange-icon --tag-green-text --tag-orange-text`.

**diverged (59)** — expressed as `color-mix(in srgb, var(--canon) N%, <partner>)`. The
percentages are **solved, not guessed**: for each row and each mode the script searches
canon anchor × blend partner × 0…100 % for the value closest to the vendor one and records
the channel error it could not remove.

| | light | dark |
|---|---|---|
| max residual (of 255) | 46.85 | 50.10 |
| median residual | 1.26 | 4.75 |
| rows landing exactly (residual 0) | 19 | — |

Light residuals above 5/255 are all tag colours plus three danger/hover states —
`--tag-purple-text` 46.85, `--tag-blue-text` 33.16, `--tag-green-border` and
`--tag-green-bg-hover` 10.75, `--fg-interactive-hover` 10.5, `--tag-red-text` 9.15,
`--tag-orange-border`/`--tag-orange-bg-hover` 6.95, `--tag-green-bg` 6.56,
`--border-danger`/`--button-danger-hover` 5.78. None of them is painted at rest on the four
measured pages; the tag palette has no consumer in the storefront at all.

**Solving per mode was not optional.** Medusa builds its light ramp out of opaque greys and
its dark ramp out of white-at-low-alpha overlays — `--bg-field` is `rgb(250,250,250)` in
light and `rgba(255,255,255,0.04)` in dark. No single blend reaches both. 57 rows therefore
emit a second declaration under `[data-mode="dark"]`. A first attempt that forced one blend
per row left `--bg-field` at a 231/255 dark residual and dragged `--button-neutral-pressed`
to 204/255 in *light* while trying to compromise; the per-mode solve removed both.

**open (28)** — no canon counterpart, so the row keeps the vendor value and today's look
survives. Four families, for the architect to decide on:

- **inverted-surface ramp (6)**: `--contrast-bg-base --contrast-bg-base-hover
  --contrast-bg-base-pressed --contrast-bg-subtle --contrast-border-top
  --contrast-border-bot`. Tooltips and the command bar are dark in *both* modes; canon
  `--primary` flips polarity, so anchoring on it would make a geist/dark tooltip light with
  light text. Canon needs an inverted-surface pair.
- **shadow stacks (20)**: `--buttons-* (6) --borders-* (6) --details-* (4) --elevation-card-hover
  --elevation-tooltip --elevation-code-block --elevation-commandbar`. Multi-layer
  `box-shadow` with baked focus blues and hairlines; canon carries three shadow tokens and
  Medusa's stacks run to seven layers. `color-mix` does not apply to a shadow list.
- **`--bg-overlay`**: a scrim that stays dark in both modes; canon has no scrim token.
- **`--border-transparent`**: `rgba(255,255,255,0)`, a literal, not a themeable value.

**Two more canon tokens would pay for themselves**, and they are the whole remaining pixel
cost: Medusa has three ink levels (`--fg-base` 24,24,27 / `--fg-subtle` 82,82,91 /
`--fg-muted` 113,113,122) plus `--fg-disabled` (161,161,170), and the canon has two
(`--foreground`, `--muted-foreground`). The second anchor went to `--fg-subtle` because it
has the most call sites (measured in `src/**`: `text-ui-fg-base` 167, `text-ui-fg-subtle`
117, `text-ui-fg-muted` 39), leaving `--fg-muted` (residual 1.01) and `--fg-disabled`
(2.31) approximate — see the pixel numbers below, where they are the only thing left.

### The `--fg-interactive` override is a row now, not a special case

`globals.css` used to carry `:root { --fg-interactive: rgba(37,99,235,1);
--fg-interactive-hover: rgba(29,78,216,1) }` — the WCAG correction, because Medusa's
blue-500 reaches only 3.67:1 on white against the 4.5:1 AA threshold. That block is gone
from `globals.css`. The value now lives in `medusa.theme.json` as `--link`, and
`--fg-interactive: var(--link)` is an ordinary **mapped** row.

This forced one design decision worth naming: a bridge row's status is judged against what
the storefront **actually renders** (`effective` in the token map), not against the raw
vendor value. Judging against the vendor value classified `--fg-interactive` as *diverged*
and had the bridge reproduce blue-500 — silently undoing the accessibility fix while every
test stayed green. `STOREFRONT_OVERRIDE` in the extractor records the distinction, and both
values are kept per row.

## T0h.2 — the two preset files

`specs/design-system/themes/medusa.theme.json` and `geist.theme.json`, both valid against
`theme-preset.schema.json` (Ajv, `ajv/dist/2020` — the schema is draft 2020-12 and Ajv's
default export only knows draft-07).

- `medusa`: values read by script from `dist/index.js`. `source` =
  `@medusajs/ui-preset@2.19.0 dist/index.js :root/.dark`.
- `geist`: vendor copy of `~/upready/packages/geist-kit/theme.css`. `source` =
  `geist-kit@b0e687b` (from `git -C ~/upready/packages/geist-kit rev-parse --short HEAD`).
  geist-kit's `.dark` block only redeclares what changes (25 of 31 tokens; `--radius` and
  `--chart-1..5` are left to the cascade), so the dark mode of the preset file repeats them
  — the schema requires the same key set in both modes.

`node apps/storefront/scripts/build-themes.mjs` prints `31 keys, 0 missing (2 presets x 2 modes)`
and fails on any difference.

## T0h.3 — `apps/storefront/scripts/build-themes.mjs`

Emits `apps/storefront/src/styles/themes.css` (347 lines), imported from `globals.css`
immediately after the three Tailwind imports:

1. `[data-theme="<id>"][data-mode="<mode>"]` per preset per mode, carrying the 31 canon tokens;
2. `:root:not([data-theme-bridge="off"])` — the bridge, 113 declarations;
3. `[data-mode="dark"]:not([data-theme-bridge="off"])` — the 57 dark-only re-declarations.

**Specificity, not luck.** `:not([data-theme-bridge="off"])` gives the bridge (0,2,0)
against the vendor preset's plain `:root` (0,1,0). That also neutralises the preset's own
dark block: which mode the storefront is in is now the profile's decision, not the operating
system's.

`data-theme="default"` is emitted as an alias of `medusa`, so a storefront whose profile
names no preset still renders today's look rather than an unstyled page.

The script also generates two modules kept in sync with the presets:
`src/lib/theme/presets.generated.ts` (the allow-list, plain-language labels, token count)
and `src/lib/theme/fonts.generated.ts` (see Fonts).

**Determinism, verified:** running `extract-theme-sources.mjs` and `build-themes.mjs` a
second time and `diff`ing all six generated files → exit 0, byte-identical.

```
2ebe4d9c…  apps/storefront/src/styles/themes.css
debbd89c…  apps/storefront/src/lib/theme/presets.generated.ts
f55f1c55…  apps/storefront/src/lib/theme/fonts.generated.ts
c13543c2…  specs/design-system/token-map.json
9152891a…  specs/design-system/themes/geist.theme.json
7ae0ab65…  specs/design-system/themes/medusa.theme.json
```

Verified in the production bundle: `.next-theme/static/css/d88d92a1708aa5d9.css` contains
`data-theme=default`, `data-theme=geist`, `data-theme=medusa`, `--fg-subtle:var(--muted-foreground)`
and `--fg-interactive:var(--link)`.

## T0h.4 — defaults, pre-paint, fonts

`src/app/layout.tsx` line 16 was `<html lang dir data-mode="light">`. It now renders
`data-theme` and `data-mode` from the active profile plus a `<head>` with the pre-paint
script. Nothing else in that file changed.

**The fallback, exactly.** `src/lib/theme/profile.ts` `readProfileTheme()` returns
`{ theme: "default", mode: "light", source: "fallback" }` in all three failure states:
the file `src/lib/profile/profile.generated.json` is absent (`require` throws, caught); it
exists but has no `theme` block (which is the case right now — the fixture profile in the
worktree carries `schema id source brand home layout i18n generatedAt` and no `theme`); or
it names a preset that is not in the allow-list, in which case each field falls back
independently. `default` resolves to the medusa preset, so the storefront builds and renders
today's look in every one of them.

**Pre-paint** (`src/lib/theme/pre-paint.ts`), following the chrxnasdmds pattern: allow-listed,
idempotent, and it never throws — two nested `try/catch`es, because `localStorage` throws on
*access* in a private window, not on the getter. The script is **generated from the axis
registry**, so there is no second list to keep in sync.

**Where the `data-image-*` allow-list goes — one line each.**
`apps/storefront/src/lib/theme/attributes.ts`, the `AXES` array (currently two entries,
`data-theme` and `data-mode`). Each entry is `{ attr, storageKey, allowed, fallback }`.
Appending `{ attr: "data-image-aspect", storageKey: "upready-store.image-aspect", allowed: ["1-1","4-5","3-4"], fallback: "1-1" }`
is the whole change: the pre-paint script, `apply.ts`, `resetAxes()` and the panel's
sections all read that array. Nothing else in `src/lib/theme/` needs touching.

**Fonts** (`src/lib/theme/fonts.ts`): the twelve names of
`store-profile.schema.json#/definitions/font`, each mapped to its `next/font/google`
loader. All twelve resolve — verified against
`next@15.5.21 dist/compiled/@next/font/dist/google/font-data.json` (1862 families); eleven
carry a `variable` weight and **IBM Plex Mono does not**, so it needs an explicit `weight`
or `next/font/google` refuses the call at build time. That is recorded in
`FONT_STATIC_WEIGHTS` and asserted by a test.

*How only the active pair ships.* `next/font/google` loaders are build-time: each call
downloads a family and injects a stylesheet wherever the calling module is imported, and the
calls must sit at module scope with literal arguments — so a twelve-entry map cannot be
lazy, and a module holding twelve calls ships twelve families to every visitor whichever
profile is active. `fonts.ts` therefore **calls nothing**: it is the allow-list and the
contract, and `build-themes.mjs` writes `fonts.generated.ts` with exactly two loader calls.
Proven by test (`fonts-generator.test.ts`): the generated module contains exactly two
`const x = Loader(` lines and none of the other ten family names appears anywhere in it.
A name outside the allow-list exits the generator non-zero with the offending name in the
message — no silent fallback to the system stack. The current build emits **0 woff2 files**
into `.next-theme/static/media/`, because the active profile names no typography.

`--font-display` and `--font-body` are exposed as CSS variables and deliberately **not**
bound to any element: `themes.css` sets no `font-family`, so a profile's typography can be
active without moving a pixel and T0h.5 measures the bridge alone. Binding them is one rule
in `globals.css` and belongs to the profile/UI layer.

## T0h.5 — the compatibility proof

`apps/storefront/tests/theme/compat.pwspec.ts` + `playwright.theme.config.ts`, run in
`mcr.microsoft.com/playwright:v1.63.0-noble`.

**The baseline is not a screenshot from before the change, and that is deliberate.** This
worktree is shared with two other agents who edited `src/modules` and `src/lib/profile`
throughout this session; a "before" capture taken an hour ago would be measuring their work
as much as mine, and in fact all four pages were returning HTTP 500 on a broken CSS module
of theirs during the window when the baseline would have been taken. Instead
`[data-theme-bridge="off"]` on `<html>` disables every bridge declaration and hands the page
back to the raw vendor variables — the exact CSS state before this step — and the control
side re-injects the two `globals.css` declarations this step removed, so "before" is
yesterday's storefront and not yesterday's storefront minus the WCAG fix. Both sides are
captured minutes apart from the same running server.

**Three passes**, because a single number cannot be read:

| pass | what it measures | result |
|---|---|---|
| A | `THEME_COMPARE=vendor --update-snapshots` — write the control baseline | exit 0 |
| B | `THEME_COMPARE=vendor THEME_MAX_DIFF_PIXELS=0` — run-to-run noise floor | **0 px on all four pages**, exit 0 |
| C1 | `THEME_COMPARE=bridge THEME_MAX_DIFF_PIXELS=0` — exact counts | see table |
| C2 | `THEME_COMPARE=bridge` — the 0.1 % acceptance gate | **6 passed**, exit 0 |

Per-pixel `threshold: 0`: a single channel off by 1 counts. Playwright's default (0.2 YIQ)
would have hidden exactly the small colour drift a bridge introduces.

| page | URL | diff pixels | ratio of 1 280 × 800 | noise floor |
|---|---|---|---|---|
| home | `/en` | **0** | **0.0000 %** | 0 |
| category | `/en/categories/shirts` | **469** | **0.0458 %** | 0 |
| PDP | `/en/products/t-shirt` | **621** | **0.0606 %** | 0 |
| cart | `/en/cart` | **0** | **0.0000 %** | 0 |

All four are inside the 0.1 % budget (1024 px). The remaining pixels are named, not
mysterious: reading the diff PNG, they are the breadcrumb links and the disabled
"Select variant" label — i.e. `--fg-muted` (light residual 1.01) and `--fg-disabled` (2.31),
the two ink rows the canon has no anchor for. A 1–2/255 drift is invisible to the eye but
lands on every antialiased glyph edge, which is why it is measurable at all.

**The failing number, before the fix.** The first bridge pass put the PDP at **1660 px
(0.162 %)**, over budget; the other three pages passed the 0.1 % gate on that run, but it
was a gate run, so their exact counts were not measured. The diff showed the PDP's pixels
were the product description, "Shipping and returns", the wordmark and the icons — all
`--fg-subtle`, which was then diverged with a 1.19/255 residual because
`--muted-foreground` had been anchored on `--fg-muted`. Swapping the anchor to `--fg-subtle`
(117 call sites against 39) made that row `mapped` and took the PDP from **1660 to 621 px**.
The 0 / 469 / 621 / 0 figures in the table above are all from after that change.

**Getting the noise floor to zero took three fixes**, each one a real source of drift that
would otherwise have been silently attributed to the bridge:

1. PDP thumbnails, **5526 px (0.54 %) control-vs-control**: `networkidle` never settles on a
   dev server (the HMR socket), so images were captured mid-decode. Now the suite waits for
   every `img.complete`.
2. Product photos, **50066 px (4.9 %)**: they are fetched from
   `medusa-public-images.s3.eu-*` through `next/image` — remote, slow, and one run had the
   photo where the other still had the placeholder. Every image is now served as one
   transparent pixel, identically in both passes; layout is untouched and the themed surface
   behind it is what gets compared.
3. Next's dev-mode issue badge (hidden with CSS — `mask` cannot cover it, the
   `<nextjs-portal>` host has no box) and the promo strip, whose copy comes from the store
   profile another agent was regenerating mid-run ("Free shipping over $120" in one capture,
   "Full-featured production ready DTC starter" in the next). The strip is masked; the mask
   covers only that strip, so every other colour on the page is still compared.

**Two behaviour tests** in the same suite, both green:

- flipping `data-theme` changes `--background` (`rgba(255,255,255,1)` → `#ffffff` medusa →
  geist) and flipping `data-mode` changes it again (`#0a0a0a`); the html background follows
  to `rgb(10,10,10)`, and `--bg-base` equals `--background` (the mapped row, proven live);
- with `upready-store.theme=geist` in `localStorage`, `data-theme` is already `geist` at
  `DOMContentLoaded` — the pre-paint runs before the first paint, so a reload does not flash.

## Verification — commands and exit codes

| command | exit |
|---|---|
| `pnpm --filter @dtc/gorgo-medusa-storefront exec tsc --noEmit` | **0** (0 errors) |
| `NEXT_DIST_DIR=.next-theme pnpm --filter @dtc/gorgo-medusa-storefront lint` | **0** — `✔ No ESLint warnings or errors` |
| `NEXT_DIST_DIR=.next-theme pnpm --filter @dtc/gorgo-medusa-storefront build` | **0** — `✓ Compiled successfully in 16.3s`, 11/11 static pages |
| `pnpm --filter @dtc/gorgo-medusa-storefront test:unit` | **0** — `Test Files 3 passed`, `Tests 43 passed` |
| `node apps/storefront/scripts/extract-theme-sources.mjs` | 0 — `113 / 26 / 59 / 28` |
| `node apps/storefront/scripts/build-themes.mjs` | 0 — `31 keys, 0 missing` |

Playwright, all from `apps/storefront`:

```
docker run --rm --add-host=host.docker.internal:host-gateway -v "$PWD/../..":/work \
  -w /work/apps/storefront -e THEME_URL=http://host.docker.internal:8031 \
  -e THEME_COMPARE=vendor mcr.microsoft.com/playwright:v1.63.0-noble \
  npx playwright test --config=playwright.theme.config.ts --update-snapshots   # exit 0
… -e THEME_COMPARE=vendor -e THEME_MAX_DIFF_PIXELS=0 …                          # exit 0, noise 0
… -e THEME_COMPARE=bridge -e THEME_MAX_DIFF_PIXELS=0 …                          # exit 1, prints 469 / 621
… -e THEME_COMPARE=bridge …                                                     # exit 0, 6 passed
```

### Reverse runs — 13/13

A test that has never failed proves nothing. Each mutation was applied, the suite run,
the file restored, the suite run again. Harness output: `13/13 reverse runs behaved
(RED when broken, GREEN when restored)`.

| # | mutation | test it turned red |
|---|---|---|
| 1 | drop the IBM Plex Mono entry from `FONT_STATIC_WEIGHTS` | non-variable families need an explicit weight |
| 2 | add a family the schema does not have | allow-list equals the schema enum |
| 3 | drop `default` from the `data-theme` allow-list | axis registry |
| 4 | remove the INNER `try/catch` | one axis's storage read throwing must not lose the others |
| 5 | remove the OUTER `try/catch` | a throwing DOM must not blank the page |
| 6 | remove BOTH | never throws on `localStorage` access |
| 7 | accept any stored value | allow-list narrowing in the pre-paint |
| 8 | instantiate every allow-listed family | exactly two loader calls are emitted |
| 9 | stop emitting `weight` for non-variable families | IBM Plex Mono gets `weight: ["400"…]` |
| 10 | accept any family name | a bad font fails the build, naming it |
| 11 | invent a pair when the profile names none | absent profile instantiates nothing |
| 12 | give the bridge plain `:root` specificity | the bridge outranks the vendor preset |
| 13 | put vendor blue-500 back into `--link` | the WCAG-corrected link colour survives |

Mutation 4 is worth a note: the first version of it did **not** turn the suite red, because
the test then asserted only "does not throw", which the outer catch satisfies on its own.
The test was rewritten to assert what only the inner catch buys — the loop continuing, so a
storage read that throws on `data-theme` still applies the stored `data-mode`.

## Files

Written:

- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/specs/design-system/token-map.json`
- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/specs/design-system/themes/medusa.theme.json`
- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/specs/design-system/themes/geist.theme.json`
- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/apps/storefront/scripts/build-themes.mjs`
- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/apps/storefront/scripts/extract-theme-sources.mjs`
- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/apps/storefront/src/styles/themes.css` *(generated)*
- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/apps/storefront/src/lib/theme/attributes.ts`
- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/apps/storefront/src/lib/theme/pre-paint.ts`
- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/apps/storefront/src/lib/theme/apply.ts`
- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/apps/storefront/src/lib/theme/profile.ts`
- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/apps/storefront/src/lib/theme/fonts.ts`
- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/apps/storefront/src/lib/theme/index.ts`
- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/apps/storefront/src/lib/theme/presets.generated.ts` *(generated)*
- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/apps/storefront/src/lib/theme/fonts.generated.ts` *(generated)*
- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/apps/storefront/src/lib/theme/theme.test.ts`
- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/apps/storefront/src/lib/theme/fonts-generator.test.ts`
- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/apps/storefront/tests/theme/compat.pwspec.ts`
- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/apps/storefront/playwright.theme.config.ts`

Edited (both minimal):

- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/apps/storefront/src/styles/globals.css` — added the `themes.css` import, removed the `--fg-interactive` `:root` override
- `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/apps/storefront/src/app/layout.tsx` — `<html>` attributes and the `<head>` pre-paint only; the rest byte-identical

**Do not commit** — scratch from the measurement, which the deletion guard refused to let
me remove: `apps/storefront/tests/theme/probe.mjs` and
`apps/storefront/tests/theme/capture.mjs`. Only `compat.pwspec.ts` belongs in
`tests/theme/`. Screenshot baselines are written to `test-results/theme-shots/`, already
covered by `apps/storefront/.gitignore` (no PNGs enter history, rule 21f).

## Two files Next rewrote by itself — do not commit them with my values

`next build`/`next dev` rewrite these whenever they run with a custom `NEXT_DIST_DIR`, and
three agents are running three dist dirs in this one worktree. `git diff` after my run:

```
 apps/storefront/next-env.d.ts
-/// <reference path="./.next/types/routes.d.ts" />
+/// <reference path="./.next-theme/types/routes.d.ts" />

 apps/storefront/tsconfig.json  "include"
+    ".next-profile/types/**/*.ts",
+    ".next-theme/types/**/*.ts",
+    ".next/types/**/*.ts",
-    ".next-gate/types/**/*.ts"
```

`next-env.d.ts` is the dangerous one: it now points at MY dist dir, and whoever runs a build
last wins. Committing it pins the repo to `.next-theme`. **Restore both to HEAD before the
commit** (`git checkout -- apps/storefront/next-env.d.ts apps/storefront/tsconfig.json`) — I
did not do it myself because I may not run git writes. Neither file is part of this step's
work; `tsconfig.json` merely accumulated every agent's dist-dir types path, and `.next-gate`
was already in HEAD.

Also modified in the tree but **not by me**: `apps/storefront/src/lib/profile/profile.generated.json`
(s1c's generator). My scripts only read it.

## For the orchestrator

**`apps/storefront/package.json`** — I may not edit it. One entry needed:

```json
"themes:build": "node scripts/build-themes.mjs"
```

Optional second entry, for regenerating the vendor-derived specs after a
`@medusajs/ui-preset` or geist-kit bump:

```json
"themes:extract": "node scripts/extract-theme-sources.mjs"
```

No test-script change is needed: the Playwright suite is named `*.pwspec.ts` so vitest's
`test:unit` does not try to collect it.

**`~/upready/packages/reuse-index.json`** — not mine to edit from this session. Entry to file:

```json
{
  "source": "geist-kit",
  "sourceCommit": "b0e687b",
  "sourceFile": "theme.css",
  "consumer": "upready-store",
  "consumerPath": "specs/design-system/themes/geist.theme.json",
  "kind": "vendor-copy",
  "what": "31 canon design tokens (:root + .dark) copied into an upready.theme-preset/v0 preset",
  "date": "2026-09-07",
  "driftCheck": "apps/storefront/scripts/extract-theme-sources.mjs regenerates the file from geist-kit/theme.css; a diff means geist-kit moved",
  "task": "t-store-profiles-pilot"
}
```

## What I could not verify

- **`next/font/google` end to end.** All twelve loaders and their weights were checked
  against Next's own `font-data.json`, and the generator's output was asserted by test — but
  no build has actually downloaded a family, because the active profile names no typography,
  so `next build` emitted 0 woff2 files. The first profile that names a font pair is the
  first real exercise of that path.
- **`geist` at the pixel level.** The four-page comparison is `medusa`/`light` against the
  vendor preset, per the brief's acceptance. The geist preset is proven to change
  `--background`, `--foreground` and the painted html background in both modes, but no
  four-page screenshot set exists for it.
- **The wider T0h.5 clause about `open` fallbacks under geist** ("zero elements whose colour
  still comes from an `open` bridge row") is not implemented. The 28 open rows are listed
  above; by construction they keep the Medusa value under every preset, so that assertion
  would fail today wherever a tooltip, a shadow stack or the scrim is painted. It needs the
  canon additions named above first — an architect decision, not an engineering one.
- **Dark mode has never been rendered before.** `tailwind.config.js` sets
  `darkMode: "class"` and the storefront has no `.dark` class anywhere, so the vendor dark
  values have never been on screen. The dark half of the bridge (57 dark-only
  re-declarations, median residual 4.75/255) is derived and validated numerically, not by
  eye.
- **The four pages are the demo catalog** (`t-shirt`, `shirts`), not the sneakers profile:
  that is what `:9023` was serving. Page URLs are overridable via
  `THEME_PAGE_HOME/CATEGORY/PDP/CART`.
