# Retro of the `sneakers` pilot — the INPUT: brief, programme, schemas, data

Author: retro analyst (input lens), 2026-09-08. Read-only pass over the worktree
`/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles` at commit `fb07051`.
Nothing was built, started or committed for this document.

**Sources read in full**
`docs/prompts/initial-prompt-2026-09-07-orchestrator-store-profiles.md` (92 lines, "the brief") ·
`docs/store-profiles/00-program-2026-09-07.md` (124 lines, "the programme") ·
`artifacts/registries/theme-surface-defects.json` (92 lines, "the registry") ·
`.ai/progress.md` (117 lines) ·
`artifacts/docs/2026-09-07-remaining-work.md` (55) ·
`artifacts/docs/2026-09-07-pilot-agent-runs.md` (58) ·
plus, because the brief cites it as its own source,
`docs/prompts/initial-prompt-2026-09-06-orchestrator-theme-presets-panel.md` ("the predecessor brief").

Every quote below is verbatim from the line named. Every number below is from a command I ran in this
session; the command is printed beside it. Nothing here is an inference about what an agent was thinking.

---

## 0. The measurements this retro rests on

All run in `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/apps/storefront/src`
unless stated otherwise.

| # | Measurement | Command | Result |
|---|---|---|---|
| M1 | No `body` rule anywhere; `html` gets a background but never a colour | `grep -n "html\|body" styles/globals.css` | `globals.css:31-34` = `@layer utilities { html { @apply bg-ui-bg-base; } }`. `themes.css` has no `html`/`body` selector at all. `app/layout.tsx:33` = `<body>` with no `className` |
| M2 | Files painting with literal Tailwind colours | `grep -rlE "(bg\|text\|border)-(white\|black\|neutral-[0-9]\|gray-[0-9]\|grey-[0-9]\|zinc-[0-9])" . \| wc -l` | **44 files** (the registry says 42 — see M3) |
| M3 | Occurrences of the same, and the two areas the registry's `byArea` list omits | same pattern with `-roE \| wc -l`; then per directory | **168 occurrences**. The registry's `byArea` sums to 42 files; the two missing are `modules/shipping/components/free-shipping-price-nudge/index.tsx` (**14 occurrences**) and `modules/store/components/mobile-refinement/index.tsx` (1) |
| M4 | Focus rings | `grep -roE "outline-none" . \| wc -l` / `grep -roE "focus-visible:ring-" . \| wc -l` | **18** `outline-none` in **12** files against **4** `focus-visible:ring-` |
| M5 | Dark-mode utilities in the storefront | `grep -roE "\bdark:[a-z-]+" . \| wc -l` | **0** |
| M6 | What the dark variant is wired to | `grep -n darkMode ../tailwind.config.js`; `grep -rn 'className="[^"]*\bdark\b' src \| wc -l`; `grep -c data-mode src/styles/themes.css` | `tailwind.config.js:4` = `darkMode: "class"`; **0** elements carry a `dark` class; **0** `.dark` selectors in `src/styles`; themes.css switches on **9** `data-mode` selectors |
| M7 | The profile's default mode | `grep -n defaultMode apps/backend/src/migration-scripts/data/profiles/sneakers/profile.json` | `profile.json:35` = `"defaultMode": "dark"` |
| M8 | Size of the storefront surface | `find . \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" \) \| wc -l` | **307 files** |
| M9 | Size of the surface inside any S1b/S1c file zone | `find ./styles ./lib/theme ./lib/profile ./modules/home/components/profile-hero ./modules/home/components/category-tiles ./modules/layout/components/promo-banner ./modules/products/components/thumbnail -name "*.tsx" -o -name "*.ts"` | **18 files**, plus `app/layout.tsx` (head only) and `app/[locale]/(main)/page.tsx` → **20 of 302** `.ts`/`.tsx` files. **282 were in nobody's zone** |
| M10 | Routes that exist | `find app -name page.tsx \| wc -l` | **24**. The brief's S7 opens 5 of them |
| M11 | Words that never appear in the 92-line brief | `grep -oin "<word>" docs/prompts/initial-prompt-2026-09-07-orchestrator-store-profiles.md \| wc -l` | `footer` **0**, `nav` **0**, `skeleton` **0**, `account` **0**, `drawer` **0**, `side-menu` **0**. `header` **1** — and it is `headers()`, the Next.js function, at line 31. `body` **1** — and it is `--font-body` at line 29 |
| M12 | Where the brief says `dark` | `grep -oin ".\{40\}dark.\{40\}" <brief>` | **twice, both on line 37**, the stage that writes a Markdown document |
| M13 | The predecessor brief's own measurement, not carried forward | `sed -n '15p' docs/prompts/initial-prompt-2026-09-06-orchestrator-theme-presets-panel.md` | "…`apps/storefront/src/app/layout.tsx` already renders `<html data-mode="light">`; **the code has zero `dark:` utilities**; …" |
| M14 | `modules/layout/components` siblings | `ls modules/layout/components` | 11 components. The brief's zones name exactly **one** of them (`promo-banner`); `cart-dropdown` and `side-menu`, both in the defect list, are two of the other ten. `modules/layout/templates` holds `nav` and `footer` — both in the defect list, neither in any zone |

**One finding the owner's registry does not contain (M6).** The theme layer switches on
`<html data-mode="dark">` (9 selectors in `themes.css`), while Tailwind's dark variant is configured as
`darkMode: "class"` (`apps/storefront/tailwind.config.js:4`) and nothing in the storefront ever sets a
`dark` class. Any repaint that reaches for `dark:bg-…` today writes dead CSS. This is a fourth root
cause, latent because M5 measures zero `dark:` utilities — nobody has tripped over it yet. The template
in §3 fixes it in the same stage that repaints.

**The sentence the whole failure fits into.** The pilot shipped the codebase's first dark-mode
storefront (M7) into a component tree with zero dark-mode utilities (M5), 168 literal light-mode colour
classes (M3), no `color` rule on the page root (M1), and a dark variant wired to a selector nothing sets
(M6) — and the brief mentions dark mode exactly twice, both times inside the order for a Markdown
document (M12).

---

## 1. Root cause → the line that should have prevented it → what it said → replacement

### Root cause A — `body` has no background and no colour rule (registry `A-body-unstyled`)

**The line that should have prevented it is not missing from the world — it was deleted in transit.**

The brief's S1b (line 29) says it implements the predecessor brief's T0h steps, and restates T0h.5
itself. The predecessor's T0h.5 is `docs/prompts/initial-prompt-2026-09-06-orchestrator-theme-presets-panel.md:23`
and it contains three assertions. The store-profiles brief kept the first and dropped the other two.

| | |
|---|---|
| **The line that should have prevented it** | `docs/prompts/initial-prompt-2026-09-06-orchestrator-theme-presets-panel.md:23` |
| **What it actually said** (verbatim, the dropped half) | "Then `geist` in both modes on the same four pages: zero elements whose colour still comes from an `open` bridge row (the script lists `open` rows; the test asserts each page's computed colours never equal the Medusa fallback of an `open` variable). Also assert `getComputedStyle(document.documentElement).getPropertyValue('--background')` changes when `data-theme` flips, **and that `body` background follows**." |
| **What the store-profiles brief line 29 wrote in its place** (verbatim, complete) | "Compatibility proof T0h.5: four pages (home, a category, a PDP, the cart) at 1280×800 before any change, then with `medusa`/`light` active: pixel difference ≤ 0.1 % per page, numbers copied." |
| **Second aggravating cut** | Brief line 14 copies three counts out of the predecessor's line 15 ("35 `*-ui-*` utilities over 26 tokens in `src`; `@medusajs/ui-preset` 2.19.0 declares 88 variables") and drops the fourth fact on that same line: "the code has zero `dark:` utilities" (M13) |
| **Zone note** | The fix location was inside the right zone all along: `apps/storefront/src/styles/**` is S1b's zone (line 29) and the fix goes in `globals.css` (registry line 21). A was **not** a zone gap. It was a missing order and a deleted check |

