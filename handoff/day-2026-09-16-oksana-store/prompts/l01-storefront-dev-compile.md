# Goal

The storefront dev server (Next.js, Turbopack) fails to compile with a Build Error, so http://localhost:8000/ru shows the error overlay instead of the store. Ivan's order (2026-09-17 21:18 WITA): fix it. One-file class of defect, no feature work.

# Defect (measured)

`apps/storefront/src/lib/data/products.ts` is a `"use server"` module. Lines 101–104 re-export TYPES:

```
export type {
  ProductOptionFilterGroup,
  ProductOptionFilterValue,
} from "@lib/util/option-filter-groups"
```

Turbopack: «Only async functions are allowed to be exported in a "use server" file.» The error is reached from `app/[locale]/(main)/page.tsx` and from the client component `modules/layout/components/search/index.tsx`.

Importers of those types via `@lib/data/products` (measured with rg, 2 files):
- `apps/storefront/src/modules/store/components/refinement-list/index.tsx:10`
- `apps/storefront/src/modules/store/components/refinement-list/options-picker/index.tsx:5`

# Fix

1. Delete the `export type { … } from "@lib/util/option-filter-groups"` block from `products.ts`. Keep the internal `import type` at the top of the file (a type import is allowed).
2. Change the two importers to `import type { ProductOptionFilterGroup } from "@lib/util/option-filter-groups"`.
3. Re-run `rg -n "from \"@lib/data/products\"" apps/storefront/src` and make sure no remaining importer pulls a TYPE from products.ts; if any does, redirect it to `@lib/util/option-filter-groups` the same way.
4. Do not touch anything else in the storefront.

# Acceptance (in YOUR worktree, never against the main checkout on port 8000)

- `pnpm --filter ./apps/storefront exec next build` finishes green (this worktree is a separate tree, so the build does not touch the live dev server's output dir).
- Start the dev server on a free port, e.g. `PORT=8031 pnpm --filter ./apps/storefront exec next dev -p 8031` with `NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9022` (shared local backend, read-only use), wait for «Ready», then `curl -s -m 60 -o /dev/null -w '%{http_code}' http://localhost:8031/ru` — any code except 500 with a Build Error is acceptable here (the local DB has no tenants, so an empty page or 404 is fine); the log must show NO «Ecmascript file had an error». Stop the dev server by its port when done.
- Paste both measurements (build tail, curl code, grep of the dev log for «Ecmascript») into the report.

# Report

`{{MISSION_DIR}}/artifacts/{{TASK_ID}}/report.md`: what changed (file:line), the three measurements above, PR number.

## Finish

```
ARTIFACT: {{MISSION_DIR}}/artifacts/{{TASK_ID}}/report.md
RESULT: OK storefront dev compiles; type re-export removed from products.ts, importers point at option-filter-groups; next build green; PR #<n>
```
