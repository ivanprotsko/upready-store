# Critique of the store-profile creation process

Critic: process critic (Fable), 2026-09-08. Target: the five files under `artifacts/docs/process/` at
commit `8dfe5fa`. Evidence: the pilot record listed in the brief. Every claim below carries a `path:line`
(relative to the worktree `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles`) or the
command that produced it. Where the record is silent, it says so. Nothing was built, started, seeded or
committed; the stand on `:8028`/`:9023` was not touched.

---

## §0. Verdict

**No.** An orchestrator who was not in the pilot cannot execute this process today: it cannot close its
first step, because W0's gate is `zones.mjs check` exit 0 (`01-steps.md:137`) and the handover contract
rests on `run-record.mjs`, `build-heartbeat.mjs`, `prompt.mjs`, `artifacts/wave2/{zones,runs,control,repairs}`
(`01-steps.md:134-136`, `00-roles-and-zones.md:182,197`, `02-gates-and-handover.md:111,116`) — and
`find . -name 'zones.mjs' -o -name 'run-record.mjs' -o -name 'build-heartbeat.mjs' -o -name 'prompt.mjs' -o -name 'gate.mjs' -o -name 'wave2-scheduler.mjs' -not -path '*/node_modules/*'`
returns nothing, `ls -d artifacts/wave2` returns "No such file or directory", and no step of F1–F3/W0–W11
builds any of it. The single worst hole: **the process's own isolation rules and scheduling rule are
violated by its own foundation steps** — F1 launches seven agents into one compilation closure on one
branch (`01-steps.md:17-18`) against §2.5 rule 4 (`00-roles-and-zones.md:184-186`), and F2, whose gate
needs a rendered page, is triggered "F1 in progress" (`01-steps.md:66`) against §3.13
(`01-steps.md:437`) — which is the exact shape of the pilot's hour-long S1b block, re-scheduled.

---

## §1. Findings, by severity

### C-01 · BLOCKER · The first gate and the whole handover machinery name tools that do not exist and nobody builds

- **Claim under attack.** W0 gate: "**G-ZONE** (§2.5 rule 1) + `zones.mjs check` exit 0 + **G-PREFLIGHT**"
  (`01-steps.md:137`). W0 work: "`run-record.mjs start` for every agent at the moment of launch"
  (`01-steps.md:134`). §2.6: a blocked worker "writes `artifacts/wave2/repairs/<file>.json`… The owner
  polls the queue" (`00-roles-and-zones.md:197`). H4/H9: `run-record.mjs`, `artifacts/wave2/control/<agent>.json`
  (`02-gates-and-handover.md:111,116`). p-04's "gate now": `build-heartbeat.mjs` (`03-failures-and-economics.md:123`).
- **Measured.** The find above: zero hits for all six scripts. `ls -d artifacts/wave2` → not found.
  `ls apps/storefront/src/styles/allow-literal-colours.json` → not found (F1's exit condition reads it,
  `01-steps.md:23,42`). `grep -c theme:coverage apps/storefront/package.json` → 0 (expected: F2 builds it —
  that one *is* owned). The retro these come from specifies them (`artifacts/docs/retro/execution-analysis.md:321-332`)
  and says plainly "Пока `run-record.mjs` не написан, следующий разбор снова упрётся…" (`execution-analysis.md:407`).
