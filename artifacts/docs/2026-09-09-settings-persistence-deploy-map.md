# Settings Persistence and Deployment Map (scout S1)

Read-only scout for `t-2026-09-09-02`. No source file was changed to produce this document.
Every claim below cites a `file:line` in this repo, a `file:line` in an installed package under
`node_modules`, a memory file, or a command run in this session with its literal output.

## 1. What Exists Today vs What Ivan's Order Needs

The hidden panel and the block-composition vocabulary are two **separate, unconnected**
systems right now. Ivan's order asks for a panel that controls both. Neither the theme axes
registry nor the popover UI knows about header/hero/tiles/listing/footer variants; that
vocabulary lives only in a static HTML mockup tool under `artifacts/docs/composer/`, which the
Next.js storefront never imports.

| Piece | Exists today | Evidence |
|---|---|---|
| Hold-to-unlock + password + popover | Yes, shipped | `apps/storefront/src/modules/devtools/components/brand-unlock/index.tsx:28-101`, `.../theme-panel/index.tsx`, `.../theme-panel/popover.tsx` |
| Axes registry (`data-theme`, `data-mode`) | Yes, exactly 2 axes | `apps/storefront/src/lib/theme/attributes.ts:27-42` |
| Per-visitor persistence of those 2 axes | Yes, `localStorage` only | `apps/storefront/src/lib/theme/apply.ts:15-25`, `pre-paint.ts:25-32` |
| Site-wide (server-side, all-visitors) persistence of anything | **No** | see §3 below — no route, no store, no module writes `store.metadata` today |
| Header H1-H6 / hero none·G·H·J·K·L·M·GA·GB / tiles on-off / listing P1-P5 / footer F1-F6 as a *rendering* choice in the storefront | **No** | zero hits for these keys under `apps/storefront/src`; see §2 |
| That same vocabulary as a *design/mockup* artifact | Yes, static HTML tool | `artifacts/docs/composer/versions.json`, `.../lib/blocks.js:69-` (`FAMILIES`) |

## 2. The Composer Vocabulary Is Not Wired Into the Storefront

`artifacts/docs/composer/` is a standalone static-HTML mockup generator (served by
`artifacts/docs/composer/serve.mjs` on `:8303` per the task brief), not a Next.js module.
`versions.json` records ten saved specs shaped like:

```json
{ "brand": "sneakers", "mode": "dark", "width": "desktop",
  "header": "h5", "hero": "l", "tiles": "off", "listing": "p2", "footer": "f3" }
```
(`artifacts/docs/composer/versions.json:10-19`)

`lib/blocks.js:1-6` says outright these are cuts from `blocks-lab/index.html`, plus two free
points (`H6`, `F6`) "added here 2026-09-09 for the per-theme compositions," not for the live
site. A repo-wide search confirms no storefront module renders per-key header/hero/listing/
footer variants:

```
$ grep -rln "header.*h[1-6]\|HeaderVariant\|blockComposition\|BLOCK_COMPOSITION" apps/storefront/src
(no output)
```

**Consequence for the order:** part 1 of Ivan's order is not "extend an existing block-variant
switch" — it is "build a block-variant rendering system in the storefront modules
(`home`, `layout`) that does not exist yet, using the composer's key vocabulary as the
contract," and *then* wire the panel and the persistence to it. The two-second-hold panel,
the password gate and the popover shell are done; the axes it needs to control (beyond theme/
mode) are not.

## 3. Theme Axis Mechanics (the Part That Does Exist)

One registry, three consumers, exactly as the header comment in `attributes.ts:1-12` states:

