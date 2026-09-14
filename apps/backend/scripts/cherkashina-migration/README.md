# Cherkashina migration scripts

The one-way move of Oksana Cherkashina's shop (`olavka.ru`, repository `chrxnasdmds`) into this
platform as the tenant `cherkashino`. The run of 2026-09-12 is written up in
[artifacts/docs/2026-09-12-cherkashina-migration/03-migration-report.md](../../../../artifacts/docs/2026-09-12-cherkashina-migration/03-migration-report.md);
these are the scripts that produced it, and the live import runs them again against
`https://shipshift.dev`.

Two properties hold for every script here. They are plain ESM run by `node` from any directory, with
no build step and no dependency outside Node itself, and they never write SQL into the target: the
import talks to the tenant HTTP API (`/auth/tenant/*`, `/tenants/*`) alone, so a tenant created this
way is exactly a tenant created from the panel. The source is read-only throughout, over `psql` and
the filesystem.

Every script answers `--help` with its own option list and exits 0, and refuses a call that is
missing a required option with the same text and exit code 2. Nothing has a hardcoded stand any more:
the backend, the public origins and the `psql` binary are all options (measured 2026-09-15 by running
`--help` on all eight).

## The scripts

| Script | Reads | Writes | Needs on the command line |
|---|---|---|---|
| `measure-source.mjs` | the SOURCE database (SELECT only) | `--out` JSON, every number next to its SQL | `--db` or `--psql`, `--out` |
| `export-source.mjs` | the SOURCE database (SELECT only) | `--out` JSON snapshot: products, variants, prices, images, categories, pages, banners, translations | `--db`, `--out` |
| `feature-inventory.mjs` | nothing (the verdicts are the record of what was read in both trees on 2026-09-12) | `<dir>/01-feature-inventory.{json,md}` | `<dir>` |
| `import.mjs` | `--snapshot`, and image bytes plus legal markdown under `--source-root` | the tenant behind `--backend`, `--registry`, `--pages-out` | `--snapshot`, `--registry`, `--admin-email`, `--admin-password` |
| `rehost-images.mjs` | `--registry`, and a HEAD/GET of every candidate URL | products, the home hero and `--registry`, through `/tenants/*` | `--registry`, `--from`, `--to`, `--admin-email`, `--admin-password` |
| `measure-target.mjs` | the TARGET database (SELECT only), `--static-dir` | `--out` JSON, the same quantities scoped to one tenant | `--db`, `--tenant`, `--out` |
| `render-registry.mjs` | `<registry.json>` | `<registry.md>` | both paths |
| `render-report.mjs` | the JSON records in `<artifacts dir>` | `<artifacts dir>/03-migration-report.md` | `<artifacts dir>` |

`lib/http.mjs` is the tenant-API client (bearer token, JSON and multipart), `lib/psql.mjs` runs one
SELECT through `psql` and stamps WITA timestamps, `lib/mapping-registry.mjs` is the registry itself
(one row per source entity, JSON is the record per rule 18b), and `lib/cli.mjs` holds `--help`, the
refusal text and the host-to-origin rule.

## One copyable example

A dry run of the whole import against the platform, changing nothing:

```bash
node apps/backend/scripts/cherkashina-migration/import.mjs \
  --backend https://shipshift.dev \
  --snapshot /path/to/source-snapshot.json \
  --registry /path/to/02-mapping-registry.json \
  --source-root ~/upready/projects/chrxnasdmds \
  --pages-out /path/to/pages \
  --handle cherkashino --name "Оксана Черкашина" \
  --storefront-origin https://cherkashino.shipshift.dev \
  --admin-email owner@example.test --admin-password "$TENANT_OWNER_PASSWORD" \
  --dry-run
```

Drop `--dry-run` to perform it. The import is idempotent: a registry row already `migrated` is
verified rather than redone, so a second run creates nothing. It exits 1 when any row ends `failed`.

`--dry-run` is not offline. It logs in, lists what is already there, and writes the registry with a
`pending` row per thing a phase would do.

## What the options are for

`--backend` is the backend whose tenant API answers; the default `http://localhost:9033` is a local
stand, and the platform is `https://shipshift.dev`. `--storefront-origin` is the public origin of
the tenant's own storefront and only feeds the old-URL to new-URL table in the registry, which the
redirect task reads: on the platform that is `https://<handle>.shipshift.dev`, locally
`http://<handle>.localhost:8043`. `--tenant-host` is the same thing written as a bare host, and the
scheme is guessed http only for `localhost` and `*.localhost`. `--source-origin` is the source
store's public origin, `https://olavka.ru`, the left-hand side of that table.

`--source-root` is a checkout of the source repository, because image bytes and the legal page
markdown are read off its disk rather than over HTTP. A missing root is refused before the first
upload rather than 335 upload failures later.

`--psql-bin` (or `PSQL_BIN`) picks the `psql` to run. Without it the scripts take Homebrew's
`postgresql@16` when it is installed and otherwise whatever `psql` is on `PATH`.

## What is not here

The source snapshot itself (about 1 MB of JSON, 26k lines) and the 534 KB registry JSON stay out of
this repository. `--snapshot` and `--registry` take their paths, and the 2026-09-12 copies live on
the branch `feat/cherkashina-tenant` under
`artifacts/docs/2026-09-12-cherkashina-migration/`.

The report renderer describes the 2026-09-12 run on its own stand, ports :9033 and :8043 included.
It renders a record, not the next run.

_Written 2026-09-15 03:28 WITA._
