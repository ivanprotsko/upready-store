# §3 The steps

Module 2 of 4. Parent index: [`theme-creation-process.md`](./theme-creation-process.md), which carries the
definition of done and the mapping from these ids to the pilot's `S`-codes and wave 2's `W`-codes.

Two blocks. **F1–F3 run once per wave**; **W0–W11 run once per profile**. The wave does not start until
F1–F3 are merged into `dev` (`artifacts/docs/2026-09-08-wave2-program.md:49`).

Each step is a fixed block: `owner`, `trigger`, `inputs`, `work`, `outputs`, `gate`, `acceptance`,
`evidence`, `duration`. `duration` gives the pilot measurement when one exists; otherwise it says **not
measured** and names any published extrapolation *as an extrapolation*.

---

## F1 — Storefront repaint

- **owner** — storefront repaint engineer (7 agents, one per storefront zone, run in parallel)
- **trigger** — `dev` is the base; branch `feat/store-theme-surface` created; **G-ZONE** green
- **inputs** — `artifacts/registries/theme-surface-defects.json` (root causes A/B/C/D); the zone map §2.2
- **work** — In your zone, replace every literal colour class with a canon token or a `-ui-` token the
  bridge reaches. A literal is `bg-|text-|border-|ring-|divide-|from-|to-|via-` followed by
  `white|black|neutral-N|gray-N|grey-N|zinc-N|slate-N|stone-N`. Your zone reaches 0, or the exception goes
  into `src/styles/allow-literal-colours.json` with a one-line reason named in your report. Every
  `outline-none` you touch gains `focus-visible:ring-2 focus-visible:ring-[var(--ring)]` in the same class
  list. **Replace with tokens, never with `dark:` variants**; each `dark:` use is listed with the reason a
  token could not express it. You change no layout, spacing, structure or copy — a diff line that changes
  anything but a colour class, a focus ring or an import is a defect in your run. (Order verbatim:
  `artifacts/docs/retro/brief-analysis.md:698-712`.)

  **Z-CHROME additionally owns two deliverables no other zone may take**
  (`brief-analysis.md:728-741`):
  ```
  html, body { background: var(--background); color: var(--foreground); }
  ```
  — **both** properties, in one rule no preset can bypass, in `src/styles/globals.css`; and
  ```
  darkMode: ['selector', '[data-mode="dark"]'],
  ```
  in `tailwind.config.js`, **in the same commit as the first repaint**, proved by a throwaway element
  carrying `dark:bg-red-500` computing to red under `data-mode="dark"` and not red under `light`, both from
  `getComputedStyle`, then removed.
- **outputs** — the repainted zone; `src/styles/allow-literal-colours.json`; a per-zone report with
  before/after grep counts
- **gate** — **G-LINT** and **G-FOCUS-COUNT**, both machine:
  ```sh
  cd apps/storefront/src
  grep -roE "(bg|text|border|ring|fill|stroke|from|to|via)-(white|black|neutral-[0-9]|gray-[0-9]|grey-[0-9]|zinc-[0-9]|slate-[0-9]|stone-[0-9])" . | wc -l
  test "$(grep -roE 'outline-none' . | wc -l)" -le "$(grep -roE 'focus-visible:ring' . | wc -l)"
  tsc --noEmit
  ```
  Baselines measured 2026-09-07: **44 files, 176 occurrences** (`theme-surface-defects.json:37`) and
  **18 `outline-none` against 4 `focus-visible:ring-`** (`theme-surface-defects.json:68`). **Both greps go
  RED on the tree as it stands** — that is the point of the numbers.
- **acceptance** — the orchestrator spot-checks 10 diff hunks for non-colour changes; per-zone before/after
  counts pasted (`brief-analysis.md:743-746`)
- **evidence** — `artifacts/docs/<date>-F1-<zone>-repaint.md` per agent; consolidated counts in
  `.ai/progress.md`
