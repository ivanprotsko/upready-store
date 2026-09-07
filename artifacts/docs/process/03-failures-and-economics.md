# §7 Failure catalogue · §8 Economics · §9 Limits · §10 Open questions

Module 4 of 4. Parent index: [`theme-creation-process.md`](./theme-creation-process.md). Steps are in
[`01-steps.md`](./01-steps.md); gates and the zone rules in
[`02-gates-and-handover.md`](./02-gates-and-handover.md) and
[`00-roles-and-zones.md`](./00-roles-and-zones.md).

---

## §7. Failure catalogue

Format: **the event as it happened → the step that now owns it → the gate that now stops it.**

### The four root causes

#### 7.1 — A: `body` has no background and no colour rule

*Event.* `globals.css:31-34` carried `html { @apply bg-ui-bg-base; }` with no `color`; `app/layout.tsx:33`
rendered a bare `<body>`; no `body {}` rule existed in `src/styles`
(`artifacts/registries/theme-surface-defects.json:10-31`,
`artifacts/docs/retro/brief-analysis.md:29`). Every heading that inherited its colour rendered
browser-black on the ink page. Measured on the live stand: `h1` `rgb(0,0,0)` on `rgb(10,10,10)` = **1.06:1**
on **all 81 scans**, 86 elements across 28 of the 41 dark scans
(`artifacts/docs/retro/output-and-gates.md:21-26`). **It is one CSS rule, not thirteen bugs.**

*Owner now.* **F1 / Z-CHROME**, as its named extra deliverable that no other zone may take.
*Gate now.* **G-COVERAGE rule R2** (`root-painted`) — "catches root cause A on every page at once"
(`output-and-gates.md:383`).
*Subtlety a critic should keep.* The fix location was inside S1b's declared zone all along, so **A was not
a zone gap** — it was a missing order and a deleted check (`brief-analysis.md:75`).

#### 7.2 — B: 44 files paint with literal Tailwind colours

*Event.* 44 files, **176 occurrences**; the narrower first count of 42 omitted `slate`, `stone` and the
non-background properties. Top offenders: `bg-gray-100` ×53, `bg-gray-200` ×21, `bg-white` ×18,
`text-white` ×10, `bg-black` ×9, `text-zinc-600` ×7, `border-gray-200` ×7
(`theme-surface-defects.json:37`). These surfaces stay white or light grey under **every** preset —
invisible to the theme bridge by construction.

*Owner now.* **F1**, all seven storefront zones; the whole tree is covered by §2.2.
*Gate now.* **G-LINT** at commit time (cheap, cannot see inheritance) and **G-COVERAGE R4/R6/R7** at run
time.

#### 7.3 — C: 18 `outline-none` against 4 focus rings

*Event.* The brief ordered `ring` as a palette token the creative director must invent
(`brief-analysis.md:137`) and ordered no consumer. The token exists — `sneakers` dark `#d6ff3b`, light
`#4c6600` — and is unused (`theme-surface-defects.json:69`). Measured live: over 8 Tab walks (4 pages × 2
modes, ~30 stops each) the token appears on **exactly one element**; 20–27 stops per page show Chrome's own
`outline: auto 1px rgb(0, 95, 204)`, and every input shows Medusa blue from the bridge's 28 `open` rows
(`output-and-gates.md:19-58`, finding 3). **So C is not "18 sites" — it is the absence of any focus-visible
rule plus a bridge that ships the vendor's blue by design.**

*Owner now.* **F1**, every zone, in the same class list as each `outline-none` it touches.
*Gate now.* **G-FOCUS-COUNT** (the identity) and **G-COVERAGE R8** (the paint).
*The shape shared by A, B and C:* **a token layer was commissioned and no stage was made responsible for
the layer that consumes it** (`brief-analysis.md:138`).

#### 7.4 — D: `darkMode: "class"` while the theme switches on `data-mode`

*Event.* `apps/storefront/tailwind.config.js:4` is `darkMode: "class"`; zero elements carry a `dark` class;
zero `dark:` utilities exist; `themes.css` switches on `data-mode` with 9 selectors
(`theme-surface-defects.json:83`, `brief-analysis.md:34`). This is a **trap for the repaint**, not a defect
on screen today: any engineer fixing class B who reaches for `dark:bg-…` writes CSS that never applies.

