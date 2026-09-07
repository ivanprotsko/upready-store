# T-fix visual verdict — the repaint rendered and walked, 2026-09-08

Written by orchestrator A of the night wave, 02:38–03:16 WITA. Input: the fourteen defects of
`artifacts/registries/theme-surface-defects.json`, profile `sneakers`.

**Two live stands, both real, both from this repository — that is what makes the numbers below
comparable rather than assertions:**

| Stand | What it is | Branch / worktree |
|---|---|---|
| `http://localhost:8028` | **pre-repaint** — 176 literal Tailwind colours, no `body` rule | `feat/store-profiles` @ `9a5cf8a` (was already running) |
| `http://localhost:8044` | **post-repaint** — this branch, plus the cause-E fix below | `feat/store-theme-surface` @ `4dc8ccd` + working tree |

Both talk to the same Medusa backend on `:9023` and the same `upready_store_sneakers` database, so the
only difference between them is storefront CSS and markup. The backend was not restarted, reseeded or
written to beyond one cart created by the walk.

Every measurement below is a computed style read out of a running Chromium, composited through the real
alpha chain, never a value inferred from the source. Where a number could not decide the question, a
screenshot was opened and looked at; those rows say so.

---

## 1. Verdict per defect

Counts: **9 fixed · 3 still broken · 2 not reachable as described.**

| id | surface | verdict | evidence |
|---|---|---|---|
| d-01 | cart page heading + copy | **fixed** | `h1` "Корзина" passes in both modes and viewports; screenshot `/tmp/tfix-eye-cart-dark-post.png` shows white heading and readable copy on the ink page. Was `rgb(0,0,0)` on `rgb(10,10,10)`. |
| d-02 | skeletons, all pages | **fixed** | Caught while `/ru/store` streams: 36 painted blocks. `bg-ui-bg-component` = `rgb(26,26,26)` on page `rgb(10,10,10)` in dark (Δ 1.14), `rgb(245,245,245)` on `rgb(255,255,255)` in light (Δ 1.09). Themed placeholders, no longer light-grey blocks on a dark page. |
| d-03 | listing, Colourway dropdown | **not reachable as described** | The storefront renders no `<select>` for options — it renders `[data-testid=option-button]` buttons (2 groups, 12 buttons on `bollard-high`). The symptom "option labels near-black on a dark panel" belongs to a native popup that does not exist in this markup. What does exist passes: button text ≥ 4.5:1 in all four cells, and the focus ring is `focus-visible:ring-2 ring-[var(--ring)]` (`--ring` = `#d6ff3b` dark, `#4c6600` light), not the browser default. |
| d-04 | listing, Size dropdown | **not reachable as described** | Same markup, same measurement as d-03. |
| d-05 | category page heading | **fixed** | `/ru/categories/high-tops` heading passes in all four cells. Was `rgb(0,0,0)` on `rgb(10,10,10)`. |
| d-06 | PDP rule between price and options | **fixed — and Ivan's open question is answered** | The hairline is `1px` `rgb(38,38,38)` on `rgb(10,10,10)` in dark and `rgb(228,228,228)` on white in light. It follows `--border` now; it is not a white line. Nothing left to confirm. |
| d-07 | site header | **fixed** | Bar is the page colour, wordmark passes in all four cells. Screenshot `/tmp/tfix-eye-home-dark-post.png`: dark header, white "UPREADY STORE", visible cart badge. Was a white bar with a grey wordmark. |
| d-08 | site footer | **fixed as a surface, one line still below AA** | The white block is gone — the footer paints the page colour. Its copyright line is one of the 54 `--fg-muted` nodes in §3: 4.28:1 light, 3.65:1 dark, both under 4.5. Themed, but not compliant. |
| d-09 | cart drawer, empty state | **fixed as a surface; its CTA fails** | At 1440 the drawer opens on hover, its panel is themed, and every text node passes **except** the primary CTA "Перейти в корзину" at **1.13:1** — near-white on the lime accent (§3, NEW-1). At 390 the drawer is hover-only and does not open: not reachable at that viewport. |
| d-10 | cart drawer count badge | **fixed** | Badge "1": **11.84:1** dark, **13.84:1** light. Before the cause-E fix, measured on the same live page: **1.30:1** dark. Was `bg-black text-white` hard-coded. |
| d-11 | PDP add-to-cart, disabled | **still broken** | "Выбрать вариант": `rgb(70,70,70)` on `rgb(31,31,31)` = **1.74:1** dark, `rgb(169,169,169)` on `rgb(240,240,240)` = **2.07:1** light. `--fg-disabled` and `--bg-disabled` are too close in both modes. WCAG 1.4.3 exempts inactive controls, so this is not a compliance failure — but the label is unreadable, which is what the defect reported. Identical on the pre-repaint stand: the repaint did not touch it and could not have. |
| d-12 | reset password heading | **fixed** | Worst heading on `/ru/account` passes in all four cells. Was `rgb(0,0,0)` on `rgb(10,10,10)`. |
| d-13 | checkout | **fixed for the classes it was filed under** | With a real cart, `/ru/checkout` returns 200 and carries no white panel and no invisible total. The failures that remain on it are the `--fg-muted` token (3.65 / 4.28) and the disabled button — both listed in §3, neither a repaint defect. Two things worth knowing, in §4. |
| d-14 | mobile navigation drawer | **still broken in dark; legible in light** | Dark: the four nav links are `rgb(10,10,10)` on `rgb(20,20,22)` = **1.08:1**, 4 of 4 failing. Screenshot `/tmp/tfix-sidemenu-dark-post.png` — the links are effectively invisible; the eyes agree with the number. Light: the flat-colour walk reads 2.53:1, but `/tmp/tfix-sidemenu-light-post.png` shows white links on a `backdrop-blur` over a dark image and they are perfectly legible. **Light is a false positive of any pure-CSS contrast walk**, dark is a real defect. Cause in §3, NEW-3. |