**Replacement text, ready to paste, for the S1b-equivalent stage:**

```
Page-root paint (blocking, this stage owns it). `apps/storefront/src/styles/globals.css` must set BOTH
properties on the element that owns the page, in one rule that no preset can bypass:

    html, body { background: var(--background); color: var(--foreground); }

Setting only the background is the defect this replaces: on 2026-09-07 globals.css:31-34 carried
`html { @apply bg-ui-bg-base; }` with no colour, so every heading that inherits its colour rendered
browser-black on an ink page. Proof required, and it is not a pixel diff: on each of the 24 routes of
`app/**/page.tsx`, in both modes, `getComputedStyle(document.body).backgroundColor` and
`getComputedStyle(h).color` for the first `h1, h2, h3` on the page must each parse to a value declared
by the ACTIVE preset in `src/styles/themes.css`. 24 routes x 2 modes x 2 assertions = 96 samples,
0 mismatches allowed. A route that renders no heading reports `no-heading` and still asserts the body
background. Print the 96 rows.
```

---

### Root cause B — 42 (measured: 44) files paint with literal Tailwind colours (registry `B-hardcoded-tailwind`)

This one **is** a zone gap, and the brief's own words draw its edge.

| | |
|---|---|
| **The lines that should have prevented it** | Brief line 25 (the S1 header), line 29 (S1b's zone), line 31 (S1c's zone) |
| **What line 25 said** | "## S1. Foundation — three zones in parallel, **file sets disjoint** (three Opus agents, ≤120k each)" |
| **What line 29 said** (the zone parenthesis, verbatim) | "**S1b. Theme bridge + fonts** (`apps/storefront/src/styles/**`, `src/lib/theme/**`, `scripts/build-themes.mjs`, `specs/design-system/token-map.json`, `specs/design-system/themes/**`, `app/layout.tsx` **head only**)." |
| **What line 31 said** (the zone parenthesis, verbatim) | "**S1c. Storefront profile blocks** (`apps/storefront/src/modules/home/components/profile-hero/**`, `…/category-tiles/**`, `src/lib/profile/**`, `scripts/build-profile.mjs`, `modules/layout/components/promo-banner`, `modules/products/components/thumbnail` **for the aspect only**, `app/[locale]/(main)/page.tsx`)." |
| **What the two parentheses together cover** | 20 of 302 `.ts`/`.tsx` files (M9). `promo-banner` is 1 of the 11 components in `modules/layout/components`; `cart-dropdown` and `side-menu` are two of the other ten. `modules/layout/templates/{nav,footer}` — the white header and the white footer — are in neither zone (M14) |
| **The two qualifiers that did the damage** | "`app/layout.tsx` **head only**" (line 29) put the file that carries `<body>` inside a zone and then fenced off line 33, which is where `<body>` is (M1). "`modules/products/components/thumbnail` **for the aspect only**" (line 31) admitted a component to a zone with colour explicitly excluded |
| **Confirmed by the orchestrator's own post-mortem** | Registry `processFailures[0].detail`: "S1b's zone was styles/lib/theme/build script; S1c's zone was the new profile blocks plus the promo banner and the thumbnail aspect. nav, footer, cart-dropdown, side-menu, checkout, skeletons, divider and the account area were in nobody's file set. **The brief created the gap, the agents did not.**" |

**Replacement text, ready to paste — this replaces the whole "three zones, file sets disjoint" framing:**

```
Zone rule. Every stage's zone is written as a set of glob paths, and the union of all zones must equal
the storefront tree exactly. The orchestrator proves it before launching a single agent, by arithmetic,
not by reading:

    cd apps/storefront/src
    find . \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" \) | wc -l        # = TOTAL
    # then the same find restricted to each zone's globs; the sums must add to TOTAL with no file
    # counted twice and none left over.

Measured on 2026-09-07 TOTAL = 307. The pilot's zones covered 20 of them. A file that belongs to no
zone is not "out of scope"; it is a defect in this brief, and the orchestrator fixes the brief before
launching. Qualifiers that narrow a zone inside a file ("head only", "for the aspect only") are
FORBIDDEN: a zone is a set of files, and whoever owns a file owns every line of it.
```

---

### Root cause C — 18 `outline-none` sites against 4 focus rings (registry `C-focus-unstyled`)

| | |
|---|---|
| **The line that should have prevented it** | There is none. The brief never uses the words focus, ring, hover, active or disabled as a thing anyone must build. The closest line is 60, S7's check list, which measures colour contrast and clipping but no interaction state |
| **What line 60 said about states** (verbatim, the whole of it) | "selecting a size and a colourway changes the price/SKU shown" |
| **What the brief did name** | Line 37 orders `ring` as a palette token the creative director must invent: "palette as canon tokens for `light` and `dark` (`background`, `foreground`, `card`, `popover`, `primary`, `primary-foreground`, `secondary`, `muted`, `muted-foreground`, `accent`, `destructive`, `border`, `input`, **`ring`**, `radius`)". The token was produced and is unused — registry `C.evidence.note`: "themes.css defines --ring per preset (sneakers dark #d6ff3b, light #4c6600), so a token exists and is unused" |
| **The shape of the error** | The brief ordered the token and never ordered a consumer. That is the same shape as A (a `--foreground` that nothing applies) and B (a bridge that 44 files bypass). All three are one class: **a token layer was commissioned and no stage was made responsible for the layer that consumes it** |

**Replacement text, ready to paste:**

```
Interaction states (blocking, owned by the repaint stages). Every element that clears the browser
outline must replace it in the same class list. The gate is a count identity, not a review:

    cd apps/storefront/src
    N_OFF=$(grep -roE "outline-none" . | wc -l)
    N_RING=$(grep -roE "focus-visible:ring" . | wc -l)
    test "$N_OFF" -le "$N_RING" || exit 1

Measured on 2026-09-07: 18 outline-none against 4 focus-visible:ring — this gate goes RED on the pilot
as it stands. The ring colour is `ring-[var(--ring)]`, never a literal. In addition, the rendered proof:
for every focusable element on the 5 highest-traffic routes, `element.focus()` then
`getComputedStyle(el, ':focus-visible').outlineColor` or its box-shadow must contain the active
preset's --ring value; 0 elements may fall back to the user-agent blue.
```

---

### Root cause D — the dark variant is wired to a selector nothing sets (found in this retro, M6)

| | |
|---|---|
| **The line that should have prevented it** | Brief line 14, the "Measured facts you build on" block |
| **What it actually said** (verbatim, complete) | "No theme layer on `dev`: `apps/storefront/src/lib/theme` does not exist, `specs/design-system/themes/` holds only a README. `<html data-mode="light">` is rendered by `app/layout.tsx:16`; 35 `*-ui-*` utilities over 26 tokens in `src`; `@medusajs/ui-preset` 2.19.0 declares 88 variables (counts from the theme-presets brief, recount)." |
| **What it omitted** | The predecessor brief's line 15, from which those three counts were copied, ends its list with "the code has zero `dark:` utilities" (M13). That clause was dropped, and with it the only written trace that the pilot's `defaultMode: dark` (M7) was a first |
| **What the pilot's own agent said in writing** | `artifacts/docs/2026-09-07-s1b-theme-bridge-report.md:464`: "**Dark mode has never been rendered before.** `tailwind.config.js` sets `darkMode: \"class\"` and the storefront has no `.dark` class anywhere, so the vendor dark values have never been on screen. The dark half of the bridge (57 dark-only re-declarations, median residual 4.75/255) is derived and validated numerically, not by eye." The disclosure was made. The brief's S1 gate (line 33) has no slot that consumes it |