- **duration** — **not measured.** `2026-09-08-wave2-program.md:253` estimates F1+F2 together at 2–4 hours
  and explicitly excludes them from the wave schedule.

---

## F2 — The coverage gate

- **owner** — test engineer
- **trigger** — F1 in progress or complete on the same branch; the gate is authored against a tree whose
  defects are **known**, so it is written and proved on `sneakers` (`2026-09-08-wave2-program.md:47`)
- **inputs** — the gate specification at `artifacts/docs/retro/output-and-gates.md:293-427` — **cited, not
  re-derived**; `specs/design-system/themes/<preset>.theme.json`; `specs/design-system/token-map.json`
- **work** — Implement exactly that specification: `apps/storefront/tests/theme/coverage.pwspec.ts`; the
  in-page walker `tests/theme/lib/scan-surface.ts` (a pure function, unit-tested on a fixture DOM); the
  store-API fixtures `tests/theme/fixtures.mjs` (probe customer + one completed order, idempotent on
  `probe-coverage@example.com`, `output-and-gates.md:307`); and the script
  `pnpm --filter storefront theme:coverage`. Surfaces S01–S28 with their anchors:
  `output-and-gates.md:314-349`. What is measured on a surface: `:351-361`. The expected-token derivation:
  `:363-376`. Rules R1–R15: `:380-396`. Output format: `:400-420`.

  **Expected tokens are read from `theme.json`, never from `themes.css` — that file is the artefact under
  test — and never from the style board, which is a document, not a measurement**
  (`output-and-gates.md:309`). Mode is forced with `context.addInitScript` and then **asserted** on
  `html[data-mode]` before scanning: a scan under the wrong mode is a failure, not a skip
  (`output-and-gates.md:310`).
- **outputs** — the three files above; the `theme:coverage` package script (added by the orchestrator —
  Z-CONFIG); the first JSON run under `artifacts/registries/theme-coverage/`
- **gate** — **G-GATE-PROVES-RED**: run the new gate against the pilot tree *before* F1's repaint lands and
  it must fail on **all fourteen** registry defects plus the five findings of `output-and-gates.md:19-58`.
  A gate that does not go red on a tree with known defects is not a gate
  (`2026-09-08-wave2-program.md:47`).
- **acceptance** — the orchestrator matches finding ids against `theme-surface-defects.json` `defects[]`
  one by one; 14 of 14 matched, or the misses are named
- **evidence** — `artifacts/registries/theme-coverage/sneakers-<date>.json`
- **duration** — **not measured** (shared 2–4 h estimate with F1). The gate's own runtime is estimated at
  ≈ 8 min for 104 scans, from a measured 60 scans in 4 min 40 s (`output-and-gates.md:312`).

---

## F3 — Foundation truthfulness fixes

- **owner** — seed engineer
- **trigger** — before the first profile of the wave; independent of F1/F2 and may run in parallel — its
  zones (Z-SEED-CORE, Z-SCRIPTS-BACKEND) are disjoint from F1's
- **inputs** — `artifacts/docs/2026-09-07-s6a-theme-assembly-report.md:120-127`;
  `artifacts/docs/2026-09-07-remaining-work.md:31-32`; `artifacts/docs/retro/execution-analysis.md:398`
- **work** — Three measured defects of the "green report over an empty reality" class:
  1. `store-profile:up` returned **exit 0 on a failed seed that produced 0 products**, measured by S6a
     (`s6a-theme-assembly-report.md:120`). It must exit non-zero when the seeded count is below
     `catalog.counts`.
  2. `validate-store-profile.mjs` with **no arguments prints usage and exits 0**
     (`execution-analysis.md:398`, `remaining-work.md:31-32`). It must exit non-zero.
  3. The dead export `PRODUCT_LIMIT` breaks `next build` (`execution-analysis.md:398`).