| File | Role | Key lines |
|---|---|---|
| `apps/storefront/src/lib/theme/attributes.ts` | `AXES` array: attr, storageKey, allowed values, fallback | `:27-42` — only `data-theme` and `data-mode` |
| `apps/storefront/src/lib/theme/pre-paint.ts` | Generates inline `<head>` script from `AXES`, runs before first paint, reads `localStorage` only | `:25-32` |
| `apps/storefront/src/lib/theme/apply.ts` | `applyAxis()` writes the DOM attribute + `localStorage`; client-only (`"use client"` line 1) | `:15-25` |
| `apps/storefront/src/lib/theme/profile.ts` | `readProfileTheme()` reads the **build-time baked** `profile.generated.json`, SSR-only default | `:40-62` |
| `apps/storefront/src/app/layout.tsx` | Sets `data-theme`/`data-mode` on `<html>` from `readProfileTheme()`, injects the pre-paint script | `:14-43` |

**Resolution order today, exactly as coded:** `readProfileTheme()` (build-time profile default,
`theme.ts` module) → SSR paints `<html data-theme data-mode>` with that → pre-paint script
overwrites the attribute from `localStorage` if a value is present and allow-listed
(`pre-paint.ts:28-30`) → visitor can change it live through the popover, which calls
`applyAxis()` and persists to `localStorage` (`apply.ts:15-25`) → nothing here is server-side or
shared across visitors. `readProfileTheme()`'s own doc comment (`profile.ts:1-21`) is explicit
that its answer comes from a **file baked at build time**, not a runtime read.

The popover UI (`theme-panel/popover.tsx:44-151`) renders exactly two sections, "Preset" and
"Mode" (`:88-134`), built directly off `AXES`/`THEME_IDS`/`THEME_MODES` — adding a new axis is
"one AXES entry" per the module doc (`attributes.ts:6-11`), but the panel itself has no generic
per-axis section renderer yet; `popover.tsx` hardcodes the two sections by hand.

## 4. Access Mechanics for the Hidden Panel (Already Correct, Reusable As-Is)

- **Hold-to-unlock**: `brand-unlock/index.tsx` wraps the existing logo link in
  `display:contents`, arms after `HOLD_MS = 2000` ms with `MOVE_TOLERANCE_PX = 10`
  (`:28-29`), swallows the resulting click (`:95-100`), and opens a native `<dialog>`.
- **Password check**: `POST /api/devtools/unlock` (`app/api/devtools/unlock/route.ts:28-53`)
  compares against `STOREFRONT_DEVTOOLS_PASSWORD` via `passwordMatches()`
  (`lib/devtools/session.ts:56-62`, constant-time, SHA-256 hashed both sides) and issues an
  **httpOnly** signed cookie (`issueDevtoolsCookie`, `:65-73`) good for 7 days
  (`DEVTOOLS_TTL_SECONDS`, `:27`).
- **Gate for rendering the panel**: `DevtoolsMount` (server component,
  `modules/devtools/components/devtools-mount/index.tsx:23-30`) checks
  `isDevtoolsEnabled()` and `devtoolsCookieIsValid()` before rendering `<DevtoolsPanel/>`; a
  visitor without the cookie gets HTML with neither button nor popover.
- **Off switch**: unset/empty `STOREFRONT_DEVTOOLS_PASSWORD` makes the whole feature 404
  (`session.ts:39-41`, `unlock/route.ts:24-26,29`).

This part needs no new work for Ivan's order; only what the popover *writes to* needs to change
(see §5) and the popover needs new sections for the new axes (see §2).

## 5. Persistence Design for a Site-Wide Configuration

### 5.1 Why `localStorage` cannot satisfy part 1 of the order

Every existing persistence path in `src/lib/theme` is `localStorage`
(`attributes.ts:20`, `apply.ts:19-24`, `pre-paint.ts:26-31`) — explicitly **per browser**. Ivan's
order requires the configuration to reach "ALL visitors of the site (server-side, not per
browser)." None of the current axis machinery can do that; it needs a server-side store plus a
server-side read on every request.

### 5.2 Recommended: backend custom Store routes + `store.metadata`, storefront reads server-side with a cache tag

**Backend side.** `@medusajs/types` confirms the shape:

- `StoreDTO.metadata: Record<string, any> | null` — a free-form JSON bag already on every store
  row (`node_modules/.pnpm/@medusajs+types@2.19.0.../dist/store/common/store.d.ts:93`).
