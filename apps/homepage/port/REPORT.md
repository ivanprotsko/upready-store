# Merge report — landing port `apps/homepage/port` (2026-09-13 00:58 WITA)

Merger pass over the 16 section ports, per
`artifacts/docs/2026-09-12-homepage-landing-port-brief.md` §4.

**Headline number: full-page `diffPct` = 0.0003** (target ≤ 3) —
`http://localhost:5299/` vs `http://localhost:4790/index.html`, both `body`,
both 1440×5813, no size mismatch. 25 differing pixels on an 8.37 Mpx page.

**tsc**: `pnpm exec tsc --noEmit` → clean, exit 0 (`.logs/tsc.log`, empty).
**build**: `pnpm exec vite build` → exit 0, 80 modules, `dist/assets/index-CQdr8hZi.js`
290.03 kB (`.logs/build.log`).

---

## 1. What the merger changed

Files touched (merger-owned per §4, plus one two-line seam per numbered section):

| file | change |
|---|---|
| `src/App.tsx` | rewritten: shared `blocks`/`audience` state, the `order`/`num` counter, per-section visibility, `<Nav/>`+`<Footer/>` assembly |
| `src/PageShell.tsx` | **new** — the page chrome that belongs to no section: outer `#FAFAFA` page, sticky 60px header + logo, the shared `max-width:1280px` bordered container |
| `src/App.module.css` | **new** — those chrome styles, copied value-for-value from `apps/homepage/index.html` lines 55-79 |
| `src/main.tsx` | `?section=<slug>` now renders inside the same 1280px container; `?section=shell` gets the real sticky bar + logo |
| `src/sections/index.ts` | registry `Component` typed `ComponentType<SectionProps>` (`{ num?, children? }`) |
| `src/sections/<10 slugs>/index.tsx` | two lines each: `({ num }: { num?: string })` + `{num ?? <the data.ts literal>}` in the eyebrow |
| `src/styles/base.css` | **unchanged** — no cross-section seam needed one |

### «Needs from merger» items, and what happened to each

1. **Wrap every section in the `max-width:1280px; margin:0 auto; background:#fff;
   border-left/right:1px solid #E4E4E7` container** (`index.html:79`) — asked by all 15
   content sections. **Done**, in `PageShell`, and *also* applied to the isolated
   `?section=<slug>` preview so the per-section numbers below are measured on the same
   1278px frame as `reference/shots/*.png`. This is the single biggest cause of the
   before/after drop in the table.
2. **Sticky header bar + logo around `<Nav/>`** (shell/NOTES.md item 1) — **done** in
   `PageShell`, markup and styles from `index.html:57-61`, including `logoClick`
   (`e.preventDefault()`, dc-script.js:367). Seam: the port wraps `<nav>` in a
   `<header data-section="shell-nav">` root (contract §3.2) that the legacy page does not
   have, so `App.module.css` gives that wrapper `flex:1 1 auto; min-width:0` — without it
   `<nav>` never reaches its reference width. Measured effect: shell **3.777 → 0.0000**,
   `<nav>` exactly 1088×36 as on the reference page.
3. **Shared `show*` flags as one piece of state** (shell item 3, frame, tariffs, faq) —
   **done**: `DEFAULT_BLOCKS = {proof, frame, included, pricing, faq}` all `false`, the
   initial `state.blocks` of `reference/dc-script.js:2`. `reference/props.json` carries no
   `show*` key at all (only `defaultAudience: "cold"`, `showTodoMarkers: true`,
   `accentColor`), so dc-script.js is the only source for these defaults. `blocks` drives
   (a) which sections mount, via `isSectionVisible()` = `renderVals()` lines 339-340,
   (b) the three conditional nav links, passed to `<Nav/>` as props.
   **Measured against the live reference render** (`http://localhost:4790/index.html`,
   fresh profile): nine sections, numbered 01…07, `proof-full`/`proof-short`/`frame`/
   `included`/`pricing`/`faq` absent — the assembled port reproduces exactly that set,
   section for section, at identical heights.
4. **Page-wide eyebrow numbering** (frame, faq, payments, pricing, proof-full, showcase,
   included) — **done**: `pageNumbers()` in `App.tsx` is a 1:1 port of the `order`/`num`
   counter (dc-script.js:319-322) and the ordinal is passed down as an optional `num`
   prop. Each section keeps its data.ts literal as the fallback, so the isolated
   `?section=` preview is byte-identical to what the section agent measured. Without this
   the assembled page would have printed the all-blocks-on numbering (`06 · операции`)
   where the reference prints `03 · операции`.