**Replacement text, ready to paste:**

```
Dark mode is a first, and this stage owns making it real. Measured on 2026-09-07:
`apps/storefront/tailwind.config.js:4` is `darkMode: "class"`, the storefront sets no `dark` class
anywhere (0 matches), and `src/styles/themes.css` switches on `data-mode` (9 selectors). The two
mechanisms are not connected, so a `dark:` utility written today is dead CSS. Change the config to

    darkMode: ['selector', '[data-mode="dark"]'],

in the same commit as the first repaint, and prove it: one throwaway element carrying `dark:bg-red-500`
must compute to red with `data-mode="dark"` and not red with `data-mode="light"`, both measured from
`getComputedStyle`, then the element is removed. Independently of that fix, a repaint replaces a literal
colour with a TOKEN; `dark:` variants are a fallback for the rare case a token cannot express, and each
use is listed in the stage report with its reason.
```

---

### The cross-cutting cause behind A, B, C and D: the brief has no noun for the thing that broke

The brief is 92 lines. In it, `footer`, `nav`, `skeleton`, `account`, `drawer` and `side-menu` occur
**zero** times; `header` occurs once and is `headers()`; `body` occurs once and is `--font-body` (M11).
Meanwhile brief line 70 — Ivan's own acceptance — says:

> "the palette is one and the same on home, listing, product and cart"

The cart drawer, the header and the footer are named in the acceptance criterion and named nowhere in
the work. That is the whole failure in two lines of the same file: **an acceptance criterion with no
stage behind it, checked for the first time by the owner.**

---

## 2. Acceptance criteria that prove the wrong thing

Twelve. For each: the quote, what it can prove, what it cannot, and a replacement that is measurable and
**goes RED on this pilot as it stands** — that last property is the point of the exercise, so each
replacement names the measurement that fails today.

### 2.1 — brief line 29, the T0h.5 pixel gate

> "Compatibility proof T0h.5: four pages (home, a category, a PDP, the cart) at 1280×800 before any change, then with `medusa`/`light` active: pixel difference ≤ 0.1 % per page, numbers copied."

**What it can prove:** that introducing the bridge changed nothing — that the vendor look survives the
refactor. It is a regression proof and it did its job: max delta 0.0606 % against a 0.1 % budget
(`artifacts/docs/2026-09-07-remaining-work.md:15`).

**What it cannot prove, structurally:** anything about a *different* preset reaching a surface. It
compares the storefront to itself under a preset chosen to be identical to the vendor default. A theme
that reaches nothing scores a perfect 0.0000 % on this gate. The orchestrator reached the same verdict
after the fact — registry `processFailures[1]`: "That is a regression proof — it certifies the theme
changes nothing. Nothing in the programme measured that the sneakers preset actually reaches every
surface."

**Second structural defect in the same line:** "before any change" is unobtainable. Brief line 25
launches three agents into one worktree simultaneously; `artifacts/docs/2026-09-07-pilot-agent-runs.md:52`
records "Изоляции по веткам не было ни у кого. Все семь работали в одном дереве `feat/store-profiles`".
By the time S1b started (20:32) two other agents had been editing the tree for four and one minutes
(20:28, 20:31 — same file, lines 15-17). There was no "before".

**Replacement (RED today):**

```
Preset-reach gate (replaces the pixel gate as the theme's proof; the pixel gate stays, demoted to a
regression check against the `medusa` preset only). On each of the 24 routes under `app/**/page.tsx`,
at 1280x800 and 390x844, in `light` and `dark`, sample the computed background-color of
`body`, `header`, `footer`, and every element matching `[data-testid], nav, aside, dialog, [role=dialog]`
that is at least 40x40 CSS px and visible. Every sampled value must equal a value declared for the
ACTIVE preset in `src/styles/themes.css`. Report `route, mode, viewport, selector, computed, matched-token`
for every sample; the count of unmatched samples must be 0.
Baseline for wave 2: run it once against the pilot stand before any repaint and record the number. On
2026-09-07 the header (`bg-white`), footer (`bg-white`), cart drawer (`bg-white border-gray-200`) and
79 skeleton blocks (`bg-gray-100/200`) all fail this, so the recorded baseline is a large non-zero — that
number is the stage's own definition of done: it must reach 0.
```

### 2.2 — brief line 33, gate S1

> "Gate S1: `tsc --noEmit` 0, `next lint` clean, `next build` 0, Jest unit + Vitest + Playwright green with reverse runs red, T0h.5 deltas ≤ 0.1 %. Commit per zone with `IVAN_OK=1` and literal pathspecs (`git add -- <files>` first)."

**What it can prove:** the code compiles, types check, the linter is happy, the tests the agents wrote
pass and fail when inverted.

**What it cannot prove:** that anything is the right colour. Every one of these five checks was green
while the header was white and every heading was black on black. `next lint` in particular is the check
that *could* have caught B — there is no lint rule against literal colour classes, and the brief never
asked for one.

**Replacement (RED today):**

```
Gate S1 additions, each blocking:
  (a) literal-colour lint: `pnpm --filter storefront lint` fails the build on any of
      bg-|text-|border-|ring-|divide- followed by white|black|neutral-N|gray-N|grey-N|zinc-N outside
      `src/styles/allow-literal-colours.json` (the allow-list is a committed file, each entry carrying a
      one-line reason). Measured 2026-09-07: 168 occurrences in 44 files -> this gate is RED until the
      repaint stages land.
  (b) the preset-reach gate of 2.1, 0 unmatched samples.
  (c) the focus-ring identity of §1/C.
  (d) the dark-variant proof of §1/D.
```

### 2.3 — brief line 37, gate S2 (the style board)

> "Gate: the orchestrator checks every numbered section exists, every hex pair has a ratio, every mock-up frame names its state; no Ivan wait."

**What it can prove:** that a 943-line Markdown file has the shape it was asked for. The orchestrator ran
exactly this and reported exactly this (`.ai/progress.md:57`): "943 lines; numbered sections 1..9 all
present … 7 `state:` labels across 5 frames; 44 numeric rows in the contrast tables."

**What it cannot prove:** that the palette works on a screen. It is a document-structure check standing
in for a design judgement. It also cannot catch a document that contradicts itself or another stage —
and two such contradictions shipped: the price band (brief line 41 says 89–189 USD, style board §2 says
$140–$210, recorded at `.ai/progress.md:117`) and the packshot template that hard-codes "A single right
shoe, alone in frame" for a catalog the same brief orders to contain a care kit and two lace cuts
(`.ai/progress.md:112-113`, brief line 41 "≥ 2 single-variant products (care kit, laces)").

**Replacement (RED today):**

```
Gate S2, three parts, all blocking:
  (a) structure, as before — sections, ratios, named states.
  (b) contrast computed from the board's own hex values by a script that exits non-zero (this the pilot
      did; keep it: 32 pairs, minimum 4.67, appendix 9(a)).
  (c) NEW — cross-document consistency, run by the orchestrator, printing a table of contradictions
      between the style board and the brief: every numeric range named in both (price band, product
      count, category count, shot count) must match, and every prompt template must be checked against
      the assortment it will be applied to (a template that says "shoe" against a catalog line that says
      "care kit" is a contradiction). 0 contradictions to pass. On 2026-09-07 this gate returns 2.
```

