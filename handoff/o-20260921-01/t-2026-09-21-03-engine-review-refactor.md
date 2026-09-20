# t-2026-09-21-03 — engine: outstanding defects, architecture review, refactor

Branch `refactor/o21-architecture-review`, base `dev`. Read `COMMON.md` next to this file first.

## Objective

The recorded data and cache defects of the engine are closed with tests, a written architecture review of the platform exists with ranked risks, the refactors it justifies are done without behaviour change, and every check of `dev` is green.

Ivan's words for this unit: «пусть запустить задачи, которые нужно было выполнить, проведут ревью архитектуры, сделают рефакторинг если нужно».

## Order of work

### Part A — outstanding defects (first, because other workers merge on top)

For each: read the record (`node /Users/ivanprotsko/upready/.ai/scripts/handoff.mjs --file=/Users/ivanprotsko/upready/projects/upready-store/HANDOFF.json task show <id>`, read only), check on current `dev` whether it still reproduces (several may have been fixed during the 16 to 18 September mission: `git log --oneline --grep=<keyword>`), then write a regression test that is red before and green after, fix, and measure on a local stand. One commit per defect.

1. `t-2026-09-12-tenant-home-revalidate-missing`: edits of the home page in the panel never reach the storefront (`force-cache` with no webhook).
2. `t-port-stale-inventory-fix`: product pages show stale inventory (upstream medusajs/dtc-starter#43).
3. `t-revalidate-product-type-gap`: `product-type.*` events have no branch in the storefront `POST /api/revalidate`; an `it.failing` spec exists and turns red when fixed.
4. `t-port-stale-cart-fix`: port the stale cart cookie fix from `/Users/ivanprotsko/upready/projects/cherkashino-store` commit `aeffa62` (read only there).
5. `t-2026-09-12-turbopack-use-server-type-export`: `export type` in a `"use server"` file breaks `pnpm storefront:dev`.
6. `t-e2e-funnel-unblock`: the four e2e defects, funnel to the payment step.
7. Catalog enrich dry run: `apps/backend/src/catalog-enrich/apply.ts:465` counts every select attribute as «to write» without comparing with the stored value, so a repeated dry run never converges to zero. The dry run is the safety check before a live run, so it must be exact.
8. Cross-shop order visibility: acceptance of PR #42 measured that `GET /store/orders/:id` answers with only a publishable key, and orders of one shop are visible in the account of another. Restrict store order reads to the sales channel of the publishable key and to the authenticated customer where Medusa core allows it; a request for shop B's order with shop A's key returns 404. Whether to confirm e-mail at registration is a product decision for Ivan: do not implement it, list it in the review.
9. Red on `dev`: run every suite and check named in `AGENTS.md` first and record the baseline (`b15-quality-debt` fixed four failing tests on 17 September; find what is red now).

### Part B — architecture review (`docs/architecture/review-2026-09-21.md`)

Read the code, not the docs about the code. Every finding carries evidence (`path:line` you actually opened), the risk in one sentence, a recommendation, an effort estimate, and a class: «do now in this unit», «separate task», «needs Ivan's decision». Rank by risk to a shop that takes real money. Cover at least:

- Tenant isolation end to end: links in `apps/backend/src/links/tenant-*`, resolution by host, publishable key scoping, custom store and tenant routes, files under `static/tenants`, admin routes; look for any route that reads or writes without the tenant filter. This is the most important chapter.
- The caching and revalidation map of the storefront: every `force-cache`, tag and revalidate path against every backend event that should bust it; one table, gaps marked.
- Backend module boundaries: what lives outside the seven Medusa primitive directories and why, duplication between `api/`, `workflows/` and ad hoc directories (`catalog-enrich`, marketplaces, `tenant-files`), script sprawl in `src/scripts` and the boot convergence chain in `docker-entrypoint.sh`.
- The storefront data layer (`src/lib/data`), middleware complexity, by-host resolution, error handling on a dead backend.
- The tenant panel as a copy of Medusa Admin screens: how far it has drifted, what a Medusa upgrade costs, where a thinner seam is possible.
- Hand-copied lists that drift (the 36 locale codes in three files, the two Markdown renderers) and whether a shared package is right given that the starter must also install under npm and yarn.
- Tests and CI: `pnpm test` executes nothing; no PR gate runs the suites; what a minimal GitHub Actions check on pull requests should run (adding a test workflow is in scope; anything that deploys is not).
- Deploy and operability: rsync without `.git` makes the deployed revision unknowable, no backups job, media without S3, secrets in one env file, health check blind to the intermittent 502 on auth (question `q-peremezhayuschiysya-502-na-post-auth`). Recommendations only; the live host is off limits.
- Repository hygiene: a copy of the staff engine and 600 KB state files under `handoff/`, large artifacts in git, real JWTs in `artifacts/docs/2026-09-10-mt-vendors-acceptance.md` (question `q-nahodka-priemki-w10-k-chuzhoy`; do not rewrite history, recommend).
- Security basics: secrets handling for integrations, cookie flags (read the `sameSite` trap in `AGENTS.md` before proposing changes), rate limits on auth, input validation on custom routes.

### Part C — refactors of the «do now» class

Behaviour preserving, covered by tests before you start, one refactor per commit, each commit message saying what moved and why. Before touching a file run `git fetch origin dev && git merge origin/dev`. Candidates are whatever the review ranks highest that fits the rule; typical examples: a single tenant-scoping helper used by every custom route instead of per-route copies, a single revalidation map shared by subscriber and route, removing dead code that the review proves unreferenced (but NOT `modules/checkout/components/payment` and `review`, which `AGENTS.md` keeps on purpose), making `pnpm test` run the unit suites, a pull request workflow that runs typecheck, lint, unit suites and `check:backend-build`.

## Off limits

`apps/storefront/src/modules/**`, `apps/storefront/src/styles/**`, `apps/storefront/tailwind.config.js`, `apps/tenant-panel/src/routes/**` and the panel's components: two interface workers own them tonight. If a defect fix needs a line there, make the smallest edit and flag it in the PR. No live host, no deploy, no history rewrite, no dependency major upgrades.

## Acceptance (the lead checks each line on a running instance)

1. Green on the branch: `pnpm check:backend-build`, `pnpm check:backend-fixtures`, backend `tsc` and `medusa lint`, the unit suites, storefront `tsc`, `next lint` and `next build`, the panel build; the list of tests that were red on `dev` before and after is attached.
2. For each folded defect: a regression test red before and green after, plus a live measurement on the local stand.
3. A stock change in the admin reaches the product page, and an edit of the home page in the panel reaches the storefront: measured.
4. A request for an order of shop B with the key of shop A returns 404: curl on a stand with two shops.
5. The review document: every finding has `path:line` evidence, risk, recommendation and estimate; decisions for Ivan are gathered in one section.
6. Refactors change no behaviour: test suites and the e2e funnel pass before and after; each refactor is its own commit.
7. The interface files owned by units 01 and 02 are untouched (or each touched line is flagged).

## Verify yourself before finishing

Every command of acceptance line 1 with its real output, the two live measurements and the curl from lines 3 and 4 on your local stand, `git diff --stat origin/dev...HEAD -- apps/storefront/src/modules apps/tenant-panel/src/routes` to prove line 7.
