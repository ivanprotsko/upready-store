# §4 Gates · §5 Handover protocol · §6 The brief rule

Module 3 of 4. Parent index: [`theme-creation-process.md`](./theme-creation-process.md). The steps these
gates belong to are in [`01-steps.md`](./01-steps.md).

---

## §4. Gates

Fourteen gates. "Catches" lists defect ids from `artifacts/registries/theme-surface-defects.json:92-203`.

| Gate | M/H | Step | What it proves | What it CANNOT prove | Exit condition | Which of the 14 defects it catches |
|---|---|---|---|---|---|---|
| **G-ZONE** | M | W0, F1 | Every file in the tree has exactly one owner | That the owner will do the work | zone sums = tree total, 0 unowned, `zones.mjs check` exit 0 | none directly; it is the **precondition** without which d-02, d-07, d-08, d-09, d-10, d-13, d-14 have no owner |
| **G-PREFLIGHT (L1/L2)** | M | W0, heartbeat | `@import` order in CSS; no `:global(` in a plain sheet; no unpure top-level rule in a module | Anything about colour | both greps clean | none — it catches the two **incidents**, not the defects |
| **G-LINT** | M | F1 | No literal colour class outside the allow-list | Inheritance, `color-mix()`, the UA default (`artifacts/docs/retro/output-and-gates.md:427`) | 176 → 0 outside the allow-list | d-02, d-06, d-07, d-08, d-09, d-10, d-13, part of d-14 |
| **G-FOCUS-COUNT** | M | F1 | Every cleared outline has a replacement in the same class list | That the ring is the preset's colour once painted | `outline-none` count ≤ `focus-visible:ring` count — **18 vs 4 today, so RED today** | d-03, d-04 |
| **G-EXIT-TRUTH** | M | F3 | A failed seed and an argument-less validator exit non-zero | That a *successful* seed is correct | both non-zero exits copied from a real run | none — it catches the "green report over empty reality" class |
| **G-GATE-PROVES-RED** | M | F2 | The new gate fails on a tree with known defects | That it will catch an unknown defect class | 14 of 14 registry defects matched by finding id | all 14, by construction |
| **G-BOARD** | M+H | W1 | Sections present, contrast pairs computed, 0 cross-document contradictions | That the palette is beautiful, or that it suits the vertical | script exit 0, min ratio ≥ 4.50:1, 0 contradictions | none on screen; it stops the **2 contradictions** the pilot shipped |
| **G-CATALOG** | M+H | W2 | Counts, lengths and schema validity **in place**; a blind reader can identify a description | That the prose is good (`artifacts/docs/retro/brief-analysis.md:890-894`) | validator exit 0 against the repo path; blind read-back 3/3 | none |
| **G-MANIFEST** | M | W3 | Frame-count identity; manifest = files = sha256; flagged frames listed | The **price** — the provider exposes none (§8.3) | three independent recounts agree; cost `null` + the word `unmeasured`, never `0` | none |
| **G-THEME** | M | W4 | Key-set completeness; every declared pair's ratio recomputed from the written JSON | That the tokens are ever painted — 9 of the 16 board pairs are painted nowhere (`output-and-gates.md:46`) | `N keys, 0 missing`; pairs within ± 0.01 | none |
| **G-SEED** | M | W6 | The database really holds the catalog; every image URL 200; the app builds | Anything about colour | `psql` counts = `catalog.counts`; 200 on every URL; `tsc`/`lint`/`build` 0 | none |
| **G-COVERAGE** | **M** | W7 | Every rendered colour on 28 surfaces × 2 modes × 2 viewports belongs to the active preset; contrast floors hold; named roles carry their tokens; the brand string is the profile's | Hover, active and pressed states — no token, no mechanical count (`brief-analysis.md:884-889`). Whether the shop is *good* | exit 0; FAIL on R1–R10 and R12–R15; R11 counted as WARN | **all 14** — mapping below |
| **G-VISUAL** | **H** | W8 | One brand, one catalog, a shop and not a template, continuity, states, copy against picture — 33 lines, each `meets`/`does not meet` | Anything a machine already proved; it must not be spent re-checking colours | 0 `does not meet` in A–E; F lists every flagged frame by decision | the **class Ivan actually found** — it is the step whose absence made him the first human to see the store |
| **G-VERIFY** | M | W9 | The numbers survive a `DROP` and a reseed by a stranger; every check has a red reverse run | That anything unmeasured is fine | 0 failures, every reverse run RED | re-proves all 14 independently |
| **G-IVAN** | **H** | stop gate | The owner says yes | — | his words | — |
| **G-HANDOVER** | M | W10 | The tree is clean and no build artefact was committed | Anything about the product | `git status` clean; no file > 1 MB; `.gitignore` media rules present | none |