### 2.4 — brief line 41, gate S3 (the catalog)

> "Gate: `store-profile:validate` green on the catalog part (media may still be empty); counts printed."

**What it can prove:** the JSON matches the schema and the counts are what was ordered.

**What it cannot prove:** that a description "reads as written by a shop, not by a model" — which is
brief line 70's actual criterion. Schema validation standing in for prose quality. A second problem: at
the time this gate ran, the validator could not run in place at all — `.ai/progress.md:115` records
"S3's exit 0 came from a throwaway scratchpad fixture … nothing from it entered the repo."

**Replacement (RED today):**

```
Gate S3: schema validation as before, plus
  (a) the validator runs IN PLACE against the repo path, never against a fixture; the orchestrator
      re-runs the exact command and pastes the output.
  (b) a blind read-back: the orchestrator picks 3 of the N product descriptions at random, strips the
      titles, and a second agent (creative director, who did not write them) answers in one line each
      "what is this product and who is it for". A mismatch on any of the 3 fails the gate. This is a
      cheap human-equivalent judgement with a binary outcome, not a rating.
```

### 2.5 — brief line 52, gate S5 (copy reconciled with the renders)

> "Gate: `store-profile:validate` green with media; a diff of changed titles/descriptions in the report."

**What it can prove:** that the files still validate and that some text changed.

**What it cannot prove:** that a title now names what its photo shows — the entire point of the stage. A
diff proves motion, not correctness. Note also that S5 was never run at all
(`artifacts/docs/2026-09-07-pilot-agent-runs.md:22`: "Не запускались: **S5** …"), so the pilot's titles
still describe what was intended rather than what was drawn
(`artifacts/docs/2026-09-07-remaining-work.md:29`).

**Replacement (RED today):**

```
Gate S5: for each of the N products, the report carries one row: handle, the render's sampled dominant
hex (sharp stats on a masked crop, value copied from the command output), the colourway hex in the
catalog, and their deltaE. deltaE must be under 12 for every product. Plus the blind check: a second
agent is shown the image alone and writes the colour name it sees; it must match the colourway name in
the title for at least N-1 of N products. On 2026-09-07 this gate cannot even be attempted — S5 never
ran — so it is RED by absence, which is the correct state for it to be in.
```

### 2.6 — brief line 56, the S6 stand check

> "`curl` of `/en` → 200, of ten image URLs → 200."

**What it can prove:** the server is up and the media host serves bytes.

**What it cannot prove:** literally anything about what the page looks like. HTTP 200 is exactly what the
store returned while the header was white, the footer white, the drawer white and every heading black on
black. `artifacts/docs/2026-09-07-remaining-work.md:18` records the stage as passing with "4 страницы
200, `data-theme=\"sneakers\"`, 283/283 картинки 200" — three green numbers, zero of them about colour.

**Replacement (RED today):** the preset-reach gate of 2.1, run as the stand's own exit criterion. A stand
is not "up" until 0 unmatched samples.

### 2.7 — brief line 60, the theme attribute check

> "`document.documentElement.dataset.theme === 'sneakers'` at `DOMContentLoaded`"

**What it can prove:** the pre-paint script ran and the attribute is on the element before hydration.

**What it cannot prove:** that the attribute changes a pixel. The attribute was present, correct and
early on the shipped store. The registry's own evidence (`A-body-unstyled.evidence.measured`) says so:
"html carries data-theme=sneakers data-mode=dark, --background #0a0a0a, --foreground #ededed,
--fg-base #ededed (**the bridge works**), yet every h1/h2 probed returns color rgb(0,0,0) on bg
rgb(10,10,10)".

**Replacement (RED today):** keep the attribute assertion — it is cheap and it guards flash-of-default —
but demote it from acceptance to a precondition, and make acceptance the computed-colour identity of
§1/A: 96 samples, 0 mismatches.

### 2.8 — brief line 60, the contrast check

> "the six token pairs ≥ 4.5:1 measured from computed styles"

**What it can prove:** that six CSS custom properties hold values whose ratio is ≥ 4.5:1.

**What it cannot prove:** that any element on the page uses either of them. This is the loophole root
cause A drove through: `--background` #0a0a0a against `--foreground` #ededed is a ratio of about 16:1
and passes gloriously, while the heading beside it renders `rgb(0,0,0)` on `rgb(10,10,10)` — a ratio of
about 1.03:1. The phrase "measured from computed styles" is what makes this criterion look rigorous; the
computed styles are read from `documentElement`, not from a painted element.

**Replacement (RED today):**

```
Contrast as painted. For every route x mode x viewport, take the largest text node in each of: page
heading, body copy, primary button label, secondary button label, link, input placeholder, disabled
button label, and the cart-drawer heading. For each, compute the ratio between
getComputedStyle(node).color and the effective background of its nearest painted ancestor (walk up until
backgroundColor alpha > 0). Ratio >= 4.5:1 for body-size text, >= 3.0:1 for text >= 24px or >= 19px bold.
Report every pair. On 2026-09-07 the cart heading (rgb(0,0,0) on rgb(10,10,10), ratio 1.03) and the
category h1 fail, so this gate is RED.
```

### 2.9 — brief line 60, the screenshots

> "screenshots under `apps/storefront/tests/profile/__screenshots__/` (not committed, **sizes reported**)"

**What it can prove:** that PNG files exist and how many bytes they are.

**What it cannot prove:** what is in them. This is the literal instance of the rule the workspace already
carries (`~/.claude/CLAUDE.md`, rule 27d): «a screenshot is attached» is a fact about a file, not a
verdict on the look. The brief asked for the byte count of the visual evidence.

**Replacement (RED today):**

```
Screenshots are an INPUT to a named reviewer, never an artefact of acceptance. The S-visual stage
(§3, blocking) takes them, and its output is a verdict document with one row per checked item and the
words "matches" or "does not match" plus the reason. The gate is: the verdict document exists, covers
every route in the route list, and contains zero "does not match" rows. On 2026-09-07 no such document
exists — `artifacts/docs/2026-09-07-remaining-work.md:22-23` records the stage as skipped — so this gate
is RED.
```

### 2.10 — brief line 68, the machine acceptance

> "Machine: the gates of S1, S3, S4, S5, S6 as written; S7 report with every check green and every reverse run red; `next build` green; the two `.gitignore` rules present; `git status` clean in the worktree; no file over 1 MB in the commits."

**What it can prove:** repository hygiene — that nothing binary leaked into git, that the tree is clean,
that a build succeeds.

