# Wave 2 — verdict on the fourteen defect classes, and what the night cost

Written by the architect window at 06:05 WITA, 2026-09-08, from measurements taken by seven agents
between 02:38 and 06:00, and amended by the architect window at 19:21 the same day — every amended
figure carries that time. Every number below was measured by somebody named; where a figure is a
prediction rather than a measurement it says so. Nothing here is estimated.

The registry is `artifacts/registries/theme-surface-defects.json` (14 defects, 6 process failures).
Four themes were built: `supplements`, `electronics`, `womens-fashion`, `home-goods`, each with a
live stand.

---

## The short answer

**Twelve of the fourteen classes are closed and measured closed — d-11 is the twelfth, closed on
the surface it names and re-measured in the architect window at 19:21 WITA. Two are half-closed:
d-03 and d-04, whose focus half is the work left open.**

That sentence used to read "ten closed, two half-closed, two open" while the table below it counted
eleven, two and one. Nobody re-derived the prose after the table moved. It is d-11's failure one
floor down — a number written once and then quoted, and the fix is the same one: count it from the
table, in the reply where the claim is made.

What stayed open was not missed — it was invisible to the gate until tonight, and the gate was
extended to see it. That is the honest shape of the result: the repaint fixed most of what it was
aimed at, and the checking apparatus turned out to be the weaker half of the work.

---

## Class by class

| id | surface | cause in the registry | verdict | measured |
|---|---|---|---|---|
| d-01 | cart page | A-body-unstyled | **closed** | headings 16.42:1 dark, 16.87:1 light (supplements); did not recur on home-goods or electronics |
| d-02 | skeletons, all pages | B-hardcoded-tailwind | **closed** | zero hardcoded greys left in skeletons (supplements) |
| d-03 | Colourway dropdown | C-focus-unstyled + A-body-unstyled | **half** | the near-black half fixed, 16.4:1; the focus half returned and is now visible — see below |
| d-04 | Size dropdown | C-focus-unstyled + A-body-unstyled | **half** | same as d-03. The symptom as WRITTEN is unreachable: the storefront renders option buttons, not a native `<select>`, so the native popup cannot occur |
| d-05 | category page heading | A-body-unstyled | **closed** | 16.42:1 dark / 16.87:1 light (supplements) |
| d-06 | PDP rule between price and options | B-hardcoded-tailwind | **closed** | the rule is the token, `rgb(38,51,48)` (supplements) |
| d-07 | site header | B-hardcoded-tailwind | **closed** | carries `bg-ui-bg-base` (supplements) |
| d-08 | site footer | B-hardcoded-tailwind | **closed** | carries `bg-ui-bg-base` (supplements) |
| d-09 | cart drawer, empty state | B-hardcoded-tailwind | **closed** | panel themed; its CTA was the separate 1.13:1 defect, now **17.18:1** |
| d-10 | cart drawer with items, count badge | B-hardcoded-tailwind | **closed** | badge themed; 1.30 → **11.84:1** |
| d-11 | PDP add-to-cart, disabled | B-hardcoded-tailwind | **closed on its surface, re-measured** | recurred at 2.00:1 light / 1.79:1 dark; fixed to 6.70 / 6.12; then **1.04:1 on womens-fashion**; re-derived against a contrast target and re-measured at 19:21 WITA: **4.60:1 worst of 16 preset × mode cells** — see below |
| d-12 | reset password heading | A-body-unstyled | **closed** | 16.42:1 dark / 16.87:1 light (supplements) |
| d-13 | checkout | B + A | **closed** | 13.9–16.4:1 with an item in the cart (supplements) |
| d-14 | mobile navigation drawer | A + B | **closed** | recurred at 1.00–1.08:1, fixed to **16.91:1**; the gate now opens the drawer and home-goods measures 0 failing nodes on 20 of 20 cells |

## The two that were open, and why they matter more than the twelve that are closed

### d-11 — a fix is only as wide as the presets it was measured against

`--fg-disabled` was mixed from `--muted-foreground`, which cannot reach 4.5:1 on `--bg-disabled` at
**any** percentage: the blend can only pull ink toward the background. Re-deriving it from
`--foreground` took the disabled button from 2.07:1 to 6.70:1 light and 1.74:1 to 6.12:1 dark, with
a computed worst case of 5.25 / 5.27 across **every preset that existed when that ran**.

`womens-fashion` did not exist when that ran. On its stand the same control measures
`rgb(90,87,80)` on `rgb(140,59,46)` = **1.04:1** — worse than the defect the fix had cured. A fixed
percentage off `--foreground` is not preset-independent; a preset whose disabled background leans
chromatic defeats it.

The lesson generalises past this token: **"worst case across all presets" is a claim with an expiry
date.** It should be written with the date and the list it was computed over, or it reads as a
guarantee about presets that do not exist yet.