- `IStoreModuleService.updateStores(id, data)` and `.listStores(filters)` are the write/read
  methods (`.../dist/store/service.d.ts:92,178`).
- `Modules.STORE = "store"` is the resolution key
  (`node_modules/.pnpm/@medusajs+utils@2.19.0.../dist/modules-sdk/definition.d.ts:23`), and the
  repo's own convention for resolving a module service in a script is
  `container.resolve(Modules.X)` (`apps/backend/src/migration-scripts/lib/products.ts:176`); the
  same call, `req.scope.resolve(Modules.STORE)`, works in a route handler per the file-based
  routing convention in `apps/backend/src/api/README.md:78-100`.

New files, following the two scaffolds already in the tree
(`apps/backend/src/api/store/custom/route.ts`, `apps/backend/src/api/admin/custom/route.ts`,
both bare `GET → 200` stubs today):

- `apps/backend/src/api/store/storefront-settings/route.ts` — `GET` reads
  `store.metadata.storefrontSettings` via `listStores`/`retrieveStore`, public but still behind
  Medusa's global publishable-key gate (see below); `PUT` checks a shared-secret header and
  calls `updateStores(id, { metadata: { ...existing, storefrontSettings } })`.
- The publishable-key middleware is **global on the whole `/store` namespace**, not opt-in per
  route: `router.js:98` calls `_ApiLoader_applyStorePublishableKeyMiddleware.call(this, "/store")`,
  and `ensurePublishableApiKeyMiddleware` (`ensure-publishable-api-key.js:5-10`) 400s any
  request under `/store/*` with no `x-publishable-api-key` header, custom routes included. So
  `GET /store/storefront-settings` is "public" only in the sense that the storefront's own SDK
  already attaches the key (`sdk.client.fetch`, `lib/config.ts:11-15`); a bare curl needs the
  header too — this is a fact to reuse when curling the route during acceptance testing later,
  not a gap to fix.
- `PUT` needs its own guard: a shared-secret header (`x-storefront-settings-secret` or similar)
  compared against `process.env.STOREFRONT_SETTINGS_SECRET`, the same shape as the existing
  `REVALIDATE_SECRET` pair (`apps/backend/.env.template:29-31`, checked in
  `apps/storefront/src/app/api/revalidate/route.ts:5-12`) — one new env var in both
  `.env.template` files, matching value required in both apps, admin auth is not needed because
  the operator panel lives on the storefront, not the Medusa Admin.

**Storefront side.** Add `apps/storefront/src/lib/data/storefront-settings.ts` as a `"use
server"` module (matching `cart.ts:1` and the "Data loaders belong in `src/lib/data`" convention
in `AGENTS.md:156-158`), calling `sdk.client.fetch("/store/storefront-settings", { next: {
tags: ["storefront-settings"] }, cache: "force-cache" })`.

**This must NOT reuse `getCacheOptions()`.** That helper builds a **per-visitor** tag,
`${tag}-${cacheId}` where `cacheId` comes from the `_medusa_cache_id` cookie
(`apps/storefront/src/lib/data/cookies.ts:22-51`) — every existing data loader
(`categories.ts:7,33`) is scoped to one browser's cache entry on purpose, because carts and
category listings differ by locale/session. A site-wide setting needs the opposite: one shared
tag (`"storefront-settings"`, no suffix) so one `revalidateTag()` call invalidates it for every
visitor at once. `llms.txt/route.ts:19` (`export const revalidate = 3600`) and its use of
`fetchWithoutLocale` (`AGENTS.md:213-217`) is the closer precedent: a route that must answer the
same content to everyone, not per-session.

**Revalidation on write.** Simplest: the `PUT` route handler itself, after `updateStores()`
succeeds, makes the same `fetch(STOREFRONT_URL + "/api/revalidate", { headers: {
"x-revalidate-secret": ... } })` call the existing `product-updated.ts` subscriber makes
(`apps/backend/src/subscribers/product-updated.ts:16-27`), with a new `body.type ===
"storefront-settings.updated"` branch added to `apps/storefront/src/app/api/revalidate/
route.ts` that calls `revalidateTag("storefront-settings")`. (Alternative: emit a Medusa event
and add a subscriber file matching `product-updated.ts` — more idiomatic, one more file, not
required since the route already has the round trip.)