**What it cannot prove:** that a storefront exists. Four of the six clauses are about the repository, one
is about a report's own self-assessment ("every check green"), one is about the compiler. This is the
acceptance for a *library*, applied to a *shop*. Two of its inputs were themselves unreliable: the
validator exits 0 when invoked with no arguments (`.ai/progress.md:73`: "prints the usage line, **exit
0**. That is a real defect: invoked wrongly in CI it reads as success"), and `store-profile:up` "вернул
**код 0 при провалившемся сиде с 0 товаров**" (`artifacts/docs/2026-09-07-remaining-work.md:32`).

**Replacement (RED today):**

```
Machine acceptance, in this order — the visual gates first, hygiene last:
  1. preset-reach: 0 unmatched samples of 96 (2.1).
  2. contrast-as-painted: 0 failing pairs (2.8).
  3. focus rings: outline-none count <= focus-visible:ring count (§1/C).
  4. literal-colour lint: 0 occurrences outside the allow-list (2.2a).
  5. seed truth: `store-profile:up <id>` exits non-zero when seeded counts < catalog.counts. Proven by
     running it once against a deliberately truncated catalog and copying the non-zero exit code.
  6. validator truth: `validate-store-profile.mjs` with no arguments exits non-zero. Proven by
     `node scripts/validate-store-profile.mjs; echo $?`.
  7. the visual verdict document, zero "does not match" rows.
  8. then: tsc 0, lint clean, build 0, tests green with reverse runs red, git status clean, no file
     over 1 MB.
Checks 3, 4, 5 and 6 are RED on the pilot as it stands, measured: 18 vs 4; 168 occurrences; exit 0 on a
failed seed; exit 0 with no arguments.
```

### 2.11 — brief lines 37 and 46, the gates that cannot stop

> line 37: "Gate: the orchestrator checks every numbered section exists … **no Ivan wait**."
> line 46: "A failure on background/lighting is a prompt-template problem: rewrite the template and continue with the next product … **Nothing stops this stage.**"

**What they can prove:** that the pipeline runs to the end without human contact, which was the order
(line 7: "Nothing in this run may wait on Ivan except the two Stop gates below").

**What they cannot prove:** anything, because a gate that cannot stop is a measurement, not a gate. The
brief has exactly one blocking gate, line 64: "**Stop gate 2 = Ivan's eyes**". The consequence is stated
in the registry, `processFailures[2]`: "The orchestrator did not run it, so **the first human to see the
rendered store was Ivan**."

**Replacement (RED today):**

```
Autonomy means no wait on IVAN, not no gates. This brief carries five gates that block the pipeline and
are cleared by an AGENT, not by Ivan: G-ZONE (before launch), G-PAINT, G-FOCUS, G-COPY, G-VISUAL. A
blocked gate stops the stage that failed it, and the orchestrator either fixes the input and re-runs the
stage or emits `blocked` with the measurement. Ivan is reached only at the end, and only after G-VISUAL
has passed with a verdict document carrying zero "does not match" rows.
```

### 2.12 — brief line 74 and the ≤120k budgets: the budget question, answered

> line 25: "## S1. Foundation — three zones in parallel, file sets disjoint (three Opus agents, **≤120k each**)"
> line 74: "Batches sized so that output plus reading exceeds boot (rule 25d): one agent per stage, not one per product."

The fact: S1b spent **298.7k** against ≤120k — 2.5x
(`artifacts/docs/2026-09-07-pilot-agent-runs.md:17`, and line 48 of the same file records that only 2 of
the 7 agents have any token figure at all; the other 5 are "н/д, и это честное «нигде не записано»").

**Was the budget derivable from the task as written? No — and the task text says why, in four places.**

1. **The stage's own input size was declared unmeasured.** Line 14: "`@medusajs/ui-preset` 2.19.0
   declares 88 variables (**counts from the theme-presets brief, recount**)". The brief budgeted against
   a number it simultaneously flagged as needing a recount. S1b recounted and found **113**
   (`.ai/progress.md:104`: "token map = **113** preset variables, NOT the brief's 88 — the 88 counts only
   the colour groups, effects add 25"). +28 % of rows before a line of work. A budget derived from a
   number the brief itself distrusts is not derived.

2. **The stage's acceptance lives outside its zone.** Line 29's last deliverable is T0h.5 — four pages
   rendered in a browser, twice. Rendering four pages exercises the whole app, not
   `styles/**` + `lib/theme/**`. Line 25's promise, "file sets **disjoint**", is a statement about
   *writes*; a render is a *read* of every file. So the one deliverable whose cost is unbounded by the
   zone was placed inside a zone-sized budget. What it actually cost is on the record twice:
   `artifacts/docs/2026-09-07-pilot-agent-runs.md:17` ("ждал компилирующуюся страницу для T0h.5") and
   `.ai/progress.md:79` and `:94`, two separate cross-zone breakages that the orchestrator had to repair
   while S1b waited.

3. **The stage was given a deliverable it was forbidden to complete.** Line 29 orders a build script
   invoked as `themes:build`; line 78 forbids the agent to write it: "no `package.json`/lockfile edits by
   agents (they ask you through the report)". `.ai/progress.md:100-101` records the hand-back. A
   deliverable that must round-trip through another actor cannot be costed against the agent's own
   context.

4. **The comparison inside the brief refutes its own numbers.** S2 — one Markdown document — was given
   ≤100k (line 35). S1b — eight deliverables, one of them a browser loop across another agent's
   unfinished code — was given ≤120k (line 25). A 20 % spread across a 10x difference in kind is not a
   budget; it is a habit.

**What in the task description should have told the author the number was wrong:** the presence, inside a
single stage, of a deliverable whose completion depends on code no one has written yet. That is
detectable mechanically at authoring time: *does this stage's acceptance require the application to
render?* If yes, its cost is not a function of its file zone and it cannot share a budget with a stage
whose acceptance is a file.

**Replacement (the rule the template uses):**

```
Budget rule. A stage is budgeted from three declared quantities, written into the stage itself:
    budget = 40k boot+context-pack
           + 2k x (files the zone requires the agent to EDIT)
           + 40k if the stage's acceptance requires the application to render
           + 30k per external artefact the agent must read but not write (a style board, a schema set)
A stage whose acceptance requires a render is NEVER scheduled concurrently with a stage that edits the
code it renders. If the arithmetic exceeds 200k, the stage is split — that is the split signal, not a
judgement call.
Overrun handling: an agent that reaches 80 % of its budget stops and reports the remaining work as a
thin envelope; the orchestrator either extends the budget explicitly, in writing, with a reason, or
splits the remainder into a second agent. Every agent's ACTUAL token spend is recorded in
`.ai/progress.md` at the moment it returns — on 2026-09-07 five of seven were never recorded.
```

---

## 3. THE TEMPLATE — brief for one store profile, parameterised by `<PROFILE_ID>`

Everything between the rulers is the deliverable. Substitute the eight parameters in the header block and
it launches unedited. Written in English per rule 3a.

Parameters: `<PROFILE_ID>` `<VERTICAL>` `<BACKEND_PORT>` `<STOREFRONT_PORT>` `<DB_NAME>` `<TASK_ID>`
`<ARCHITECT_SESSION>` `<PROGRAMME_ROW>` (the row of `docs/store-profiles/00-program-2026-09-07.md` §5).

---

# Orchestrator brief: store profile `<PROFILE_ID>` — end to end (upready-store)

Parameters of this run, substituted before launch:

| Parameter | Value |
|---|---|
| `<PROFILE_ID>` | e.g. `supplements` |
| `<VERTICAL>` | the §5 row's vertical, options, palette character, photo aspect, fonts, hero style |
| `<BACKEND_PORT>` / `<STOREFRONT_PORT>` | e.g. `9024` / `8029` — never `:9022`, `:8027`, `:8002`, `:9023`, `:8028` |
| `<DB_NAME>` | `upready_store_<PROFILE_ID>` on Postgres `5433` |
| `<TASK_ID>` | the HANDOFF task id Ivan approved |
| `<ARCHITECT_SESSION>` | the ListAgents id to report to |

Language of this brief and of every prompt you send to an agent: English (rule 3a). Decisions:
`docs/store-profiles/00-program-2026-09-07.md`; where this brief and the programme disagree, the
programme wins on *what*, this brief wins on *how it is proved*. Schemas: `specs/store-profiles/*.schema.json`,
`specs/design-system/theme-preset.schema.json`. You work in the worktree for this profile's branch.

## 0. What is already built, and what this run must not rebuild

The `sneakers` pilot built the foundation and it is not rebuilt per profile: the `STORE_PROFILE` seed
switch and price-ratio table, the 113-row theme bridge and `themes:build`, the pre-paint script and font
allow-list, the profile blocks (`profile-hero`, `category-tiles`, `promo-banner`, `image-frame`), the
Replicate driver, `store-profile:validate` and `store-profile:up`. Recount before relying on any number
in this brief.

The pilot also left a debt this brief pays off **once**, on the first profile launched after it, and
which the S-REPAINT stages below will find already clean on every later profile. Measured on 2026-09-07
in `apps/storefront/src`:

- `globals.css:31-34` sets a background on `html` and no colour anywhere; `app/layout.tsx:33` is a bare
  `<body>`; no `body {}` rule exists in `src/styles`.
- **168 literal colour occurrences in 44 files** (`grep -roE "(bg|text|border)-(white|black|neutral-[0-9]|gray-[0-9]|grey-[0-9]|zinc-[0-9])" .`).
- **18 `outline-none` against 4 `focus-visible:ring-`**.
- `tailwind.config.js:4` is `darkMode: "class"`; nothing sets a `dark` class; `themes.css` switches on
  `data-mode` (9 selectors). The dark variant is wired to a selector nothing sets.
- **0 `dark:` utilities** in the whole storefront.

## 1. The zone identity — checked by you BEFORE you launch anyone

Every stage below carries a zone as a set of glob paths. Their union must equal the storefront tree
exactly, with no file counted twice and none left over. Prove it by arithmetic, not by reading:

```sh
cd apps/storefront/src
TOTAL=$(find . \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" \) | wc -l)
Z1=$(find ./modules/layout ./styles -type f \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" \) | wc -l)   # +1 for app/layout.tsx
Z2=$(find ./modules/checkout \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" \) | wc -l)
Z3=$(find ./modules/products ./modules/cart ./modules/order \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" \) | wc -l)
Z4=$(find ./modules/store ./modules/categories ./modules/collections ./modules/home ./modules/shipping \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" \) | wc -l)
Z5=$(find ./modules/skeletons \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" \) | wc -l)
Z6=$(find ./modules/common \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" \) | wc -l)
Z7=$(find ./modules/account \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" \) | wc -l)
Z8=$(( $(find ./app \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" \) | wc -l) - 1 ))                     # app minus layout.tsx
Z9=$(find ./lib ./i18n ./types \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" \) | wc -l)                 # + middleware.ts
echo $(( Z1 + 1 + Z2 + Z3 + Z4 + Z5 + Z6 + Z7 + Z8 + Z9 + 1 )) vs $TOTAL
```

Measured 2026-09-07: `13+2+1 | 29 | 36 | 20 | 15 | 48 | 21 | 42 | 79+1` = **307 = TOTAL**. If the two
numbers differ, a file belongs to no stage: **that is a defect in this brief and you fix the brief before
launching an agent.** Zone qualifiers that narrow a zone inside a file ("head only", "for the aspect
only") are forbidden — whoever owns a file owns every line of it.

**G-ZONE (blocking, cleared by: you, before S1).** The identity above holds.

## 2. The five gates that block

Named, so a stage report can say which one it cleared. Each is cleared by an AGENT; none waits on Ivan.

| Gate | Measurement | Pass condition |
|---|---|---|
| **G-ZONE** | the arithmetic of §1 | sums equal, 0 unowned files |
| **G-PAINT** | 24 routes x 2 modes x 2 viewports; computed `background-color` of `body`, `header`, `footer`, and every visible element ≥ 40x40 px matching `nav, aside, dialog, [role=dialog], [data-testid]`; each must equal a value declared for the active preset in `src/styles/themes.css` | **0 unmatched samples**; the full table printed |
| **G-FOCUS** | `grep -roE "outline-none" src \| wc -l` ≤ `grep -roE "focus-visible:ring" src \| wc -l`; plus, on the 5 highest-traffic routes, every focusable element's focus-visible outline or box-shadow contains the preset `--ring` | **count identity holds AND 0 elements fall back to the user-agent ring** |
| **G-COPY** | per product: deltaE between the render's sampled dominant hex and the catalog colourway hex; plus a blind read-back by an agent that did not write the copy | **deltaE < 12 for every product; blind read-back matches for ≥ N-1 of N** |
| **G-VISUAL** | the creative director, given the screenshots of §S7 and the contact sheet, writes a verdict document with one row per checked item: `matches` / `does not match` + reason | **the document exists, covers every route in the route list, and carries 0 `does not match` rows** |

A blocked gate stops its stage. You fix the input and re-run, or you emit `blocked` with the measurement.
**You never hand the stand to Ivan with a gate open.**

## 3. Stages

Budget arithmetic used throughout: `40k boot+context + 2k x (files to EDIT) + 40k if acceptance requires
a render + 30k per external artefact read`. A stage over 200k is split. An agent at 80 % of budget stops
and reports the remainder as a thin envelope. **You record every agent's actual token spend in
`.ai/progress.md` the moment it returns** — on the pilot, 5 of 7 were never recorded.

### S0 — setup (you, no agents)

Task intake (rule 22j), `corepack pnpm install` in the worktree only, envs copied and patched to
`<BACKEND_PORT>`/`<STOREFRONT_PORT>`/`<DB_NAME>`/`STORE_PROFILE=<PROFILE_ID>`, `.gitignore` media rules
re-verified with `git check-ignore -v` (the pilot found `apps/backend/.gitignore:12` `!src/**`
re-including profile media — re-check, do not assume it is still fixed), baseline stand up, `.ai/progress.md`
started. Then **G-ZONE**.

**Acceptance:** `git check-ignore -v` exit codes copied for 4 paths; `/health` 200 on `<BACKEND_PORT>`;
the G-ZONE arithmetic printed with both totals. **Budget:** yours.

### S1 — style board `<PROFILE_ID>` (creative director, 1 Opus agent)

As the pilot's S2, with the §5 row `<PROGRAMME_ROW>` as input, the geist-kit canon, and the
`theme-preset.schema.json` key set. Output `data/profiles/<PROFILE_ID>/design/style-board.md`.

**Acceptance, as a measurement:** 9 numbered sections present; ≥ 30 fg/bg contrast pairs computed by a
script that exits non-zero on failure, minimum ratio ≥ 4.50:1, values copied from its output; ≥ 5 ASCII
mock-up frames each naming its state; **0 contradictions** in the cross-document table (every numeric
range named both here and in this brief — price band, product count, category count, shot count — must
match, and every prompt template must be checked against the assortment it will apply to: a template
saying "shoe" against a catalog line saying "care kit" is a contradiction). The pilot returned 2
contradictions here and both shipped.

**Budget:** 40k + 0 edits x 2k + 0 render + 30k (canon + schema) = **≈70k, cap 100k.** Reasoning: one
document, two external artefacts read, nothing rendered.

### S2 — catalog and image briefs (merchandiser, 1 Opus agent), after S1's brand section

As the pilot's S3. Output `data/profiles/<PROFILE_ID>/catalog/*.json` + `i18n/{en,de,fr,es,ru}.json`.

**Acceptance, as a measurement:** 12–16 products, 3–5 categories in 2 levels, 2 collections; every
description 300–1400 chars; 6–10 spec rows per product; ≥ 2 single-variant products; `store-profile:validate`
run **in place against the repo path** (never a scratchpad fixture — the pilot's S3 green came from a
throwaway fixture) with its exit code and counts pasted; **blind read-back**: 3 descriptions chosen at
random by you, titles stripped, identified correctly by an agent that did not write them — 3 of 3.

**Budget:** 40k + 0 edits x 2k (writes data, not code) + 0 render + 30k (style board) + 30k (schemas) =
**≈100k, cap 120k.**

### S3 — images (image producer, 1 Opus agent driving the script)

As the pilot's S4: the batch runs in `apps/backend/scripts/store-media/generate.mjs`, not in the agent's
context. Bytes to disk, raw never deleted, no provider URL outside the sidecar. Render count fixed by
Ivan's standing rule: one hero frame per product + 1 banner + 4 tiles.

**Acceptance, as a measurement:** renders = products + 5, exactly; accepted + flagged = renders;
manifest rows = files on disk = sha256 rows (recounted by you, three independent counts printed);
**cost read from the provider or, if the provider does not expose it, the field is `null` and the report
says "unmeasured", never `0`** — the pilot wrote `totals.costUsd: 0` for an unmeasured cost
(`artifacts/docs/2026-09-07-remaining-work.md:46`); flagged frames listed in `second-pass.json` with file,
reason and suggested prompt change.

**Budget:** 40k + 0 edits x 2k + 0 render (the images render, the app does not) + 30k (style board) +
30k (catalog) = **≈100k, cap 150k** — the cap stays above the arithmetic because per-frame judgement
against the checklist scales with the frame count. Pilot actual: 122.1k for 19 frames.

### S4..S10 — REPAINT (7 agents, disjoint zones, together covering the whole tree)

Each repaint agent has the same order and a different zone. **Order, identical for all seven:**

```
Replace every literal colour class in your zone with a canon token or a `-ui-` token that the bridge
reaches. Rules:
  - A literal colour is bg-|text-|border-|ring-|divide-|from-|to-|via- followed by
    white|black|neutral-N|gray-N|grey-N|zinc-N. Your zone must reach 0 of them, or the exception is
    added to `src/styles/allow-literal-colours.json` with a one-line reason and you name it in the report.
  - Every `outline-none` you touch gains `focus-visible:ring-2 focus-visible:ring-[var(--ring)]` in the
    same class list.
  - You replace with TOKENS, not with `dark:` variants. A `dark:` variant is a last resort and each use
    is listed in your report with the reason it could not be a token.
  - You do not change layout, spacing, structure or copy. A diff line that changes anything but a colour
    class, a focus ring or an import is a defect in your run.
Report: files touched, occurrences removed (before/after counts from the exact grep), allow-list entries
added with reasons, `dark:` uses with reasons.
```

| Stage | Zone | Files (2026-09-07) | Literal occ. | Budget | Reasoning |
|---|---|---|---|---|---|
| **S4 chrome** | `modules/layout/**`, `app/layout.tsx` (**whole file, including `<body>`**), `styles/**` | 16 | 15 + the page-root rule | **120k** | 40 + 16x2 = 72k, +40k because this stage owns the page-root paint and must prove it in a browser |
| **S5 checkout** | `modules/checkout/**` | 29 | 6 | **100k** | 40 + 29x2 = 98k; no render of its own, it is proved by G-PAINT at S8 |
| **S6 commerce** | `modules/products/**`, `modules/cart/**`, `modules/order/**` | 36 | 14 | **115k** | 40 + 36x2 = 112k |
| **S7 browse** | `modules/store/**`, `modules/categories/**`, `modules/collections/**`, `modules/home/**`, `modules/shipping/**` | 20 | 24 | **80k** | 40 + 20x2 = 80k |
| **S8 skeletons** | `modules/skeletons/**` | 15 | **79** | **70k** | 40 + 15x2 = 70k; highest occurrence density, lowest judgement — mechanical |
| **S9 shared** | `modules/common/**` | 48 | 7 | **140k** | 40 + 48x2 = 136k; largest file count in one zone |
| **S10 account + routes** | `modules/account/**`, `app/**` except `app/layout.tsx` | 63 | 20 | **170k** | 40 + 63x2 = 166k; split further if the arithmetic exceeds 200k on the day |

**Non-visual zone, owned by nobody and asserted by you:** `lib/**`, `i18n/**`, `types/**`,
`middleware.ts` (80 files). Measured 2026-09-07: **0 literal colour occurrences.** Your assertion is that
it stays 0 — one grep, printed.

**S4's extra deliverable, which no other stage may take:**

```
Page-root paint. `apps/storefront/src/styles/globals.css` must set BOTH properties on the page root, in
one rule no preset can bypass:
    html, body { background: var(--background); color: var(--foreground); }
Setting only the background is the defect this replaces (globals.css:31-34 on 2026-09-07 carried
`html { @apply bg-ui-bg-base; }` with no colour, so every inheriting heading rendered browser-black on an
ink page).
Dark-variant wiring, same commit: `tailwind.config.js` becomes
    darkMode: ['selector', '[data-mode="dark"]'],
Proven by a throwaway element carrying `dark:bg-red-500` computing to red under `data-mode="dark"` and
not red under `data-mode="light"`, both from getComputedStyle, then removed.
```

**Acceptance of every repaint stage, as a measurement:** before/after occurrence counts from the exact
grep, its own zone at **0** outside the allow-list; `tsc --noEmit` 0; the diff contains no line that
changes anything but a colour class, a focus ring or an import (you spot-check 10 hunks).

**Scheduling.** The seven repaint stages edit disjoint file sets and none of them requires a render, so
they run in parallel. **No stage whose acceptance requires a render is scheduled while these are
running** — that is the rule the pilot broke, and it cost 298.7k against a 120k budget.

### S11 — theme, assembly, stand (theme engineer + profile engineer, 1 Opus agent each)

`theme.json` from the style board through the bridge dictionary (same key set as the existing presets,
`N keys, 0 missing`); `profile.json` complete; `themes:build`; `build-profile.mjs`; `next build`;
`store-profile:up <PROFILE_ID>`.

**Acceptance, as a measurement:** `N keys, 0 missing` printed; seed counts from the database read with
`psql`, not from the log, and equal to `catalog.counts`; `store-profile:up` **exits non-zero when the
seeded count is below `catalog.counts`** — proven once by running it against a deliberately truncated
catalog and copying the non-zero exit (the pilot measured exit 0 on a seed that produced 0 products);
`validate-store-profile.mjs` with no arguments exits non-zero — proven by
`node scripts/validate-store-profile.mjs; echo $?` (the pilot measured exit 0).

**Budget:** 40k + ~6 files x 2k + 40k render + 30k style board = **≈120k each, cap 140k.**

### S12 — VISUAL GATE (creative director, 1 Opus agent) — **blocking, G-VISUAL**

Screenshots of every route in the route list at 1280x800 and 390x844, both modes, plus the contact sheet,
are handed to the creative director who wrote the style board. Its output is a verdict document with one
row per checked item and the words **matches** / **does not match** plus a reason.

**Acceptance, as a measurement:** the verdict document covers **every** route (24 on 2026-09-07, not 5)
and carries **0** `does not match` rows. The screenshots themselves are an input, never evidence — their
file sizes are not a result.

This stage is the one the pilot skipped. `artifacts/registries/theme-surface-defects.json`,
`processFailures[2]`: "The orchestrator did not run it, so the first human to see the rendered store was
Ivan."

**Budget:** 40k + 0 edits + 40k render + 30k style board = **≈110k, cap 120k.**

### S13 — adversarial verification (verifier, 1 Opus agent)

Starts from a DROP of `<DB_NAME>` and reseeds from scratch. Playwright in Docker. Runs **G-PAINT**,
**G-FOCUS**, the contrast-as-painted check, and tries to refute S3's manifest numbers and the seed's
prices.

**Acceptance, as a measurement:** G-PAINT 0 unmatched of (routes x 2 x 2 x selectors) samples, table
printed; G-FOCUS count identity plus 0 user-agent fallbacks; contrast-as-painted ≥ 4.5:1 for body text
and ≥ 3.0:1 for large text on every sampled node, every pair printed; every product image
`naturalWidth > 0`; variant selection changes price and SKU; prices in 3 currencies; no raw id in visible
text; at 390 px `scrollWidth ≤ clientWidth` for every title and price; manifest rows = files = sha256;
3 regional prices recomputed by hand. Every check with its reverse run, the reverse run RED.

**Budget:** 40k + 0 edits + 40k render + 30k (manifest + catalog) + 30k (the reports it refutes) =
**≈140k, cap 160k.**

### S14 — handover (you)

Commits per path with `IVAN_OK=1` and literal pathspecs, HANDOFF `task update --append-details` with the
numbers, `session log`, `orchestrator.mjs emit --kind done`, `SendMessage` to `<ARCHITECT_SESSION>` with
the URL, ports, pids, the verify report path, the G-VISUAL verdict path, the cost total (or the word
`unmeasured`), and everything the verifier could not confirm. **Stop gate = Ivan's eyes**, reached only
with all five gates green. No push.

## 4. Machine acceptance, in order

1. **G-PAINT**: 0 unmatched samples.
2. **contrast-as-painted**: 0 failing pairs.
3. **G-FOCUS**: `outline-none` count ≤ `focus-visible:ring` count, 0 user-agent fallbacks.
4. **literal-colour lint**: 0 occurrences outside `src/styles/allow-literal-colours.json`.
5. **seed truth**: `store-profile:up` exits non-zero on a short seed, proven.
6. **validator truth**: no-argument invocation exits non-zero, proven.
7. **G-VISUAL**: verdict document, all routes, 0 `does not match`.
8. **G-COPY**: deltaE < 12 for every product, blind read-back ≥ N-1 of N.
9. then, and only then: `tsc` 0, `next lint` clean, `next build` 0, unit + Playwright green with reverse
   runs red, `git status` clean, no file over 1 MB in the commits, the `.gitignore` media rules present.

## 5. Ivan, on `http://localhost:<STOREFRONT_PORT>/en`, without reading any report

The home page reads as a `<VERTICAL>` brand's shop, not the starter. The photo shows the product the
title names. Descriptions read as written by a shop. Options can be chosen and the price changes. **The
palette is one and the same on the home page, the listing, the product page, the cart drawer, the
checkout, the account area, the mobile menu, the footer and every loading state** — every one of those
surfaces is named in a stage zone above, and G-PAINT measured every one of them before this sentence was
allowed to be shown to him. On a phone width no title or price is cut.

## 6. Off-limits

No edits in the main checkout or under `node_modules`; no `pnpm install` outside the worktree; no
deletion of any file under `artifacts/media/` (paid renders); no provider URL in JSON, TS or MD outside
the sidecars; no real brand names or logos in copy or renders; no push; no commit without the `IVAN_OK=1`
prefix and literal pathspecs; no `/compact`-style summaries in place of numbers; no new UI library.
**Agents may not edit `package.json` — so a stage that needs a package script names it in its report and
you apply it; do not order an agent to produce a script it cannot write.**

## 7. Reporting

`orchestrator.mjs emit --task <TASK_ID>` after S0 and after each stage, `blocked` from any of the five
gates. `.ai/progress.md` holds the running state **and one row per agent recording its actual token
spend at the moment it returns**. Questions only the architect can answer → `SendMessage` to
`<ARCHITECT_SESSION>` plus the emit.

## 8. Launch prompt

```
[AGENT: orchestrator store-<PROFILE_ID>] [MODEL: opus] [DIR: <WORKTREE>] ultracode. Read this brief
first, then docs/store-profiles/00-program-2026-09-07.md §5 row `<PROFILE_ID>` and
specs/store-profiles/*.schema.json. Ivan has approved <TASK_ID>; set it in_progress with the two-call
unlock of rule 22j, take the orchestration consent (touch "$TMPDIR/claude-orch-ok-<sid>" as its own
call), then run S0-S14 autonomously to the end. G-ZONE before you launch anyone: if the zone arithmetic
does not close, fix this brief first. The five gates block and are cleared by agents, not by Ivan; you
never hand the stand over with one open. One frame per product, no regenerations — flagged frames go to
second-pass.json. Every subagent on Opus or higher, prompts in English, commits per path with the
IVAN_OK=1 prefix, no push, never touch :9022, :8027, :8002, :9023 or :8028. Report by orchestrator.mjs
emit and SendMessage to <ARCHITECT_SESSION>; hand over when http://localhost:<STOREFRONT_PORT>/en has
passed G-VISUAL.
```

---

*(end of template)*

---

## 4. What the template deliberately does NOT fix

Named here so nobody reads §3 as covering more than it does.

1. **It does not repaint the storefront by itself.** S4–S10 carry the order and the zones, but the
   168-occurrence debt is paid by the *first* profile launched after the pilot. If wave 2 launches nine
   profiles in parallel, nine agents will race on the same shared components. **The repaint must run once,
   on its own branch, merged to `dev`, before the nine start.** The template cannot enforce cross-run
   sequencing; that is the architect's scheduling decision and it is not made here.

2. **It does not decide the light/dark question for the other nine profiles.** The programme's §5 assigns
   `dark` to `sneakers`, `electronics` and `accessories` and light or unstated modes to the rest. The
   template proves whichever mode a profile declares, in both modes — it does not tell the architect
   whether shipping seven light profiles before the dark ones would have been the cheaper order. It would
   have been, and that observation is offered, not encoded.

3. **It does not cover hover, active or pressed states.** G-FOCUS covers focus-visible only, because
   focus is the state with a token (`--ring`) and a mechanical count (`outline-none`). Hover and pressed
   have neither, and the registry lists them under `notChecked`. Inventing a gate for them without a
   token to measure against would produce another criterion that proves the wrong thing — the exact
   failure this retro is about.

4. **It does not validate prose quality beyond the blind read-back.** Three random descriptions
   identified by a second agent is a cheap binary signal, not an editorial standard. "Reads as written by
   a shop, not by a model" (brief line 70) remains a human judgement; the template makes it reach a human
   (the creative director at S12) rather than pretending to measure it.

5. **It does not address the image cost measurement.** Replicate did not expose a billed amount anywhere
   the pilot looked (`artifacts/docs/2026-09-07-remaining-work.md:46`). The template forbids writing `0`
   for an unmeasured cost and requires the word `unmeasured`; it does not solve the measurement. That is
   a provider question for Ivan.

6. **It does not touch the deploy topology, the media host, or the R2 question.** Programme §11.2 and
   §11.3, explicitly out of scope for a per-profile run.

7. **It does not fix agent isolation.** The pilot ran seven agents in one worktree with no branch
   isolation (`artifacts/docs/2026-09-07-pilot-agent-runs.md:52-56`); collisions were resolved by the
   orchestrator twice. The template reduces the exposure — disjoint zones that actually cover the tree,
   and a rule that no rendering stage runs concurrently with an editing one — but it does not give each
   agent its own worktree. Whether wave 2 gets per-agent worktrees is a decision above this document.

8. **It does not rewrite the programme.** `docs/store-profiles/00-program-2026-09-07.md` remains the
   authority on *what* the ten profiles are. This template only changes *how a profile is proved done*.
   The one thing the programme should absorb from this retro is §6's role table: it assigns the creative
   director a "финальная проверка целостности по контакт-листу и скриншотам" (programme line 93) that no
   stage of the pilot's brief scheduled. In the template that is S12, a blocking stage with a named
   owner.
