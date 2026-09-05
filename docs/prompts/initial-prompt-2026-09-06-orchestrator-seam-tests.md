[AGENT: orchestrator store-seams-b] [MODEL: fable] [DIR: /Users/ivanprotsko/upready/worktrees/upready-store/feat/seam-tests]

# Orchestrator brief: seam tests (upready-store)

Mode: **ultracode** (Ivan's directive of 2026-09-06, item 1.2). Soft gates waived; hard gates hold: destructive git, push or deploy of `main`/`stage`, deletion of anything you did not create, paid APIs, production DB, seeds against a shared database.
Task id: `t-ds-1-seam-tests`. Architect: session `store-ds`, main checkout `/Users/ivanprotsko/upready/projects/upready-store`, branch `dev`. Chain: architect → you → subagents. You never talk to Ivan directly.

Goal, in Ivan's words: study the project, all its inputs and outputs, types and interfaces, tests, and the documented bugs of medusajs and gorgojs, then cover the code with tests at the seams: (2.1) human — interface, (2.2) interface — server, (2.3) whatever else you find necessary and can justify by a measurement.

## Read first, in this order

1. `AGENTS.md`: conventions, the two apps' gates, "Things That Break Silently", Localization, Relationship to Upstream.
2. `docs/prompts/2026-09-06-ivan-directive-ui-from-json.md` and `docs/design-system/00-program-2026-09-06.md` (§4 "Ф1 параллельно", §5 F5 ports and branches, §8 risks).
3. `~/upready/specs/playwright-ui-testing-spec.md`: the macOS browser limitation and the Docker path; "Vitest — setup для Next.js 15 App Router"; Page Object Model; screenshot capture per step.
4. `~/upready/specs/parallel-sessions/orchestrator-progress-protocol.md`.
5. Rules `~/r/22i.md`, `~/r/21e.md`, `~/r/21h.md`, `~/r/3a.md`, `~/r/5e.md`, `~/r/25d.md`, `~/r/17a.md`, `~/r/17b.md`, `~/r/18f.md`.
6. HANDOFF task `t-port-stale-cart-fix` (`node ~/upready/.ai/scripts/handoff.mjs task show t-port-stale-cart-fix`): a documented bug that already applies here.

## Setup

- Worktree from `dev`: `git worktree add /Users/ivanprotsko/upready/worktrees/upready-store/feat/seam-tests -b feat/seam-tests dev`. Copy the env files from the main checkout; never commit them.
- Ports: your storefront on `:8002`. `:8000` is Ivan's, `:8001` is orchestrator A's. The backend is shared; read `MEDUSA_BACKEND_URL` and verify it answers. Never start a second backend against the same database.
- Databases (rule 17b): backend jest suites run against a live Postgres through `integration-tests/setup.js` and `jest.config.js`; read both and establish which database they use before running anything. Integration suites must run against a dedicated test database, never the shared dev database. If the config points at the dev database, stop, write the finding with the file and line, and ask the architect through `question add`.
- Orchestration consent is in the directive; unlock the guard as a separate call (`touch "$TMPDIR/claude-orch-ok-<your session id>"`) before the first spawn. Register the manifest before spawning anyone (see "First commands"). `<worktree>/.ai/progress.md` append-only, `emit` after every milestone.

## Subagent economics

- You (Fable) hold the map and the cross-file invariants. Batches of ≥5 same-shaped items (route tests, page objects, fixtures) go to Sonnet subagents, ≤60k each, at most six over the task, each with the full context package in one English prompt. Cross-file invariants (middleware + cookies + payment return) stay with you or an Opus agent.
- Subagents never commit. You commit with `IVAN_OK=1`, Conventional Commits `<type>(<scope>): <subject> (t-ds-1-seam-tests)`, literal pathspecs, harness trailers.
- No `SendMessage` to a running subagent (it forks, rule 22i).

## Phases

### S0. Seam map (you)

`docs/testing/seam-map.md`: one table, one row per seam: seam | entry point (file:line) | inputs | outputs | types/interfaces | existing test | planned test | tool. Sources: `src/app` (24 pages, 5 layouts), `src/app/api/*`, `src/middleware.ts`, `src/lib/data/*.ts` (`"use server"` loaders), `src/lib/config.ts` (`x-medusa-locale` header, `fetchWithoutLocale`), `src/lib/data/cookies.ts`, `src/i18n/*`, `apps/backend/src/api/*`, `workflows`, `subscribers`, `emails` i18n, the seed. Count the rows and copy the count into the report.

### S1. Documented bugs (one Sonnet subagent, WebFetch or `gh`)

Open and closed issues of `medusajs/dtc-starter` and `gorgojs/medusa-dtc-starter`, plus Medusa 2.x issues that touch storefront flows (cart cookie, region and locale switching, payment return, `sameSite`). Output: `artifacts/research/2026-09-dtc-starter-known-bugs.md` with links, a one-line summary each, and a column "applies here: yes/no/unknown + evidence (file:line)". Every "yes" becomes a regression-test candidate in S2 or S3. `t-port-stale-cart-fix` is the first row.

### S2. Seam interface — server (first, because the jest infrastructure already exists)

- Backend: `test:integration:http` coverage for every custom route under `apps/backend/src/api` (list them, copy the count), and unit tests for workflows and steps that carry logic.
- Storefront: vitest per the spec section (`vitest.config.ts`, jsdom, `@testing-library/react`). Tests for `src/lib/data/*`: mock the `sdk` at the boundary with fixtures recorded once from the live backend and committed as JSON (no hand-typed payloads). `src/middleware.ts` unit tests: locale from URL, `_medusa_locale` cookie, `Accept-Language`; redirect of a prefix-less path; the `X-NEXT-INTL-LOCALE` header; `/api` excluded by the matcher; country cookie resolution.
- `package.json` coordination: orchestrator A merges its Playwright foundation into `dev` first (its T1). Rebase on `dev` after that merge before adding vitest dependencies. Until then: backend tests, the seam map, S1, and spec files written but not installed.

### S3. Seam human — interface (Playwright in Docker, after A's T1 is on `dev`)

Enter every flow at its start (rule 18f). Flows: landing → locale redirect → `/en/store` (sort, filters) → product page → add to cart → cart → checkout (address, shipping, payment step; Stripe test mode only if test keys exist in the env, otherwise stop at the payment step and say so) → account register and login; region switch and locale switch including RTL for `ar` and `he` (direction attribute measured, not assumed); `api/payment-return` with the `lax` cookies; 404 pages; `llms.txt`, `sitemap`, `robots`. Page objects per the spec, one screenshot per step as evidence under `tests/e2e/__screenshots__/`. Run against `:8002` with the shared backend: reads and cart creation are fine on the dev database; no seeds, no admin mutations.

### S4. Extras you justify

Candidates, each adopted only with a sentence of justification and a measurement: the i18n parity script from `AGENTS.md` turned into a vitest gate; a test that every `@medusajs/ui` component imported by the storefront has its glob in the Tailwind allowlist (this catches the live `Select` case; coordinate with A, who owns the allowlist file, by testing rather than editing it); a `fetchWithoutLocale` misuse detector for non-locale routes; type-level tests for the SDK response shapes the loaders depend on.

### S5. Report and merge

Coverage numbers copied from the tools (`vitest --coverage`, `jest --coverage`); tests added per seam; known bugs mapped to tests; every red test that exposes a real bug becomes a backlog proposal in HANDOFF (`task add`), never a product fix in this branch (fixes go through Ivan's task approval). Rebase on `dev`, gates green, merge `feat/seam-tests` → `dev` after the architect's acceptance. No push.

## Gates

Backend: `npx medusa lint`, `npx tsc --noEmit`, the three jest suites. Storefront: `npx tsc --noEmit`, `npx next lint`, `npx next build`, vitest, the Docker Playwright summary. A flaky test is a defect of the test until proven otherwise; measure its frequency and fix the wait, never retry it into green.

## Off-limits

- Orchestrator A's zone: `src/ui/**`, `src/app/[locale]/ui-lab/**`, `tests/ui-lab/**`, `playwright.config.ts` (extend it with your own project entry only after A's T1 merge, in a separate commit), `.eslintrc.json`, `tsconfig.json` paths, `tailwind.config.js`.
- You own: `apps/storefront/tests/e2e/**`, `tests/unit/**`, `vitest.config.ts`, `apps/backend/integration-tests/**`, `apps/backend/src/**/__tests__/**`, `docs/testing/**`, `artifacts/research/**`.
- Never change product behaviour. Never touch `:8000`, `:8001`, the main checkout, `main`, `stage`. Never push. Never delete what you did not create.

## Reporting

Same protocol as orchestrator A: `progress.md`, `orchestrator.mjs emit --task t-ds-1-seam-tests …`, `handoff.mjs --file=/Users/ivanprotsko/upready/projects/upready-store/HANDOFF.json task update t-ds-1-seam-tests --append-details="S<n> <sha>: …"`, `question add` for the architect, one report per phase, numbers from output.

## First commands

```bash
cd /Users/ivanprotsko/upready/projects/upready-store && git worktree add /Users/ivanprotsko/upready/worktrees/upready-store/feat/seam-tests -b feat/seam-tests dev
cd /Users/ivanprotsko/upready/worktrees/upready-store/feat/seam-tests && ls -a apps/storefront apps/backend | grep -i env && sed -n 1,40p apps/backend/jest.config.js && sed -n 1,40p apps/backend/integration-tests/setup.js
node ~/upready/.ai/scripts/orchestrator.mjs task add --json '{"id":"t-ds-1-seam-tests","title":"Seam tests: human-interface, interface-server, documented bugs","project":"upready-store","branch":"feat/seam-tests","worktree":"/Users/ivanprotsko/upready/worktrees/upready-store/feat/seam-tests","prompt_file":"docs/prompts/initial-prompt-2026-09-06-orchestrator-seam-tests.md","model":"fable","deliverables":[{"path":"docs/testing/seam-map.md","requirement":"one row per seam with entry point file:line and planned test"},{"path":"artifacts/research/2026-09-dtc-starter-known-bugs.md","requirement":"issues with links and applies-here evidence"},{"path":"apps/storefront/tests/e2e","requirement":"Playwright flows from the funnel start with screenshots"},{"path":"apps/storefront/vitest.config.ts","requirement":"vitest wired per the workspace spec"}],"verify":"cd apps/storefront && npx tsc --noEmit && npx next lint && npx vitest run","status":"running"}'
```
