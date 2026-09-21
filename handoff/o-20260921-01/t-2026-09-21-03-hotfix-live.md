# Hotfix unit: the leak fix alone, on top of what the live platform runs (t-2026-09-21-03, order o-20260921-01)

Written by the project lead 2026-09-21 18:35 WITA. Binding together with `/Users/ivanprotsko/upready/projects/upready-store/handoff/o-20260921-01/COMMON.md`.

## Ivan's word (relayed by HQ 2026-09-21 ~18:30 WITA, verbatim)

> нужно устранить утечку

Scope, as HQ relayed it: the leak fix ONLY (PR 109 including commit `09442c4a`). NOT the storefront of PR 105, NOT the owner panel of PRs 106/108/110, NOT engine part 1 of PR 107, no content, no DNS, no CDEK key rotation.

## Measured by the lead

- The leak REPRODUCES on the live platform (anonymous GETs, 18:26 WITA): `*tenant.admins` returns one admin with an `email` field, `*tenant.notification_settings` returns `link_code` and `telegram_chat_id`, `*shipping_profile.shipping_options` returns 515 options. Log (field names and counts only): `/private/tmp/claude-502/-Users-ivanprotsko-upready-projects-upready-store/c9f1f7c6-e09d-43f8-8d8b-963322ee5848/scratchpad/live-t6/live-before.log`.
- Live runs `3859e6b8` according to the last deploy report `/Users/ivanprotsko/upready/projects/upready-store/artifacts/docs/d09-deploy-integrations/report.md` (not re-measured on the host; nobody of this unit touches the host).
- Every PRODUCT file of squash `954c860d` is unchanged between `3859e6b8` and `a29c8480` (dev before PR 109). The two that are not: `apps/backend/src/api/tenants/__tests__/tenant-scope-guard.unit.spec.ts` (added by PR 107, absent on live) and `docs/architecture/review-2026-09-21.md` (absent on live). No migration in PR 109, and no backend migration between `3859e6b8` and `origin/dev`.
- The live storefront (`3859e6b8:apps/storefront/src/modules/collections/templates/index.tsx:92`) already falls back to `PRODUCT_LIMIT` when a collection has no `products`, so the storefront change `57f621fe` is NOT needed and the release is BACKEND ONLY: one image, `mt-backend`.

## What you do

YOU NEVER TOUCH THE LIVE HOST: no ssh, no rsync, no deploy. You prepare and verify a branch. The lead deploys, and only after Ivan confirms the concrete plan.

1. In your worktree: `git fetch origin`, then `git switch -c hotfix/o21-tenant-field-leaks-live 3859e6b8`. Bring in the backend part of `954c860d` only: `field-guard.ts` and its unit spec, `middlewares.ts`, `tenants/shipping-options/route.ts`, `tenants/uploads/route.ts`, `tenants/branding/upload/route.ts`, `tenant-files/static-headers.ts`, `tenant-files/upload-policy.ts`, `medusa-config.ts`, the three new integration specs and the change of `tenants-orders-detail.spec.ts`. Leave out `tenant-scope-guard.unit.spec.ts`, the review document and `apps/storefront/**`. One commit, message `fix(backend): tenant field leaks, scoped delivery lists and upload types, hotfix on the live commit (t-2026-09-21-03)`. `git diff --stat 3859e6b8 HEAD` must list backend files only; paste it.
2. The allow list was proven against the field lists of `dev`. Prove it against LIVE's callers: extract every `fields` string of `apps/storefront/src` and `apps/tenant-panel/src` AT `3859e6b8` (script, not by eye), run each through `guardFields` with its route, and list every string that loses a field. For each loss decide: leak (stays closed, name the screen that pays) or a legitimate field (add to the list with a unit case). The buyer address book of the panel is a known, accepted loss.
3. Run on the hotfix branch what was NOT re-run after K6, one heavy job at a time, `uptime` below 12, `nice -n 10`: `pnpm check:backend-build`, `pnpm check:backend-fixtures`, backend `npx tsc --noEmit`, `npx medusa lint`, the backend unit suites, and ALL integration http specs (`DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=<free>`). For each red test say whether it is also red on plain `3859e6b8` (run that one spec there) — a test red on both is not this release's, a test red only on the hotfix blocks the release.
4. Stand: the hotfix backend plus the storefront and panel of `3859e6b8` (that is what live will be). `next dev` is broken at `3859e6b8` (fixed later by `07151c3b`), so make ONE production `next build` of the storefront, never next to another build. On the stand: the T-6, K1, K3, K4, K5, K6, T-5, S-4 curls closed; home, catalog, category, collection, product, cart pages 200; add to cart and reach the payment step (run `apps/storefront/e2e/funnel.e2e.mjs` from `origin/dev` against it if it fits, otherwise by a scratch script); owner login in the panel, orders list, an order, a product, the media upload of a PNG. Read the backend log for `[field-guard] … dropped` lines produced by the storefront's and the panel's OWN traffic and list them all.
5. Push the branch, open a DRAFT PR against `dev` titled `hotfix: …` with the word DO NOT MERGE in the body (the branch is a release branch, `dev` already has the fix), put the evidence in the body, print the envelope. Keep the stand up until the lead has looked, then stop everything by PID.

STOP and print `SUPERSET_WORKER_BLOCKED` instead of improvising if: the fix does not apply to `3859e6b8` without pulling other work in; it needs a migration or a data change; a check is red on the hotfix and green on `3859e6b8`; a legitimate screen of LIVE's storefront or panel breaks under the guard.