*Owner now.* **F1 / Z-CHROME**, in the same commit as the first repaint, with the throwaway-element proof.
*Gate now.* The proof itself; **G-COVERAGE R1** then guarantees the mode actually rendered.
*For the critic.* D was **disclosed in writing by the pilot's own agent**
(`artifacts/docs/2026-09-07-s1b-theme-bridge-report.md:464`, quoted at `brief-analysis.md:167`) and the S1
gate had no slot that would accept it — see 7.12.

**The cross-cutting cause.** The brief had no noun for the thing that broke: in 92 lines, `footer`, `nav`,
`skeleton`, `account`, `drawer` and `side-menu` occur **zero** times, `header` once as `headers()`, `body`
once as `--font-body` (`brief-analysis.md:39`, `:190-198`).

### The six process failures

#### 7.5 — p-01: no step owned repainting the existing storefront

*Event.* S1b's zone was styles/lib/theme/build-script; S1c's was the new profile blocks plus the promo
banner and the thumbnail aspect. `nav`, `footer`, `cart-dropdown`, `side-menu`, checkout, skeletons,
divider and the account area were in nobody's file set. **The brief created the gap, the agents did not.**
(`theme-surface-defects.json:214-218`)
*Owner now.* **F1**, seven zones covering 307 of 307 files (§2.2).
*Gate now.* **G-ZONE** — the union identity, checked by arithmetic before anyone launches.

#### 7.6 — p-02: the pixel gate proved the opposite of what was needed

*Event.* T0h.5 compared the storefront before the bridge against the storefront with `medusa`/`light`
active and demanded a difference under 0.1 %. That certifies the theme changes **nothing**
(`theme-surface-defects.json:219-224`).
*Owner now.* **F2** builds the coverage gate; **W7** runs it.
*Gate now.* **G-GATE-PROVES-RED** — a gate that does not go red on a tree with known defects is not a gate.

#### 7.7 — p-03: the creative director's final integrity check was never run

*Event.* Programme §6 assigns the final check over the contact sheet and screenshots to the creative
director (`docs/store-profiles/00-program-2026-09-07.md:93`). The orchestrator did not run it, **so the
first human to see the rendered store was Ivan** (`theme-surface-defects.json:228`).
*Owner now.* **W8**, a blocking step with a named owner — the creative director who wrote *this* board.
*Gate now.* **G-VISUAL**, plus the sequencing rule that W8 cannot start until G-COVERAGE exits 0, so a human
is never spent finding a black heading (`output-and-gates.md:425`).
*Structural risk retained.* W8 sits in the heavy lane, which makes it the first candidate to be skipped
under time pressure — exactly as in the pilot (`artifacts/docs/retro/execution-analysis.md:396-407`). The
only measure against it is schedule variant B, which brings the show forward by five hours and removes the
pressure (`artifacts/docs/2026-09-08-wave2-program.md:223`, `:232`).

#### 7.8 — p-04: the orchestrator's cross-zone fix became the next blocker, and its record called it a success

*Event, in three states.* S1b was blocked by 11 top-level `:global(html[…])` rules in a `*.module.css`
compiled in PURE mode — a file in **S1c's** zone (`execution-analysis.md:107`). The orchestrator split the
global half into a plain stylesheet `image-frame.globals.css` **but kept the `:global()` wrapper**; a plain
stylesheet has no CSS-modules compiler, so Turbopack rejected the file outright
(`'global' is not recognized as a valid pseudo-class`) and every route returned 500 again. S1c fixed it and
recorded so at `artifacts/docs/2026-09-07-s1c-profile-blocks-report.md:269-278`. The orchestrator's entry in
`.ai/progress.md` reads *"zero `:global` left in the module, :8033/en → 200"* — true about the module,
silent about the wrapper it had just carried into a new file. **Two documents about one fix, and the third
state exists in neither** (`execution-analysis.md:111`, `theme-surface-defects.json:232-237`).
*Owner now.* §2.6, the repair queue: a blocked worker files `artifacts/wave2/repairs/<file>.json` and
switches to work the page is not needed for; the owner repairs; the orchestrator repairs only after the
owner has finished, and then runs **the owner's gate**.
*Gate now.* **G-PREFLIGHT L2** catches this exact class statically in milliseconds
(`execution-analysis.md:157`), and `build-heartbeat.mjs` makes "the build is red" a timestamped file rather
than a claim (`execution-analysis.md:165`).