**Machine (11):** G-ZONE, G-PREFLIGHT, G-LINT, G-FOCUS-COUNT, G-EXIT-TRUTH, G-GATE-PROVES-RED,
G-MANIFEST, G-THEME, G-SEED, G-COVERAGE, G-VERIFY, G-HANDOVER *(twelve counting G-HANDOVER, which is
bookkeeping rather than a product gate)*.
**Human eyes (2):** **G-VISUAL**, **G-IVAN**.
**Mixed (2):** G-BOARD and G-CATALOG each carry a machine count plus exactly one judgement.

### 4.1 G-COVERAGE against the fourteen defects, rule by rule

| Defect | Symptom | Cause | Rule that fires |
|---|---|---|---|
| d-01 | cart heading black on ink | A | R2 `root-painted`, then R3/R5 |
| d-02 | light-grey skeleton blocks on a dark page | B | R6 `surface-in-palette` |
| d-03 | listing Colourway dropdown: browser-blue ring, near-black labels | C + A | R8 `focus-ring`, R14 `role-anchor` (popover) |
| d-04 | listing Size dropdown, same | C + A | R8, R14 |
| d-05 | category heading black on black | A | R2, R5 |
| d-06 | white hairline instead of `--border #262626` | B | R7 `border-in-palette` |
| d-07 | white site header | B | R4 `bg-in-palette`, R6 |
| d-08 | white site footer | B | R4, R6 |
| d-09 | white cart drawer, grey heading | B | R4, R6 (surface S10) |
| d-10 | white cart drawer, `bg-black` count badge | B | R6 |
| d-11 | disabled add-to-cart near-invisible | B | R5 `contrast` |
| d-12 | reset-password heading black on black | A | R2, R5 |
| d-13 | white checkout summary column | B + A | R4, R6 (surfaces S22/S23) |
| d-14 | mobile drawer black-to-white gradient | A + B | R4 at 390 px (surface S12) |

Rule numbers are `output-and-gates.md:380-396`. Beyond the fourteen, R15 `brand-string`
(`output-and-gates.md:396`) catches the wordmark the owner's list does not contain: measured live, every
page reads **"Upready Store"** — `[nav-store-link]` text, `<title>` "Cart | Upready Store", footer
"© 2026 Upready Store", "Powered by" — so the profile's brand name appears nowhere in the chrome
(`output-and-gates.md:56`).

R2 + R3 + R5 together are the cheap smoke: if R2 fails, R3 and R5 fail on every inherited element, and the
report says so **once** (`root cause: R2`) instead of 200 times (`output-and-gates.md:398`).

### 4.2 `theme:coverage` replaces T0h.5 — its place in the flow

The specification is `output-and-gates.md:293-427` and is **not re-derived here**. Its place in the flow:

- **T0h.5 stays** as a regression proof **for the `medusa` preset only** — its purpose is that the bridge
  does not move the vendor look — **and it is not a gate for a profile** (`output-and-gates.md:424`).
- **`theme:coverage` runs on every preset a profile names**, in the profile's own catalog, as a
  **blocking** stage (W7) **before** the human acceptance of W8 (`output-and-gates.md:425`).
- The literal-colour **lint** is the cheap pre-check that catches root cause B at commit time; it does not
  replace the gate, because it cannot see inheritance, `color-mix()` or the UA default
  (`output-and-gates.md:427`).

Why the swap was necessary, in the pilot's own words: T0h.5 *"cannot fail on a surface the preset never
reaches — `bg-white` on the header is identical in both passes, so it contributes 0 diff pixels and
passes"* (`output-and-gates.md:297`). It measured four pages, light mode only, one viewport, every image
replaced by a transparent pixel — and returned max 0.0606 % against a 0.1 % budget
(`artifacts/docs/2026-09-07-remaining-work.md:15`). **It was green and the header was white.**

### 4.3 Two caveats a critic should hold me to

- **d-06** (the white PDP hairline) is marked `"to confirm — Ivan flagged it as possibly intended"`
  (`theme-surface-defects.json:137`). R7 will flag it; whether that is a defect or a design choice is a W8
  judgement, not a machine verdict.