- **outputs** — the two scripts and the storefront export, with tests
- **gate** — **G-EXIT-TRUTH**, proved by construction and not by claim: run `store-profile:up` against a
  deliberately truncated catalog and copy the non-zero exit; run
  `node scripts/validate-store-profile.mjs; echo $?` and copy the non-zero exit
  (`brief-analysis.md:757-762`)
- **acceptance** — both exit codes pasted by the agent **and re-run by the orchestrator**
- **evidence** — `artifacts/docs/<date>-F3-foundation-truth.md`
- **duration** — **not measured.**

---

## W0 — Setup

- **owner** — orchestrator (no agents)
- **trigger** — F1, F2, F3 merged into `dev`; the task approved by Ivan and set `in_progress` (rule 22j)
- **inputs** — `docs/store-profiles/00-program-2026-09-07.md:71-82` (the §5 row for this profile);
  `specs/store-profiles/*.schema.json`
- **work** — Worktree for `feat/store/<id>`; `corepack pnpm install` **inside the worktree only**
  (`00-program-2026-09-07.md:118`); envs patched with `<BACKEND_PORT>`, `<STOREFRONT_PORT>`,
  `<DB_NAME>=upready_store_<id>` on Postgres 5433, `STORE_PROFILE=<id>`; `.gitignore` media rules
  **re-verified with `git check-ignore -v`, never assumed** — the pilot found `apps/backend/.gitignore:12`
  `!src/**` re-including profile media (`brief-analysis.md:641`); `pids.json` created and `pkill -f`
  forbidden thereafter, because a `pkill -f 'medusa develop'` destroyed running stands in the pilot
  (`execution-analysis.md:331`); `run-record.mjs start` for every agent **at the moment of launch**; **all
  stage prompts assembled from templates before the wave starts.**
- **outputs** — worktree, envs, `pids.json`, `.ai/progress.md` started, `artifacts/wave2/zones/*.json`
- **gate** — **G-ZONE** (§2.5 rule 1) + `zones.mjs check` exit 0 + **G-PREFLIGHT** (L1/L2) + `/health` 200
  on `<BACKEND_PORT>` + the four `git check-ignore -v` exit codes copied
- **acceptance** — the G-ZONE arithmetic printed with both totals; if they differ, **fix the brief before
  launching an agent** (`brief-analysis.md:608-613`)
- **evidence** — `.ai/progress.md`
- **duration** — **not measured.** The pilot's launch lag for four agents was 6 minutes, attributed
  entirely to prompts being assembled one at a time (`execution-analysis.md:84`); with templates it is a
  constant, not a sum.

---

## W1 — Style board

- **owner** — creative director
- **trigger** — W0 complete
- **inputs** — the §5 programme row (`00-program-2026-09-07.md:71-82`); the geist-kit canon
  (`~/upready/packages/geist-kit/AGENTS.md`, rule 27); `specs/design-system/theme-preset.schema.json`
- **work** — Brand; palette as canon tokens for `light` **and** `dark`; font pair from the allow-list;
  photo direction (background, light, camera, props); hero and tile concepts; card aspect; ASCII mock-ups of
  home/listing/PDP **each naming its state**; and the prompt templates the image producer will use
  (`00-program-2026-09-07.md:93`)
- **outputs** — `data/profiles/<id>/design/style-board.md`
- **gate** — **G-BOARD**: 9 numbered sections present; ≥ 30 fg/bg contrast pairs computed **by a script that
  exits non-zero on failure**, minimum ratio ≥ 4.50:1, values copied from its output; ≥ 5 ASCII frames;
  **0 contradictions** in the cross-document table — every numeric range named both here and in the brief
  (price band, product count, category count, shot count) must match, and every prompt template is checked
  against the assortment it will apply to (`brief-analysis.md:655-662`)
- **acceptance** — the orchestrator recounts sections and contradictions. **The pilot returned 2
  contradictions here and both shipped** (`brief-analysis.md:662`): a price band of 89–189 in the brief
  against $140–$210 in board §2, and a template clause "A single right shoe, alone in frame" that would
  have wasted 3 of 19 paid frames on a care-kit product with no right to a regeneration
  (`execution-analysis.md:332`, `:338`).
