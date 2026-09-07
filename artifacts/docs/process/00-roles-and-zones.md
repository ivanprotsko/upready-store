# §1 Roles · §2 The file-zone map

Module 1 of 4. Parent index: [`theme-creation-process.md`](./theme-creation-process.md).

---

## §1. Roles

Model tier: **every subagent on Opus or higher** — Ivan's word, and rule 5e yields to it
(`docs/store-profiles/00-program-2026-09-07.md:88`). A downgrade plan exists (catalog translations, WebP
transcoding, manifest recount, validator could run on Sonnet) and is **shown and not applied**; it is
switched on only by Ivan (`00-program-2026-09-07.md:100`). The "pilot evidence" column therefore records
what was *observed at Opus*, not a claim that a lower tier fails.

| Role | Owns (deliverables) | May never touch | Pilot evidence, measured at Opus | Status |
|---|---|---|---|---|
| **Orchestrator** | The DAG, zone identity, gate execution, commits (`IVAN_OK=1`, literal pathspecs), HANDOFF, run records, prompt assembly | Any file inside a live agent's zone; any repair while its owner still runs (§2.6) | Window hit **371k against a 250k limit** because agent reports were read into it (`artifacts/docs/retro/execution-analysis.md:304`); **45 of 98 critical-path minutes were orchestrator, not work** (`execution-analysis.md:76`) | **survives, narrowed** — its judgement work moves to scripts (`execution-analysis.md:319-332`) |
| **Creative director** | `design/style-board.md`; **and the G-VISUAL verdict** | Any code file; `theme.json` | 16 min for a 943-line, 9-section board, 32 contrast pairs, min 4.67 (`artifacts/docs/2026-09-07-pilot-agent-runs.md:14`, `artifacts/docs/2026-09-07-remaining-work.md:11`) | **survives, gains W8** — the programme assigned it the final integrity check (`00-program-2026-09-07.md:93`) and the pilot never scheduled it (`artifacts/registries/theme-surface-defects.json:226-230`) |
| **Merchandiser** | `catalog/*.json`, `i18n/*.json`, image briefs; **and the copy-vs-render reconciliation** | `theme.json`, `profile.json`, any storefront code | 24 min for 14 products, 225 variants, 5 locales (`pilot-agent-runs.md:18`, `remaining-work.md:13`) | **survives** — its second pass (W5) never ran (`pilot-agent-runs.md:22`) |
| **Image producer** | `artifacts/media/<id>/raw/**`, `data/profiles/<id>/media/**`, `media/manifest.json`, the prompt registry, the contact sheet | Catalog copy, `theme.json`, any storefront code | 27 min, 19 frames, 15 accepted, 4 flagged, **0 regenerations**; 122.1k tokens against 150k = 81 % (`pilot-agent-runs.md:19`, `remaining-work.md:17`) | **survives** — the only pilot budget confirmed by reality (`execution-analysis.md:377`) |
| **Theme engineer** | `data/profiles/<id>/theme.json`, `specs/design-system/themes/<id>.theme.json`, the bridge dictionary, `themes:build` | Storefront components; catalog; media | S1b: 61 min, **298.7k against 120k = 249 %** (`pilot-agent-runs.md:17`); 113 bridge rows, T0h.5 max 0.0606 % against a 0.1 % budget (`remaining-work.md:15`) | **survives, split from assembly** — its cost came from browser cycles, not the deliverable (`execution-analysis.md:363-366`) |
| **Profile engineer** | `profile.json`, `build-profile.mjs` output, the seed run, the stand | `theme.json` internals; catalog copy; repaint zones | S6a: 17 min including 4 cross-seam repairs and two database rebuilds (`pilot-agent-runs.md:20`, `execution-analysis.md:228`) | **absorbs the pilot's theme-assembler role** for per-profile work |
| **Seed engineer** | The `STORE_PROFILE` switch, price-ratio table, i18n merge, `store-profile:validate`, `store-profile:up` | Storefront; theme; catalog content | S1a: 33 min, 39/39 tests, 27 reverse runs, prices derived across 241 regions (`pilot-agent-runs.md:15`, `remaining-work.md:12`) | **foundation-only** — runs at F3, then never per profile |
| **Storefront blocks engineer** | `profile-hero`, `category-tiles`, `promo-banner`, `image-frame`, `lib/profile/**` | Theme files; catalog; media | S1c: 38 min, 18 mock-up frames, 3 components, 19+13 tests (`pilot-agent-runs.md:16`, `remaining-work.md:14`) | **foundation-only** — built once, inherited by all profiles (`artifacts/docs/2026-09-08-wave2-program.md:44`) |
| **Storefront repaint engineer** | The whole component surface: every literal colour replaced by a token, every `outline-none` given a ring, the page-root paint, the dark-variant wiring | Layout, spacing, structure, copy — a diff line changing anything but a colour class, a focus ring or an import is a defect in the run | **MISSING IN THE PILOT.** `nav`, `footer`, `cart-dropdown`, `side-menu`, checkout, skeletons, divider and the account area were in nobody's file set (`theme-surface-defects.json:214-218`) | **NEW (F1)** — once per wave, own branch, before any profile (`artifacts/docs/retro/brief-analysis.md:868-873`) |
| **Test engineer (gates)** | `tests/theme/coverage.pwspec.ts`, `tests/theme/lib/scan-surface.ts`, `tests/theme/fixtures.mjs`, the `theme:coverage` script | Any file the gate measures — it is the artefact under test | **MISSING IN THE PILOT.** T0h.5 proved a regression, not coverage (`theme-surface-defects.json:220-224`) | **NEW (F2)** — once per wave |
| **Verifier (adversarial)** | The `DROP` + reseed run, Playwright in Docker, the attempt to refute every other role's numbers | Any production file; writes only its own report | **NEVER RAN** (`pilot-agent-runs.md:22`) | **survives on paper, unmeasured** |
| **Ivan (owner)** | The stop gate; task approval; money; push/PR/merge; the flagged-frame decision | — | Was the first human to see the rendered store (`theme-surface-defects.json:228`) | **survives, but is no longer the first human** |