- **d-11** (disabled add-to-cart) is marked `"needs its own measurement of the disabled token pair"`
  (`theme-surface-defects.json:177`). The gates retro supplies the measurement: `--fg-disabled` on
  `--bg-disabled` is `rgb(70,70,70)` on `rgb(31,31,31)` = **1.75:1** dark and `rgb(169,169,169)` on
  `rgb(240,240,240)` = **2.06:1** light (`output-and-gates.md:42`, `:174`). So R5 catches it — but the
  *root* is a bridge-derived pair, not a component, and fixing it means changing the bridge, which is
  F1/Z-CHROME work and not a repaint of a component.

---

## §5. Handover protocol between steps

**The founding lesson: a green agent report is not disk state.** The memory entry is
`feedback_agent_report_is_not_disk_state.md` (`docs/store-profiles/00-program-2026-09-07.md:118`), and the
pilot proved it again from the other side: S1a's envelope never reached the orchestrator, and the work
survived **only because it was on disk** (`artifacts/docs/retro/execution-analysis.md:391`).

### 5.1 The contract

| # | Rule | Source |
|---|---|---|
| H1 | **A stage closes on a file, never on a received message.** The report lands at a path the next stage can open; if the envelope is lost, the stage is still closed. | `execution-analysis.md:391` |
| H2 | **The orchestrator verifies by re-running the producer's own measurement**, not by reading the producer's number. Counts are recounted; exit codes are re-run; `psql` replaces the log. | `brief-analysis.md:684`, `:757-762` |
| H3 | **The record of a fix states what was measured on the artefact the fix produced**, not on the one it left behind. | `theme-surface-defects.json:236` |
| H4 | **`run-record.mjs start` at launch, `finish` at return** — name, role, start, budget, inputs, zone at launch; finish and token count at return. Without it there is nothing to exceed. | `execution-analysis.md:325`, `:388` |
| H5 | **The orchestrator writes every agent's actual token spend into `.ai/progress.md` the moment it returns.** | `brief-analysis.md:635` |
| H6 | **No message to a live child.** A channel into a running worker is a file it polls, or nothing. | rule 22i, `execution-analysis.md:167` |
| H7 | **Reports do not enter the orchestrator's window.** A stage report needing judgement goes to a verifier agent (≤ 80k). | `execution-analysis.md:311` |
| H8 | **A finding nobody asked for has a slot.** Every stage report carries a section `Findings outside my checklist`, and the orchestrator must merge each entry into `theme-surface-defects.json` or write the reason it did not. | §7.12 of [`03-failures-and-economics.md`](./03-failures-and-economics.md) |
| H9 | **At 100 % of budget the orchestrator writes `stop` to `artifacts/wave2/control/<agent>.json` — never a message.** At 150 % it takes what is already on disk and re-issues the remainder to a fresh agent with a narrowed task, because a 300k agent costs more than two 150k agents. | `execution-analysis.md:390-391` |

### 5.2 The envelope, per step

Each stage hands over exactly this, on disk, before it is called closed:

```
artifacts/docs/<date>-<step>-<role>.md      the report, containing:
  · files created and changed, by literal path
  · every number with the command that produced it
  · the gate name it cleared, and that gate's output pasted
  · "What I could NOT verify"          — mandatory, never empty by default
  · "Findings outside my checklist"    — mandatory (H8)
  · package.json entries it needs      — NAMED, not written (Z-CONFIG is the orchestrator's)
artifacts/wave2/runs/<agent>.json           milestones as {ts, milestone, tokensUsed}
<the step's own outputs>                    at the paths 01-steps.md names
```

The orchestrator's acceptance of an envelope is: the output paths exist, the gate re-runs green **in the
orchestrator's own shell**, and the "could NOT verify" list is read and either closed or carried into the
next step's inputs.

The pilot's stage reports **did** carry that section — `2026-09-07-s1a-seed-profile-report.md:191`,
`s1b-theme-bridge-report.md:448`, `s1c-profile-blocks-report.md:286`, `s3-catalog-report.md:239`,
`s4-images-report.md:226`, `s6a-theme-assembly-report.md:222`. What was missing was a **step that consumed
it**.

### 5.3 What was lost in the pilot for want of this