**SSR mode resolution**, updated from the current profile-only order in §3, to satisfy "the
DEFAULT light/dark mode shown to visitors who have not switched it themselves": visitor's
`localStorage` choice (existing pre-paint mechanism, unchanged) **overrides** the saved
site-wide default, which itself overrides the profile's built-in default — i.e. exactly the
override chain already coded (profile default → pre-paint script may overwrite from
`localStorage`), except the SSR-painted starting value changes from `readProfileTheme()`'s
build-time file read to a merge of the server-fetched site-wide setting and the profile
fallback. `RootLayout` (`layout.tsx:14-19`) is the one place that needs to call the new
server-side settings loader instead of (or in addition to) `readProfileTheme()`.

### 5.3 Alternatives considered and why they lose here

| Alternative | Why it loses in this deployment |
|---|---|
| JSON file on the storefront container | `next.config.js:40` sets `output: "standalone"`; the deploy story (README §Deployment) and every memory file about this stack's prod deploys (§7 below) describe containers, and a standalone Next container has no persistent volume convention in this repo — a redeploy replaces the filesystem. Nothing here writes to a mounted volume today. |
| Redis | Not part of this repo's baseline: `medusa-config.ts:118` only loads Redis modules when `useRedis` is true, and `AGENTS.md:169-171` documents Redis, SMTP and S3 as opt-in infra "so a shop owner can add a provider without editing config" — adding a **mandatory** Redis dependency for one settings panel contradicts that stated design goal, and it is one more service to run per stand (five stands = five more containers, see §8). |
| A Medusa custom module with its own table | Real option, more "correct" Medusa architecture (a first-class module vs. overloading `store.metadata`), but strictly more work for this order: a migration, a module registration in `medusa-config.ts`, and a service — versus `store.metadata`, which is a field that already exists on every store row with zero schema change. Given the order's scope (one small config blob, one row), `store.metadata` is proportionate; a dedicated module is the better answer only if this config is expected to grow into something relational (versioned history, per-locale variants, etc.), which nothing in the order asks for. |

Backend already has Postgres (`DATABASE_URL` in every `.env`, confirmed §8) — that's the
existing durable store the recommendation reuses, not a new dependency.

## 6. Files That Change (Rendering Consequences Named)

| File | Change | Rendering consequence |
|---|---|---|
| `apps/backend/src/api/store/storefront-settings/route.ts` | New: `GET`/`PUT` | New dynamic route on the backend; no storefront build impact |
| `apps/backend/.env.template` | Add `STOREFRONT_SETTINGS_SECRET=supersecret` next to `REVALIDATE_SECRET` (`:29-31`) | none |
| `apps/storefront/.env.template` | Add matching `STOREFRONT_SETTINGS_SECRET=` near `REVALIDATE_SECRET` (`:27`) | none |
| `apps/storefront/src/lib/data/storefront-settings.ts` | New `"use server"` loader | Any Server Component calling it becomes dependent on this fetch's cache/tag behavior |
| `apps/storefront/src/app/api/revalidate/route.ts` | Add a `storefront-settings.updated` branch | none structural; one more `if` block |
| `apps/storefront/src/app/layout.tsx` | `RootLayout` reads the new loader instead of / alongside `readProfileTheme()` | `layout.tsx` already forces every page dynamic in practice — see next row |
| `apps/storefront/src/lib/theme/attributes.ts` | New `AXES` entries for header/hero/tiles/listing/footer, **if** the panel is to reuse the same generic mechanism for these (see §2 gap) | pre-paint script (generated from `AXES`) grows; still one script, still allow-listed |
| New storefront module(s) under `src/modules/home`, `src/modules/layout` | Render the chosen header/hero/tiles/listing/footer variant | This is net-new UI work the order implies but that does not exist as a switchable system today (§2) |

