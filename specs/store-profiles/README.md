# Store profiles — schemas

Three JSON Schemas (draft-07, Ajv strict) for one store version used as a portfolio example. Program and decisions: `docs/store-profiles/00-program-2026-09-07.md`. Orchestrator brief: `docs/prompts/initial-prompt-2026-09-07-orchestrator-store-profiles.md`.

| File | Validates | Lives at |
|---|---|---|
| `store-profile.schema.json` | `profile.json` — brand, theme choice, layout, home blocks, catalog file names and counts | `apps/backend/src/migration-scripts/data/profiles/<id>/profile.json` |
| `catalog-products.schema.json` | `catalog/products.json` — seed shape + `price_usd`, `metadata.specs`, relative images, `imageBrief` | `…/profiles/<id>/catalog/products.json` |
| `media-manifest.schema.json` | `media/manifest.json` — every render with model, prompt, params, sha256, cost, accepted/rejected | `…/profiles/<id>/media/manifest.json` |

The mode axis every image field may carry — a second version for dark mode — is one convention
across all three files and across the runtime documents the storefront reads:
[MODE-IMAGE-PAIRS.md](MODE-IMAGE-PAIRS.md) (`upready.mode-image-pair/v1`).

`theme.json` of a profile is validated by the existing `specs/design-system/theme-preset.schema.json` (`upready.theme-preset/v0`). Categories, product options and collections keep the seed's own shape (`data/products/index.ts`).

Validator (built by the orchestrator, script `apps/backend/scripts/validate-store-profile.mjs`): all four files against their schemas, then cross-checks — every product category is a leaf handle, every option title exists, every variant option value exists, every image is an accepted manifest entry, every manifest file exists on disk with the recorded sha256, `catalog.counts` equal the recount, no `http` in any image field.