- **evidence** — the board itself, with the contrast script's output pasted into it
- **duration** — **16 min, measured** (`artifacts/docs/2026-09-07-pilot-agent-runs.md:14`)

**Two-part delivery.** The board is handed over in two envelopes, because W2 needs only the first: the
*brand card* (§1 brand and naming, §2 persona, §6.2 tile handles, §7 layout) unblocks W2; the *photo and
palette* envelope (§3, §5) unblocks W3 and W4 (`execution-analysis.md:85`). The saving is **not measured** —
the board's internal timing was never written down.

---

## W2 — Catalog and image briefs

- **owner** — merchandiser
- **trigger** — W1's brand card exists on disk (**not** the whole board)
- **inputs** — the brand card; `specs/store-profiles/catalog-products.schema.json`;
  `specs/store-profiles/store-profile.schema.json`
- **work** — Assortment, category tree, collections; per product a title, description, spec rows,
  options/variants/SKU, `price_usd` and the `imageBrief`; five locales `en, de, fr, es, ru`
  (`00-program-2026-09-07.md:66`, `:94`)
- **outputs** — `data/profiles/<id>/catalog/{categories,collections,product-options,products}.json`;
  `data/profiles/<id>/i18n/{en,de,fr,es,ru}.json`
- **gate** — **G-CATALOG**: 12–16 products, 3–5 categories over two levels, 2 collections; every description
  300–1400 chars; 6–10 spec rows per product; ≥ 2 single-variant products; `store-profile:validate` run
  **in place against the repository path, never a scratchpad fixture** — the pilot's green came from a
  throwaway fixture (`brief-analysis.md:670-673`); plus a **blind read-back**: 3 descriptions chosen at
  random by the orchestrator, titles stripped, identified correctly by an agent that did not write them,
  3 of 3
- **acceptance** — validator exit code and counts pasted; **the orchestrator picks the three descriptions**
- **evidence** — `artifacts/docs/<date>-W2-catalog.md`
- **duration** — **24 min, measured** (`pilot-agent-runs.md:18`) for 14 products, 225 variants, 5 locales

---

## W3 — Images

- **owner** — image producer
- **trigger** — W2's `imageBrief` exists for **at least the first product** — the style gate needs one, not
  the whole catalog (`execution-analysis.md:86`)
- **inputs** — the board's photo-and-palette envelope; `catalog/products.json`;
  `REPLICATE_DEFAULT_API_KEY` from `~/upready/.env.keys`
- **work** — Drive `apps/backend/scripts/store-media/generate.mjs`. **The batch runs in the script, not in
  the agent's context** — that instruction is the only reason the pilot's largest deliverable came in under
  budget (`execution-analysis.md:363`). Style gate on the first frame **before** the paid batch
  (`00-program-2026-09-07.md:104`). Then one hero frame per product + 1 banner + 4 tiles, **no
  regenerations in the first pass**; a defective frame stays in the catalog marked `flagged` and goes to the
  second-pass list — Ivan's standing decision F9 (`00-program-2026-09-07.md:65`). Bytes to
  `artifacts/media/<id>/raw/` immediately and **never deleted**; WebP via sharp; no provider URL outside the
  sidecar (`00-program-2026-09-07.md:61`, rule 17d).

  **Prompt registry.** Every prompt is written in the split form Ivan ordered — `sharedPreamble` stored
  **apart from** per-cell `subjectClause`, with `kind: "single" | "grid-3x3"`, `aspect`, `resolution`,
  `model`, `predictionId`, `cropBox` and `fullPromptSha256`
  (`artifacts/docs/2026-09-08-ivan-directives-image-strategy.md:75-86`). **This is a migration, not a new
  artefact.** `artifacts/media/sneakers/prompts.json` already exists and is flat: measured with `node -e`,
  it holds `{profileId, generatedAt, budget: 19, frames: [19]}` with per-frame keys
  `key, role, template, productHandle, categoryHandle, aspectRatio, resolution, outFile, longestSide,
  prompt, negativePrompt`, templates `packshot 11 / still-life 3 / editorial 5`, full prompt strings of
  1187–2509 characters each, and **no `sharedPreamble` and no `cells`**. The shared preamble is today
  duplicated inside all 19 prompt strings, which is exactly what the split removes.