### 1.1 Which of the pilot's eight roles survive, merge, or were missing

- **Survive unchanged:** creative director, merchandiser, image producer, theme engineer, verifier.
- **Merge:** the pilot's *theme assembler* (S6a) was the profile engineer and the theme engineer doing two
  jobs in one window. This process separates them, because W4 depends on the style board alone and not on
  the catalog (`2026-09-08-wave2-program.md:60`) — the pilot lost an hour to not knowing that: the palette
  existed at 20:42 and the theme stage started at 21:47 (`2026-09-08-wave2-program.md:193`).
- **Demoted to foundation:** seed engineer and storefront blocks engineer. Both built once; neither recurs
  per profile (`2026-09-08-wave2-program.md:44`).
- **Missing, now named:** the **storefront repaint engineer** (root causes A, B, C and D had no owner) and
  the **test engineer** who builds the coverage gate.
- **Not a missing role — a missing step:** the visual gate. The creative director already owned it in the
  programme (`00-program-2026-09-07.md:93`); nobody scheduled it. It is now W8.

---

## §2. The file-zone map

### 2.1 What a zone is, and why "disjoint file sets" was not enough

The pilot's brief said "three zones in parallel, file sets disjoint"
(`docs/prompts/initial-prompt-2026-09-07-orchestrator-store-profiles.md:25`). The file sets *were*
disjoint and the isolation still failed twice:

> Зона агента — это не множество файлов, которые он пишет, а множество файлов, которые **компилируются
> вместе с тем, что он пишет**. Два агента изолированы только если их замыкания компиляции не
> пересекаются. Разные dist-директории и порты изоляции не дают.
> (`execution-analysis.md:121`)

Measured: all seven pilot agents ran in one worktree `feat/store-profiles` with no per-agent branch; the
only separation was `.next-theme` / `.next-profile` and ports `:8031` / `:8033`
(`pilot-agent-runs.md:53-57`). Both failures went **through** that separation, because it separated the
**output**, not the **input** (`execution-analysis.md:117-119`).

### 2.2 The storefront map — 307 files, every one owned

Measured in this session, in `apps/storefront/src`:

