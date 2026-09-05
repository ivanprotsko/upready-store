[AGENT: orchestrator store-ui-a] [MODEL: opus] [DIR: /Users/ivanprotsko/upready/worktrees/upready-store/feat/ui-wrappers]

# Orchestrator brief: Phase 1 wrappers pilot (upready-store)

Mode: **ultracode** (Ivan's directive of 2026-09-06, item 1.1.4). Soft gates are waived; hard gates hold: destructive git, push or deploy of `main`/`stage`, deletion of anything you did not create, paid APIs, production DB.
Task id: `t-ds-1-ui-wrappers-pilot` (HANDOFF of the main checkout). Architect: session `store-ds`, main checkout `/Users/ivanprotsko/upready/projects/upready-store`, branch `dev`. Chain: architect → you → subagents. Ivan's eyes on `http://localhost:8000` are reached only through the architect; you never talk to Ivan directly.

## Revision 2026-09-06, step 0 first (supersedes the task order below)

Ivan relayed the app-shell architect's review (`~/upready/projects/app-shell/artifacts/deliverables/storefront-json-ui-brief-review-2026-09-06.md`, read it in full, §11 is the order) and ordered the plan rebuilt: **step 0 runs before any component is handed to agents**, and the component sets for agents come from the registry, not from the groups written in T2 below. Decision doc §10 (`docs/design-system/00-program-2026-09-06.md`) is the canon; where this file's T-sections contradict §10, §10 wins.

Step 0 is HANDOFF task `t-ds-0-foundation`; the pilot `t-ds-1-ui-wrappers-pilot` waits for it.

**Addendum 2026-09-06 (second architect session).** Ivan answered the forks: F1 = (a) `@ivanprotsko-org/ui`, F7 = (a) Geist canon with an order of work (Medusa preset first, both presets as a compatibility test of the dictionary, then presets that switch the theme = today's goal, then the hidden settings panel a few hours later). Before T0c read `docs/prompts/initial-prompt-2026-09-06-orchestrator-theme-presets-panel.md` and `00-program` §11: they insert **T0h (theme presets) and T0i (hidden panel) right after T0a/T0b**. `q-store-remote` is answered: `origin` = private `ivanprotsko/upready-store`, `dev` is pushed by the architect; T0a's push is not yours.

- **T0a. Branches.** `git branch stage dev` (promotion-only branch; work never happens on it, so no worktree until the first promotion; if the worktree guard asks, that is the reason). Push `dev` only after Ivan answers `q-store-remote`: `origin` today is the public gorgojs fork.
- **T0b. Test tooling first**: `@playwright/test` (Docker image, exact version) and `vitest` per `~/upready/specs/playwright-ui-testing-spec.md`; both wired into `apps/storefront/package.json` before any product code changes. Verify the toolchain on this machine before spawning anyone (rule 25i): Docker run prints a Playwright summary; backend answers; `GITHUB_ACCESS_TOKEN` is readable from `~/upready/.env.keys`.
- **T0c. Registry** = old T0, with one more field per entry: `propsUsed` (the props actually passed at the call site, already covered by `props` in `ui-inventory.schema.json`; add a rollup `totals.propsUsedByComponent` = union of prop names per component with counts). TypeScript compiler API, aliases, re-exports and spreads resolved. Totals must match `00-program` §2. Ask the architect for a schema bump if you need a field the schema lacks; do not silently extend.
- **T0d. Baseline on v3**: matrix pages and golden for the 16 `@medusajs/ui` exports and the 30 icons from the registry (cases = `propsUsed` combinations + contract minimum from the `.d.ts`, not the documentation's cartesian product). The gallery maps `use` names straight to `@medusajs/ui` exports for now (wrappers do not exist yet). This baseline is the acceptance of T0e.
- **T0e. Tailwind 3.4.19 → v4** with screenshot and measurement acceptance against T0d (every golden equal within tolerance; `toHaveScreenshot` on each full matrix page; both counts copied). Compatibility of `@medusajs/ui-preset` 2.19 with v4 is decided from the preset sources in `node_modules` (`@config`/`@plugin` compat path or a rewrite of the preset's `:root` tokens into CSS), never from memory; write the finding into `docs/design-system/tailwind-v4-migration.md` with the command outputs. Also record the React 19 vs `@medusajs/ui` peer `^18.3.1` gap in the registry as a known risk.
- **T0f. Token map** `specs/design-system/token-map.json`: the 26 `ui-*` classes found in the markup → canon token names of geist-kit (`~/upready/packages/geist-kit/AGENTS.md`), with per-row `usageCount` from the registry and `status: mapped|diverged|open`. Token NAMES now; VALUES follow Ivan's `q-ds-visual-canon` answer. Consumption of geist-kit follows its "Consumption & drift" rule (vendor copy with `source: geist-kit@<commit>` and a `~/upready/packages/reuse-index.json` entry in the same commit).
- **T0g. Next smoke**: a minimal route or a sibling app (your call, justify in one sentence) that installs `@ivanprotsko-org/renderer` + `@ivanprotsko-org/block-gen` from GitHub Packages (`.npmrc` scope `@ivanprotsko-org` → `npm.pkg.github.com`, token from `~/upready/.env.keys`, never committed), sets `transpilePackages`, wraps `UniversalBlock` behind a `'use client'` boundary, adds Tailwind v4 `@source` for `node_modules/@ivanprotsko-org/*`, and renders `product-grid` with live products from the shared backend. Deliverable: a screenshot plus the exact list of integration seams that needed work, written into `artifacts/deliverables/app-shell-requests/` as a request file if anything must change on the engine side (the engine is edited only in app-shell; you never fork it).

**Then T1/T2 as below, with these overrides:** agent groups are cut by you from the registry by descending frequency (Text, Button, Heading, Container, Checkbox, Badge, RadioGroup, Label, Input, Table, StatusBadge, IconButton, IconBadge + `clx` + icons); the multiplying compounds (Select, DropdownMenu, Table on @tanstack) are a second wave; wrappers expose an API in app-shell primitive axes (`variant`, `size`, `tone`, slots) with `appShell.mapping = "adapter"`, forward `className`/`data-*`/`aria-*`/`ref` (tested), and their API is checked against AppUISpec with the app-shell architect through a file on disk before the first wave (write `artifacts/deliverables/app-shell-requests/<date>-<NN>-wrapper-api-check.md` and tell the architect). Agents return thin structured JSON (rule 25h), not prose. Every check carries a reverse run (remove the property → red, count copied). Hidden content is accepted from data, not from the DOM.

## Read first, in this order, before any action

1. `AGENTS.md` (conventions, gates, silent breakages: the Tailwind allowlist, the middleware matcher, cookies).
2. `docs/prompts/2026-09-06-ivan-directive-ui-from-json.md` (Ivan, verbatim).
3. `docs/design-system/00-program-2026-09-06.md` (decision: layers, phases, forks, acceptance).
4. `specs/design-system/wrapper-contract.schema.json`, `variant-matrix.schema.json`, `golden.schema.json`, `ui-inventory.schema.json`.
5. `~/upready/specs/playwright-ui-testing-spec.md`, section "Окружение запуска браузера": a browser does not start from the bash tool on macOS, so Playwright runs in the Docker image, version tag equal to the package version.
6. `~/upready/specs/parallel-sessions/orchestrator-progress-protocol.md` (the disk channel).
7. Rules `~/r/22i.md`, `~/r/21e.md`, `~/r/21h.md`, `~/r/3a.md`, `~/r/3b.md`, `~/r/25d.md`, `~/r/17a.md`.

## Setup

- Worktree from `dev`, never from `main`: `git worktree add /Users/ivanprotsko/upready/worktrees/upready-store/feat/ui-wrappers -b feat/ui-wrappers dev`.
- Env files: list what the main checkout has (`ls -a apps/storefront apps/backend | grep -i env`) and copy them into the worktree. Never commit them.
- Ports: your storefront runs on `:8001` (`cd apps/storefront && NEXT_PUBLIC_UI_LAB=1 npx next dev --turbopack -p 8001`). `:8000` belongs to Ivan. The backend is shared: read `MEDUSA_BACKEND_URL` from the storefront env and verify it answers before you assume anything (`curl -s -o /dev/null -w "%{http_code}\n" "$MEDUSA_BACKEND_URL/health"`). Never start a second backend.
- Orchestration consent: Ivan's OK for subagents is in the directive. Unlock the guard as a separate call (`touch "$TMPDIR/claude-orch-ok-<your session id>"`), then spawn. Model guards: Ivan named Opus for the pilot agents and Fable for the test agent (directive 1.1, 1.1.2); use `OPUS_OK=1` with that reason where a guard asks.
- Register the manifest before spawning anyone (command in "First commands"). Keep `<worktree>/.ai/progress.md` append-only and `emit` after every milestone.

## Subagent economics

- Ivan's budget: **100–125k tokens per pilot agent**. Boot costs about 20k, so each agent receives its whole component group in ONE prompt with the context package inlined (paths, schema ids, acceptance list, the exact `node_modules` paths to read). No drip-feeding, no mid-flight messages: a message to a running agent forks it (rule 22i). New work for a live agent = a file it polls or a new agent.
- Prompts to agents in English (rule 3a). Subagents never commit. You commit with the `IVAN_OK=1` prefix, Conventional Commits `<type>(<scope>): <subject> (t-ds-1-ui-wrappers-pilot)`, literal pathspecs, plus the harness trailers. Workspace rule 21g and the harness trailers win over the "no trailers" line of `AGENTS.md` for commits made by our sessions.
- Models: T0 → Sonnet (mechanics with a schema). T1 → you, or one Opus agent. T2 → four Opus agents in parallel, one message, background. T3 → one Fable agent, starts when the four T2 reports are in (pipeline, rule 22a). Any batch of ≥5 same-shaped file edits inside an agent's task → a script or a Sonnet helper, never hand edits in Opus.

## Tasks

### T0. UI inventory script (Sonnet, ≤60k)

Deliverables: `apps/storefront/scripts/ui-inventory.mjs`, `specs/design-system/ui-inventory.json` valid against `specs/design-system/ui-inventory.schema.json`, script `pnpm ui:inventory` in `apps/storefront/package.json`.
Requirements: parser, not grep. Use the TypeScript compiler API (`typescript` is already a devDependency of the storefront). Walk every JSX opening element under `apps/storefront/src`, resolve the tag to its import declaration, record package, component (dotted member for `Select.Trigger`), file, line, col, literal props (non-literal → `"<expr>"`, spread → `"<spread>"`), nearest parent tag, `"use client"` flag, route for files under `src/app`. Record `clx(...)` calls as `kind: "call"`. Run time under 10 s. Validate with ajv (`~/upready/.ai/scripts/node_modules` has it; a 10-line node script is enough).
Acceptance, numbers copied from the output: `totals.byPackage["@medusajs/ui"].imports` = 78; files per component equal the table in `00-program` §2 (Text 28, Button 24, Heading 11, Container 7, Checkbox 7, RadioGroup 4, Label 4, Badge 4, Table 2, Input 2, StatusBadge 1, Select 1, IconButton 1, IconBadge 1, DropdownMenu 1, clx 30); `@medusajs/icons` files = 34 with 30 distinct components; `directImportsOutsideUi` = 112. A mismatch is explained with evidence about which side is wrong: grep is the weaker tool, but a parser miss is a bug.

### T1. Foundation (you or one Opus agent, ≤100k)

1. `apps/storefront/src/ui/` and the tsconfig path `@ui/*` → `src/ui/*`.
2. ESLint in `.eslintrc.json`: `no-restricted-imports` with patterns `@medusajs/ui`, `@medusajs/ui/*`, `@medusajs/icons`, `@medusajs/icons/*`, message "import from @ui/<name>: the wrapper is the only door (docs/design-system/00-program-2026-09-06.md)". Level `warn` for now (it flips to `error` in phase 1.3 when `directImportsOutsideUi` = 0). An `overrides` entry turns it off for `src/ui/**`. Prove it: `npx next lint` prints warnings on existing direct imports; copy the count.
3. Gallery route `src/app/[locale]/ui-lab/[component]/page.tsx` with its own `layout.tsx` (no site chrome). It reads `src/ui/<component>/matrix.json` through a static import map, renders every case for every viewport inside `<div data-case="<viewport>/<id>" data-viewport-width="…">`, and maps `case.render` (node → element) over the wrapper's exports. Guard: `notFound()` unless `process.env.NEXT_PUBLIC_UI_LAB === "1"`; prove that a production build without the flag answers 404. English-only labels with `lang="en"` and no i18n keys; add that exception to `AGENTS.md` in one sentence.
4. Playwright: `@playwright/test` pinned to an exact version; `apps/storefront/playwright.config.ts` (project `ui-lab`, `baseURL` from `UI_LAB_URL`, default `http://host.docker.internal:8001`); generic runner `apps/storefront/tests/ui-lab/measure.spec.ts`: for every `src/ui/*/matrix.json`, for every viewport, open `/en/ui-lab/<name>`, set the viewport and `dir`, for every case apply `interaction`, measure the listed dimensions, compare with `golden.json` within tolerance; `UPDATE_GOLDEN=1` rewrites golden. Screenshots as evidence under `tests/ui-lab/__screenshots__/<component>/<viewport>-<case>.png`, git-tracked. Scripts: `pnpm ui-lab:dev` (dev server with the flag on `:8001`) and `pnpm ui-lab:test` = `docker run --rm --add-host=host.docker.internal:host-gateway -v "$PWD":/work -w /work/apps/storefront mcr.microsoft.com/playwright:v<exact>-jammy npx playwright test tests/ui-lab`. Colima is the Docker runtime here: verify host reachability with a `curl` inside the container first; if `host.docker.internal` fails, use `host.lima.internal` and write that into the script.
5. Merge T0+T1 into `dev` as soon as the gates pass, using Badge from T2/A1 as the smoke case if it is ready, otherwise a one-case matrix on the first wrapper you have. Orchestrator B waits for this merge before touching `package.json`.

Acceptance: gates from `AGENTS.md` green; lint warning count copied; `/en/ui-lab/<name>` renders in dev and returns 404 from a production build; the Docker run prints the Playwright summary, copied.

### T2. Pilot wrappers, four Opus agents in parallel (100–125k each)

Groups (Ivan's list): **A1** icon + badge + tooltip · **A2** select + otp-input · **A3** date-picker (calendar, date-segment, time-input are its subcomponents) · **A4** dropdown-menu.
Per component, each agent delivers:

- `src/ui/<name>/index.tsx`: wrapper re-exporting from `@medusajs/ui` with the same API (mapping `1:1` today), dotted members re-attached (`Select.Trigger`…), `displayName` kept, `"use client"` where the source is client-only.
- Icon is different: `src/ui/icon/index.tsx` exports `<Icon name="ChevronDown" … />` with an explicit map of the 30 icon names found in `ui-inventory.json`, each imported by name from `@medusajs/icons` (no `import *`), plus the `IconName` union. An unknown name is a TypeScript error, never a runtime fallback.
- `contract.json` valid against `wrapper-contract.schema.json`: props from the actual `.d.ts` under `node_modules/@medusajs/ui/dist/esm/components/<name>/`, every union enumerated, every function or ReactNode prop under `nonSerializable` with a plan, subcomponents with `multiplies` set honestly, states, `tokens` read from the compiled classes (`bg-ui-…`, `shadow-…`), a11y keyboard table from the underlying radix/ariakit primitive, docs URL `https://docs.medusajs.com/ui/components/<name>` fetched and read. The docs are a source; the `.d.ts` is the truth.
- `matrix.json` valid against `variant-matrix.schema.json`: variants × states × multiplying subcomponent states; viewports desktop 1280×800, mobile 375×812, and an `rtl` viewport for anything with horizontal layout; `excluded` combinations carry reasons.
- `golden.json` recorded through the Docker run (`UPDATE_GOLDEN=1`), then a second run green without the flag. Both summaries copied.
- Call-site migration: replace direct imports of this component under `src/modules` and `src/app` with `@ui/<name>`. Icons: all 34 files become `<Icon name="…" />` through a script or a Sonnet helper with the file list from the inventory. After migration `pnpm ui:inventory` shows `directImportsOutsideUi` reduced by exactly the migrated count; before and after numbers copied.
- Tailwind allowlist: add the globs for select, tooltip, otp-input, date-picker and whatever they import from the kit (check the `dist` imports: calendar, date-segment, time-input, popover). Prove the Select fix on the live sort control at `/en/store` on `:8001` with a before and after screenshot.
- Pitfalls: `contract.pitfalls[]` with evidence, and one English section per component in `docs/design-system/pitfalls-2026-09.md` (you assemble the file from the four reports).
- No new i18n strings. If one is unavoidable: all 36 catalogs plus the parity script from `AGENTS.md` in the same commit.

Acceptance per agent: ajv validates the three JSON files; `tsc`, `next lint`, `next build` green; the gallery renders every case (count = matrix length, copied); golden green; mutation proof: change one token in `globals.css` (for instance `--button-inverted`), run, copy the number of red cases, restore; inventory delta matches.

### T3. Test completeness, one Fable agent (125–150k), after all four T2 reports

- `apps/storefront/scripts/ui-matrix-check.mjs`: from `contract.json` + `matrix.json` compute every variant value × state × multiplying subcomponent state and print the combinations missing from `covers` and `excluded`. This is the answer to Ivan's "how to check parameters": parameters are checked by coverage plus ajv validation of every case's `props` against `contract.props`.
- Keyboard and a11y specs for the compounds: select (ArrowDown, Enter, Escape, typeahead), dropdown-menu (same, submenu if present), date-picker (month navigation, typing into segments), otp-input (paste, Backspace, auto-advance), tooltip (focus shows, Escape hides).
- Two named modes documented in `docs/design-system/testing.md`: `regression` (every dimension equals golden) and `feature` (assert one named dimension). Show how a developer writes each.
- Mutation proofs per component (one token, one class), counts copied.

Acceptance: `ui-matrix-check` prints 0 missing for the seven contracts (output copied); specs green in Docker; `docs/design-system/testing.md` exists.

### T4. Report and merge

- Assemble `docs/design-system/pitfalls-2026-09.md`; if the inventory disagrees with the grep table in `00-program` §2, say which side is wrong and why; HANDOFF details; `emit --kind done`.
- Rebase on `dev`, gates green, merge `feat/ui-wrappers` → `dev` (merge commit or fast-forward, never a rewrite of `dev`). Do not push (rule 21b: push on Ivan's command). Tell the architect: commit hash, gate outputs, and what Ivan should look at on `:8000` (the architect restarts Ivan's instance on the new `dev`).

## Gates, every T

`cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build` with `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` set; the i18n parity script from `AGENTS.md` whenever a catalog is touched; ajv on every JSON under `src/ui/**`; the Docker Playwright summary. Every number in a report is copied from output (rule 17a). A check that is red one run in three is a defect of the check, not noise (memory `pattern_flaky_gate_is_a_gate_defect`).

## Off-limits

- Orchestrator B's zone: `apps/backend/**`, `apps/storefront/tests/e2e/**`, `tests/unit/**`, `vitest.config.ts`, `docs/testing/**`, `artifacts/research/**`. `src/lib/data/**` behaviour stays as is.
- You own: `src/ui/**`, `src/app/[locale]/ui-lab/**`, `scripts/ui-inventory.mjs`, `scripts/ui-matrix-check.mjs`, `tests/ui-lab/**`, `playwright.config.ts`, `.eslintrc.json`, `tsconfig.json` paths, the `tailwind.config.js` allowlist, `package.json` scripts and devDependencies (B rebases after your T1 merge).
- Never `:8000`, never the main checkout, never `main` or `stage`, never `git push`, never delete what you did not create (rule 9).

## Reporting

- `<worktree>/.ai/progress.md` after each milestone; `node ~/upready/.ai/scripts/orchestrator.mjs emit --task t-ds-1-ui-wrappers-pilot --kind progress|done|blocked --summary "…" --commit <sha> --verify "N/N"`.
- HANDOFF of the main checkout: `node ~/upready/.ai/scripts/handoff.mjs --file=/Users/ivanprotsko/upready/projects/upready-store/HANDOFF.json task update t-ds-1-ui-wrappers-pilot --append-details="T<n> <sha>: …"`, one line per T, numbers from output.
- A question for the architect or Ivan: `handoff.mjs question add "…" --audience=architect --blocks=t-ds-1-ui-wrappers-pilot`, then continue with everything that does not depend on the answer (rule 22e).
- One report per T. No chat with Ivan. No `SendMessage` to a running subagent.

## Stop gates, hard

Deleting files you did not create; touching `:8000` or the main checkout; pushing; changing user-facing behaviour outside the pilot components; installing a paid service. Everything else: proceed.

## First commands

```bash
cd /Users/ivanprotsko/upready/projects/upready-store && git worktree add /Users/ivanprotsko/upready/worktrees/upready-store/feat/ui-wrappers -b feat/ui-wrappers dev
cd /Users/ivanprotsko/upready/worktrees/upready-store/feat/ui-wrappers && ls -a apps/storefront apps/backend | grep -i env
node ~/upready/.ai/scripts/orchestrator.mjs task add --json '{"id":"t-ds-1-ui-wrappers-pilot","title":"Phase 1 wrappers pilot (7 components, 4 Opus + 1 Fable)","project":"upready-store","branch":"feat/ui-wrappers","worktree":"/Users/ivanprotsko/upready/worktrees/upready-store/feat/ui-wrappers","prompt_file":"docs/prompts/initial-prompt-2026-09-06-orchestrator-ui-wrappers.md","model":"opus","deliverables":[{"path":"apps/storefront/scripts/ui-inventory.mjs","requirement":"parser-based inventory; totals equal 00-program section 2"},{"path":"specs/design-system/ui-inventory.json","requirement":"valid against ui-inventory.schema.json"},{"path":"apps/storefront/src/ui/select/contract.json","requirement":"valid; subcomponents carry multiplies"},{"path":"apps/storefront/tests/ui-lab/measure.spec.ts","requirement":"generic runner, golden compare + update mode"},{"path":"docs/design-system/pitfalls-2026-09.md","requirement":"one section per pilot component, each pitfall with evidence"}],"verify":"cd apps/storefront && npx tsc --noEmit && npx next lint && pnpm ui-lab:test","status":"running"}'
```