---

## 2. Cause E — fixed at the source, and what it moved

**Decision taken (the architect's default, unchanged):** the fix went into the bridge, not into a patch.

Three rows of `specs/design-system/token-map.json` bound `--contrast-fg-primary`, `--contrast-fg-secondary`
and `--contrast-border-base` to the canon token `--destructive-foreground`. That token flips polarity per
preset (`#ffffff` light, `#0a0a0a` in sneakers dark), while `--contrast-bg-base` is a **fixed dark surface in
both modes** — it is already marked `open` in the map for exactly that reason. A foreground derived from a
flipping canon on a non-flipping surface disappears.

So the three rows joined the `--contrast-*` family that is already `open`: the fix is in the generator, not in
the generated file. `apps/storefront/scripts/extract-theme-sources.mjs` now marks them
`{ open: "inverted-surface ramp, see --contrast-bg-base: …" }` alongside the six siblings that were already
there. `pnpm themes:extract` regenerates `token-map.json`, `pnpm themes:build` regenerates `themes.css`, and
the scoped patch in `globals.css` is **removed** (replaced by a comment saying where the fix lives now).

**The guard the brief set was met.** Diff of the regenerated `themes.css` against the pre-fix copy is four
declarations and one counts comment, nothing else:

```
-  --contrast-fg-primary: color-mix(in srgb, var(--destructive-foreground) 88%, transparent);
+  --contrast-fg-primary: rgba(255, 255, 255, 0.88);
-  --contrast-fg-secondary: color-mix(in srgb, var(--destructive-foreground) 56%, transparent);
+  --contrast-fg-secondary: rgba(255, 255, 255, 0.56);
-  --contrast-border-base: color-mix(in srgb, var(--destructive-foreground) 15%, transparent);   (light block)
+  --contrast-border-base: rgba(255, 255, 255, 0.15);
-  --contrast-border-base: color-mix(in srgb, var(--destructive-foreground) 16%, transparent);   (dark block)
+  --contrast-border-base: rgba(255, 255, 255, 0.16);
```

Row-level diff of `token-map.json`: **3 rows changed, no others**; counts moved `59 diverged / 28 open` →
`56 diverged / 31 open`. `specs/design-system/themes/*.theme.json` unchanged. So the stop-condition
("if it changes more than those three variables, keep the patch") did not fire, and `q-cause-e-the-contrast-foreground`
does not need to be asked.

### Measured contrast, before and after, on the live page

"Before" was produced by writing the three old expressions back onto `document.documentElement` in the
running page and re-reading the computed styles — the same document, the same stylesheet, only the three
rows swapped. It is a measurement, not an extrapolation.

| Surface | dark before | dark after | light before | light after |
|---|---:|---:|---:|---:|
| promo banner text (`--contrast-fg-primary` on `--contrast-bg-base`) | 1.30:1 | **11.84:1** | 13.84:1 | 13.84:1 |
| cart count badge (same pair) | 1.30:1 | **11.84:1** | 13.84:1 | 13.84:1 |
| contrast-surface secondary text (`--contrast-fg-secondary`) | 1.00:1 | **5.70:1** | 1.00:1 | **6.25:1** |
| free-shipping delivery popup | not reachable — the nudge does not render in a one-item cart under the free-shipping threshold | | | |

Light mode is unchanged by design: `--destructive-foreground` is already `#ffffff` there, so the light block
resolved correctly before and after. The fix touches the dark block only, which is what the patch did too —
the difference is that it now lives where all nine themes are generated from.

**Fourth surface, and why it is not fixed by this change:** the side-menu panel (d-14) is a *different* token
pair — `--fg-on-color` on `--bg-overlay` — not one of cause E's three rows. It is the same *class* of bug and
it is still broken. See NEW-3 below.

---

## 3. What the walk found that the registry did not have

These four are not among the fourteen. Three of them are token-level, which means **every one of the nine
themes inherits them** unless they are fixed in the bridge before the wave starts.

**NEW-1 — `--primary-foreground` does not follow the accent's polarity. 1.13:1. The most visible one.**
Sneakers' accent is lime `#d6ff3b`; its foreground stays near-white `rgb(250,255,231)`. Every primary CTA is
white-on-lime: "Оформить заказ" on the cart page, "Войти" on account, "Перейти в корзину" in the drawer.
Visible in `/tmp/tfix-eye-cart-dark-post.png` — the button reads as a lime slab with a ghost of text on it.
A theme with a light accent needs a dark on-accent foreground; the bridge has no rule that derives one.
**Nine themes, nine accents: whichever are light will all do this.**

**NEW-2 — `--fg-muted` is below AA in both modes.** `rgb(122,122,122)` on white = 4.28:1 (light),
`rgb(106,106,106)` on `rgb(10,10,10)` = 3.65:1 (dark), threshold 4.5. 54 of the 64 remaining failing nodes are
this one token. It carries real content, not decoration: the footer copyright, the checkout section headings
"Контакты" and "Адрес доставки", and the "Powered by" line. A small nudge to the blend fixes all 54 at once.

**NEW-3 — `--fg-on-color` on `--bg-overlay`: cause E's sibling, and it is d-14.** `side-menu/index.tsx:62`
puts `text-ui-fg-on-color` on a panel painted `bg-ui-bg-overlay`. `--bg-overlay` is a fixed dark translucent
in both modes (`rgba(24,24,27,.72)` dark, `rgba(24,24,27,.4)` light) — an `open` row, like `--contrast-bg-base`.
`--fg-on-color` is `mapped` to `--destructive-foreground`, which flips to `#0a0a0a` in sneakers dark. Black
text on a dark overlay: **1.08:1**.
*The fix is one row and it is the same shape as cause E's*, but `--fg-on-color` is genuinely theme-dependent
elsewhere (text on a saturated accent legitimately follows the accent), so the honest fix is at the **call
site**, not the token: the side-menu panel should use a foreground that pairs with `--bg-overlay`, which is
fixed. Not applied — out of this window's scope, and it is a design call, not a mechanical one.

**NEW-4 — the static repaint gate is blind to two thirds of the Tailwind palette.**
`theme-repaint-gate.mjs:16,26` matches only `white|black|neutral|gray|grey|zinc|slate|stone`. Against the full
palette, `apps/storefront/src` still contains **22 chromatic literal colours** — `text-rose-500` ×6,
`text-emerald-500` ×3, `to-green-500` ×2, `from-green-400` ×2, `text-green-500` ×2, `text-orange-500/800/950`,
`bg-orange-300`, `text-violet-60`, `border-violet-60`, `text-red-500`. The static gate reads 0 and is green.
The runtime gate catches one of them at render time (`text-rose-500`, the required-field asterisk, 3.67:1).
Widening the regex to the full palette is a one-line change; it is **not applied** because it turns a
currently-green gate red and that is the parent's call, not mine.

---

## 4. Two things about `/ru/checkout` worth writing down

1. **It returns HTTP 404 without a cart.** An earlier pass measured "checkout" and was in fact measuring the
   404 page. Any gate, brief or agent that walks `/ru/checkout` must create a cart first (pick one option from
   each `[data-testid=product-options]` group, then `[data-testid=add-product-button]`), or it is measuring
   nothing. This is how a walk reports "checkout is broken" when checkout was never rendered.
2. **The 404 page ignores the mode axis.** With `upready-store.mode = light` in localStorage, `/ru`, `/ru/cart`,
   `/ru/account` and a PDP all render `data-mode="light"`; `/ru/checkout` without a cart renders
   `data-mode="dark"`, the SSR profile default. The pre-paint script does not reach the not-found branch.
   Minor on its own; it matters because `supplements`, the first theme of the wave, is the light one.

---

## 5. Method, and where it was wrong before it was right

Two measurement bugs were found and fixed inside this window. Both are worth knowing because any agent
writing a contrast check will hit them:

- **Chromium does not return `rgb()` for `color-mix()`.** It returns `color(srgb 0.415235 0.415235 0.415235)`.
  A parser that only knows `rgb()/rgba()` returns `null`, the compositor falls back to the background, and
  every token built from `color-mix` reports a contrast of **exactly 1.00** — a defect that does not exist,
  reported with total confidence. The first pass of this walk called d-11 and d-13 "still broken" for that
  reason. The runtime gate handles both shapes; this walk's probes now do too.
- **A flat-colour walk cannot price text over `backdrop-filter` or over an image.** d-14 in light mode reads
  2.53:1 and is legible; the coverage gate handles the image case with a pixel stage, but not the blur case.
  This is the reason the brief demanded eyes as well as numbers, and it is the one row where they disagreed.

Screenshots kept for the record (`/tmp`, not committed — they are throwaway evidence, not artifacts):
`tfix-eye-{home,category,pdp,cart}-{dark,light}-post.png`, `tfix-sidemenu-{dark,light}-post.png`.

---

## 6. The coverage gate — its acceptance, honestly

Full detail: `artifacts/docs/2026-09-08-tgate-notes.md`. Gate:
`apps/storefront/scripts/theme-coverage-gate.mjs`, run as `pnpm themes:coverage -- --url <base>`.

Re-run independently by this window against both stands, 20 cells each (5 pages × 2 modes × 2 viewports):

| | pre-repaint `:8028` | post-repaint `:8044` |
|---|---:|---:|
| failing nodes | **198** | **64** |
| distinct failure groups | 9 | 6 |
| failing cells | 20 / 20 | 20 / 20 |
| exit code | 1 | 1 |

**"Red before" is met.** "Green after" is **not**, and that is the correct outcome, not a gate defect: all six
remaining groups were checked one by one and every one is a real defect — 54 nodes of `--fg-muted` (NEW-2),
4 of a literal `text-rose-500` (NEW-4), 4 of the disabled button (d-11), 2 of the lime CTA (NEW-1). Nothing was
suppressed; the allow-list is empty and no threshold was moved.

What the repaint actually did, in the gate's own numbers: **134 of 198 failing nodes removed (68%)**, and the
whole white-on-white and black-on-black population — 104 + 29 + 17 + 12 + 1 = 163 nodes across the nav, the
section headings and the footer links — is gone. What remains is four token/theme-level problems that the
repaint was never scoped to touch.

**One caveat about one of the gate's checks.** The `body`-background assertion passes 20/20 on *both* stands,
so it does not by itself discriminate. It is still worth keeping — it would catch a theme whose body stops
following `--background` — and the gate prints the line that does discriminate right under it:
*pre* → "background painted by `<html>`, body carries its own opaque rule on **0/20** cells";
*post* → "painted by `<body>`, **20/20**". That is cause A, measured, in one line.
