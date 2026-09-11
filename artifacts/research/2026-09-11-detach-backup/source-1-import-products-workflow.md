# Source
https://docs.medusajs.com/resources/references/medusa-workflows/importProductsWorkflow

# Fetched
2026-09-11 (WebFetch)

# Topic
`importProductsWorkflow` — what Medusa's native product import does and does not cover.

# Facts
- Purpose: "start a product import from a CSV file in the background."
- Input: `ImportProductsDTO { fileContent: string; filename: string }`.
- Output: `ImportProductsSummary { toCreate: number; toUpdate: number }` — a dry-run summary, not the
  final result; the import itself is asynchronous and requires a separate confirm step.
- "The workflow only starts the import, but you'll have to confirm it using the Workflow Engine."
- Steps: `normalizeCsvStep` → `waitConfirmationProductImportStep` → `batchProductsWorkflow` (bulk
  create/update) → notification on completion/failure.
- Entities the workflow touches, per its emitted events: create/update products, create product
  variants, delete product options, create/delete inventory items and inventory levels.
- CSV example shown in the docs: `"title,description\nShirt,This is a shirt"` — column set not fully
  enumerated on this page.
- No mention of categories, collections, or prices being part of the CSV import itself on this page;
  `core-flows` (verified in `node_modules`) ships separate `createCollectionsWorkflow` and
  `createProductCategoriesWorkflow` for those, run independently of `importProductsWorkflow`.

# Used for
`docs/multitenancy/detach-spec.md` §2 (import runbook) and §3 (what natively imports vs what a script
must do).