```sh
find . \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" \) | wc -l        # → 307
find . -type f | wc -l                                                     # → 313
```

| Zone | Globs (relative to `apps/storefront/src`) | Files | Command | Owner role | Literal-colour occ. 2026-09-07 |
|---|---|---:|---|---|---:|
| **Z-CHROME** | `modules/layout/**`, `styles/**`, `app/layout.tsx` (**whole file**) | 16 | `find ./modules/layout ./styles \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" \) \| wc -l` → 15, `+1` for `app/layout.tsx` | repaint engineer | 15 + the page-root rule |
| **Z-CHECKOUT** | `modules/checkout/**` | 29 | `find ./modules/checkout …` | repaint engineer | 6 |
| **Z-COMMERCE** | `modules/products/**`, `modules/cart/**`, `modules/order/**` | 36 | `find ./modules/products ./modules/cart ./modules/order …` | repaint engineer | 14 |
| **Z-BROWSE** | `modules/store/**`, `modules/categories/**`, `modules/collections/**`, `modules/home/**`, `modules/shipping/**` | 20 | `find ./modules/store ./modules/categories ./modules/collections ./modules/home ./modules/shipping …` | repaint engineer | 24 |
| **Z-SKELETONS** | `modules/skeletons/**` | 15 | `find ./modules/skeletons …` | repaint engineer | **79** |
| **Z-COMMON** | `modules/common/**` | 48 | `find ./modules/common …` | repaint engineer | 7 |
| **Z-ACCOUNT** | `modules/account/**` | 21 | `find ./modules/account …` | repaint engineer | 20 (with Z-ROUTES) |
| **Z-ROUTES** | `app/**` except `app/layout.tsx` | 42 | `find ./app … \| wc -l` → 43, minus 1 | repaint engineer | (see Z-ACCOUNT) |
| **Z-NONVISUAL** | `lib/**`, `i18n/**`, `types/**`, `middleware.ts` | 80 | `find ./lib ./i18n ./types … \| wc -l` → 79, `+1` for `middleware.ts` | asserted by the orchestrator, edited by nobody in a repaint | **0** |
| | **Total** | **307** | `16+29+36+20+15+48+21+42+80 = 307` | | |

The zone breakdown and the occurrence column are the retro's (`brief-analysis.md:716-726`); the totals were
re-measured here and agree. The occurrence figures come from
`grep -roE "(bg|text|border|ring|fill|stroke|from|to|via)-(white|black|neutral-[0-9]|gray-[0-9]|grey-[0-9]|zinc-[0-9]|slate-[0-9]|stone-[0-9])"`
= **44 files, 176 occurrences** (`theme-surface-defects.json:37`).

**Against the pilot: 20 of 302.** The pilot's two declared storefront zones covered 20 `.ts`/`.tsx` files
out of 302; **282 were in nobody's zone** (`brief-analysis.md:37`, `theme-surface-defects.json:246-251`).
The map above covers **307 of 307**.

### 2.3 The hole the retro's own arithmetic still leaves — 6 files

The `.ts`/`.tsx`/`.css` filter G-ZONE counts with is itself a zone boundary, and six files in
`apps/storefront/src` fall outside it. Measured:

```sh
find apps/storefront/src -type f ! -name '*.tsx' ! -name '*.ts' ! -name '*.css'
```

```
app/icon.svg
app/opengraph-image.alt.txt
app/opengraph-image.png
app/twitter-image.alt.txt
app/twitter-image.png
lib/profile/profile.generated.json
```

`cat apps/storefront/src/app/opengraph-image.alt.txt` returns, verbatim:

> "Production-ready Medusa DTC Starter: Medusa, Gorgo and Next.js logos next to a screenshot of the
> Clothing category page in the Gorgo Medusa Store storefront"

That is the starter's own promotional art, still shipped, still the share card of every profile
(`git log -1 --format=%s -- apps/storefront/src/app/opengraph-image.png` → `feat: rebuild the dtc starter
as a production-ready gorgo starter`). It is outside every zone the retro declared, outside the filter
G-ZONE counts with, and coverage rule R15 (`brand-string`) asserts brand identity over **rendered text**
only (`artifacts/docs/retro/output-and-gates.md:396`) — it cannot see a PNG.