5. **Nav anchors → section ids** — verified live, not assumed: all four visible nav
   anchors resolve, at byte-identical document offsets to the reference
   (`#sec-payments` 2173, `#sec-delivery` 3056, `#sec-showcase` 3562, `#sec-tariffs` 4529
   on both pages). The three flag-gated links (`#sec-included`, `#sec-pricing`,
   `#sec-faq`) render only when their block is on; their targets carry those ids.
6. **The floating admin/debug panel contaminating `reference/shots/*.png`** (raised by
   9 sections) — **not fixed, and not fixable from `App.tsx`**: it is baked into the
   reference *fixtures*, see open issue O1.

---

## 2. Per-section diff

`diffPct` after merge = `scripts/shot.mjs --url "http://localhost:5299/?section=<slug>"
--selector '[data-section="<slug>"]'` (shell: `[data-section="shell-nav"]`) into
`shots/out/merged/<slug>.png`, then `scripts/diff.mjs reference/shots/<slug>.png
shots/out/merged/<slug>.png`. Harness: `nohup pnpm exec vite --port 5299 >
.logs/merge.log 2>&1 &`, PID 96673, ready in 154 ms, killed after measuring (confirmed
gone: empty `ps -p 96673`, no listener on 5299).

| slug | agent | after merge | in the assembled page | open issues |
|---|---|---|---|---|
| shell | 3.7770 | **0.0000** | — (chrome) | — |
| hero | 1.5539 | **0.0008** | 0.0000 | — |
| launch-artifact | 2.8626 | **1.0708** | 0.0000 | O1 (all of it: 0.0015 with the panel masked) |
| social-proof | 2.3907 | **1.8172** | 0.0016 | O1, O2 |
| proof-full | 3.2914 | **0.7990** | not rendered (blocks.proof=false) | O1, O2 |
| proof-short | 1.7812 | **0.0036** | not rendered | — |
| frame | 6.1982 | **0.5235** | not rendered | O1 |
| included | 0.9426 | **0.5893** | not rendered | O1 |
| operations | 2.9343 | **2.2315** | 0.0003 | O1, O2 — over 2 standalone, pixel-identical in place |
| pricing | 2.5701 | **0.8846** | not rendered | O1 |
| payments | 2.5935 | **1.8655** | 0.0006 | O1, O2 |
| delivery | 0.3634 | **0.2510** | 0.0005 | O1 |
| showcase | 5.1880 | **1.5936** | 0.0001 | O1 (all of it: 0.0005 with the panel masked) |
| faq | 3.6062 | **2.5487** | not rendered | O1, O2 — the only gated section over 2 |
| tariffs | 3.3851 | **1.3705** | 0.0003 | O1 |
| final-cta | 3.7497 | **0.4016** | 0.0000 | O1 |
| **full page** | — | **0.0003** | 1440×5813, exact size match | — |

Column «in the assembled page» is the same section cropped out of the two **full-page**
screenshots at its measured band (x=81, w=1278) and diffed — i.e. the section as Ivan
will actually see it. Worst case there is 7 differing pixels (`social-proof`,
`payments`). Every section that renders by default is pixel-identical in place; the
standalone column above it measures the *fixture*, not the port (O1/O2).

---

## 3. Open issues

**O1 — the legacy admin panel is baked into every `reference/shots/<slug>.png`.**
`scripts/capture-reference.mjs` unlocks admin (`sessionStorage.upready_admin=1`) and
clicks the gear to reach the five block toggles, so the `position:fixed;left:16px;
bottom:16px` panel sits in frame for every per-section capture. Measured, not assumed:
blanking the left 230px of both images drops `launch-artifact` 1.0708 → **0.0015** and
`showcase` 1.5936 → **0.0005** (i.e. the panel *is* the entire residual for those two),
`operations` 2.2315 → 1.4392, `faq` 2.5487 → 1.8190, `payments` 1.8655 → 1.3480,
`social-proof` 1.8172 → 0.7714, `tariffs` 1.3705 → 0.4734. Fix belongs in the fixtures,
not in the port: re-run `capture-reference.mjs` with the panel closed after toggling
(one `gear.click()` before each capture), then re-measure. Nothing in `src/**` changes.

