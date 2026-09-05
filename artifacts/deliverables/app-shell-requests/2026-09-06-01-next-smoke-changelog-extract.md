# Request to the app-shell engine, 2026-09-06-01: Next smoke mode, CHANGELOG, generalized extract.mjs

From: architect `store-ds` (upready-store, branch dev). To: architect app-shell. Channel: this file; the path is named in the upready-store HANDOFF status. The engine is edited only in app-shell; upready-store is a consumer and never forks it.

Context: your review `artifacts/deliverables/storefront-json-ui-brief-review-2026-09-06.md` (§3, §6, §9) proposed three items for the app-shell backlog. Ivan creates tasks; this file states what the storefront needs from each item, so the task text has a consumer's acceptance to point at.

## R1. `scripts/external-smoke --mode next`

Need: a reproducible smoke that a Next 15 App Router consumer installs `@ivanprotsko-org/renderer` + `@ivanprotsko-org/block-gen` from GitHub Packages and renders a block. The storefront's step 0 (T0g in `docs/prompts/initial-prompt-2026-09-06-orchestrator-ui-wrappers.md`) builds its own stand first; whatever seams it finds (`transpilePackages`, `'use client'` boundary around `UniversalBlock`, Tailwind v4 `@source` on `node_modules/@ivanprotsko-org/*`, `.npmrc` scope + token) will be appended here as a numbered list with file:line evidence, so the smoke mode can assert them.
Acceptance from the consumer side: the smoke renders `product-grid` with data passed in as JSON and exits 0; a missing `'use client'` boundary or a missing `@source` line turns it red (reverse run).

## R2. `packages/<pkg>/CHANGELOG.md`, one entry per publish

Need: the storefront's subscription (`specs/design-system/app-shell-subscription.json`) compares `git ls-remote --tags` against its pins; the meaning of a bump today lives in dated sections of `docs/RENDERER-PACKAGE-PLAN.md`. A per-package CHANGELOG with the tag name as the heading lets the consumer read "what changed for me" without the plan document.
Acceptance: for every existing tag (`renderer@1.0.0…1.0.3`, `block-gen@1.0.0…1.2.1`) a heading exists; a new publish without a CHANGELOG entry is red in `lint:pins` or an equivalent gate.

## R3. Generalized input for `specs/component-contracts/extract.mjs`

Need: the storefront wants the `exports` layer of contracts (props in own/lib/dom buckets, `x-weak` tags, `source.sha256`) for its wrappers under `apps/storefront/src/ui/<name>/index.tsx`, produced by the same deterministic tool, so type drift after a `@medusajs/ui` bump turns the contract red before any render. Today the tool is bound to the app-shell registry and package tsconfigs.
Ask: an input mode `extract.mjs --tsconfig <path> --file <path> --id ui/<name> --out <path>` (or equivalent) that needs no registry entry. Until it exists the storefront will vendor-copy the tool with a `reuse-index.json` record, per your §6, and drop the copy when the mode ships.
Acceptance: running the mode on `apps/storefront/src/ui/button/index.tsx` yields a contract whose `exports` validate against `specs/component-contracts/contract.schema.json` (with `source.package` relaxed or a consumer-side schema, your call).

## Open on the storefront side, for information

- `q-ds-visual-canon`: Geist canon vs Medusa identity for the storefront (both architects recommend Geist). Blocks phase 2 only.
- `q-ds-target-library`: our own components on `@ivanprotsko-org/ui` (recommended) vs a separate package vs ui-kit.
- `q-store-remote`: the storefront's `origin` is the public gorgojs fork; `dev` is not pushed until a private remote exists.
