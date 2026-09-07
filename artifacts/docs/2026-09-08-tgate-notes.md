# Runtime theme-coverage gate (T-gate) — build notes and measured results

Date: 2026-09-08 · task `t-store-profiles-pilot` · worktree
`/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-theme-surface`

Gate: `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-theme-surface/apps/storefront/scripts/theme-coverage-gate.mjs`
Runner: `pnpm --filter @dtc/gorgo-medusa-storefront themes:coverage -- --url <base>`

```
node apps/storefront/scripts/theme-coverage-gate.mjs --url <base> [--json <path>]
     [--modes light,dark] [--viewports 390,1440] [--pages home,category,pdp,cart,account]
     [--locale ru] [--theme <id>] [--timeout 30000] [--pixel-probes 60] [--headed]
```

Exit codes: `0` every check passed · `1` a check failed · `2` operational error (no chromium,
page >= 400, navigation timeout, page kind with no discovered URL). Exit 2 is never a verdict
on the theme and the run says so on stderr.

---

## What it measures

20 loads per run: 5 page kinds x {light, dark} x {390x844, 1440x900}. One browser, one context
per (mode, viewport), reused across the five pages.

**Mode forcing.** The pre-paint script reads localStorage before the first paint, so both
`upready-store.mode` and (optionally) `upready-store.theme` are written with
`context.addInitScript` BEFORE navigation, and `document.documentElement.dataset.mode` is read
back after load. A mode that does not land is recorded as a **failing cell**, not as an
operational error — one broken axis must not hide the other nineteen cells.

**Route discovery.** No slug is hardcoded. The gate loads `<base>/<locale>`, reads every
`<a href>`, and takes the first `/categories/…` and `/products/…` it finds; `cart` and `account`
are fixed paths. Every navigation asserts status < 400. Discovered on both stands:
`/ru`, `/ru/categories/high-tops`, `/ru/products/stanchion-high`, `/ru/cart`, `/ru/account`.

**Contrast, stage 1 (CSS colours).** For every element with a direct, non-blank text-node child
that is rendered (not `display:none` / `visibility:hidden`, chain-opacity > 0.01, rect w and h > 0,
and not `script`/`style`/`noscript`/`template`):

- foreground = `getComputedStyle(el).color`, its alpha multiplied by the *product* of the
  opacity of the element and every ancestor (opacity is not inherited but the painted result
  multiplies), then composited over the background;