#### 7.9 — p-05: the clause that would have prevented A was cut in transcription

See §6.2 of [`02-gates-and-handover.md`](./02-gates-and-handover.md).
*Owner now.* the brief author, at brief-writing time.
*Gate now.* the clause-level diff, with a written reason beside every dropped clause.

#### 7.10 — p-06: zones covered 20 files of 302

See §2.2 and 7.5.
*Owner now.* §2.2 + §2.4 — 307 storefront files and 429 backend files, each with exactly one owner.
*Gate now.* **G-ZONE**, plus the ban on intra-file qualifiers (§2.5 rule 2).
*Extension found in this document.* The `.ts/.tsx/.css` filter G-ZONE counts with leaves **6 files** in
`apps/storefront/src` outside every zone, two of which are the starter's own share images (§2.3). p-06 is
therefore **not** fully closed by the retro's own arithmetic; Z-BRAND-ASSETS closes it.
*Second extension.* S6a edited `migration-scripts/lib/products.ts` in commit `890c8ea` — a file in
Z-SEED-CORE, owned by S1a, while S1a had already finished. That is a cross-zone edit that the pilot's zone
declaration did not forbid and §2.6 now routes through ratification.

### The two cases where the process must tolerate reality

#### 7.11 — A worker blocked by another worker's broken file

*Event.* S1b ran 61 minutes — twice the median — and spent **298.7k tokens against a 120k budget**
(`artifacts/docs/2026-09-07-pilot-agent-runs.md:17`, `:51-52`). The reason was not "waiting for a compile":
*"all four pages were returning **HTTP 500 on a broken CSS module of theirs** during the window when the
baseline would have been taken"*
(`artifacts/docs/2026-09-08-ivan-directives-image-strategy.md:11-13`). It was waiting for **someone else's
zone to be repaired**, and its own gate was pixel-based, so it could not proceed without a rendered page.

*What the process does, in order:*
1. **Removes the cause where it can.** The check that was cut (p-05) reads from **computed style**, not
   pixels; it needs one rendered page instead of four and no reference screenshots at all
   (`ivan-directives-image-strategy.md:21-24`). G-COVERAGE is computed-style based for exactly this reason.
2. **Accepts the block will still sometimes happen** and gives it a channel: the repair queue of §2.6, plus
   the standing instruction that a blocked worker **switches to work that does not need the page**
   (`execution-analysis.md:166`).
3. **Records the workaround as an asset.** S1b's own invention — hang `[data-theme-bridge="off"]` on
   `<html>` to disable every bridge declaration, so both sides come off one live server minutes apart
   (`ivan-directives-image-strategy.md:27-29`) — is written into F2's inputs rather than left in a report.

*The honest residue.* **The exact idle time is not measured**: only the repair timestamps (20:57:14 and
~21:0x) and the fact that `:8031` remained 500 after them are on record (`execution-analysis.md:99`).

#### 7.12 — A finding no checklist asked for

*Event.* S1b wrote, in its own report: *"**Dark mode has never been rendered before.** `tailwind.config.js`
sets `darkMode: "class"` and the storefront has no `.dark` class anywhere, so the vendor dark values have
never been on screen."* (`2026-09-07-s1b-theme-bridge-report.md:464`, quoted at `brief-analysis.md:167`).
**The disclosure was made. The brief's S1 gate had no slot that consumes it**
(`theme-surface-defects.json:84`). The same fact is root cause D.

*What the process does.* Envelope rule **H8**: every stage report carries a mandatory section
`Findings outside my checklist`, and the orchestrator must either merge each entry into
`artifacts/registries/theme-surface-defects.json` or write, in `.ai/progress.md`, the reason it did not. The
registry is **an input to the next stage, not a report**: each stage's prompt carries the section of the
registry that applies to it, and each stage appends what it found
(`2026-09-08-wave2-program.md:269-275`).

*What this does not fix.* A finding whose importance nobody recognises still sits in a registry unread.
**The gate is a slot, not a reader.**

---

## §8. Economics

Every figure is labelled **measured**, **extrapolated (source)** or **not measured**. No figure is silently
estimated.