- **The event that breaks it.** The pilot lost three of seven agent names and five of seven token counts
  (`artifacts/docs/2026-09-07-pilot-agent-runs.md:46-50`) for want of exactly this tooling. The process
  turns the missing tooling into gate conditions without giving it an owner or a step, so the first
  orchestrator will either skip the gate (the pilot's behaviour) or stop at W0.
- **Also broken by this:** the stage prompts the process points to as ready (`02-gates-and-handover.md:165-166`
  → `artifacts/docs/2026-09-08-wave2-stage-prompts.md`) carry none of the envelope: `grep -n -i 'not verify\|outside\|repairs/\|heartbeat\|run-record\|zones.mjs' artifacts/docs/2026-09-08-wave2-stage-prompts.md`
  finds only line 443, "If you need a file outside it, you STOP and report it" — the opposite of §2.6's
  "switches to work that does not need the page".
- **Must change.** Add a foundation step **F0 — orchestration tooling** (owner: orchestrator or a named
  tooling engineer) whose outputs are the six scripts and the `artifacts/wave2/` layout, with a gate that
  runs each once (rule 19c). Until F0 exists, W0's gate must read "G-ZONE by the arithmetic of §2.2, printed"
  and nothing else, and §2.6/H4/H6/H9 must be marked *not executable yet*. Regenerate the stage prompts from
  the envelope contract or delete the pointer.

### C-02 · BLOCKER · F1 and F2 violate the process's own zone rule 4 and scheduling rule 3.13

- **Claims.** §2.5 rule 4: "Two agents whose `writes` intersect the other's compilation closure are one
  failure domain: serialise them, give one a separate worktree, or make one the sole writer of the whole
  intersection" (`00-roles-and-zones.md:184-186`). §3.13: "No stage whose acceptance requires a render is
  scheduled while an editing stage is running" (`01-steps.md:437`). §9.6: the process "does not give each
  agent its own worktree" (`03-failures-and-economics.md:365-367`).
- **What F1/F2 say.** F1 = "7 agents, one per storefront zone, run in parallel" on one branch
  `feat/store-theme-surface` (`01-steps.md:17-18`); its gate includes `tsc --noEmit` (`01-steps.md:49`).
  F2 trigger = "F1 in progress or complete on the same branch" (`01-steps.md:66`); F2's gate
  G-GATE-PROVES-RED must run "against the pilot tree *before* F1's repaint lands" (`01-steps.md:85-86`);
  F2's product is a Playwright suite against a live stand (`01-steps.md:70-74`).
- **Replay.** All seven F1 agents write into `apps/storefront/src/**` — one Next app, one CSS bundle, one
  module graph (`execution-analysis.md:117`). By rule 4 they are one failure domain. If any of them
  declares `tsc`/`next build` as a `runs`, `zones.mjs check` #3 exits 2 by construction
  (`execution-analysis.md:149`). F2 needs the page to render while seven agents edit it — the pilot's
  incident 2 shape: S1b "sat waiting because four routes were returning HTTP 500 from another agent's
  broken CSS module" (`01-steps.md:438-440`, `artifacts/docs/2026-09-08-ivan-directives-image-strategy.md:10-16`).
  And F2's trigger and F2's gate contradict each other: the gate needs the un-repainted tree, the trigger
  starts after repainting begins.
- **Must change.** State explicitly: (a) no F1 agent runs `tsc`/`next build`; the orchestrator runs the
  F1 gate once after all seven return; (b) F2 runs **before** F1 on the un-repainted tree (that is when
  the fourteen defects exist to be caught) and is re-run after F1 as the proof the repaint worked; (c) if
  (a) cannot be held, F1's seven agents get worktrees or run serially — §9.6 then changes.

### C-03 · SERIOUS · Scenario 1 replay: the broken file's zone has no owner in the wave, so the orchestrator repairs it and p-04 recurs

- **The event.** S1c's `apps/storefront/src/lib/profile/image-frame.module.css` with `:global()` in PURE
  mode; four routes 500; S1b blocked because its gate was pixel-based (`ivan-directives-image-strategy.md:10-19`);
  the orchestrator's repair carried the wrapper into a new file and every route returned 500 again
  (`artifacts/docs/2026-09-07-s1c-profile-blocks-report.md:269-278`); `.ai/progress.md:98` reads
  "`:8031` still 500 — that is S1b's own stand and S1b is alive and polling; not chased further".
- **Where the file lands now.** `lib/**` is Z-NONVISUAL, "asserted by the orchestrator, edited by nobody in
  a repaint" (`00-roles-and-zones.md:83`) — yet it holds two CSS files
  (`find apps/storefront/src/lib/profile -name '*.css'` → `image-frame.module.css`, `image-frame.globals.css`),
  the very files of incident 2 and 2b. Their §1 owner is the blocks engineer, "foundation-only… built once"
  (`00-roles-and-zones.md:24`) — a role with **no step and no gate** anywhere in `01-steps.md`.
- **Replay through §2.6.** Owner "still running"? No — the owner does not run in a wave. So row 2 applies:
  "The orchestrator may repair — and must then run **the owner's gate**" (`00-roles-and-zones.md:198`). The
  owner's gate is undefined, so the orchestrator runs what it has — a curl. That is p-04 verbatim
  (`03-failures-and-economics.md:112-118`).
- **How long does the blocked worker wait?** The process has no clock. The only thresholds are token
  percentages (H9, `02-gates-and-handover.md:116`); the heartbeat runs "every N minutes" with N never set
  (`execution-analysis.md:165`, carried at `03-failures-and-economics.md:123-124`). At 150 % the remainder is
  "re-issued to a fresh agent with a narrowed task" — a fresh agent blocked on the same foreign file. The
  record: S1b's idle is unmeasured (`03-failures-and-economics.md:166-167`), and the process leaves it
  unmeasurable.
- **Must change.** Every zone that contains a compiled file needs an owner **who exists during the wave**
  (Z-NONVISUAL's CSS goes to Z-CHROME or gets a named maintainer); every owner needs a named gate for
  §2.6 row 2 to invoke; the repair queue needs a time bound ("a repair request older than X min escalates
  to the orchestrator, who runs L1/L2 and the owner's gate"), and G-PREFLIGHT L2 must be listed as the
  gate a cross-zone CSS repair is verified by, not "the owner's gate" in the abstract.

### C-04 · SERIOUS · Scenario 2: the diff rule would not have stopped the cut, and the author did not apply it to his own derivation

- **Claim.** §6.2: clause-level diff, every clause `kept` / `reworded` / `dropped`; only `dropped` needs a
  reason (`02-gates-and-handover.md:186-189`); the orchestrator fixes the brief (`:190-191`).
- **Replay of p-05.** The predecessor's line 23 is one numbered item holding three assertions
  (`docs/prompts/initial-prompt-2026-09-06-orchestrator-theme-presets-panel.md:23`, quoted at
  `artifacts/docs/retro/brief-analysis.md:72`). The successor's line 29 rewrote T0h.5 into a pixel test and
  pulled T0h.1–T0h.4 in **by pointer** ("Exactly T0h.1–T0h.4 of `docs/prompts/…`",
  `docs/prompts/initial-prompt-2026-09-07-orchestrator-store-profiles.md:29`). Under §6.2 a transcriber
  marks item 5 `reworded` and is done — no reason required, and the sub-clause "…and that `body`
  background follows" vanishes inside a legal `reworded`. The rule never defines the unit "clause", and
  the second cut (root cause D) was not a work clause at all but a fact in the "Measured facts" line
  (`brief-analysis.md:165-166`), which a diff of *orders* does not cover. The check is done by the
  brief's own author (`02-gates-and-handover.md:190`), who in the pilot was the one who cut it.
- **The rule applied to this document.** The process is "derived" from the retro template
  (`02-gates-and-handover.md:164-165`). The template says "An agent at 80 % of budget stops and reports the
  remainder as a thin envelope" (`brief-analysis.md:633`). `grep -n '80 %\|80%' artifacts/docs/process/*.md`
  → no such rule; H9 says 100 % → stop file, 150 % → re-issue (`02-gates-and-handover.md:116`). A clause
  was changed and no reason was recorded — exactly the disposition §6.2 calls "a defect in the brief". The
  template's G-PAINT (`brief-analysis.md:622`) became G-COVERAGE the same way, without the diff.
- **Must change.** Unit = one assertion (a sentence containing a verb of proof), not a numbered item;
  `reworded` carries old and new text side by side; a brief that includes a predecessor by pointer must
  expand the pointer before the diff; the diff is reviewed by an agent that did not write the brief; and
  the author ships the clause diff of template → process as the first proof the rule can be obeyed.

### C-05 · SERIOUS · Scenario 3: the slot exists, but its reader is forbidden by H7 and its trigger section is the wrong one

- **Claim.** H8: "Every stage report carries a section `Findings outside my checklist`, and the
  orchestrator must merge each entry into `theme-surface-defects.json` or write the reason it did not"
  (`02-gates-and-handover.md:115`). H7, two lines above: "**Reports do not enter the orchestrator's
  window.** A stage report needing judgement goes to a verifier agent" (`:114`).
- **Replay of D.** S1b wrote the `darkMode: "class"` fact under **"What I could not verify"**
  (`artifacts/docs/2026-09-07-s1b-theme-bridge-report.md:448` heading, `:464` text). The process's envelope
  keeps that section *and* adds a second one (`02-gates-and-handover.md:127-128`); the merge obligation is
  attached only to the second. S1b, told to fill both, files D again under "could not verify" — and the
  acceptance rule for that list is "read and either closed or carried into the next step's inputs"
  (`:134-136`). The next step after the theme bridge is assembly; D matters to the repaint (F1). Wrong
  consumer, and the reader is the orchestrator whose window H7 closes. The author's own line:
  "**The gate is a slot, not a reader**" (`03-failures-and-economics.md:185`).
- **Also.** The stage prompts contain neither section (grep in C-01), so the slot is not even ordered.
- **Must change.** One section, not two; a reader that is not the orchestrator (the verifier agent H7
  already names) with a written obligation to route each entry to a **zone**, not to "the next step"; the
  registry merge is the verifier's output, and the orchestrator's acceptance is "the registry diff exists".

### C-06 · SERIOUS · Scenario 4: G-COVERAGE carries three T0h.5-shaped allowances, and G-GATE-PROVES-RED has no green proof

Each of the 16 gates, asked "what do you say if the surface was never themed?": G-ZONE, G-PREFLIGHT,
G-LINT (inheritance), G-FOCUS-COUNT (0 ≤ 0), G-EXIT-TRUTH, G-BOARD, G-CATALOG, G-MANIFEST, G-THEME, G-SEED,
G-HANDOVER, G-IVAN — all pass, and the table says so honestly in "what it CANNOT prove"
(`02-gates-and-handover.md:14-29`). Three do not say so:

1. **G-COVERAGE, R11 WARN.** "R11 (`open-row-leak`) is WARN… non-blocking" (`01-steps.md:324-326`). OPEN
   = 28 bridge rows that "keep Medusa's own colours under every preset" (`artifacts/docs/retro/output-and-gates.md:372`).
   A surface painted entirely from those 28 vendor colours → WARN → exit 0. DoD-7's sentence "every rendered
   colour on every surface belongs to the active preset" (`theme-creation-process.md:57`) is false while
   R11 is WARN.
2. **G-COVERAGE, the BRIDGE set.** ALLOWED colours include 85 bridge values "read live with
   `getComputedStyle(html)`… never recomputed from the JSON" (`output-and-gates.md:371`). The bridge is
   part of the artefact under test; a bridge row with the wrong hue self-certifies. Measured case: the
   error toast is **grey** (`rgb(129,129,129)` on `rgb(13,13,13)`, 4.99:1) because `--tag-red-text` anchors
   on `--chart-4` (`output-and-gates.md:31,137`) — it passes R3/R4/R5 and is caught only if R14 happens to
   name that role. That is T0h.5's shape: the thing that might be wrong defines what counts as right.
3. **G-COVERAGE, light-mode coincidence.** "The white header and footer, the checkout column and the cart
   dropdown **coincide** with `--background`, so the literal-white class of defects (d-07, d-08, d-09,
   d-10, d-13) is invisible in light — 167 contrast failures against 607 in dark" (`output-and-gates.md:201`).
   The first profile in the queue is `supplements`, light, "клинический белый" (`2026-09-08-wave2-program.md:18,246`).
   On it the light scan proves nothing about root cause B; only the dark scan does. The process never
   states that the second mode is the *only* thing that turns a value-membership check into a coverage
   proof, so a single-mode preset, an `allowLiterals` entry, or a ±1 tolerance re-opens p-02 silently.
4. **G-GATE-PROVES-RED.** Exit condition "14 of 14 registry defects matched by finding id"
   (`02-gates-and-handover.md:19`). A gate that fails on everything passes it. There is no green proof (the
   gate must also exit 0 on a surface known good), and the reverse-run discipline the document demands of
   unit suites (`theme-creation-process.md:56`) is not demanded of this gate.

- **Must change.** R11 → FAIL with a per-profile allow-list that names each open row used and why; the
  BRIDGE set is recomputed from `theme.json` + `token-map.json` and compared with the live value (a
  mismatch is a bridge defect, a match is then trusted); write into G-COVERAGE that both modes are
  mandatory *because* one mode can coincide, and forbid `allowLiterals` from containing the mode's
  `background`; G-GATE-PROVES-RED gains a green half on a fixture surface.

### C-07 · SERIOUS · Scenario 5: W8 is blocking by prose only, is done by an Opus agent yet labelled "human eyes", and is absent from the schedule

- **Nothing physical.** W9 triggers on "W8 signed" (`01-steps.md:365`), W10 on "W9 green" (`:389`), but the
  only machine gate before the commit is G-HANDOVER: `git status` clean, no file > 1 MB, `.gitignore`
  rules (`01-steps.md:398-401`). It does not check that `artifacts/docs/<date>-<id>-visual-acceptance.md`
  exists or reads `ship`. The author admits the risk and offers only schedule variant B as a remedy
  (`03-failures-and-economics.md:103-106`).
- **Who looks.** W8 owner = "the creative director who wrote this profile's board" (`01-steps.md:339`).
  That role is an Opus agent (`00-roles-and-zones.md:18` — 16 min for a 943-line board; `2026-09-08-wave2-program.md:64`
  "креативный директор той же темы | Opus"). The gate table marks G-VISUAL **H** and the summary says
  "Human eyes (2): G-VISUAL, G-IVAN" (`02-gates-and-handover.md:26,34`); the role table says Ivan "is no
  longer the first human" (`00-roles-and-zones.md:28`). If W8 is an agent, Ivan **is** still the first
  human, and rule 27d's "≥ 1 human-eyes criterion" is met by G-IVAN alone. Functionally an agent reading
  104 screenshots can catch a white header; the document must say that is what it is.
- **No duration, no budget, no lane.** W8 "not measured… no published extrapolation" (`01-steps.md:357-358`);
  the class budgets A–E (`03-failures-and-economics.md:247-251`) assign it nothing, though 28 surfaces × 2
  modes × 2 viewports of screenshots is a multimodal pass priced in image patches (rule 8b). The heavy lane
  is defined as "W6→W7 = 52 min" (`03-failures-and-economics.md:220`), so a step that needs the live stand
  held is outside the lane arithmetic — see C-08 for the 52 itself.
- **Must change.** G-HANDOVER gains "the acceptance sheet exists at the named path and its last line reads
  `ship`" as a mechanical precondition; relabel G-VISUAL as agent-eyes with what it looks at (screenshots
  of the live stand) and give it a budget class; put W8 (and W9, W10) into the lane arithmetic with a
  placeholder duration marked *not measured*; measure it once on the pilot stand (see §3, question 5).

### C-08 · SERIOUS · Scenario 6: the schedule assumes the idle away with a scheduler that does not exist, and its heavy-lane figure is built from another step's number

- **Idle.** The pilot lost 25 + 14 + 6 = 45 orchestrator minutes (`execution-analysis.md:76-77`). The
  process says "Three structural cuts remove 39 of those 45 minutes" (`03-failures-and-economics.md:216-217`)
  — the cuts are `wave2-scheduler.mjs` and `prompt.mjs` (`execution-analysis.md:94-96,324,327`), neither of
  which exists (C-01). W0's "with templates it is a constant, not a sum" (`01-steps.md:143-144`) describes
  a template set that has not been written from the envelope contract. So the process reproduces the
  pilot's idle mechanism — a stage starts when the orchestrator is free — and does not say so.
- **Within-profile concurrency.** After W3 the chain is W5 → W6 → W7 → W8 → W9 → W10, single agent each;
  the document admits "the only true parallel is W4 against the chain W2 → W3 → W5" (`01-steps.md:442-443`)
  but does not admit that the pilot's "44 of 98 minutes with one agent" is the designed shape of every
  profile's second half; the answer is the cross-profile pipeline, and that is fine — say it.
- **The 52.** §8.1 table: W7 "≈ 8 min runtime", W9 "35 min extrapolated" (`03-failures-and-economics.md:204,206`).
  Two lines later: "heavy lane (W6→W7) = 52 min per profile" (`:220`). 17 + 35 = 52 — the 35 is **W9's**
  number, carried over from `execution-analysis.md:229` where S7 = verification, and relabelled W7 in
  `2026-09-08-wave2-program.md:217-218,252`. W7's own estimate in the same table is 8. The heavy lane is
  therefore W6 + (a number belonging to W9), and W8/W9/W10 are outside it. Every downstream figure —
  555, 320, 104, 789, 347 (`:221-224`) — inherits this.
- **Also.** "Per profile ≈ 139 min" (`:208`) is copied from `execution-analysis.md:232`; the rows of the
  process's own table sum to 16+24+27+20+17+8+35+5 = 152 (or 147 without W10) — 139 is the retro's total
  which excludes S8's 5 minutes (84 + 55 = 139, and 55 = 20 + 35 without S8).
- **Must change.** Rebuild the lane arithmetic from the table it stands under: heavy = W6 + W7(≈8) + W8(?) +
  W9(35), with the stand held throughout; recompute variants A/B; mark the scheduler as F0 output and the
  idle-removal as *conditional on F0*.

### C-09 · SERIOUS · G-MANIFEST and DoD-3 contradict the image direction Ivan accepted and the schema the gate validates against

- **Renders = products + 5 exactly** (`01-steps.md:232`, `theme-creation-process.md:53`). Ivan's accepted
  direction: "генерировать сеткой ВСЕ изображения, а полноразмерным делать только одно" (`ivan-directives-image-strategy.md:79-86`,
  "ПРИНЯТО КАК НАПРАВЛЕНИЕ"), and the same W3 step mandates a registry with `kind: "single" | "grid-3x3"`
  (`01-steps.md:218-220`). If the grid measurement succeeds, a correct W3 has ~3 grids + 1 frame and
  G-MANIFEST goes red.
- **Cost `null`.** "cost read from the provider or the field is `null`… never `0`" (`01-steps.md:234-235`).
  `specs/store-profiles/media-manifest.schema.json:130-133,250,265-266`: `costUsd` is `"type": "number",
  "minimum": 0` and required. `null` fails the validator that G-CATALOG/G-SEED/W5 run
  (`01-steps.md:191,283,303-305`). The schema's owner is "architect" (`00-roles-and-zones.md:148`) — not a
  role in §1.
- **Must change.** G-MANIFEST: `frames = Σ singles + Σ grid cells`, recounted from the registry's `kind`;
  a step that changes the schema (`costUsd: number | null`, or a separate `costMeasured: false`) with an
  owner who exists.

### C-10 · SERIOUS · F3 orders a fix that was already made, on a file its owner may not touch

- **Claim.** F3 item 3: "The dead export `PRODUCT_LIMIT` breaks `next build`" (`01-steps.md:110`), owner
  seed engineer (`:99`), who "may never touch: Storefront" (`00-roles-and-zones.md:23`).
- **Measured.** `grep -c PRODUCT_LIMIT 'apps/storefront/src/app/[locale]/(main)/collections/[handle]/page.tsx'`
  → 0. `git log --oneline -S'PRODUCT_LIMIT' -- <that file>` → `ee6cfff feat(store-profiles): S1c … the
  three fixes only the orchestrator could make`. The remaining `export const PRODUCT_LIMIT = 12` is at
  `apps/storefront/src/modules/store/templates/paginated-products.tsx:8` — live, imported, Z-BROWSE. The
  process copied `execution-analysis.md:398` without the recount its own index demands
  (`theme-creation-process.md:119-120`).
- **Must change.** Drop item 3 or re-verify it against the tree at wave start; F3's owner cannot own
  storefront files — split the step or move item 3 to F1/Z-BROWSE.

### C-11 · SERIOUS · Stale citations into the directive file, and a conclusion the record at HEAD has already overturned

- The index claims head `d39d10b` (`theme-creation-process.md:5`). The process was committed at `8dfe5fa`,
  after `e50f05a`, which inserted 19 lines into `2026-09-08-ivan-directives-image-strategy.md` at lines
  53–71 (`git diff --stat d39d10b HEAD -- artifacts/docs/2026-09-08-ivan-directives-image-strategy.md` →
  `19 +`). Every citation into that file at or beyond line 53 is off by 19 — nine sites, listed in §2.
- The inserted text measures `resolution = ["1K","2K","4K"]` and concludes "**На `4K` ячейка сетки 3×3 ≈
  1365 px**… Вывод «сетка годится только для миниатюр» держится на `2K` и должен быть перепроверен"
  (`ivan-directives-image-strategy.md:59-61`). The process states the overturned conclusion as current:
  "At a 2K output a 3×3 cell is ≈ 680 px… So the grid serves thumbnails and the product's main frame
  stays a separate full-size render" (`03-failures-and-economics.md:306-308`).
- **Must change.** Re-cite against HEAD; rewrite §8.4 item 1 with the 4K figure and the open question.

### C-12 · MINOR · The order, the gate and the retro define "literal colour" three ways

- F1 order: `bg-|text-|border-|ring-|divide-|from-|to-|via-` (`01-steps.md:21`). F1 gate grep:
  `(bg|text|border|ring|fill|stroke|from|to|via)` — no `divide`, plus `fill|stroke` (`01-steps.md:47`).
  Retro M3: `(bg|text|border)` only → 168 (`brief-analysis.md:31`), and "168-occurrence debt" at
  `brief-analysis.md:871`, which the process cites for F1's rationale (`03-failures-and-economics.md:345-347`)
  while F1's own baseline is 176.
- Re-derived in `apps/storefront/src`: registry regex 176/44; order regex 176/44; M3 regex 168/44;
  `divide-` literals 0; `fill|stroke` literals 0. The numbers coincide today only because the disputed
  prefixes are unused; the exit condition "176 → 0" needs one canonical regex, printed in the gate.

### C-13 · MINOR · Internal counts and names do not agree with the document's own tables

- "Fourteen gates" (`02-gates-and-handover.md:10`, `theme-creation-process.md:85`) — the table has **16**
  rows (`sed -n '14,29p' 02-gates-and-handover.md | grep -c '^| \*\*G-'` → 16); "Machine (11)" lists twelve
  names (`:31-33`).
- `G-FOCUS` is used at `theme-creation-process.md:58`, `01-steps.md:369`, `03-failures-and-economics.md:349`;
  the gate table names `G-FOCUS-COUNT` (`02-gates-and-handover.md:17`).
- "14 visual defects on 13 screens" (`theme-creation-process.md:71`) — `node -e` over the registry:
  14 defects, 14 distinct `image`, 14 distinct `surface`. "13" appears nowhere in the record.
- Step codes: a fourth scheme (F1–F3, W11) on top of three (`theme-creation-process.md:92-96`); the stage
  prompts Ivan will launch use T-fix/T-gate/W0–W10 and have no W11 (`grep -n '^## ' 2026-09-08-wave2-stage-prompts.md`).
- "≈ 104 scans" beside "S01–S28" (`01-steps.md:321-322`): 28 × 2 × 2 = 112; the 104 is the retro's
  "~26 surfaces" (`output-and-gates.md:312`).

### C-14 · MINOR · Citation offsets other than the directive shift

Listed in §2. Twelve sites point at a line 1–7 away from the one carrying the claim; in every case the
claim is true of the nearby line.

### C-15 · MINOR · H9's thresholds rest on self-reported token counts, and the document does not say so

`execution-analysis.md:384,389`: the orchestrator cannot read a child's window; the 60 % milestone is a
self-report that "может врать". H9 (`02-gates-and-handover.md:116`) states the thresholds as if measured.
The pilot's single hard number, 298.7k, "всплыло случайно" (`execution-analysis.md:357`).

---

## §2. Citation and number audit

### 2.1 Citations — 72 sites checked, 21 did not point at the cited text

Method: each `path:line` opened with `sed -n`; "held" = the cited line carries the claim.

| # | Site in the process | Cites | Result |
|---|---|---|---|
| 1 | `theme-creation-process.md:8` | `ivan-directives…md:124` | **✗** — now `:143` (19-line shift, C-11) |
| 2 | `theme-creation-process.md:10` | `…:134-136` | **✗** — now `:153-155` |
| 3 | `00-roles-and-zones.md:17` | `execution-analysis.md:304` | ✓ 371k / 250k |
| 4 | `00-roles-and-zones.md:17` | `execution-analysis.md:76` | ✓ 45 of 98 |
| 5 | `00-roles-and-zones.md:18` | `pilot-agent-runs.md:14`, `remaining-work.md:11` | ✓ |
| 6 | `00-roles-and-zones.md:20` | `execution-analysis.md:377` | **✗** — class C row is `:374`; `:377` is blank |
| 7 | `00-roles-and-zones.md:21` | `pilot-agent-runs.md:17` | ✓ 61 min, 298.7k |
| 8 | `00-roles-and-zones.md:22` | `execution-analysis.md:228` | ✓ |
| 9 | `00-roles-and-zones.md:24` | `pilot-agent-runs.md:16` | ✓ 38 min |
| 10 | `00-roles-and-zones.md:25` | `theme-surface-defects.json:214-218` | ✓ |
| 11 | `00-roles-and-zones.md:36` | `2026-09-08-wave2-program.md:193` | ✓ 20:42 / 21:47 |
| 12 | `00-roles-and-zones.md:57` | `execution-analysis.md:121` | ✓ verbatim |
| 13 | `00-roles-and-zones.md:61` | `pilot-agent-runs.md:53-57` | ✓ |
| 14 | `00-roles-and-zones.md:143` | `890c8ea` touches `migration-scripts/lib/products.ts` | ✓ `git show --name-only` |
| 15 | `00-roles-and-zones.md:168` | `s1c-profile-blocks-report.md:280-284` | ✓ |
| 16 | `00-roles-and-zones.md:170` | `brief-analysis.md:832-833` | **✗** — sentence is at `:834-835` |
| 17 | `00-roles-and-zones.md:186` | `execution-analysis.md:148` "exit code 2" | **✗** — exit 2 is check 3 at `:149`; `:148` is exit 1 |
| 18 | `00-roles-and-zones.md:197` | `execution-analysis.md:166` | ✓ |
| 19 | `00-roles-and-zones.md:207,210` | `execution-analysis.md:156,157` | ✓ L1/L2 |
| 20 | `01-steps.md:28` | `brief-analysis.md:698-712` | ✓ verbatim order |
| 21 | `01-steps.md:51-52` | `theme-surface-defects.json:37,68` | ✓ 44/176, 18/4 |
| 22 | `01-steps.md:110` | `execution-analysis.md:398` | ✓ the line says it — the tree no longer does (C-10) |
| 23 | `01-steps.md:134` | `execution-analysis.md:331` (`pkill`) | **✗** — `pkill` row is `:330`; `:331` is Replicate |
| 24 | `01-steps.md:143` | `execution-analysis.md:84` | ✓ 6 min lag |
| 25 | `01-steps.md:165` | `brief-analysis.md:662` "2 contradictions… both shipped" | **✗** — at `:658-659`; `:662` is the budget line |
| 26 | `01-steps.md:221` | `ivan-directives…md:75-86` | **✗** — registry format is `:94-105` |
| 27 | `01-steps.md:242` | `execution-analysis.md:226` | ✓ 311.5 s / 16.4 s |
| 28 | `01-steps.md:251` | `2026-09-08-wave2-program.md:191,193` | ✓ |
| 29 | `01-steps.md:264` | `s6a-theme-assembly-report.md:236` | ✓ `--chart-1…5` |
| 30 | `01-steps.md:309` | `s6a-theme-assembly-report.md:128-139` | ✓ §6.2 |
| 31 | `01-steps.md:322` | `output-and-gates.md:310,312` | ✓ |
| 32 | `01-steps.md:340` | `output-and-gates.md:430` | ✓ |
| 33 | `01-steps.md:357` | `theme-surface-defects.json:228` | ✓ |
| 34 | `01-steps.md:418-420` | `ivan-directives…md:85-86`, `:90-92` | **✗** — now `:104-105`, `:109` |
| 35 | `01-steps.md:440` | `ivan-directives…md:10-16` | ✓ (before the shift) |
| 36 | `02-gates-and-handover.md:16` | `output-and-gates.md:427` | ✓ |
| 37 | `02-gates-and-handover.md:23` | `output-and-gates.md:46` | ✓ nine of sixteen |
| 38 | `02-gates-and-handover.md:60` | `output-and-gates.md:56` | ✓ (`:54-58`) |
| 39 | `02-gates-and-handover.md:79` | `output-and-gates.md:297` | ✓ verbatim |
| 40 | `02-gates-and-handover.md:81` | `remaining-work.md:15` | ✓ 0.0606 % |
| 41 | `02-gates-and-handover.md:91` | `output-and-gates.md:42,174` | ✓ 1.75 / 2.06 |
| 42 | `02-gates-and-handover.md:102` | `execution-analysis.md:391` | ✓ S1a envelope |
| 43 | `02-gates-and-handover.md:111` | `execution-analysis.md:325` | **✗** — `run-record` row is `:328`; `:325` is `zones.mjs` |
| 44 | `02-gates-and-handover.md:111` | `execution-analysis.md:388` | ✓ |
| 45 | `02-gates-and-handover.md:112` | `brief-analysis.md:635` | ✓ |
| 46 | `02-gates-and-handover.md:116` | `execution-analysis.md:390-391` | ✓ |
| 47 | `02-gates-and-handover.md:138-140` | six report sections (`s1a:191`, `s1b:448`, `s1c:286`, `s3:239`, `s4:226`, `s6a:222`) | ✓ all six headings |
| 48 | `02-gates-and-handover.md:147` | `pilot-agent-runs.md:46-48` | ✓ |
| 49 | `02-gates-and-handover.md:195-198` | predecessor `:23`, successor `:29`, `brief-analysis.md:72`, registry `:239-244` | ✓ all four |
| 50 | `02-gates-and-handover.md:199-200` | `brief-analysis.md:74`, `:165-166` | ✓ |
| 51 | `02-gates-and-handover.md:211-214` | `brief-analysis.md:39`, `:194` | ✓ |
| 52 | `03-failures-and-economics.md:22-24` | `output-and-gates.md:21-26` | ✓ 81 / 86 / 28 of 41 |
| 53 | `03-failures-and-economics.md:69` | `s1b-theme-bridge-report.md:464` | ✓ verbatim |
| 54 | `03-failures-and-economics.md:115` | `s1c-profile-blocks-report.md:269-278` | ✓ |
| 55 | `03-failures-and-economics.md:149` | `pilot-agent-runs.md:17,51-52` | ✓ |
| 56 | `03-failures-and-economics.md:152` | `ivan-directives…md:11-13` | ✓ |
| 57 | `03-failures-and-economics.md:167` | `execution-analysis.md:99` | **✗** — timestamps are at `:91`; `:99` is a ruler |
| 58 | `03-failures-and-economics.md:212` | `execution-analysis.md:44-48` | **✗** — 2.20 and 44/98 are at `:53-54`; `:44-48` are table rows |
| 59 | `03-failures-and-economics.md:264` | `s4-images-report.md:50-54` | **✗** — at `:45-47` |
| 60 | `03-failures-and-economics.md:275` | `s4-images-report.md:28-40` | ✓ |
| 61 | `03-failures-and-economics.md:280` | `s4-images-report.md:44-47` | **✗** — blockquote is `:41-43` |
| 62 | `03-failures-and-economics.md:287` | `00-program-2026-09-07.md:114` | ✓ "$0,06 около $1,1" |
| 63 | `03-failures-and-economics.md:288` | `s4-images-report.md:54` | **✗** — at `:47` |
| 64 | `03-failures-and-economics.md:293` | `s4-images-report.md:55` | **✗** — at `:49-51` |
| 65 | `03-failures-and-economics.md:299-301` | `ivan-directives…md:62-64` | **✗** — now `:81-82` |
| 66 | `03-failures-and-economics.md:316` | `ivan-directives…md:66-67` | **✗** — now `:85-86` |
| 67 | `03-failures-and-economics.md:318` | `ivan-directives…md:69-86` | **✗** — now `:88-105` |
| 68 | `03-failures-and-economics.md:325` | `ivan-directives…md:94-102` | **✗** — now `:113-121` |
| 69 | `03-failures-and-economics.md:328` | `ivan-directives…md:104-118` | **✗** — now `:123-137` |
| 70 | `03-failures-and-economics.md:336` | `remaining-work.md:37` | ✓ 596 MB |
| 71 | `03-failures-and-economics.md:378` | `s6a-theme-assembly-report.md:238-239` | ✓ |
| 72 | `03-failures-and-economics.md:383` | `remaining-work.md:53` | ✓ |

Totals: **72 checked, 51 held, 21 failed** — 9 from the one systematic cause (C-11), 12 independent
offsets of 1–7 lines (C-14). In no failed case did the nearby text contradict the claim; in one held case
(#22) the cited line is accurate and the tree has moved on (C-10).

### 2.2 Numbers — 22 re-derived, 5 failed

| Claim | Where | My command / arithmetic | Result |
|---|---|---|---|
| 307 storefront `.ts/.tsx/.css` | `00-roles-and-zones.md:69` | `find apps/storefront/src \( -name '*.tsx' -o -name '*.ts' -o -name '*.css' \) \| wc -l` | ✓ 307 |
| 313 all files; 6 non-code | `:70,101-111` | `find … -type f \| wc -l`; the `!`-filter | ✓ 313; ✓ the six named files |
| Zones 16/29/36/20/15/48/21/42/80 | `:75-84` | per-zone `find` (15+1, 29, 36, 20, 15, 48, 21, 43−1, 79+1) | ✓ all nine; sum 307 |
| 429 = 32 + 316 + 81 backend | `:142-153` | `find apps/backend/src -type f \| wc -l`; per sub-tree | ✓ (note: `initial-data-seed.ts` is inside `migration-scripts/`, already in the 316) |
| 44 files / 176 occurrences | `01-steps.md:51` | registry regex in `apps/storefront/src` | ✓ 176 / 44 |
| 168 (retro) vs 176 (registry) | `brief-analysis.md:31` vs registry `:37` | M3 regex `(bg\|text\|border)-…` | 168 — a narrower regex, not a disagreement; the process cites both without saying so (C-12) |
| 18 `outline-none` / 4 `focus-visible:ring` | `01-steps.md:52` | `grep -roE` both | ✓ 18 (12 files) / 4 |
| 0 `dark:` utilities | `03-failures-and-economics.md:61-62` | `grep -roE '\bdark:[a-z-]+'` | ✓ 0 |
| 216 agent-min, 2.20, 44 of 98 | `03-failures-and-economics.md:210-211` | 16+33+38+61+24+27+17; 216/98; 2+22+14+6 | ✓ 216; 2.204; 44 |
| 33 acceptance lines | `02-gates-and-handover.md:26` | A6 + B8 + C8 + D3 + E6 + F2 (`output-and-gates.md:436-493`) | ✓ 33 |
| 15 steps; 14 DoD rows | `theme-creation-process.md:84,46` | 3 + 12; DoD-1…14 | ✓ / ✓ |
| **14 gates** | `02-gates-and-handover.md:10` | rows in the table | **✗ 16** |
| **Machine (11)** | `:31-33` | names listed | **✗ 12** |
| **13 screens** | `theme-creation-process.md:71` | `node -e` over `defects[]` | **✗ 14 images, 14 surfaces** |
| **≈ 139 min per profile** | `03-failures-and-economics.md:208` | sum of the table's own rows | **✗ 152 with W10 (147 without); 139 = retro total that omits S8** |
| **Heavy lane 52 = W6 + W7** | `:220` | 17 + 35; W7's own row says ≈ 8 | **✗ the 35 is W9's extrapolation** |
| ≈ 104 scans from S01–S28 | `01-steps.md:322` | 28 × 2 × 2 | 112; "104" is the retro's "~26 surfaces" — approximate, not wrong |
| 19 renders, 4 flagged = 21 % | `03-failures-and-economics.md:262` | 4/19 | ✓ 21.05 % |
| `prompts.json` shape | `01-steps.md:222-227` | `node -e` on `artifacts/media/sneakers/prompts.json` | ✓ 19 frames, keys as listed, no `sharedPreamble`/`cells`, 1187–2509 chars |
| 92-line brief | `02-gates-and-handover.md:210` | `wc -l docs/prompts/initial-prompt-2026-09-07-orchestrator-store-profiles.md` | ✓ 92 |
| 98-min wall clock | `03-failures-and-economics.md:210` | 20:26 → 22:04 | ✓ 98 |
| 680 px cell at 2K | `:306` | 2048 / 3 | ✓ 682.7 — but superseded by 4K → 1365 at HEAD (C-11) |
| Directive shift | C-11 | `git diff --stat d39d10b HEAD -- …ivan-directives…md` | 19 insertions, lines 53–71 |

---

## §3. The author's nine open questions (`03-failures-and-economics.md:397-422`)

| n | Question | Verdict | Why |
|---|---|---|---|
| 1 | Backend zone map is the author's | **author decided — openly, and the arithmetic holds.** Not for Ivan. | 32 + 316 + 81 = 429 re-derived; the ten commits' `--name-only` is the right basis. Residue: `Z-BACKEND-APP` = "nobody" needs the `git status` assertion written into W6's gate, where it currently is not (`01-steps.md:303-306`). |
| 2 | Per-profile OG/Twitter share image | **for Ivan.** | It is money (a paid render per profile, price unmeasured, §8.3) and portfolio identity. One yes/no; until then Z-BRAND-ASSETS' W6 work is "explicitly deferred", which the DoD must then allow (DoD-10 covers rendered text only). |
| 3 | Step numbering F/W | **author decided silently** — and added a fourth scheme. Not for Ivan. | The prompts Ivan launches carry T-fix/T-gate/W0–W10 (`2026-09-08-wave2-stage-prompts.md`, headings); the process should adopt those codes and name F3/W11 as additions to *that* scheme, not remap all three. |
| 4 | W4 has no standalone duration | **dressed-up unknown; close it by noting it is off the critical path.** | W4 ∥ W2→W3→W5 = 71 min (`01-steps.md:442-443`); W4 ≤ 17 (upper bound, `:266-268`). It cannot bind the schedule by ≥ 54 min. No timestamps exist inside the S6a report to split it (`grep -o '2[012]:[0-5][0-9]' …s6a-theme-assembly-report.md` → none). |
| 5 | W8 has no duration and sits in the heavy lane | **measurable today** — and one half is for Ivan. | The sheet exists (`output-and-gates.md:428-495`), the pilot stand is live (`remaining-work.md:4`). Command: launch the creative-director agent with the sheet against `http://localhost:8028` in both modes/viewports, `run-record.mjs start/finish` (or `date` before and after), and copy the duration and token count; that is also DoD-9 for `sneakers`. The half for Ivan: whether W8's eyes are an Opus agent's or a human's (C-07). |
| 6 | Who owns the `prompts.json` migration | **author decided — in his own role table.** Not for Ivan. | "Image producer owns … the prompt registry" (`00-roles-and-zones.md:20`). The only open bit is *when* for `sneakers`: before W11, since W11 rebuilds prompts from the registry (`01-steps.md:415-420`). |
| 7 | F3 is a step the author created | **author decided, consistent with the record for items 1–2; wrong for item 3.** | S6a names the owner: "Owner: S1a" (`s6a-theme-assembly-report.md:126`); `remaining-work.md:31-32` puts it before S7. Item 3 is already fixed (C-10) and would be Z-ROUTES/Z-BROWSE, not the seed engineer's. |
| 8 | d-06 / d-11 routing | **split: d-06 for Ivan; d-11 closed by measurement.** | d-06 is Ivan's own "possibly intended" (`theme-surface-defects.json:137`) — one word from him closes it. d-11 is measured at 1.75:1 / 2.06:1 (`output-and-gates.md:42,174`); the process already routes it to R5 + F1/Z-CHROME (`02-gates-and-handover.md:88-93`). Nothing is open. |
| 9 | Enforcing "F1–F3 merged before the wave" | **measurable today, here is the command.** Not for Ivan. | W0's gate gains: `git merge-base --is-ancestor <feat/store-theme-surface head> dev && cd apps/storefront/src && test "$(grep -roE '<canonical regex>' . \| wc -l)" -eq 0 && grep -q theme:coverage ../package.json` — three exit codes, printed. A rule with a command is a gate; without one it is the prose the author calls "no mechanism" (`03-failures-and-economics.md:344-348`). |

---

## §4. What the document gets right and must survive the revision

- **The zone identity is real and it closes.** 307 = 16+29+36+20+15+48+21+42+80, 313 = 307 + 6, 429 =
  32+316+81 — every figure re-derived exactly (§2.2). The six-file hole with the starter's own share card
  in it (`00-roles-and-zones.md:95-131`) is a genuine catch the retro missed. Keep §2.2–2.3 verbatim.
- **"A zone is a compilation closure, not a file set"** (`00-roles-and-zones.md:54-57`, from
  `execution-analysis.md:121`) is the correct lesson of both incidents; C-02 is a demand that the document
  obey it, not a doubt about it.
- **Measured vs extrapolated is labelled honestly** almost everywhere: 216 / 2.20 / 44 / 98 / 176 / 18 / 4 /
  0 / 33 / 19 / 4 all hold; W5, W7, W8, W9, W10 are marked unmeasured; §9 item 13 ("It has not been
  executed once", `03-failures-and-economics.md:387-389`) is the right last sentence.
- **The W4 discovery** — the palette existed at 20:42 and the theme stage started at 21:47
  (`00-roles-and-zones.md:34-36`, `01-steps.md:249-251`) — is real and correctly turned into a trigger.
- **H1, H3, H6** (`02-gates-and-handover.md:108,110,113`) — close on a file; record what was measured on the
  artefact the fix produced; never message a live child — are each proven by a pilot event and are the
  part of the handover contract that needs no tooling to obey.
- **"Cost = iterative measurement cycles in the window"** with class E at 250k and a checkpoint at 120k
  (`03-failures-and-economics.md:238-251`) is the correct reading of 298.7k vs 122.1k.
- **The coverage-gate essentials**: expected tokens from `theme.json`, never from `themes.css`; mode
  asserted on `html[data-mode]` before scanning; R1/R2/R10 anchors; both modes and both viewports
  (`01-steps.md:78-82`, `02-gates-and-handover.md:25`). C-06 asks for four amendments, not a different gate.
- **R15 brand-string** and the measured "Upready Store" wordmark on every page
  (`02-gates-and-handover.md:56-60`) — a defect nobody had listed, caught by a rule that names it.
- **§2.6's shape** — blocked worker files a request and moves on; the orchestrator repairs only after the
  owner has finished and then runs the owner's gate; never a second repairer — is right. C-03 is about the
  owner and the clock being undefined, not about the shape.
- **The p-05 diagnosis** (two clauses, one transcription, two of four root causes,
  `02-gates-and-handover.md:194-202`) is exact and should stay as the motivation even after C-04 rewrites the rule.