- **outputs** — `artifacts/media/<id>/raw/**`; `data/profiles/<id>/media/*.webp`;
  `data/profiles/<id>/media/manifest.json`; `artifacts/media/<id>/second-pass.json`;
  `artifacts/media/<id>/ledger.json` (prediction ids); `artifacts/media/<id>/prompts.json`;
  `artifacts/media/<id>/review.json`; the contact sheet
- **gate** — **G-MANIFEST**, machine: renders = products + 5 exactly; `accepted + flagged = renders`;
  manifest rows = files on disk = sha256 rows, **recounted by the orchestrator, three independent counts
  printed**; cost read from the provider **or the field is `null` and the report says `unmeasured` — never
  `0`** (`brief-analysis.md:684-688`); every flagged frame listed in `second-pass.json` with file, reason
  and a suggested prompt change
- **acceptance** — the orchestrator's three recounts; the style-gate frame judged against the board
  **before a single paid batch frame**
- **evidence** — `artifacts/docs/<date>-W3-images.md`, the manifest, the ledger, `review.json`
- **duration** — **27 min, measured** (`pilot-agent-runs.md:19`). Of that, provider time was **5 min 12 s**
  (311.5 s over 19 frames, mean 16.4 s), so about 22 minutes is agent work around the batch
  (`execution-analysis.md:226`).

---

## W4 — Theme preset

- **owner** — theme engineer
- **trigger** — W1's palette envelope exists. **W4 waits for neither the catalog nor the renders.** In the
  pilot the palette existed at 20:42 and the theme stage started at 21:47 — an hour of idle in a stage that
  was waiting for nothing (`2026-09-08-wave2-program.md:191`, `:193`)
- **inputs** — board §3.1 palette; `specs/design-system/token-map.json` (the bridge dictionary, 113 rows);
  `specs/design-system/theme-preset.schema.json`
- **work** — `theme.json` for `light` and `dark` on the canon key set, the same key set as the existing
  presets; `specs/design-system/themes/<id>.theme.json`; a contrast report computed **from the `theme.json`
  that was written, not from the board's prose** (`artifacts/docs/2026-09-07-s6a-theme-assembly-report.md:60`)
- **outputs** — `data/profiles/<id>/theme.json`, `specs/design-system/themes/<id>.theme.json`, the contrast
  report
- **gate** — **G-THEME**, machine: `N keys, 0 missing` printed against the reference preset; every declared
  pair's ratio recomputed from the written JSON and matching the board's number ± 0.01 — this is coverage
  rule R12 (`output-and-gates.md:393`)
- **acceptance** — the orchestrator diffs the key set against `geist.theme.json`. **Any value the stage
  invents that the board does not specify is listed by name and goes to the creative director** — S6a
  invented `--chart-1…5` and nobody reviewed them (`s6a-theme-assembly-report.md:236`)
- **evidence** — the contrast report inside `artifacts/docs/<date>-W4-theme.md`
- **duration** — **not measured separately.** The pilot fused W4 and W6 into one 17-minute stage (S6a,
  `pilot-agent-runs.md:20`) which also performed 4 cross-seam repairs and rebuilt the database twice, so 17
  is an upper bound on the **pair**, not a measurement of either (`execution-analysis.md:228`).

---

## W5 — Copy reconciled against the renders