### 8.1 Agent time, per profile

| Step | Duration | Basis |
|---|---:|---|
| W1 style board | **16 min** | measured, `pilot-agent-runs.md:14` |
| W2 catalog | **24 min** | measured, `pilot-agent-runs.md:18` |
| W3 images | **27 min** | measured, `pilot-agent-runs.md:19`; of which **5 min 12 s** at the provider — 311.5 s over 19 frames, mean 16.4 s (`execution-analysis.md:226`) |
| W4 theme | — | **not measured separately**; fused with W6 in the pilot |
| W5 copy reconciliation | 20 min | **extrapolated**, `execution-analysis.md:227` (range 17–24) |
| W6 assembly + stand | **17 min** | measured, `pilot-agent-runs.md:20` — an **upper** bound: it included 4 cross-seam repairs and two database rebuilds (`execution-analysis.md:228`) |
| W7 coverage gate | ≈ 8 min runtime | **extrapolated**, `output-and-gates.md:312` (from 60 measured scans in 4 min 40 s). Stage duration **not measured** |
| W8 visual acceptance | — | **not measured**, never ran, no published extrapolation |
| W9 verification | 35 min | **extrapolated**, `execution-analysis.md:229` (range 28–45) |
| W10 handover | 5 min | **extrapolated**, `execution-analysis.md:230` |
| **Per profile** | **≈ 139 min** | `execution-analysis.md:232`: **84 min measured (60 %), 55 min extrapolated (40 %)** |

**Pilot wall clock: 98 minutes** (20:26 → 22:04) for **216 agent-minutes** over seven agents — average
concurrency **2.20**, and **44 of 98 minutes (45 %) with exactly one agent alive**
(`execution-analysis.md:44-48`). **45 of the 98 critical-path minutes were the orchestrator, not the work**:
6 min launch lag + 25 min idle between W2 and W3 + 14 min between the theme gate and the next launch
(`execution-analysis.md:76`). The counter-example sits in the same data: the W1→W2 handover ran with **zero
lag**, because that prompt had been assembled while W1 was still working (`execution-analysis.md:77-78`) —
so 25 and 14 minutes are properties of the moment, not of the pipeline. Three structural cuts remove 39 of
those 45 minutes (`execution-analysis.md:97-100`).

