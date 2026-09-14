# Goal

Bring the two things the client's live store actually needs from the unmerged branch
`feat/cherkashina-tenant` onto `{{BASE}}`, as a small reviewable PR:

1. the migration scripts (`apps/backend/scripts/cherkashina-migration/**`) that create the tenant and import
   the catalog, so the live import task can run them from the main checkout;
2. the product code change that makes a tenant's public pages answer in the visitor's locale, so a Russian
   shop stops serving English page text.

Everything else on that branch stays where it is. Do NOT merge the branch.

## Why a port and not a merge (read this first, it is the whole shape of the task)

The branch `feat/cherkashina-tenant` was cut on 2026-09-12 from `fix/mt-storefront-head-footer`, is 6 commits
and **+43207 lines** ahead, and most of that is a JSON snapshot of the source catalog that has no business in
`{{BASE}}`. Its base is far behind today's `{{BASE}}`, and its change to the local file provider conflicts with
the way `{{BASE}}` already solved the same problem (`LOCAL_FILE_BACKEND_URL` in `apps/backend/medusa-config.ts`).
It is also checked out in a worktree outside Superset
(`/Users/ivanprotsko/upready/worktrees/upready-store/feat/cherkashina-tenant`, HEAD `6500fac`), so a workspace
cannot be created on it. Treat it as a read-only source.

You take files from it without merging:

```
git checkout feat/cherkashina-tenant -- apps/backend/scripts/cherkashina-migration
```

`git checkout <branch> -- <path>` is not a merge and no guard blocks it.

## Context pointers

- Report of the migration: `/Users/ivanprotsko/upready/worktrees/upready-store/feat/cherkashina-tenant/artifacts/docs/2026-09-12-cherkashina-migration/03-migration-report.md`
  — read «Изменения продуктового кода на ветке» (the two changes) and «Скрипты» (what each script does).
- Feature inventory on the same branch: `01-feature-inventory.md`; mapping registry `02-mapping-registry.json`
  (the old-URL → new-URL table that task `t11-seo-redirects` will need — carry the JSON or the md, whichever is
  smaller, into `artifacts/` and say which).
- `{{MISSION_DIR}}/research/chrxnasdmds-digest.md` §6 — every reusable asset with its absolute path.
- On `{{BASE}}`: `apps/backend/src/api/store/tenant/pages/**`, `apps/storefront/src/lib/data/tenant-pages.ts`,
  the seam suite `apps/backend/integration-tests/http/` (the migration branch added a case to
  `tenants-pages.spec.ts`).

## Step plan

1. `git status`, then `git fetch origin {{BASE}} && git merge origin/{{BASE}}` so you sit on today's base.
2. Port the scripts: `git checkout feat/cherkashina-tenant -- apps/backend/scripts/cherkashina-migration`.
   Read every file you brought over. Measured on 2026-09-15: `import.mjs` is already fully parameterised
   (`--backend`, `--snapshot`, `--registry`, `--source-root`, `--pages-out`, `--handle`, `--name`,
   `--admin-email`, `--admin-password`, `--dry-run`, `--only`, `--theme-preset`), its default backend is
   `http://localhost:9033` and it talks only to the tenant HTTP API, never SQL into the target. Check the
   other six scripts for the same property and fix whatever still assumes the old stand, because the live
   import runs against `https://shipshift.dev`. Add a short `README.md` in that directory naming, for each
   script, what it reads, what it writes and what it needs on the command line, with one copyable example.
3. Port the locale fix by hand, not by checkout: read how the branch made `/store/tenant/pages` and
   `/store/tenant/pages/:key` answer in `req.locale` (`?locale=`, then `x-medusa-locale`) with the fallback
   language → `en` → any, and how `lib/data/tenant-pages.ts` sends the locale and keys its cache by language.
   Apply the same behaviour to today's code on `{{BASE}}`, which has moved. Carry the seam test case with it.
4. Do NOT port the file-provider change. `{{BASE}}` already resolves the public URL through
   `LOCAL_FILE_BACKEND_URL` (`apps/backend/medusa-config.ts`, `apps/backend/src/tenant-files/index.ts`).
   Verify that by reading both, and write one line in the PR body saying which mechanism wins and that the
   branch's version is therefore dropped on purpose.
5. Carry the three migration documents (`01`, `02`, `03` of `artifacts/docs/2026-09-12-cherkashina-migration/`)
   into `artifacts/docs/2026-09-12-cherkashina-migration/` on your branch. Leave the multi-megabyte source
   snapshot JSON out of git; if a script needs it, the script takes its path as an argument.
6. Measure on the local stand (recipe: `{{MISSION_DIR}}/research/upready-store-capabilities.md` §5).

## Commands

```
cd apps/backend && npx medusa lint && npx tsc --noEmit
cd apps/backend && pnpm test:unit
cd apps/backend && DB_HOST=localhost PORT=9199 pnpm test:integration:http     # seam suites; DB_HOST must be the literal localhost
cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build
```

## Acceptance (measured, quoted in the PR body)

- `apps/backend/scripts/cherkashina-migration/` exists on your branch with its README, and
  `node apps/backend/scripts/cherkashina-migration/import.mjs --help` (or `--dry-run` against the local stand)
  prints usage instead of failing on a missing hardcoded path. Quote the output.
- A tenant page created in Russian is returned in Russian: quote the two curl calls and their bodies
  (`?locale=ru` and `?locale=en`, plus one for a locale with no text, which must fall back).
- `tenants-pages.spec.ts` passes, with the new fallback case. Quote the suite's result line, including the
  `ℹ fail` count of the whole file, not just your own case.
- Storefront build and backend lint clean.

## What NOT to do

- No `git merge feat/cherkashina-tenant`, no cherry-pick of its 6 commits, no force-push, and do not delete or
  modify anything in `/Users/ivanprotsko/upready/worktrees/upready-store/feat/cherkashina-tenant`.
- Do not bring the 43k-line catalog snapshot into `{{BASE}}`.
- Do not create the tenant or import anything anywhere: the live import is task `x01-tenant-live-import`, and it
  runs after the deploy.