- **owner** — merchandiser (the same agent as W2)
- **trigger** — W3's manifest exists and the WebP files are on disk
- **inputs** — `media/manifest.json`, the delivered frames, `catalog/products.json`, the five locales
- **work** — Titles and descriptions name what is **visible**, not what was intended; the colourway hex is
  **sampled from the render** (sharp stats over a masked crop, value copied); spec rows agree with the
  photograph; all five locales updated (`remaining-work.md:28-29`)
- **outputs** — updated `catalog/**` and `i18n/**`, plus a diff of every changed title in the report
- **gate** — **G-COPY**: per product, deltaE between the render's sampled dominant hex and the catalog
  colourway hex < 12; plus a blind read-back by an agent that did not write the copy, matching for ≥ N−1 of
  N (`brief-analysis.md:624`); `store-profile:validate <id>` **without** `--skip-media`
  (`remaining-work.md:29`)
- **acceptance** — the orchestrator reads the title diff and the deltaE table
- **evidence** — `artifacts/docs/<date>-W5-copy-reconciliation.md`
- **duration** — **not measured — this stage never ran in the pilot** (`pilot-agent-runs.md:22`).
  `execution-analysis.md:227` extrapolates 20 min from a 17–24 range and marks it `[Э]` in its own source.

---

## W6 — Assembly and stand