| Zone | Globs | Files | Owner role |
|---|---|---:|---|
| **Z-BRAND-ASSETS** | `app/icon.svg`, `app/opengraph-image.*`, `app/twitter-image.*` | 5 | profile engineer (W6), input from the creative director's board |
| **Z-GENERATED** *(write-rule overlay, not a second owner)* | `lib/profile/profile.generated.json`, `lib/theme/{presets,fonts}.generated.ts`, `styles/themes.css` | — | written only by `build-profile.mjs` / `build-themes.mjs`; a hand edit is a defect even when correct, because the next build erases it |

`5 + 1 (profile.generated.json, already inside Z-NONVISUAL by path) + 307 = 313` = every file in
`apps/storefront/src`. Whether a per-profile OG image is worth a paid render is open — §10.2 of
[`03-failures-and-economics.md`](./03-failures-and-economics.md).

### 2.4 The backend and the rest of the tree — 429 + 83 files

The record never wrote a backend zone map: the pilot's brief gave S1a the whole of `apps/backend/**`
(`execution-analysis.md:115`). **The map below is mine**, derived from what the pilot's commits actually
touched — `git show --name-only --format= <c>` over `183ea30 ffd9df7 98a496a f66076f 3d67e11 616b09e
ee6cfff 55666fa b912aa3 890c8ea`. Counts measured with `find <path> -type f | wc -l`.

| Zone | Globs | Files | Owner role | Written in the pilot by |
|---|---|---:|---|---|
| **Z-PROFILE-DATA** | `apps/backend/src/migration-scripts/data/profiles/**` | 32 | split by sub-path, below | S2, S3, S4, S6a |
| **Z-SEED-CORE** | `migration-scripts/{lib,__tests__}/**`, `migration-scripts/data/**` except `profiles/`, `initial-data-seed.ts` | 316 | seed engineer (F3 only) | S1a (`3d67e11`); S6a touched `lib/products.ts` in `890c8ea` — a cross-zone edit, §7.10 |
| **Z-BACKEND-APP** | `apps/backend/src/{admin,api,emails,jobs,links,modules,subscribers,workflows}/**` | 81 | **nobody** — a profile never touches it; the orchestrator asserts `git status` clean here | untouched in all ten commits |
| **Z-SCRIPTS-BACKEND** | `apps/backend/scripts/**` | 7 | seed engineer (F3); image producer owns `store-media/**` | S1a, S4 |
| **Z-SCRIPTS-STOREFRONT** | `apps/storefront/scripts/**` | 3 | theme engineer (`build-themes.mjs`, `extract-theme-sources.mjs`); profile engineer (`build-profile.mjs`) | S1b, S1c, S6a |
| **Z-TESTS-STOREFRONT** | `apps/storefront/tests/**` | 19 | test engineer owns `tests/theme/**` (F2); blocks engineer owns `tests/profile/**` | S1b, S1c, S6a |
| **Z-SPECS** | `specs/**` | 15 | theme engineer owns `design-system/themes/**` + `token-map.json`; architect owns `store-profiles/*.schema.json` | S1b, S6a |
| **Z-CONFIG** | repo root (12), `apps/storefront` root (17), `apps/backend` root (10): `package.json`, `next.config.js`, `tailwind.config.js`, `tsconfig.json`, `next-env.d.ts`, `.npmrc`, `.gitignore`, `pnpm-lock.yaml`, env templates | 39 | **orchestrator only** | S0 commits `183ea30`, `ffd9df7`, `98a496a` |
| **Z-ARTIFACTS** | `artifacts/**` | append-only | each role writes its own report; only the orchestrator consolidates registries | every stage |

`32 + 316 + 81 = 429` = every file in `apps/backend/src`
(`find apps/backend/src -type f | wc -l` → 429).

Z-PROFILE-DATA sub-ownership, one owner per sub-path, no overlap:

| Sub-path | Owner | Step |
|---|---|---|
| `design/**` | creative director | W1 |
| `catalog/**`, `i18n/**` | merchandiser | W2, W5 |
| `media/**` | image producer | W3 |
| `theme.json` | theme engineer | W4 |
| `profile.json` | profile engineer | W6 |

