# Goal

Create the client's shop on the live platform and fill it with her catalogue. At the end of this task
`https://cherkashino.shipshift.dev/ru` is a working store with 29 published products in 9 categories, real
photographs, and Russian pages. This is the main deliverable of the whole day.

Your cwd is the worktree of branch `feat/cherkashina-tenant`, because that is where the migration scripts and
the source snapshot live. **Commit nothing there, change no file there, and do not switch its branch.** It is a
read-only toolbox for you. Everything you produce goes to `{{MISSION_DIR}}/artifacts/{{TASK_ID}}/`.

## What you have

Measured 2026-09-15, all inside `{{CWD}}`:

- `apps/backend/scripts/cherkashina-migration/import.mjs` — idempotent importer that talks **only** to the
  tenant HTTP API (`/auth/tenant/*`, `/tenants/*`), never SQL into the target. It writes a registry row per
  source entity and exits 1 if any row is `failed`. Its usage block:

```
node import.mjs --backend <url> \
  --snapshot <source-snapshot.json> --registry <02-mapping-registry.json> \
  --source-root /Users/ivanprotsko/upready/projects/chrxnasdmds \
  --pages-out <dir> --handle cherkashino --name "Оксана Черкашина" \
  --admin-email <email> --admin-password <password> \
  [--dry-run] [--only tenant,categories,images,products,pages,home,rest] [--theme-preset supplements]
```

- `apps/backend/scripts/cherkashina-migration/rehost-images.mjs` — re-points already uploaded file URLs and
  checks each new address answers 200 before writing it.
- `artifacts/docs/2026-09-12-cherkashina-migration/source-snapshot.json` (1.0 MB) — the source export.
- `artifacts/docs/2026-09-12-cherkashina-migration/02-mapping-registry.json` (534 KB) — the mapping registry of
  the 2026-09-12 run against a **local** stand. Work on a **copy** of it in your artifacts directory so the
  original stays as the record of that run, and so «already migrated» rows from the local stand do not make the
  importer skip work it has not done on the live host.
- `03-migration-report.md` — what was carried and what was deliberately left behind. Read it first.

Live platform (from `{{MISSION_DIR}}/research/upready-store-capabilities.md` §1–2):
engine `https://shipshift.dev`, panel `https://panel-store.upready.dev`, tenant storefronts
`https://<handle>.shipshift.dev`, uploads served from `https://shipshift.dev/static`.

## Step plan

1. **Check what is already there** before creating anything. `curl https://cherkashino.shipshift.dev/ru`
   returned 502 on 2026-09-15 02:5x, which means the wildcard certificate resolves but no tenant answers.
   Confirm the handle is free through the superadmin API or the tenant list. If a tenant `cherkashino` already
   exists, do not create a second one: continue the import into it and say so in the report.
2. **Owner account.** The importer creates the owner identity itself. Use an address Ivan controls, not an
   invented one: the client's own e-mail is an open question (`{{MISSION_DIR}}/research/chrxnasdmds-digest.md`
   §5, `q-realnyy-email-prodavca` — the value in the old code is the placeholder `olavka@example.com`). Generate
   a strong password. Write the address, the password and the panel URL to
   `/Users/ivanprotsko/upready/.private/upready-store-day-2026-09-16/cherkashino-owner.md` (outside git — that
   directory is the established place for personal data). **Never** put the password in the mission artifacts,
   in a log line you print, in the repository, or in this task's report. In the report, reference the file path.
3. **Dry run first.** `--dry-run` against `https://shipshift.dev` with the copied registry. Read what it says it
   will do and compare the counts with the report's table (38 products, 38 variants, 9 categories, 36 category
   links, 313 gallery images, 78 prices, 6 product translations, 5 pages, 1 home document, 334 files). Any
   disagreement is something to understand before the real run, not after.
4. **Import in stages**, in the order the script's `--only` allows, checking after each:
   `tenant` → `categories` → `images` → `products` → `pages` → `home` → `rest`. Uploading 334 files (about
   115 MB) over the network takes time: run the long stages with output redirected to a file in your artifacts
   directory and check that file by deadline, once, rather than watching it.
5. **Do not seed the demo catalogue.** `POST /tenants/seed` would drop ten unrelated demo products into the
   client's shop. The importer does not call it; make sure nothing you do does either.
6. **Images.** After the product stage, open five product pages and confirm the photographs load from their
   public URLs, not from `localhost:9000`. If any URL is wrong, that is exactly what `rehost-images.mjs` fixes;
   run it and re-check. Report the count of images that answered 200 out of the total you checked.
7. **Pages in Russian.** `https://cherkashino.shipshift.dev/ru/pages/offer`, `/contacts`, `/privacy`, `/about`
   must render Russian text. If they come back in English, the locale fix of task `t02-cherkashina-port` is not
   on the live host yet: record it as a finding with the exact URL and body, finish the rest, and say in the
   report that deploy wave 2 must land before the pages are right. Do not try to deploy it yourself.
8. **Sanity pass as a visitor.** Home, catalogue, one product page, add to cart. Screenshots at 1280x900 and
   390x844 into `{{MISSION_DIR}}/artifacts/{{TASK_ID}}/`.

## Acceptance (all measured, all in the report)

- `curl -s -o /dev/null -w "%{http_code}" https://cherkashino.shipshift.dev/ru` → 200.
- Published product count on the live storefront equals 29 and the draft count equals 9; quote the API response
  or the SQL-free count you used.
- 9 categories exist and each opens with at least one product, except the ones the source itself left empty —
  name those.
- At least five product images fetched with `curl -I` return 200 from their public address; quote one URL.
- The four content pages return Russian text (or the finding of step 7, with evidence).
- The registry copy has zero rows with status `failed`. Quote the per-kind summary table the script prints.

## What NOT to do

- Do not run SQL against the live database. The importer uses the HTTP API on purpose.
- Do not commit anything, anywhere, in this worktree.
- Do not deploy, do not restart a container, do not touch another tenant.
- Do not invent the client's e-mail, phone, legal address or bank details. Where a value is unknown, leave the
  placeholder exactly as it is and list it in the report as «нужно от Оксаны».
- Do not migrate customers (46), orders (88), reviews (332) or articles (18). The first two are a separate
  export (`x03-orders-archive`), the last two get their own features today (`t09-reviews`, `t10-blog`).

## Finish

Write `{{MISSION_DIR}}/artifacts/{{TASK_ID}}/report.md` with every number above and the list of what the shop
still needs from the client. Then print:

```
ARTIFACT: {{MISSION_DIR}}/artifacts/{{TASK_ID}}/report.md
RESULT: OK cherkashino.shipshift.dev — <N> товаров, <M> категорий, <K> картинок 200
```

or `RESULT: FAIL <what exactly>` as the last line.