**Wave schedule for nine profiles, extrapolated** (`2026-09-08-wave2-program.md:223`, `:232`): light lane
(W1→W2→W3→W5) = 87 min per profile, tact 27 min; heavy lane (W6→W7) = 52 min per profile and holds exactly
one profile at a time. Variant A: last profile at **555 min ≈ 9 h 15 m**. Variant B (W7 runs in the heavy
lane's gaps): first shop visible at **104 min**, all nine at **320 min ≈ 5 h 20 m**, full closure ≈ 565 min.
Published sensitivity: if W7 behaves like the pilot's S1b, 555 → **789 min ≈ 13 h**
(`2026-09-08-wave2-program.md:260`).

### 8.2 Token cost

**Two of seven agents have a recorded token count. Five are `н/д` — honestly "written nowhere", not zero**
(`pilot-agent-runs.md:49-50`).

| Agent | Budget | Actual | Ratio |
|---|---:|---:|---:|
| S1b theme bridge | ≤ 120k | **298.7k** | **249 %** |
| S4 images | ≤ 150k | **122.1k** | 81 % |

Together they give the rule:

> **Стоимость агента определяется числом ИТЕРАТИВНЫХ ЦИКЛОВ ИЗМЕРЕНИЯ внутри его окна, а не размером
> поставки.** (`execution-analysis.md:366`)

S4 produced 86 MB, 19 renders, 19 sidecars, a manifest and a contact sheet and came in **under** budget
because the batch ran in the script, not in the agent's context — ordered in so many words by the brief
(`execution-analysis.md:363`). S1b produced 347 lines of generated CSS and a token map and burned 2.5
budgets on three Playwright passes, three rounds of noise-floor debugging, 13 reverse runs and the wait
under the incident (`execution-analysis.md:363-365`).

**Class budgets, extrapolated except class C** (`execution-analysis.md:370-380`): A (text + one counting
script) 80k · B (data generation with a validator loop) 120k · C (batch in a script) **150k — the only
budget confirmed by a measurement** · D (build + compile) 100k · E (browser loop) **250k with a mandatory
checkpoint at 120k, because the single measurement of this shape is 298.7k**. Sum per profile ≈ **780k**,
of which 150k is measurement-backed.

Orchestrator window: **371k against a 250k limit**, because agent reports were read into it
(`execution-analysis.md:304`). Envelope rule H7 exists for that number alone.

Money for tokens: the recorded estimate `est-store-profiles-wave2-nine` is **$89–240 for nine profiles**,
made **before** the pilot; the pilot's two measurements neither confirm nor refute it
(`2026-09-08-wave2-program.md:116`).

### 8.3 Renders and their price

**Measured:** 19 renders per profile — 14 products + 1 banner + 4 tiles; 15 accepted, 4 flagged (**21 %**),
**0 regenerations**; `image_output_count = 1` on every one of the 19 predictions, so 19 billable images and
0 retries (`artifacts/docs/2026-09-07-remaining-work.md:17`,
`artifacts/docs/2026-09-07-s4-images-report.md:50-54`). Nine profiles under the same rule = **171 renders**
(`2026-09-08-wave2-program.md:107`).

**The unit price of `google/nano-banana-2` is NOT published.** Checked with the account's own key on
2026-09-07 and re-checked 2026-09-08, five places, none carrying a price: the prediction object
(`GET /v1/predictions/{id}` — keys `id, model, version, input, logs, output, data_removed, error, source,
status, created_at, started_at, completed_at, urls, metrics`, and `metrics` carries only
`image_output_count, predict_time, resolution_target, total_time`); the model object
(`GET /v1/models/google/nano-banana-2`, no `pricing` field); the account (`GET /v1/account`, no billing
endpoint and no balance); the model page; the pricing page
(`2026-09-07-s4-images-report.md:28-40`, `2026-09-08-wave2-program.md:78`). A regex sweep for
`cost|price|billing` across all 19 full prediction JSONs returned **zero hits**.

> **`totals.costUsd: 0` in the manifest means "nothing measurable", NEVER "free".** The schema makes the
> field required, so a number had to be written; 0 is the sum of the measured values, of which there are
> none. **These renders cost real money.** (`2026-09-07-s4-images-report.md:44-47`)

Published prices of **neighbouring** models, for a range and nothing more
(`2026-09-08-wave2-program.md:89-98`): `flux-dev` $0.025 · `ideogram-v3-turbo` $0.03 · `flux-1.1-pro` $0.04
· `recraft-v3` $0.04 · `flux-1.1-pro-ultra` $0.06 · `ideogram-v3-quality` $0.09. Applied to 171 renders that
**range** gives **$4.28 / $6.84 / $15.39** — three estimates by comparison, not a measurement
(`2026-09-08-wave2-program.md:107`). The programme's own "19 renders at about $0.06 ≈ $1.1"
(`00-program-2026-09-07.md:114`) used a figure that **was never sent to the provider and never came back
from it** (`2026-09-07-s4-images-report.md:54`).

**The one action that closes this:** open the Replicate billing dashboard for 2026-09-07, where the pilot's
19 predictions are the only activity; the sum divided by 19 is the real per-frame price. The nineteen
prediction ids are recorded in `artifacts/media/sneakers/ledger.json` for reconciliation
(`2026-09-07-s4-images-report.md:55`). **Until that figure is taken, every wave budget is an estimate with
an unknown middle** (`2026-09-08-wave2-program.md:108`).

### 8.4 The 3×3 grid — an open measurement, not a banked saving

Ivan's proposal: generate the PDP gallery thumbnails **in one request**, splitting the content into 9 cells,
3 columns × 3 rows (`ivan-directives-image-strategy.md:35-36`). Direction accepted further: render
**everything** as grids and keep only **one** full-size frame — the product page the portfolio screenshot is
taken from (`ivan-directives-image-strategy.md:62-64`).

**Nothing is saved until three things are measured, each settled by one render**
(`ivan-directives-image-strategy.md:41-51`):

1. **Cell resolution.** At a 2K output (2048 px) a 3×3 cell is ≈ **680 px** — enough for a gallery
   thumbnail, not for PDP zoom. So the grid serves thumbnails and the product's main frame stays a separate
   full-size render.
2. **Consistency across cells.** Whether the model holds the same light, background and camera height
   across nine cells of one image. **This is the main risk**: nine cells of one frame may drift in tone
   *more* than nine separate renders from one prompt.
3. **Slicing accuracy.** The model does not guarantee exact thirds; slicing must follow found boundaries,
   not arithmetic, or every thumbnail carries a neighbour's edge.

A **condition** on the direction: the exemplar page is chosen **before** generation, or the full-size frame
lands on the wrong product (`ivan-directives-image-strategy.md:66-67`). And a **mandatory** format change
either way — the prompt registry stores `sharedPreamble` and per-cell `subjectClause` separately, with
`kind` and `fullPromptSha256` (`ivan-directives-image-strategy.md:69-86`); today
`artifacts/media/sneakers/prompts.json` has neither, and duplicates the shared preamble inside all 19 prompt
strings of 1187–2509 characters each (measured, see W3).

Two adjacent requests are **unmeasured and are not promised**: a transparent-background template — models
of this class return an opaque frame, transparency normally comes from post-processing, and whether
`nano-banana-2`'s `output_format` supports PNG **with alpha** does not follow from the field name and must
be tested with one render (`ivan-directives-image-strategy.md:94-102`) — and transparency **with shadows
preserved**, where the honest statement is that a shadow is a darkening of a background a transparent frame
does not have; the recommendation is a CSS-drawn shadow, with the alpha-channel path used only after a
measurement on one frame (`ivan-directives-image-strategy.md:104-118`).

### 8.5 Hardware

The binding constraint is **not the number of agents but the number of compiling processes**: no more than
two at once on a 16 GB M1 Pro, and one live stand is already two — `medusa develop` + `next dev`
(`execution-analysis.md:236-245`). Four of the six per-profile stages never touch it. The heavy lane's
capacity is taken as **1 profile at a time** on a single dirty measurement — 596 MB free of 16 GB, taken
*after* seven agents had run and with a stand alive (`execution-analysis.md:237`, `remaining-work.md:37`).
**Measuring one stand's resident footprint costs five minutes and has not been done**
(`execution-analysis.md:396-407`, risk 3).

---

## §9. What this process still cannot do

1. **It does not make the repaint safe to parallelise across profiles.** F1 pays the 176-occurrence debt
   once, on its own branch, merged before any profile starts. The template this derives from states plainly
   that it *cannot enforce cross-run sequencing* — that is a scheduling decision above the document
   (`brief-analysis.md:868-873`). This process states the sequencing as a rule; it has no mechanism to stop
   someone launching the wave anyway.
2. **It does not cover hover, active or pressed states.** G-FOCUS and R8 cover focus-visible only, because
   focus is the one state with a token (`--ring`) and a mechanical count (`outline-none`). Hover and pressed
   have neither, and inventing a gate without a token to measure against would produce another criterion
   that proves the wrong thing (`brief-analysis.md:884-889`). Measured today: card hover changes nothing at
   all — `border rgb(38,38,38) → rgb(38,38,38)`, title `text-decoration none → none`, in both modes
   (`output-and-gates.md:56`) — while the board's §7 specifies a `--border → --ring` hover. R9 asserts the
   contract; it does not tell you what a good hover is.
3. **It does not validate prose quality beyond the blind read-back.** Three random descriptions identified
   by a second agent is a cheap binary signal, not an editorial standard
   (`brief-analysis.md:890-894`).
4. **It does not solve the image cost measurement** (§8.3). It forbids writing `0` for an unmeasured cost
   and requires the word `unmeasured`. The real number is on a dashboard nobody has opened.
5. **It does not touch deploy topology, the media host or the R2 question** — programme §11.2 and §11.3
   (`00-program-2026-09-07.md:123-124`). Consequence today: delivered WebP files are gitignored, so **a
   clean clone has no images** (`remaining-work.md:47`), and nine profiles put the whole media library in
   one working tree on one machine (`execution-analysis.md:396-407`, risk 7).
6. **It does not give each agent its own worktree.** It reduces exposure — zones that actually cover the
   tree, a repair queue, and the rule that no rendering stage runs beside an editing one — but per-agent
   isolation is a decision above this document (`brief-analysis.md:902-906`).
7. **It cannot stop a worker from filing a finding nobody reads.** H8 gives every off-checklist finding a
   slot and an obligation. It cannot make the orchestrator recognise the finding's importance — D was
   disclosed in writing and sat unused (§7.12).
8. **The heavy-lane capacity of 1 is an assumption, not a measurement** (§8.5). If two fit, the wave
   shortens from 555 to ≈ 347 min (`2026-09-08-wave2-program.md:260`).
9. **40 % of the per-profile critical path is extrapolation.** W5, W7, W8 and W9 have never run
   (`execution-analysis.md:232`, `pilot-agent-runs.md:22`). W8 in particular has **no** published duration
   at all, and it is a blocking human step.
10. **The foundation is called frozen and has already leaked.** S6a made four edits to files owned by S1a
    and S1c, and one of them reversed two of S1c's deliberately green tests
    (`artifacts/docs/2026-09-07-s6a-theme-assembly-report.md:238-239`, `remaining-work.md:52`,
    `execution-analysis.md:398`). If profile 2 needs a fifth, code parallelism returns and with it the
    incident class of §7.8.
11. **`store-profile:validate`'s image counter is unreconciled.** `catalog.counts.images` = 14 while 19
    frames exist, because the counter counts product links only; whether the validator accounts for that is
    written down as unchecked (`remaining-work.md:53`).
12. **It cannot price its own risk of shipping known-bad frames.** The no-regeneration rule is Ivan's and it
    accumulates debt at the measured rate of 21 % of frames (`execution-analysis.md:402`). W11 exists to pay
    it down; whether it is paid is Ivan's call each time.
13. **It has not been executed once.** Every step is assembled from a pilot that ran a *different* sequence.
    The first profile to run this process is also its first test, and the honest expectation is that it will
    find defects in this document the way the retros found defects in the brief.

---

## §10. Open questions — where the record did not settle it and I decided

Verbatim, so the critic can attack each on its own.

1. The backend zone map (Z-PROFILE-DATA / Z-SEED-CORE / Z-BACKEND-APP) is mine, derived from
   `git show --name-only` over the ten pilot commits; the record only ever gave S1a `apps/backend/**`.
2. G-ZONE's own `.ts/.tsx/.css` filter leaves 6 files in `apps/storefront/src` unowned, including
   `opengraph-image.png` and `twitter-image.png` whose alt text still reads "Medusa, Gorgo and Next.js logos
   … Gorgo Medusa Store" — I added Z-BRAND-ASSETS, but nobody has decided whether each profile gets its own
   share image.
3. Step numbering: I used F1–F3 (once per wave) + W0–W11 (per profile) with a mapping table to the pilot's
   S-codes; the record carries three incompatible numbering schemes (pilot S0–S8, retro template S0–S14,
   wave-2 W0–W10).
4. W4 (theme) has no standalone measured duration — the pilot fused it with W6 into one 17-minute stage that
   also did 4 cross-seam repairs and rebuilt the DB twice, so 17 is an upper bound on the pair, not a
   measurement of either.
5. W8 (human visual acceptance) has no published duration of any kind, and it is a blocking human step in
   the hardware-constrained lane — the same position from which the pilot skipped it.
6. `artifacts/media/sneakers/prompts.json` already exists (19 frames, budget 19, templates packshot 11 /
   still-life 3 / editorial 5, prompt strings 1187–2509 chars) with NO `sharedPreamble` and NO `cells` key —
   so Ivan's ordered registry format is a migration of a live artefact, not a greenfield addition, and
   nobody decided who owns that migration.
7. F3 (foundation truthfulness fixes: `store-profile:up` exit 0 on a failed seed, argument-less validator
   exit 0, dead `PRODUCT_LIMIT` export) is a step I created — the record lists the three defects but assigns
   them to no stage.
8. d-06 (white PDP hairline) is marked "possibly intended" and d-11 (disabled add-to-cart) "needs its own
   measurement" in the registry; I route both to G-COVERAGE for detection and W8 for the verdict, which the
   record does not settle.
9. Whether the wave may start with F1 unmerged is stated as a rule in §3, but neither this process nor the
   retro template has a mechanism to enforce cross-run sequencing.

---

*Nothing in this process was built, started or committed. The orchestrator commits.*