**Z-CONFIG is orchestrator-only because the pilot proved agents cannot hold it.** Both S1b and S1c had to
ask the orchestrator to add `package.json` entries, and `next-env.d.ts` and `tsconfig.json` were being
rewritten under each agent's own `NEXT_DIST_DIR` — a commit would have pinned the repository to one agent's
directory (`execution-analysis.md:151`, `artifacts/docs/2026-09-07-s1c-profile-blocks-report.md:280-284`).
The rule that follows: **do not order an agent to produce a script it cannot write**
(`brief-analysis.md:832-833`).

### 2.5 The five zone rules

1. **Union identity.** The union of all zones equals the tree, exactly, no file counted twice and none left
   over. Proved by arithmetic before a single agent launches — gate **G-ZONE**
   (`brief-analysis.md:588-613`). **A file that belongs to no zone is not "out of scope"; it is a defect in
   the brief, and the orchestrator fixes the brief before launching.**
2. **No intra-file qualifiers.** "head only", "for the aspect only" and their kind are forbidden; whoever
   owns a file owns every line of it (`brief-analysis.md:611`). Those two phrases produced root causes A
   and B (`theme-surface-defects.json:246-248`).
3. **One writer per file, always.** Declared machine-readably per agent at
   `artifacts/wave2/zones/<agent>.json` (format at `execution-analysis.md:127-140`) and checked by
   `zones.mjs check`, which must exit 0 before a wave starts (checks 1–6 at `execution-analysis.md:143-152`).
4. **Compilation-closure isolation.** Two agents whose `writes` intersect the other's compilation closure
   are one failure domain: serialise them, give one a separate worktree, or make one the sole writer of the
   whole intersection (`execution-analysis.md:148`, exit code 2).
5. **Generated files are written by their generator only** (Z-GENERATED, §2.3).

### 2.6 What happens when a worker must touch another zone

The pilot's answer was "the orchestrator fixes it", and that answer produced the fourth incident: the
orchestrator's own cross-zone repair became the next blocker and its record called it a success
(`theme-surface-defects.json:232-237`). The replacement, in strict order:

| Situation | Action | Forbidden |
|---|---|---|
| Owner **still running** | The blocked worker writes `artifacts/wave2/repairs/<file>.json` — symptom, measured cause, proposed edit — and **switches to work that does not need the page**. The owner polls the queue. (`execution-analysis.md:166`) | `SendMessage` to a live child: it forks the agent and a second copy writes the same files (rule 22i, `execution-analysis.md:167`) |
| Owner **has finished** | The orchestrator may repair — and must then run **the owner's gate**, not its own. The pilot verified a repair with one `curl :8033 → 200` when the real criterion was the second agent's `next build` (`execution-analysis.md:166`) | Verifying a cross-zone repair by the route that happened to recover |
| Repair **done** | The record states what was measured **on the artefact the repair produced**, not the one it left behind (`theme-surface-defects.json:236`). The owner **ratifies** it — four of S6a's cross-seam repairs are unratified to this day (`artifacts/docs/2026-09-07-s6a-theme-assembly-report.md:238-239`) | Declaring success about the file you did not create |
| A **second repairer** | **Never.** A second agent repairing a live first agent's file reproduces the same class of incident (`execution-analysis.md:315`) | — |

Static pre-flight, which would have caught both pilot incidents in milliseconds and belongs in the launch
sequence and in the heartbeat:

- **L1** — in any CSS file every `@import` precedes every rule. Catches incident 1. *Domain fact that must
  be written into the comment: `tailwindcss/*` imports are inlined, so "line 16" looks legal to the eye.*
  (`execution-analysis.md:156`)
- **L2** — no top-level selector without a local class in `*.module.css`; no `:global(` substring in a
  plain `.css`. Catches incident 2 **and** incident 2b — the wrapper the repair carried into the new file.
  (`execution-analysis.md:157`)

Both are static, need no build, cost milliseconds, and address the class rather than the instance
(rule 20).

---

Next: [`01-steps.md`](./01-steps.md).