**Re-measured in the architect window, 2026-09-08 at 19:21 WITA.** The derivation against a
contrast target shipped, and the paragraph above no longer has to quote an agent. Method: the
disabled PDP add-to-cart button — `[data-testid="add-product-button"][disabled]`, the *Select
variant* state d-11 was reported in — on the live `:8081` stand, read through Chromium's computed
styles, one cell per preset per mode, with `data-theme` / `data-mode` flipped on `<html>`: the same
switch the design system offers a visitor.

**Worst case 4.60:1 — `womens-fashion`, dark mode, ink `rgb(76,52,43)` on `rgb(224,144,122)`. Best
case 4.66:1. All 16 preset × mode cells clear the 4.5:1 that WCAG AA asks of this text; none fails,
and none of the 16 read unstable.** The presets it was computed over, named because that is the
whole lesson above: `electronics`, `geist`, `home-goods`, `medusa`, `sneakers`, `supplements`,
`womens-fashion` — seven, plus `default`, an alias of `medusa` that measures identically, which is
why there are 16 cells and not 14. The agent's "≥ 4.60:1 across all six presets" had the floor
exactly right and the list short by a preset and an alias.

The same CSS is on all four stands, not just the one this ran on: fetching every stylesheet each
stand serves and normalising hex against `rgb()` gives one identical set of 28 solved inks
(7 presets × 2 modes × 2 surfaces) on :8070, :8061, :8081 and :8110.

What the number does **not** cover, so it is not read wider than it was taken:

- only `--fg-disabled-on-surface` was measured, the ink read on `--bg-disabled`. The other half of
  the same derivation, `--fg-disabled-on-page`, was not re-measured in this window;
- the registry entry names the button *and its spinner*; only the button was measured.

Two traps sit between this control and a correct number, and both return a plausible wrong one in
silence. They are now guarded inside `apps/storefront/scripts/measure-disabled-pair.mjs`:

1. the button carries `transition: color, background-color … 0.15s`. Read straight after the preset
   flips, computed style returns the PREVIOUS preset's colours — measured here: the root variables
   moved at once while the button still reported the old ink, and it settled 800 ms later. The first
   run of this measurement returned 4.15:1 to 4.78:1 with the womens-fashion ink on every preset in
   the table, and it looked like a result. Transitions are switched off before anything is read.
2. a stale read cannot be told from a live one by looking at it, so every cell is read twice with a
   gap and a disagreement is reported as unstable rather than quietly averaged.

Per-cell numbers: `artifacts/docs/2026-09-08-disabled-pair-measure.json`. Re-running the tool prints
the preset list it actually found on the stand, so the next person's claim carries its own list.

### d-03 / d-04 — the focus ring, and a gate that could not see it

The near-black label half is fixed. The focus half came back: the browser-blue ring
(`outline: auto 1px rgb(0,95,204)`) returned on links and header buttons, where Medusa-UI buttons
kept a themed ring.

It came back **unseen**, because the coverage gate never measured focus at all. It now does: it
Tab-walks up to 24 controls per cell and fails the UA ring, a missing ring, and any ring under 3:1.
On the foundation stand that took browser-blue rings from 12 to 0. What remains is real and named:
**18 focus failures across 242 controls, being 5 distinct defects** — the promo-banner close button
(`--ring` under 3:1 on the inverted banner), two inputs whose `focus:ring-0` beats their own
`focus-visible:ring-2`, and an account tab button. `home-goods` measures 8 failures across 254
controls, all of them controls with no ring at all.

---

## What the gate could not see at all, and now can

This is the part of the night worth remembering. The pilot's gate compared screenshots, so it went
green while text was invisible — process failure `p-02`. Its replacement reads computed styles and
caught 198 failing text nodes on the pre-repaint state. But it still had two blind spots, and both
of them were exactly where a defect came back:

- it never opened the mobile drawer, which is where d-14 returned at 1.00:1;
- it never measured focus, which is where d-03/d-04 returned.

**A check nobody runs at a gate is not a check.** Both are now walked, and an unopenable drawer is a
failure rather than a skip.

Consequence for reading any number in this document: **the baseline moved because the gate looks at
more.** "The foundation is 8 nodes" was a number produced by a gate that did not look at drawers or
focus. The honest current baseline is three numbers, not one:

**4 contrast nodes · 0 drawer nodes · 18 focus failures across 242 controls.**

---

## Four defects found tonight that are not in the registry

1. **Prices rendered in Indonesian rupiah on every stand.** `ip-api` outranked
   `NEXT_PUBLIC_DEFAULT_REGION` and then wrote a year-long cookie, so the setting lost twice.
   Fixed; the architect window measured `$17.99` on the supplements stand afterwards. The
   environment template also shipped `NEXT_PUBLIC_DEFAULT_REGION=en` — a language, not a country
   code — so the region lookup was always false and the fallback was arbitrary.