- **owner** — profile engineer
- **trigger** — W4 **and** W5 complete
- **inputs** — `theme.json`, the reconciled catalog, the media on disk, the `profile.json` skeleton
- **work** — `profile.json` complete; `themes:build`; `build-profile.mjs`; `next build`;
  `store-profile:up <id>` (database, migrations, seed, media copied into
  `apps/backend/static/store-profiles/<id>/`, backend and storefront started on the profile's ports); the
  brand assets of Z-BRAND-ASSETS replaced or explicitly deferred (§2.3)
- **outputs** — `data/profiles/<id>/profile.json`; generated `themes.css` and `profile.generated.json`; a
  live stand on `<BACKEND_PORT>`/`<STOREFRONT_PORT>`; `pids.json` updated
- **gate** — **G-SEED**, machine: seed counts read from the database **with `psql`, not from the log**, and
  equal to `catalog.counts`; every image URL 200 (the pilot measured 283/283, `remaining-work.md:18`);
  `tsc` 0, `next lint` clean, `next build` 0; **and F3's two exit-code proofs re-run here**
  (`brief-analysis.md:757-762`)
- **acceptance** — the orchestrator re-runs the `psql` counts itself. The pilot's own trap: the generated
  profile silently dropped the whole `theme` block and the stand rendered `medusa`/`light`
  (`s6a-theme-assembly-report.md:128-139`); coverage rule R1 (`mode-applied`) now fails on exactly that
  (`output-and-gates.md:382`)
- **evidence** — `artifacts/docs/<date>-W6-assembly.md` with curl status codes and `psql` counts
- **duration** — **17 min, measured** (`pilot-agent-runs.md:20`), an upper bound — see W4's note

---

## W7 — Coverage gate run

- **owner** — orchestrator (runs the script; no agent)
- **trigger** — W6's stand is live and answering
- **inputs** — the live stand; `profile.generated.json`; `specs/design-system/themes/<id>.theme.json`
- **work** — `pnpm --filter storefront theme:coverage`. Matrix: surfaces S01–S28 × `{dark, light}` ×
  `{1280×800, 390×844}` ≈ 104 scans (`output-and-gates.md:310`, `:312`).
- **outputs** — `artifacts/registries/theme-coverage/<id>-<date>.json` and the console table
- **gate** — **G-COVERAGE**: exit 0. FAIL rules are R1–R10 and R12–R15; R11 (`open-row-leak`) is WARN,
  counted and printed, non-blocking until the canon question is decided
  (`output-and-gates.md:311`, `:392`)
- **acceptance** — machine. **The orchestrator does not read the scan rows into its own window**; it reads
  the exit code and the totals line. A yellow result goes to a verifier agent, not into the orchestrator's
  context — that is what produced the pilot's 371k window (`execution-analysis.md:311`)
- **evidence** — the JSON under `artifacts/registries/theme-coverage/`
- **duration** — **not measured.** Runtime estimated at ≈ 8 min from a measured 60 scans in 4 min 40 s
  (`output-and-gates.md:312`). Whether the *stage*, fix-and-rerun cycles included, is 8 minutes or an hour
  is unknown — it has never run.

---

## W8 — Human visual acceptance — **blocking**

- **owner** — the creative director **who wrote this profile's board** — named in the brief, never "the
  orchestrator" (`output-and-gates.md:430`)
- **trigger** — **G-COVERAGE exits 0.** A human is never the first to see a black heading on a black page
  (`output-and-gates.md:425`)
- **inputs** — the live stand in both modes and both viewports (rule 18f: the real product, not a
  surrogate); the contact sheet `artifacts/media/<id>/contact-sheets/*.webp`; this profile's style board
- **work** — Fill the acceptance sheet of `output-and-gates.md:428-495`: group A one brand (6 lines),
  B product frames (8), C a shop not a template (8), D continuity through the journey (3), E states (6),
  F copy against picture (2). **Every line is `meets` / `does not meet` with a screenshot filename for a
  "does not meet". "Mostly", "fine", "looks good" are not answers** (`output-and-gates.md:430`).
- **outputs** — `artifacts/docs/<date>-<id>-visual-acceptance.md`, screenshots beside it, and its path in
  the profile's HANDOFF entry (`output-and-gates.md:495`)
- **gate** — **G-VISUAL**: the sheet exists, covers every route in the route list, and carries **0
  `does not meet` rows** in A–E; F lists every flagged frame **by decision**
  (`brief-analysis.md:625`, `output-and-gates.md:495`)
- **acceptance** — the verdict line at the bottom reads `ship`. **The screenshots are an input, never
  evidence — their file sizes are not a result** (`brief-analysis.md:777`)
- **evidence** — the filled sheet
- **duration** — **not measured — this stage never ran in the pilot** (`theme-surface-defects.json:228`,
  `remaining-work.md:22-26`). **No published extrapolation exists**, and it is a blocking human step.

---

## W9 — Adversarial verification

- **owner** — verifier
- **trigger** — W8 signed (`2026-09-08-wave2-program.md:64`)
- **inputs** — every other role's report and numbers; the manifest; the seeded database
- **work** — `DROP` the profile database and reseed from scratch; Playwright in Docker
  (`mcr.microsoft.com/playwright:v1.63.0-noble`, `00-program-2026-09-07.md:34`) at 1280×800 and 390×844;
  run G-COVERAGE and G-FOCUS independently; try to **refute** W3's manifest numbers and W2's prices
  (`00-program-2026-09-07.md:98`)
- **outputs** — a thin JSON verdict plus `artifacts/docs/<date>-W9-verification.md`
- **gate** — **G-VERIFY**: 0 unmatched coverage samples; contrast as painted ≥ 4.5:1 body and ≥ 3.0:1 large
  on every sampled node; every product image `naturalWidth > 0`; variant selection changes price and SKU;
  prices in 3 currencies; no raw id in visible text; at 390 px `scrollWidth ≤ clientWidth` for every title
  and price; manifest rows = files = sha256; 3 regional prices recomputed by hand. **Every check with its
  reverse run, and the reverse run RED** (`brief-analysis.md:788-796`)
- **acceptance** — the orchestrator reads the thin JSON only. Memory check before Docker: the pilot recorded
  **596 MB free of 16 GB** at that moment (`remaining-work.md:37`)
- **evidence** — the verification report
- **duration** — **not measured — never ran** (`pilot-agent-runs.md:22`). `execution-analysis.md:229`
  extrapolates 35 min over a 28–45 range and warns it may behave like S1b's 61 min if the browser loop sits
  in the agent's window rather than in a runner.

---

## W10 — Handover

- **owner** — orchestrator
- **trigger** — W9 green
- **inputs** — every report path, every number
- **work** — Commits per path with `IVAN_OK=1` and **literal** pathspecs (`git add -- <literal>` first;
  rule 21h); `handoff.mjs task update --append-details` with the numbers; `orchestrator.mjs emit --kind
  done`; `SendMessage` to the architect session with the URL, ports, pids, the verification path, the
  G-VISUAL path, the render count, the cost total **or the word `unmeasured`**, and everything the verifier
  could not confirm (`brief-analysis.md:800-804`). **No push** unless Ivan has said so
  (`remaining-work.md:44`).
- **outputs** — commits, the HANDOFF entry, the emit, the message
- **gate** — **G-HANDOVER**: `git status` clean; no file over 1 MB in the commits; `.gitignore` media rules
  present; `next-env.d.ts` and `tsconfig.json` restored to `HEAD` before committing — they are rewritten by
  every `next dev`/`next build` under a foreign `NEXT_DIST_DIR`
  (`artifacts/docs/2026-09-07-s1c-profile-blocks-report.md:280-284`)
- **acceptance** — **Ivan's eyes** on `http://localhost:<STOREFRONT_PORT>/en`. The stop gate, reached only
  with every gate green (`brief-analysis.md:804`)
- **evidence** — the HANDOFF entry
- **duration** — **not measured.** `execution-analysis.md:230` extrapolates 5 min.

---

## W11 — Flagged-frame second pass — **conditional**

- **owner** — image producer (a separate order, not a continuation of W3)
- **trigger** — **Ivan orders it.** F9 fixes the first pass at one frame per product with no regenerations;
  flagged frames go to a separate second pass that Ivan commissions separately
  (`00-program-2026-09-07.md:65`, `remaining-work.md:45`)
- **inputs** — `artifacts/media/<id>/second-pass.json` (file, reason, suggested prompt change per frame);
  the prompt registry, from which a single-cell prompt is rebuilt as
  `sharedPreamble + cells[i].subjectClause` without re-reading the whole text
  (`ivan-directives-image-strategy.md:85-86`), via
  `store-media prompt build --profile <p> --handle <h> [--from-grid <id> --cell <i>] [--resolution 2K]`
  (`ivan-directives-image-strategy.md:90-92`)
- **work** — Re-render only the listed frames; replaced frames enter the manifest with `derivedFrom`
  pointing at the original prompt record; **the superseded raw bytes are not deleted**
  (`00-program-2026-09-07.md:61`)
- **outputs** — new frames, updated manifest, updated `second-pass.json` with the decision per frame
- **gate** — **G-VISUAL group F re-run**, on the affected rows only
- **acceptance** — creative director, then Ivan
- **evidence** — the updated manifest and the amended acceptance sheet
- **duration** — **not measured.** The pilot flagged **4 of 19 frames = 21 %** (`remaining-work.md:17`,
  `execution-analysis.md:402`); at that rate nine profiles produce ≈ 36 flagged frames. The four flagged in
  the pilot are `gutter-low` (mirrored), `cattle-grid-trail` (warm background), `care-kit` (two brushes
  instead of three objects) and `tile-low-tops` (head and shoulders in frame) (`remaining-work.md:45`).

---

## 3.13 The scheduling rule that binds all of the above

**No stage whose acceptance requires a render is scheduled while an editing stage is running.** That is the
rule the pilot broke, and it cost 298.7k against a 120k budget (`brief-analysis.md:747-750`): S1b sat
waiting because four routes were returning HTTP 500 from another agent's broken CSS module
(`ivan-directives-image-strategy.md:10-16`).

Within one profile the only true parallel is **W4 against the chain W2 → W3 → W5**
(`2026-09-08-wave2-program.md:191`). Between profiles, W1, W2 and W4 are fully independent; W6, W7 and W9
contend for the hardware, and no more than two compiling processes run at once
(`2026-09-08-wave2-program.md:206`).

---

Next: [`02-gates-and-handover.md`](./02-gates-and-handover.md).