**Static vs. dynamic today**, per the requested grep and file read:

```
$ grep -rn "force-dynamic\|revalidate\|generateStaticParams" apps/storefront/src/app
apps/storefront/src/app/llms.txt/route.ts:19:export const revalidate = 3600
apps/storefront/src/app/api/devtools/unlock/route.ts:21:export const dynamic = "force-dynamic"
```

No route sets `generateStaticParams`. The root layout already reads cookies on every request
(`getLocale()` via next-intl reads the locale cookie; `DevtoolsMount` reads
`cookies()` unconditionally, `devtools-mount/index.tsx:26`) — its own comment says this "adds no
dynamic rendering that was not there: the baseline build has no static page route"
(`devtools-mount/index.tsx:19-21`). So adding a server-side settings read to `RootLayout` costs
nothing new in terms of static-vs-dynamic classification; the app is already rendered per
request end to end. `AGENTS.md` states no separate build-output notes beyond the standalone
output flag (`next.config.js:40`) and the Tailwind/middleware/cookie caveats in its "Things That
Break Silently" section (`AGENTS.md:219-243`), none of which mention static pages.

## 7. Deployment Facts

### 7.1 This repo's own CI does not deploy this fork

`.github/workflows/notify-deploy.yml` only dispatches a deploy notification, and only when
`github.repository == 'gorgojs/medusa-dtc-starter'` (`notify-deploy.yml:94`, also gating the
commented-out `test` job at `:49`). This repo's remote is a different owner:

```
$ git remote -v
origin  https://github.com/ivanprotsko/upready-store.git (fetch)
```

So this workflow is a no-op on every push to this repo's `main` — there is no working CI/CD
deploy pipeline in this repository as it stands; whatever deploys the five stands has to be set
up new. `.github/workflows/update.yaml` is unrelated: a daily bot PR that bumps the Medusa
dependency (`update.yaml:1-24`), gated only by `schedule`/`workflow_dispatch`, not by repo owner.

### 7.2 README's own deployment guidance

`README.md`, section "Deployment" (quoted in full): both apps "deploy like any Medusa 2 and
Next.js pair," and lists the production env toggles already present in `medusa-config.ts` and
`next.config.js` — `REDIS_URL`, the `S3_*` five, `STORE_CORS`/`ADMIN_CORS`/`AUTH_CORS` plus
`STOREFRONT_URL`, and `MEDUSA_CLOUD_S3_HOSTNAME`/`MEDUSA_CLOUD_S3_PATHNAME` for Medusa Cloud
specifically. **No Dockerfile or docker-compose file exists anywhere in this repo**:

```
$ find . -iname "docker-compose*" -o -iname "Dockerfile*" | grep -v node_modules
(no output)
```

So a container build has to be authored from scratch (or via the target host's own build-from-
git support), unlike the `agent-creatr` precedent in §7.4 which had a `deploy/docker-compose.yml`
already in its own tree before the prod push.

### 7.3 The store-profiles topology decision (F1) already fixes the shape

`docs/store-profiles/00-program-2026-09-07.md:59`, decision **F1**, chosen option **(a)**: "one
DB per profile, one backend+storefront pair per profile" over "one DB, one sales channel per
profile, ten storefronts on different publishable keys" — rejected because categories,
collections and search are not sales-channel-scoped in this product, so option (b) leaks one
profile's catalog into another's menus. Consequence: **five independent
backend+Postgres+storefront triples**, not one shared backend. Section 11 ("Решения за Иваном")
leaves the exact multi-instance **topology** (ten backend+storefront pairs each with its own DB,
vs. one backend process with ten DB instances) explicitly open, "decide after the pilot, does
not affect the pilot" (`:2` under "## 11"), and leaves the media host open too (`:3`, "check
`R2_BACKUP_*` or open a separate bucket; after the pilot"). Both are still open as of this scout
— nothing in the repo or in the memory files resolves them since that program document was
written (2026-09-07).

### 7.4 Contabo/Coolify precedent from `agent-creatr`