2. **The full-bleed hero's subheadline is dark ink on a dark photograph.** It computes to
   `rgb(36,28,22)` because Tailwind's `/80` modifier cannot compose against `--contrast-fg-primary`,
   which already carries `rgba(255,255,255,.88)` and is one of the 31 open bridge rows. Every
   full-bleed profile carries it, `electronics` included. No edit to a hero fixes it. Open:
   `q-fullbleed-subheadline-opacity`.
3. **A rejected brand name shipped to a live stand.** `home-goods` served the wordmark its own style
   board had refused, and nothing caught it but a human looking at a screenshot: no gate reads
   `NEXT_PUBLIC_SITE_NAME`. Open: `q-site-name-unchecked`.
4. **A locale file that resolves to nothing looks finished.** `womens-fashion`'s keys were
   kebab-case while the lookup camelCases them: 12 of 12 product keys, 3 of 7 category keys and 1 of
   2 collection keys were dead. Writing the four missing locales in that shape would have shipped
   four more dead files, each of them full and valid. Fixed; the architect window re-counted 50 leaf
   keys in each of five files with identical sets. `supplements` and `electronics` have none.

## One defect class that is cosmetic and present on all four themes

The `text-rose-500` required-field asterisk measures 3.29–3.67:1 on `/account` in light mode, four
nodes on every theme. It is the whole of the contrast baseline. Nobody fixed it because it is a
component colour rather than a theme token, and because it is the same four nodes everywhere — which
is also the argument for fixing it once.

---

## The money

| line | amount | note |
|---|---|---|
| fal.ai balance at start | $7.10 | read from the dashboard at 02:20 WITA |
| ceiling Ivan set | $6.00 | leaving $1.10 untouched |
| soft stop | $5.00 | above it, only reshoots |
| **predicted spend, from the ledger** | **$2.667** | 12 renders, each written down before its call |
| of which the grid measurement | $0.378 | 3 renders, one rejected |
| supplements | $0.939 | 19 images from 3 predictions |
| electronics | $0.300 | 22 files from 1 prediction — $0.019 per product image |
| womens-fashion | $0.450 | 30 files from 2 predictions |
| home-goods | $0.600 | 2 predictions; 9 cells cannot cover 12 products |
| **actually spent, from the fal.ai dashboard** | **not read** | `spend.json` carries `dashboardUsd: null` on purpose. The ledger is a prediction from the published price list; only the dashboard is the fact. Ivan reads it. |

Two renders are recorded as rejected and their dollars are gone: the transparent-background probe
($0.039), and $0.30 lost when an agent "syntax-checked" a render script with `node -e "import(...)"`
— a dynamic import executes the module, so the script ran, called fal.ai, and was killed before the
request id printed. Journal `aie-20260908-042252-ff23`.

**The ceiling was never approached.** $3.33 of the $6.00 remains, which is roughly six more themes at
the rate the last three ran.

### What the grid strategy actually bought

| shape | model | background luma spread across cells |
|---|---|---|
| 3x3 | nano-banana-pro 4K | **7.8** (measurement), **2.9** (womens-fashion), **12.6** (home-goods) |
| 3x3 | nano-banana (cheap) | 13.1, and it drew a gutter it was told not to draw |
| 4x4 | nano-banana-pro 4K | **59.2** |

A 4K 3x3 costs $0.30 and yields nine usable product images at 1365x1024 — **$0.033 each**, against
$0.039 for one cheap single frame. Bigger and cheaper. But cell count is not free: the 4x4 that
electronics bought halved the price per image and cost seven times the consistency.

Two conditions carry forward. **Read the panel count off the image**: a 3x3 was ordered once and a
3x4 arrived, with a fourth row of invented near-duplicates delivered free. And **slice on the seams
you find, never on thirds**: column seams can be 2.58x the noise floor, and a detector that falls
back to gaps between subjects finds the subjects, not the panels.

**Alpha does not survive.** A transparent-background request returns opaque RGB with a checkerboard
*painted* into it — it looks like a cut-out in a preview and is opaque everywhere else.

---

## What Ivan is looking at

Four live stands, left running:

| theme | storefront | backend | database |
|---|---|---|---|
| supplements | http://localhost:8070 | 9051 | `upready_store_supplements` |
| electronics | http://localhost:8061 | 9041 | — |
| womens-fashion | http://localhost:8081 | 9061 | `upready_store_womens_fashion` |
| home-goods | http://localhost:8110 | 9110 | `upready_store_home_goods` |

The contact sheet — four themes, both modes, home + category + PDP in one screen — is at
`artifacts/docs/contact-sheet/index.html`, opened from `file://` with no server.

Eighteen questions are open in HANDOFF — fourteen of them asked tonight, eight blocking
`t-store-profiles-pilot` — and none of them was guessed at: they are the decisions that belong to
the owner rather than to the night. (Counted with `handoff.mjs index --all` at 2026-09-08 19:0x;
the "eleven" this line carried until now was wrong when it was written.)
