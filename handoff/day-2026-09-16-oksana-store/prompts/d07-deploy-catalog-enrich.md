# {{TASK_ID}} — Deploy the WB enrichment to the LIVE tenant site (cherkashino.shipshift.dev)

Worktree `{{WORKTREE}}`, branch `{{BRANCH}}` from `{{BASE}}`. Depends on merged w07 (`catalog:enrich-from-wb` with `--import`, dataset `artifacts/docs/w07-tenant-catalog-enrich/dataset.json`) and on the deploy procedure already used in this mission — read the latest deploy task prompt and report (`prompts/d0*.md`, `artifacts/docs/d0*/report.md`) and follow the same steps (host `root@84.46.251.149`, key `~/.ssh/id_ed25519_contabo`, stack under `/opt/upready-store/mt/`, env `/opt/upready-store/mt/deploy/mt/shipshift.env`; the host is in the protected-infra registry — no `compose down`, no volume removal, no container rm; `INFRA_OK=1` is NOT granted).

## Ivan's order (2026-09-16 04:44 WITA)
Update the tenant's live site: the products already listed there get WB titles, prices, characteristics, reviews and photos; our white-background cover images stay first; no new products. This order is the permission to write to the production DB for exactly this operation (rule 17b), under the safeguards below.

## Steps
1. Deploy the current `origin/dev` (with w07 merged) to the host the way the previous deploy task did; confirm the backend answers with the new build marker (a route or version field added by w07, not just HTTP 200).
2. `pg_dump` of the production store DB into the host's backup dir BEFORE anything else; record the file path and size.
3. Copy `dataset.json` to the host (`scp` with the exact target path, md5 verified on the host), run `catalog:enrich-from-wb --tenant cherkashino --import <path> --dry-run` inside the backend container; paste the dry-run counts.
4. Run `--apply`; paste the counts; run `--apply` again → zeros (idempotency proven on prod).
5. Verify on the LIVE storefront `https://cherkashino.shipshift.dev`: 3 product pages — title, price, characteristics, reviews, gallery with the white cover first — screenshots into `artifacts/docs/{{TASK_ID}}/shots/`; check the images are served (HTTP 200 for 3 image URLs).
6. The WB key is NOT installed on the host; no marketplace call is made from the host.

Report `report.md` + `report.json` (secretRef for any credential, never the value). If any step fails, stop, write `logs/blocked-{{TASK_ID}}.md` with the exact error and leave the DB as after the dump (restore only if `--apply` half-failed, and say so).