Source: `~/upready/memory/agent-creatr-prod-deploy-contabo.md`,
`agent-creatr-deploy-plan.md`, `agent-creatr-deploy-decisions-2026-09-04.md` (a different
project, typebot fork, deployed 2026-09-04 on the same server Ivan's order implies reusing).

| Fact | Detail | Source |
|---|---|---|
| Host | `root@84.46.251.149`, Ubuntu 24.04, 6 vCPU, RAM 11.7 GB, disk 193 GB | `agent-creatr-deploy-plan.md:71` |
| Ingress already running | Coolify's own `coolify-proxy` (traefik v3.6) already owns 80/443; new apps join the `coolify` Docker network and use traefik labels, not a second reverse proxy | `agent-creatr-prod-deploy-contabo.md:33-38`, `agent-creatr-deploy-plan.md:77` |
| DNS | Cloudflare zone `upready.dev`, A records to the same IP, **`proxied=False`** required (Cloudflare terminating TLS + a 100 MB upload cap broke large-file delivery for that project) | `agent-creatr-prod-deploy-contabo.md:26-29` |
| TLS | Let's Encrypt via traefik's `letsencrypt` resolver, automatic | `agent-creatr-prod-deploy-contabo.md:29` |
| Internal addressing pitfall | Containers on the shared `coolify` network must use their own container name (`agentcreatr-postgres`, not `postgres`) — `coolify-db`'s own alias `postgres` silently wins short-name resolution when the coolify stack is up | `agent-creatr-prod-deploy-contabo.md:64-74` |
| Private git remote | None was set up for that project; code was rsynced. For this repo a private remote already exists (`ivanprotsko/upready-store`, confirmed §7.1), so this pitfall does not repeat here as long as deploy pulls from `origin` rather than rsync | `agent-creatr-deploy-plan.md:41-42` |
| Backups | `pg_dump` + tar via a systemd timer, **local disk only, no offsite copy** (rule 42a gap, explicitly logged as "consciously not done") | `agent-creatr-prod-deploy-contabo.md:23-24,89` |
| Resource headroom measured before that deploy | 53 containers stopped → freed to 4.9 GB used / 5.8 GB available RAM, swap freed to 3.0 GB, ports 80/443 free | `agent-creatr-deploy-plan.md:75-83` |
| What that stack alone then added | 5 containers: `agentcreatr-{postgres,minio,viewer,builder,bridge}` | `agent-creatr-deploy-decisions-2026-09-04.md:60` |

**No RAM/CPU figures exist anywhere in these memory files for a Medusa backend, a Postgres
instance sized for Medusa, or a Next.js storalfront container** — the `agent-creatr` numbers are
for a different stack (Typebot/Next viewer+builder, not Medusa). A search for such numbers in
this repo's memory turned up nothing:

```
$ grep -rn "RSS\|MB\|ГБ\|memory\|RAM" ~/upready/memory/agent-creatr-*.md | grep -iv "telegram\|leadgen"
agent-creatr-deploy-decisions-2026-09-04.md:32-33  (RAM available, unrelated to Medusa)
agent-creatr-deploy-plan.md:38,66,71,75,83,91       (same server's own sizing, not Medusa's)
```

So any "five Medusa+Postgres+Next triples fit on this box" estimate in §7.6 below is **not**
sourced from a prior measurement of this exact stack — it is stated as an assumption to be
checked against a live measurement of the first deployed stand, not as a fact.

### 7.5 Credentials on file, live connectivity

```
$ grep -o -E '^(CONTABO|COOLIFY|CLOUDFLARE|R2|S3)[A-Z0-9_]*' ~/upready/.env.keys | sort -u
CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN CLOUDFLARE_CF_ADMIN_TOKEN CLOUDFLARE_EMAIL
CLOUDFLARE_GLOBAL_API_KEY CONTABO_CUSTOMER_ID CONTABO_CUSTOMER_ORDER_ID
CONTABO_CUSTOMER_PANEL_EMAIL CONTABO_CUSTOMER_PANEL_PASSWORD CONTABO_SERVER_IP
CONTABO_SERVER_IPV6_SUBNET CONTABO_SERVER_PASSWORD CONTABO_SERVER_USERNAME
COOLIFY_ADMIN_EMAIL COOLIFY_ADMIN_PASSWORD COOLIFY_ADMIN_USERNAME
R2_BACKUP_ACCESS_KEY_ID R2_BACKUP_BUCKET R2_BACKUP_SECRET_ACCESS_KEY
```

Note: **no `COOLIFY_API_TOKEN`/`COOLIFY_URL`** variable exists — only dashboard login
credentials. Coolify does have an API, but automating a deploy through it from an agent session
would need a token that is not currently in `~/upready/.env.keys`; today it implies a human
(or a browser-automation session) doing the deploy through Coolify's UI, or issuing a token
there first. `R2_BACKUP_*` exists — the same bucket the `docs/store-profiles` program doc
flagged as the candidate media host (§7.3) is already provisioned for *backups*; whether it
should also serve product/profile media, or a separate bucket should be created, is unresolved
(open fork, §9).

```
$ IP=$(grep '^CONTABO_SERVER_IP=' ~/upready/.env.keys | cut -d= -f2)
$ curl -sS -m 8 -o /dev/null -w '%{http_code}\n' http://$IP:8000
302
$ curl -sS -m 8 -o /dev/null -w '%{http_code}\n' -k https://$IP:443
502
```

Read plainly: `84.46.251.149` is live and something answers on 8000 (302 redirect — consistent
with Coolify's own dashboard, which the memory files say runs on this host) and on 443 (traefik
itself answers, 502, because no vhost matches a bare-IP request with no `Host` header for a real
domain — exactly the routing model described in §7.4: traefik dispatches by `Host`, not by
port). This confirms the host is reachable and its ingress is up; it does not confirm any
specific app or domain for *this* project exists yet, because none has been created.

### 7.6 The five worktrees are already scaffolded with distinct ports and profiles

```
$ for d in feat/store-profiles feat/store/{electronics,supplements,womens-fashion,home-goods}; do ...; done
```

| Profile | Storefront port | Backend port | `NEXT_PUBLIC_STORE_PROFILE` | `STORE_PROFILE` present on backend `.env`? |
|---|---|---|---|---|
| sneakers / Kerbstone | 8028 | 9023 | `sneakers` | yes |
| electronics / Ferrite | 8061 | 9041 | `electronics` | **no** |
| supplements / Scruple | 8070 | 9051 | `supplements` | **no** |
| womens-fashion / Larchant | 8081 | 9061 | `womens-fashion` | yes |
| home-goods / Long Morning | 8110 | 9110 | `home-goods` | **no** |

(worktrees under `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles` and
`feat/store/{electronics,supplements,womens-fashion,home-goods}`, values read with
`grep -E '^(PORT|NEXT_PUBLIC_BASE_URL|...)='` per the task brief). The missing `STORE_PROFILE`/
`STORE_MEDIA_BASE_URL` pair on three of the five backend `.env` files means those backends do
not yet serve profile-specific media under `/static/store-profiles/<id>/` the way `sneakers`'s
does (`build-profile.mjs:22-30` describes that URL shape) — worth flagging before deploy, not
just an artifact of local dev, since it changes what URLs the storefront's `mediaUrl()` (`build-
profile.mjs:77-83`) produces at build time. Backend `.env` variable names are otherwise
identical across all five (`ADMIN_CORS AUTH_CORS COOKIE_SECRET DATABASE_URL DB_NAME
INTEGRATION_ENCRYPTION_KEY JWT_SECRET MEDUSA_ADMIN_ONBOARDING_NEXTJS_DIRECTORY PORT REDIS_URL
REVALIDATE_SECRET SMTP_* STOREFRONT_* STORE_*`), confirming F1's "the product works unchanged"
claim (§7.3) at the env-shape level — no profile needs bespoke variables beyond `PORT` and the
profile id.

## 8. Resource Estimate for Five Backend+Postgres+Storefront Triples

No number in this repo or in the read memory files measures a Medusa backend's or this
storefront's actual container RAM footprint (confirmed §7.4). What can be stated as fact:

- The host has 6 vCPU / 11.7 GB RAM total (`agent-creatr-deploy-plan.md:71`), of which the
  `agent-creatr` stack now permanently occupies 5 containers on top of the Coolify stack itself
  (~400 MB per `agent-creatr-prod-deploy-contabo.md:36`) — the 4.9-5.8 GB "available" figure from
  2026-09-04 (`agent-creatr-deploy-plan.md:83`) is **stale**: it predates the `agent-creatr`
  containers going up, so current headroom is smaller than that number and has not been
  re-measured live in this session (rule 18f — this scout did not SSH, per its own hard rules).
- Five Medusa backends is five Node processes plus five Postgres instances plus five Next
  standalone servers — fifteen long-running processes minimum, before Redis/S3/SMTP are
  considered (all currently optional per `medusa-config.ts:10-12`, so the cheapest path is to
  leave them off for the demo stands, matching the "development stays in memory" default
  `AGENTS.md:169`).
- Recommendation: deploy **one** stand first, measure its container RSS live on the host
  (`docker stats`), then multiply by five with a safety margin, rather than estimating from an
  unrelated stack's numbers. This scout deliberately does not publish an invented number here
  (rule 17a); 11.7 GB total minus an unmeasured but nonzero amount already used is not enough to
  say five triples fit without that live measurement.

## 9. Open Forks

| Fork | Options | Recommendation |
|---|---|---|
| Deploy host and domain scheme | (a) Reuse Contabo `84.46.251.149` + Coolify + Cloudflare DNS, `proxied=False`, matching the `agent-creatr` precedent exactly (§7.4); (b) a different host/provider | (a) — the ingress, TLS and DNS pattern is already proven working on this exact host for a comparable Next.js+Postgres stack; reusing it needs zero new infrastructure decisions, only new Coolify apps/traefik labels per stand |
| 4 vs 5 stands | Ivan wrote "4 stands" in the order; five store profiles exist on disk (§7.6) and F1 (§7.3) was decided against five isolated triples | Confirm with Ivan which profile is excluded, or deploy all five — the marginal cost of the fifth triple is one more backend+Postgres+storefront set, not a different architecture; recommend deploying all five unless Ivan names one to cut, since all five worktrees are equally ready |
| Media host for images | (a) Existing `R2_BACKUP_*` bucket reused for live media, not just backups; (b) a new, separate R2/S3 bucket per the program doc's own suggestion (`docs/store-profiles/00-program-2026-09-07.md` §11.3) | (b) — mixing live-serving media into a *backup* bucket (named `R2_BACKUP_BUCKET`) conflates two different retention/access policies (public-read for media vs. private for backups); a same-account, separate bucket costs nothing extra on R2 and keeps `STORE_MEDIA_BASE_URL` per profile pointing at something whose lifecycle isn't tied to backup rotation |
| `store.metadata` vs. a dedicated Medusa module for settings persistence | See §5.3 | `store.metadata` — proportionate to the order's actual scope (one config blob, one row, no versioning asked for) |
| Where the settings PUT route's auth lives | (a) shared-secret header (`STOREFRONT_SETTINGS_SECRET`), matching the `REVALIDATE_SECRET` precedent; (b) Medusa Admin session auth, since this is an operator action | (a) — the operator here is Ivan acting through the storefront's own hidden panel, not through Medusa Admin; a shared secret the storefront already holds (matching `REVALIDATE_SECRET`'s existing pattern) needs no new auth plumbing, whereas (b) would require the storefront to hold and refresh an Admin session, which nothing in this repo does today |
| Coolify automation vs. manual deploy | No `COOLIFY_API_TOKEN` exists in `~/upready/.env.keys` today (§7.5) | Either add a Coolify API token to the keys file before attempting a scripted deploy, or plan for a human/browser-driven deploy through the Coolify dashboard for the first stand |