- **Three of seven agent names are nowhere on disk.** `progress.md` opened an "agent <name>" column only for
  the first wave of four; S2, S4 and S6a are recorded by role, and the agent panel did not survive `/clear`
  (`artifacts/docs/2026-09-07-pilot-agent-runs.md:46-48`).
- **Five of seven token counts are `н/д`** — honestly "written nowhere", not zero
  (`pilot-agent-runs.md:49-50`).
- **Two documents contradict each other about one repair, and the third state exists in neither**
  (`execution-analysis.md:111`). A `build-heartbeat.mjs` writing `artifacts/wave2/build-status.json` with a
  timestamp makes "the build is red" a fact on disk rather than an agent's claim
  (`execution-analysis.md:165`).

---

## §6. The brief rule

### 6.1 How a brief for the next profile is derived from this process

A brief for profile `<id>` is this process plus eight substituted parameters: `<PROFILE_ID>`,
`<VERTICAL>`, `<BACKEND_PORT>`, `<STOREFRONT_PORT>`, `<DB_NAME>`, `<TASK_ID>`, `<ARCHITECT_SESSION>`,
`<PROGRAMME_ROW>` — the row of `docs/store-profiles/00-program-2026-09-07.md:71-82`
(parameter list: `brief-analysis.md:545-546`). The ready-to-paste template with those parameters already
wired is `brief-analysis.md:540-864`; the per-stage prompts are
`artifacts/docs/2026-09-08-wave2-stage-prompts.md`.

Authority, so a conflict has a resolution rather than an argument:

- **This process** is the authority on *what the steps are and who owns them*.
- **The programme** (`00-program-2026-09-07.md`) remains the authority on *what the ten profiles are*
  (`brief-analysis.md:907-909`).
- **The brief template** is the authority on *how a stage is proved*.

Fixed content every brief carries unedited: the zone map and its arithmetic (§2), the gate table (§4), the
envelope contract (§5), and the off-limits list (`brief-analysis.md:828-834`,
`00-program-2026-09-07.md:118`).

### 6.2 The diff rule — from p-05

> **A brief transcribed from an earlier brief is carried over point by point, and every dropped point
> carries its recorded reason.** (`theme-surface-defects.json:243`)

Mechanically, at brief-writing time:

1. Produce a **clause-level diff** of the predecessor brief against the new one. Not a summary — a list in
   which every clause of the predecessor appears exactly once, marked `kept` / `reworded` / `dropped`.
2. Every `dropped` clause carries a one-line reason **in the new brief**, under a heading
   `Clauses dropped from <predecessor path> and why`.
3. A clause dropped **without** a reason is a defect in the brief, and the orchestrator fixes the brief
   before launching an agent — the same disposition as an unowned file (§2.5 rule 1).
4. The diff itself is committed beside the brief, so a later retro can read it.

**Why the rule is written this hard.** Root cause A was not an oversight of thought — it was a loss in
transcription. `docs/prompts/initial-prompt-2026-09-06-orchestrator-theme-presets-panel.md:23` demanded
three assertions in T0h.5; the third, verbatim: *"…and that `body` background follows"*. The
store-profiles brief line 29 kept the pixel half and dropped that clause
(`brief-analysis.md:72`, `theme-surface-defects.json:239-244`). The same brief's line 14 copied three counts
out of the predecessor's line 15 and dropped the fourth fact standing beside them — *"the code has zero
`dark:` utilities"* — which is root cause D (`brief-analysis.md:74`, `:165-166`).

**Two clauses, one transcription, two of the four root causes.**

### 6.3 The acceptance rule — from p-06

> **A brief whose acceptance names a surface must have a step that owns that surface.**
> (`theme-surface-defects.json:250`)

Mechanical check at brief-writing time: extract every noun from the acceptance section and, for each, name
the step and the zone that owns it. In the pilot's 92-line brief the words `footer`, `nav`, `skeleton`,
`account`, `drawer` and `side-menu` occurred **zero** times; `header` occurred once and was `headers()`, the
Next.js function; `body` occurred once and was `--font-body` (`brief-analysis.md:39`) — while line 70 stated
Ivan's acceptance as *"the palette is one and the same on home, listing, product and cart"*
(`brief-analysis.md:194`).

The cart drawer, the header and the footer were named in the acceptance criterion and named nowhere in the
work. That is the whole failure in two lines of one file: **an acceptance criterion with no stage behind
it, checked for the first time by the owner** (`brief-analysis.md:196-198`).

---

Next: [`03-failures-and-economics.md`](./03-failures-and-economics.md).