**O2 — ~1px vertical offset in the isolated capture.** Six reference shots are 1px
taller or shorter than the port's (`faq` 561 vs 562, `payments` 883 vs 884,
`social-proof` 340 vs 339, `frame` 622 vs 621, `final-cta` 459 vs 458, `proof-full` 861
vs 862), and re-diffing with the port's crop shifted one row down collapses most of what
is left: `faq` 1.4056 → **0.3546**, `operations` 1.2090 → **0.9068**, `payments` 0.9818 →
**0.6557** (all with the panel already masked). Sub-pixel rounding of the `clamp()`
paddings against a different ancestor chain in the isolated preview; it does not exist in
the assembled page (see the third column of the table). No action proposed.

**O3 — page-level chrome nobody ported.** Three root-level pieces of the legacy page are
outside all 16 sections and are *not* in the port: the payment modal
(`payPlan`/`payTg`/Tribute checkout, `index.html:1053-1096` — flagged by tariffs, which
already keeps `selectedPlan` local and would need one `onSelectPlan` prop), the admin
password modal (`index.html:1100-1109`) and the 600 ms long-press that opens it
(`startPress`/`endPress`, dc-script.js:5-9), and the admin/debug panel itself
(`index.html:1113-1136`, the five block toggles + the cold/warm/price audience switcher
that hero's and launch-artifact's notes flagged as orphaned). Consequence: nothing in the
port can flip a `show*` flag or the audience at runtime, so `proof-full`, `proof-short`,
`frame`, `included`, `pricing` and `faq` are mounted-capable but never visible — exactly
like the legacy page on a fresh visit. They stay reachable for review via
`?section=<slug>`. Ivan's call whether the port should carry an admin surface at all.

**O4 — `showTodoMarkers` is still per-section.** `props.json` defaults it to `true`;
`faq/data.ts` (and the todo badges in `included`, `pricing`, `final-cta`, the footer)
each hold their own copy. `App.tsx` exports `SHOW_TODO_MARKERS` as the page-level source
of truth but nothing consumes it yet — wiring it needs one prop per section that renders
a badge, which is section-owned surface. Listed, not done.

**O5 — audience resolution exists twice.** `hero/index.tsx` resolves `cold|warm|price`
from `?v=`/`?utm_content=`/`sessionStorage` on mount for its own headline variant;
`App.tsx` now runs the same `resolveAudience()` because it needs the audience to choose
between `proof-full` and `proof-short`. Both are faithful ports of dc-script.js:89-108
and both write the same `upready_v` key, so they cannot disagree — but the duplicate
should collapse into a prop when the port moves into the RR7 route.

**O6 — `launch-artifact` and `social-proof` do not take `num`.** Their ordinals
(`plans` → `01`, `logos` → `02`) are the first two entries of `order` and are `true`
unconditionally, so they cannot change; `launch-artifact` additionally bakes the ordinal
into a single `stepLabel` string (`"01 · тарифы"`). Left alone deliberately — no flag
combination makes them wrong.

**O7 — nothing was committed.** Per the task: no `git add`, no `git commit`, no
`pnpm install`, no deletions. The whole `apps/homepage/port/` tree is still untracked.

---

## 4. Reproduce

```
cd apps/homepage && python3 -m http.server 4790          # reference (already up, PID 83757)
cd apps/homepage/port && pnpm exec tsc --noEmit && pnpm exec vite build
nohup pnpm exec vite --port 5299 > .logs/merge.log 2>&1 & # wait for the "ready in" line
node scripts/shot.mjs --url http://localhost:5299/           --selector body --out shots/out/merged-fullpage.png
node scripts/shot.mjs --url http://localhost:4790/index.html --selector body --out shots/out/ref-fullpage.png
node scripts/diff.mjs shots/out/ref-fullpage.png shots/out/merged-fullpage.png
#   → {"diffPct":0.0003,"w":1440,"h":5813}
kill <the recorded PID>
```

Human-eyes acceptance (§5) is still Ivan's: open 5299 next to 4790 at 1440 px and walk
the page — the tariff tabs, the four card rails, the FAQ accordion (only reachable via
`?section=faq` until O3 is decided) and every nav anchor.