- background = walk the ancestor chain, collecting every `background-color` with alpha > 0 until
  an opaque one is reached; if none is, the chain ends at the canvas colour (the root's
  background, else the body's, else white). Layers are then composited bottom-up with the real
  formula `out = fg*a + bg*(1-a)` — no shortcut, no "assume opaque".
- ratio = WCAG 2.1 relative luminance, `(L_hi + 0.05) / (L_lo + 0.05)`.
- threshold = 3.0 when the text is large (`font-size >= 24px`, or `>= 18.66px` with
  `font-weight >= 700`), otherwise 4.5.

**Contrast, stage 2 (pixel measurement) — why it exists.** Stage 1 can only see *computed*
colours. Hero copy that sits on an `<img>` composites down to the canvas and reads as
white-on-white: `1.00 < 3.0`, a false positive present on **both** stands. Excluding the hero, or
allow-listing it, would have been a lie about the product. So stage 2 *measures* instead:

1. a finding is flagged `mediaBehind` when its background chain crossed a CSS `background-image`,
   or when an `<img>/<video>/<canvas>/<svg>/<picture>` overlaps its rect without being an
   ancestor or descendant of it;
2. a scoped stylesheet makes the glyphs transparent (`color: transparent !important` plus
   `text-shadow`/`-webkit-text-stroke-color`) — layout and painted background untouched, unlike
   `visibility:hidden`, which would make the element unscreenshottable;
3. Playwright screenshots the element; the PNG is decoded in-process (`node:zlib` inflate plus
   the five PNG filters — no new dependency), sampled to at most ~20k pixels;
4. the foreground is re-composited over the **measured mean** background and re-scored. The
   luminance spread and the worst-case ratio (against the darkest and the lightest sampled
   pixel) are reported alongside, so a textured background is visible as such and cannot hide
   behind a comfortable average.

Stage 2 only ever runs on nodes stage 1 already failed, and only on the media-flagged ones
(cap `--pixel-probes`, default 60/cell). Every measurement is in the JSON under `groups[].pixel`.

**Body-background assertion (separate check).** `--background` is resolved by painting it onto a
throwaway probe element and reading back the normalised `rgb()`, then compared channel-by-channel
(tolerance 1) against `document.body`'s composited background. This is deliberately its own
check, not a by-product of the contrast walk — its absence from an earlier brief is a recorded
process failure. The record also carries `paintedBy` and `bodyOwnIsOpaque`, because "body has its
own rule" and "body is transparent and inherits the canvas from `html`" render identically and a
report that cannot tell them apart is not worth reading.

**Noise cap.** Identical `(selector, fg, bg)` triples are grouped with a count, so a skeleton grid
collapses to one line. stdout prints at most 12 groups per cell; the full record goes to `--json`.

**Allow-list.** `ALLOW_LIST` at the top of the file, **currently empty**. Each entry would need a
`match` and a `reason`, and every run prints how many nodes it suppressed. Nothing was excluded
and no threshold was touched to make anything pass.

---

## Measured results

Commands (streamed to disk, then read from the files):

```
node scripts/theme-coverage-gate.mjs --url http://localhost:8028 --json /tmp/tgate-pre.json  > /tmp/tgate-pre.log  2>&1   # exit 1
node scripts/theme-coverage-gate.mjs --url http://localhost:8044 --json /tmp/tgate-post.json > /tmp/tgate-post.log 2>&1   # exit 1
```

### Headline

| | `:8028` pre-repaint | `:8044` post-repaint |
| --- | ---: | ---: |
| failing nodes | **198** | **64** |
| failing cells (page x mode x viewport) | **20 / 20** | **20 / 20** |
| distinct failure groups | 119 | 46 |
| distinct colour pairs | 10 | 6 |
| body-background assertion | **PASS 20/20**, painted by `<html>`, body's own rule opaque on 0/20 | **PASS 20/20**, painted by `<body>`, body's own rule opaque on 20/20 |
| pixel stage | 7 measured, 6 resolved, 0 unmeasurable | 2 measured, 2 resolved, 0 unmeasurable |
| verdict | RED (exit 1) | RED (exit 1) |

The gate is RED on the pre-repaint stand, as required — a gate green there would not be a gate.

### Per cell

| page | mode | viewport | :8028 nodes | :8044 nodes | delta |
| --- | --- | --- | ---: | ---: | ---: |
| home | light | 390x844 | 1 | 1 | 0 |
| category | light | 390x844 | 4 | 4 | 0 |
| pdp | light | 390x844 | 5 | 5 | 0 |
| cart | light | 390x844 | 1 | 1 | 0 |
| account | light | 390x844 | 3 | 3 | 0 |
| home | light | 1440x900 | 2 | 2 | 0 |
| category | light | 1440x900 | 5 | 5 | 0 |
| pdp | light | 1440x900 | 6 | 6 | 0 |
| cart | light | 1440x900 | 2 | 2 | 0 |
| account | light | 1440x900 | 4 | 4 | 0 |
| home | dark | 390x844 | 15 | 1 | **-14** |
| category | dark | 390x844 | 17 | 4 | **-13** |
| pdp | dark | 390x844 | 17 | 5 | **-12** |
| cart | dark | 390x844 | 13 | 1 | **-12** |
| account | dark | 390x844 | 16 | 2 | **-14** |
| home | dark | 1440x900 | 16 | 2 | **-14** |
| category | dark | 1440x900 | 20 | 5 | **-15** |
| pdp | dark | 1440x900 | 18 | 6 | **-12** |
| cart | dark | 1440x900 | 16 | 2 | **-14** |
| account | dark | 1440x900 | 17 | 3 | **-14** |

**The entire win is in dark mode: -134 nodes.** Light mode is byte-for-byte unchanged (0 delta in
all ten light cells). That is the expected shape of this repaint — the literal Tailwind greys it
replaced already matched the light palette, so the tokens only start to matter once `data-mode`
flips. It also means the ten remaining light-mode failures are pre-existing token defects, not
repaint regressions.

### What `:8028` fails on and `:8044` does not (the four classes that disappear)

| nodes | measured | reading |
| ---: | --- | --- |
| 104 | `rgb(161,161,161)` on `rgb(255,255,255)` @ 2.58 | literal grey text on a literal white surface — the whole page ignores dark mode |
| 29 | `rgb(237,237,237)` on `rgb(255,255,255)` @ 1.17 | near-white footer headings on white |
| 10 + 7 + 1 | `rgb(0,0,0)` on `rgb(10,10,10)` @ 1.06 | black text on the dark canvas: invisible |
| 12 | `rgb(106,106,106)` on `rgb(10,10,10)` @ 3.65 | muted breadcrumb, dark |

### What still fails on `:8044` — six real defects, nothing suppressed

| nodes | fg on bg | ratio / threshold | where | reading |
| ---: | --- | --- | --- | --- |
| 27 | `rgb(122,122,122)` on `rgb(255,255,255)` | **4.28** / 4.5 | footer `span.txt-medium` (copyright, "Powered by"), all 5 pages, light | `--muted-foreground` in light is 0.22 short of AA |
| 27 | `rgb(106,106,106)` on `rgb(10,10,10)` | **3.65** / 4.5 | same nodes, dark | `--muted-foreground` in dark is 0.85 short of AA |
| 4 | `rgb(244,63,94)` on `rgb(255,255,255)` | **3.67** / 4.5 | account form, `span.text-rose-500` (required-field `*`) | a **literal Tailwind colour that survived the repaint** — `rose` is not in the repaint gate's literal-colour regex, so the static gate cannot see it |
| 2 | `rgb(169,169,169)` on `rgb(240,240,240)` | **2.07** / 4.5 | PDP "Выбрать вариант" button, light | disabled-button state; light |
| 2 | `rgb(70,70,70)` on `rgb(31,31,31)` | **1.74** / 4.5 | same button, dark | disabled-button state; dark |
| 2 | `rgb(250,255,231)` on `rgb(214,255,59)` | **1.13** / 4.5 | account "Войти" primary button, dark | `--primary-foreground` stays near-white on the lime accent in dark — the accent needs a dark foreground |

Ranked by what to fix first: (1) `--muted-foreground` in both modes, 54 of the 64 nodes, one
token pair; (2) `--primary-foreground` on the lime accent in dark, 1.13:1 is unreadable;
(3) the `text-rose-500` literal, which is also a hole in the *static* gate's regex;
(4) the disabled-button pair, arguably intentional but still below AA.

### Body-background assertion — both stands PASS, for different reasons

Measured directly (chain walk from `body` upward):

```
:8028 light  --background=#fff      BODY bg=rgba(0,0,0,0)  ->  HTML bg=rgb(255,255,255)
:8028 dark   --background=#0a0a0a   BODY bg=rgba(0,0,0,0)  ->  HTML bg=rgb(10,10,10)
:8044 light  --background=#fff      BODY bg=rgb(255,255,255)
:8044 dark   --background=#0a0a0a   BODY bg=rgb(10,10,10)
```

The brief predicted `:8028` has "no `body` background rule", and that is literally true — but the
*composited* background behind body's content still equals `--background` there, because the
value propagates from `html`. Since the brief specifies the **composited** background, the check
passes on both, and it should: what the user sees is correct on both stands. The discriminating
fact is recorded rather than failed on: `paintedBy` is `<html>` on all 20 `:8028` cells and
`<body>` on all 20 `:8044` cells, and `bodyOwnIsOpaque` is 0/20 vs 20/20. **This check therefore
does not discriminate pre from post on these two stands** — stated plainly so nobody reads its
green as evidence the repaint fixed the background.

---

## Notes, limits, decisions

- **`import("playwright")` does not resolve from `apps/storefront`.** Only `@playwright/test` is
  linked into `apps/storefront/node_modules` in this workspace; `playwright` lives unlinked in the
  worktree root's `.pnpm` store. `loadChromium()` tries `playwright`, then `@playwright/test`
  (which re-exports `chromium`), then `playwright-core`, asserts `typeof chromium.launch ===
  "function"`, and reports every specifier it tried when none works. `require.resolve` is not used
  anywhere: it resolves the *require* condition and hands back a namespace with no `chromium`.
- **Only the element's own text is scored.** A `<div>` whose text lives in a child `<span>` is not
  a finding; the `<span>` is. Blank runs (whitespace, zero-width space/joiner, word joiner, BOM,
  NBSP) are skipped.
- **Stage 2 verdicts use the mean background.** Over a photograph no single number is the truth;
  the mean is the fair aggregate, and `luminanceSpread` plus `worstRatio` are in the record so a
  textured hero is visible as a textured hero. All 8 media-backed findings across both runs were
  measurable; 8 of 8 were re-measured, 8 resolved (6 pre, 2 post) — i.e. the CSS chain's
  white-canvas guess was wrong every time it fired.
- **`waitUntil: "networkidle"`** on every navigation, 30s default. Both stands are dev servers; a
  cold first compile of a route can approach that. `--timeout` raises it.
- **Not covered:** `mix-blend-mode`, `filter`, `backdrop-filter`, CSS gradients as the *only*
  background of a text node (a gradient sets `background-image`, so such a node is flagged
  `mediaBehind` and handed to stage 2 — this works, but is untested here because no such node
  failed), text under a transform, and pseudo-element content (`::before`/`::after`).
- **Runtime:** ~25s for the full 20-cell matrix against a warm dev server, single browser.
- **Exit codes actually exercised.** `1` on both stands (above). `2` twice: `--url
  http://localhost:8099` (dead port -> `connect ECONNREFUSED`, message printed, "this is not a
  verdict on the theme") and a missing `--url`. **`0` was not demonstrated against a live stand,
  because no cell in either matrix is currently clean** — the branch is
  `exitCode = failingCells.length > 0 ? 1 : 0` and will turn green when the six defects above are
  fixed. Do not read this note as a claim that a green run has been observed.

## Files created or modified by this task

- created `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-theme-surface/apps/storefront/scripts/theme-coverage-gate.mjs`
- created `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-theme-surface/artifacts/docs/2026-09-08-tgate-notes.md`
- modified `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-theme-surface/apps/storefront/package.json` — one line added, `"themes:coverage": "node scripts/theme-coverage-gate.mjs"`

Run records (not committed): `/tmp/tgate-pre.log`, `/tmp/tgate-pre.json`, `/tmp/tgate-post.log`,
`/tmp/tgate-post.json`.
