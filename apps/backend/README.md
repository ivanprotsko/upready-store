<p align="center">
  <a href="https://www.medusajs.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://user-images.githubusercontent.com/59018053/229103275-b5e482bb-4601-46e6-8142-244f531cebdb.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
      <img alt="Medusa logo" src="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg" height="58">
    </picture>
  </a>
</p>
<h1 align="center">Production-ready Medusa DTC Starter</h1>

<p align="center">
  Backend
</p>

<h4 align="center">
  <a href="https://docs.gorgojs.com/tools/medusa-dtc-starter">Starter documentation</a> |
  <a href="https://docs.medusajs.com">Medusa documentation</a> |
  <a href="https://gorgojs.com">Gorgo</a>
</h4>

<p align="center">
  The Medusa application behind <a href="../../README.md">Medusa DTC Starter by Gorgo</a>: Store and Admin APIs, the Admin dashboard, transactional emails, seed data for 241 countries and 36 locales, and the Integration Module for configuring providers without a redeploy.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Medusa-2.19-7c3aed" alt="Medusa 2.19" />
  <img src="https://img.shields.io/badge/Node-%3E%3D20.19-339933?logo=nodedotjs&logoColor=white" alt="Node >= 20.19" />
  <img src="https://img.shields.io/badge/PostgreSQL-15%2B-4169e1?logo=postgresql&logoColor=white" alt="PostgreSQL 15+" />
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license" />
</p>

## What's in This App?

On top of a stock Medusa 2 application, this backend ships:

- **SMTP notification provider** – [`src/modules/smtp-notification`](src/modules/smtp-notification) sends [React Email](https://react.email/) templates through `nodemailer`. It is registered as the `email` channel of the Notification Module, alongside Medusa's local `feed` provider.
- **Ten email templates** – [`src/emails`](src/emails) covers the welcome, password reset, order placed, order completed, payment captured, order packed, order shipped, order delivered, order canceled, and order transfer request emails, with copy in 36 languages under [`src/emails/i18n`](src/emails/i18n). They share one style sheet, [`src/emails/lib/styles.ts`](src/emails/lib/styles.ts), built from the same design tokens the storefront renders with. Every email reaches the buyer in the language they shopped in.
- **Eleven subscribers** – [`src/subscribers`](src/subscribers) sends those emails on `customer.created`, `auth.password_reset`, `order.placed`, `order.completed`, `order.fulfillment_created`, `shipment.created`, `delivery.created`, `order.canceled`, `order.transfer_requested`, and `payment.captured`. Three of those events carry the Admin's "do not notify the customer" flag, and the subscribers honour it. [`product-updated.ts`](src/subscribers/product-updated.ts) posts a revalidation webhook to the storefront on 24 more events: create, update, and delete for products, variants, options, types, tags, categories, collections, and translations.
- **Initial data seed** – [`src/migration-scripts/initial-data-seed.ts`](src/migration-scripts/initial-data-seed.ts) creates the store, 241 regions with their currencies and shipping options, 36 locales' translations, and a demo catalog. Every stage lives in [`src/migration-scripts/lib`](src/migration-scripts/lib) and reads its input from JSON under [`src/migration-scripts/data`](src/migration-scripts/data).
- **Storefront settings seed** – [`src/scripts/seed-storefront-settings.ts`](src/scripts/seed-storefront-settings.ts) writes this stand's default header/hero/tiles/listing/footer composition and default light/dark mode into `store.metadata.storefrontSettings`, keyed by `STORE_PROFILE`, only when nothing is saved there yet. Run it once after the main seed:

  ```bash
  npx medusa exec ./src/scripts/seed-storefront-settings.ts
  ```
- **Integration Module** – [`@gorgo/medusa-integration`](https://docs.gorgojs.com/medusa-modules/integration) is registered in [`medusa-config.ts`](medusa-config.ts), so payment, fulfillment, and ERP providers are configured under **Settings → Integrations** in the Admin instead of in config files.
- **x402 payments** – [`src/modules/payment-x402`](src/modules/payment-x402) takes USDC through the [x402](https://x402.org/) protocol, version 2, on USD carts. A buyer signs the payment in a browser wallet at checkout; an AI agent sends `POST /store/x402/purchase` with the shop's publishable key and a body of `items`, `email` and, for anything that is posted, `shipping_address`. Without a `PAYMENT-SIGNATURE` header the route answers 402 with the requirements in `PAYMENT-REQUIRED`; with one it places the order and answers with `PAYMENT-RESPONSE`, and the same payment sent again returns the same order. A facilitator the shop owner names verifies and settles each payment into the owner's own address ([`src/api/store/x402/purchase/route.ts`](src/api/store/x402/purchase/route.ts)). Run [`src/scripts/link-x402-regions.ts`](src/scripts/link-x402-regions.ts) once to offer it in the USD regions.
- **Translations feature flag** – Medusa's Translation Module is enabled, which is what the seeded locale data and the storefront's translated catalog rely on.
- **Optional Redis and S3** – the cache, event bus, workflow engine, and locks switch to Redis in production as soon as `REDIS_URL` is set, and in development once you also set `USE_REDIS=true` ([`src/config/redis.ts`](src/config/redis.ts)). Without it a restart drops every event and workflow step still in flight. File uploads move to S3-compatible storage once `S3_BUCKET` is set and `NODE_ENV` is `production`.

## Requirements

- Node.js v20.19+ (or v22.12+)
- PostgreSQL v15 or later
- Redis, optional in development. Development runs the in-memory cache, event bus, workflow engine, and locks unless you set `USE_REDIS=true` alongside `REDIS_URL`.

## Getting Started

This is an ordinary npm package, so npm, yarn, and pnpm all work. Install dependencies first, either with `pnpm install` at the repository root or with `npm install` or `yarn install` in this directory, then run:

```bash
cp .env.template .env               # then set DATABASE_URL
pnpm medusa db:migrate              # npx medusa db:migrate, yarn medusa db:migrate
pnpm medusa user -e admin@medusajs.com -p supersecret
pnpm seed                           # npm run seed, yarn seed
pnpm dev                            # npm run dev, yarn dev
```

The application runs on `http://localhost:9000` and the Admin dashboard on `http://localhost:9000/app`. Copy the publishable API key from **Settings → Publishable API Keys** into the storefront's `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`.

For the full walkthrough, see [Getting Started with Medusa DTC Starter](https://docs.gorgojs.com/tools/medusa-dtc-starter/getting-started).

## Commands

| Task | pnpm | npm | yarn |
|---|---|---|---|
| Start in development mode with the Admin and hot reload | `pnpm dev` | `npm run dev` | `yarn dev` |
| Build the application, then copy the seed JSON into the build output | `pnpm build` | `npm run build` | `yarn build` |
| Start from the build | `pnpm start` | `npm start` | `yarn start` |
| Run migrations and sync links | `pnpm medusa db:migrate` | `npx medusa db:migrate` | `yarn medusa db:migrate` |
| Seed the store, regions, locales, and the demo catalog | `pnpm seed` | `npm run seed` | `yarn seed` |
| Lint with `@medusajs/eslint-plugin` | `pnpm lint` | `npm run lint` | `yarn lint` |
| Unit tests | `pnpm test:unit` | `npm run test:unit` | `yarn test:unit` |
| HTTP integration tests | `pnpm test:integration:http` | `npm run test:integration:http` | `yarn test:integration:http` |
| Module integration tests | `pnpm test:integration:modules` | `npm run test:integration:modules` | `yarn test:integration:modules` |

Linting runs through `medusa lint`, which reads [`eslint.config.mjs`](eslint.config.mjs). `medusa develop` runs the same check before it starts and refuses to boot on a lint error, while `medusa build` reports problems and builds anyway. Pass `--lint false` to either one to skip it.

One-off backfills and imports under [`src/scripts`](src/scripts) that take a `dry-run` switch
(`backfill-tenant-locale-settings.ts`, `backfill-product-attributes.ts`, `import-cherkashino-redirects.ts`,
`import-cherkashina-reviews.ts`, `prefill-cherkashino-requisites.ts`, `bpj/import-catalog.ts`) run through `medusa exec` and spell
it as a bare, dash-less word rather than `--dry-run`: `medusa exec ./src/scripts/<name>.ts dry-run`.
`medusa exec` hands a script its own positionals verbatim but swallows a leading `--` before it ever
reaches them (measured on the Medusa CLI 2.19), so the dashed spelling silently runs the script for
real instead of previewing it. Every one of those scripts still accepts `--dry-run` too, in case you
type it out of habit, but `dry-run` is the form that is guaranteed to work.

## What the Container Does on Every Boot

[`docker-entrypoint.sh`](docker-entrypoint.sh) runs before `medusa start`, and it is the reason an
ordinary deploy needs no manual follow-up. In order:

1. `medusa db:migrate` — always safe to re-run.
2. The seed (`initial-data-seed.js`) — a no-op once this stand's store exists.
3. `seed-storefront-settings.js` — writes the default block composition only when nothing is saved.
4. `ensure-accounts.js` — converges the Admin user and the demo customer onto the env values. The
   one step that is NOT allowed to fail.
5. `rename-default-shipping-methods.js` — renames the machine-made delivery options of shops
   provisioned by an older image.
6. `backfill-tenant-redirects.js` — writes the 301 rows a MIGRATED catalogue implies, from the
   `migrated_from`/`source_url` metadata the importer left on every product and category
   (`src/tenant-redirects/migrated-redirects.ts`). Old addresses of an imported shop therefore
   answer 301 after a plain deploy; before this step existed, the rows were written by hand with
   `import-cherkashino-redirects.ts` against one task's registry JSON, and the live platform ran for
   three days with an empty `tenant_redirect` and a 404 on every old address.
7. `link-robokassa-regions.js` — offers Robokassa in every RUB region.
8. `link-orphan-orders.js` — links every placed order in a shop's sales channel that has no
   tenant-order link (`src/tenant-orders/link-orphan-orders.ts`). The `order.placed` subscriber
   writes that link once, and the panel lists orders only through it. The `link-orphan-orders` job
   runs the same code every ten minutes. `npx medusa exec ./src/scripts/link-orphan-orders.ts dry-run`
   counts the orphans without linking them.

Steps 5 to 8 are convergence, not correctness: `set -e` is lifted for them and a failure is logged
rather than kept the backend down. Both are idempotent, and step 6 additionally stamps each tenant
it seeded (`tenant.metadata.redirects_seeded_from`) so a redirect the OWNER deleted in the panel is
not resurrected on the next boot. To seed a catalogue imported after that stamp by hand:

```bash
npx medusa exec ./src/scripts/backfill-tenant-redirects.ts dry-run
npx medusa exec ./src/scripts/backfill-tenant-redirects.ts tenant=<handle> force
```

Arguments carry no leading dashes: `medusa exec` parses its own argv first and rejects a `--flag`
meant for the script.

A new convergence script belongs in this list, in `src/scripts/`, idempotent, with one log line
saying what it changed — not in a runbook step someone has to remember.

With `NODE_ENV=production` and `SMTP_HOST` empty, the entrypoint also prints a framed
`WARNING: SMTP_HOST is empty in production` block, once before step 1 and once right before
`medusa start`. The backend boots the same without SMTP, so without the block the only symptom is
that no order confirmation, password reset or owner notification is ever delivered.

## Environment Variables

Copy [`.env.template`](.env.template) to `.env`. Only `DATABASE_URL` has to be set for the application to boot, and every `supersecret` value has to be replaced before production.

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres@localhost/$DB_NAME` |
| `DB_NAME` | Database name interpolated into `DATABASE_URL` | `medusa_dtc_starter` |
| `STORE_CORS` | Allowed origins for the Store API | `http://localhost:8000,…` |
| `ADMIN_CORS` | Allowed origins for the Admin API | `http://localhost:5173,http://localhost:9000,…` |
| `AUTH_CORS` | Allowed origins for authentication. `STORE_CORS`, `ADMIN_CORS` and `AUTH_CORS` are required in production (the backend refuses to start without them) | `http://localhost:5173,http://localhost:9000,…` |
| `JWT_SECRET` | Signing secret for JWTs. Required when `NODE_ENV=production`: the backend refuses to start without it | `supersecret` outside production |
| `TELEGRAM_API_BASE_URL` | Base URL of the Telegram Bot API used by `POST /admin/telegram-mini-app`; point it at a mock to provision a Mini App without a bot token | `https://api.telegram.org` |
| `COOKIE_SECRET` | Signing secret for cookies. Required in production, like `JWT_SECRET` | `supersecret` outside production |
| `COOKIE_SECURE` | The session cookie's `Secure` flag. In production it is on unless this is exactly `false`; outside production it is always off (local runs are plain http) | on in production, off elsewhere |
| `TRUST_PROXY` | Set to `1` when a reverse proxy you control (traefik on the deployments) writes `X-Forwarded-For`: the login and registration rate limit (10 per minute per client, `src/api/rate-limit.ts`) then keys on its first hop. Unset, it keys on the socket address and ignores the header | unset |
| `REDIS_URL` | Redis instance for the cache, event bus, workflow engine, and locks in production | `redis://localhost:6379` |
| `USE_REDIS` | Set it to `true` to use `REDIS_URL` in development too | unset |
| `CACHE_REDIS_URL` | Separate Redis instance for the cache | `REDIS_URL` |
| `INTEGRATION_ENCRYPTION_KEY` | Encrypts the secret fields the Integration Module stores, and the per-shop payment credentials in `tenant_integration_secret` (`src/tenant-secrets/`) | `supersecret` |
| `BACKEND_PUBLIC_URL` | Public address of this backend, shown to shop owners as the Robokassa Result URL (`<BACKEND_PUBLIC_URL>/robokassa/result`) and as the webhook URL of their BTCPay Server store (`<BACKEND_PUBLIC_URL>/btcpay/webhook/<tenant id>`). Every Bitcart invoice also carries `<BACKEND_PUBLIC_URL>/bitcart/webhook/<tenant id>` as its notification address, and without the variable it carries none and the minute sweep alone settles it. It is also the x402 purchase address for AI agents (`<BACKEND_PUBLIC_URL>/store/x402/purchase`). Falls back to the request host, which is wrong behind the panel proxy | unset |
| `PAYMENTS_CRYPTO_AVAILABLE` | Set it to exactly `true` to offer cryptocurrency payments: the shops' own BTCPay Server and Bitcart stores, and x402 (USDC). Any other value, or none, hides all three from the panel and the checkout, closes `POST /store/x402/purchase`, and makes the BTCPay and Bitcart webhooks and sweeps do nothing. Never set it on the RU instance, where `deploy/instances/ru.json` forbids it | unset (off) |
| `X402_MAINNET_AVAILABLE` | Set it to exactly `true` to let shops take real USDC on Base (`eip155:8453`) through x402. Without it a shop can choose Base Sepolia only, a test network whose USDC is worthless, and its storefront shows the test-mode dot. Forbidden on RU like every `X402_` variable | unset (off) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | SMTP transport for transactional emails | `smtp.example.com`, `587`, `false` |
| `SMTP_USER`, `SMTP_PASS` | SMTP credentials | — |
| `SMTP_FROM`, `SMTP_REPLY_TO` | Sender and reply-to addresses. `SMTP_FROM` carries the address; the name beside it is the shop's own (`tenant_notification_settings.email_from_name`), falling back to `STORE_NAME` | — |
| `TELEGRAM_BOT_TOKEN` | The platform bot that tells a shop owner about a new order. The backend only sends; the long polling belongs to `apps/bot`, which Telegram allows one of per token. Unset means no owner is notified, and each skipped order says so in the log | — |
| `TELEGRAM_BOT_USERNAME` | The `@name` the panel builds its `?start=` deep link on | `upreadystore_bot` |
| `TELEGRAM_LINK_SECRET` | Shared secret for `POST /telegram/link`, the one call the bot makes here. Unset refuses every link attempt | — |
| `PANEL_PUBLIC_URL` | Where the owner opens an order. The Telegram message links to `<PANEL_PUBLIC_URL>/orders/<id>`; falls back to `DEMO_PANEL_URL`, and with neither set the message carries no link | — |
| `STOREFRONT_URL` | Storefront base URL for revalidation webhooks, and the FALLBACK address in customer e-mails. On a multi-tenant deployment the links in a letter are built from the shop the order belongs to (`src/tenant-notifications/storefront-origin.ts`), and this variable only donates the scheme and the port | `http://localhost:8000` |
| `REVALIDATE_SECRET` | Sent as `x-revalidate-secret` to the storefront; must match its value | `supersecret` |
| `PLATFORM_PRICING_URL` | The public address of the platform's `/pricing` page (a `DEMO_HOSTS` host of the storefront), for the «Открыть /pricing» link on the admin's «Тарифы» page. Unset hides the link; the page itself does not depend on it | — |
| `STOREFRONT_DEFAULT_LOCALE` | Fallback email language when the buyer's is unknown, one of the locales under `src/emails/i18n` | `en` |
| `STORE_NAME`, `STORE_EMAIL`, `STORE_PHONE`, `STORE_ADDRESS` | Store branding in email templates, and the fallback for a shop that has set none of its own | — |
| `STORE_PROFILES_MEDIA_BASE_URL` | Where `/static/store-profiles` is served from, the parent of every starter dataset's media directory. `POST /tenants/seed` (the onboarding wizard's starter catalog) and `seed-mt-demo` build every image URL from it and refuse to write a relative one, so neither runs without this variable or `STORE_MEDIA_BASE_URL` below | — |
| `STORE_MEDIA_BASE_URL` | Where ONE profile's media is served from, for the single-store seed (`STORE_PROFILE`). `resolveMediaBaseUrl` takes its parent directory when `STORE_PROFILES_MEDIA_BASE_URL` is unset | — |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` | S3-compatible file storage, used when `NODE_ENV=production` | — |
| `MEDUSA_ADMIN_ONBOARDING_NEXTJS_DIRECTORY` | Storefront directory for Medusa's onboarding flow | `medusa-storefront` |
| `PLATFORM_ADMIN_EMAIL` | The platform's own login, added as a `tenant_admin` row to every shop a tenant creates (`createTenantWorkflow`) and backfilled onto every existing shop by `scripts/fixtures/o25-platform-admin-all-shops.ts`. The auth identity is shared across shops; unset disables the feature entirely, and no shop gets the row | unset |
| `SCHOOL_SSO_RETURN_HOSTS` | The hosts a school may receive a buyer's single-use sign-in code on, comma separated, such as `school.cherkashina.ru`. `POST /store/tenant/sso/code` mints a code only for a `return_to` on one of them, and `POST /store/tenant/sso/exchange` trades it for the buyer's token (`src/api/store/tenant/sso/`). Empty mints no code. Give the storefront the same list. RU only: `deploy/instances/intl.json` forbids it | — |

## Project Structure

```
apps/backend/
├── medusa-config.ts              # modules, plugins, feature flags
├── scripts/
│   └── copy-migration-data.js    # copies seed JSON into the build output
└── src/
    ├── admin/                    # scaffold for Admin extensions, with an empty i18n export
    ├── api/                      # scaffold with Medusa's example store and admin routes
    ├── emails/                   # React Email templates and email i18n
    ├── jobs/                     # scheduled jobs, empty
    ├── links/                    # module links, empty
    ├── migration-scripts/        # initial-data-seed.ts, lib/ stages, data/ JSON
    ├── modules/                  # smtp-notification provider
    ├── subscribers/              # transactional emails and storefront revalidation
    └── workflows/                # custom workflows, empty
```

The scaffold and empty directories carry no starter code. Each of them keeps its own README with the Medusa framework reference for the primitive it holds, so you can drop your own widget, route, job, link, or workflow in place.

## Customizing the Seed Data

The seed script reads every stage from JSON, so adapting it to your markets and catalog means editing data files, not TypeScript.

Its only existence check is the sales channel named in `data/store/json/store.json`. While that sales channel exists, the script logs that the store is already seeded and does nothing, so edited data files take effect on a fresh database. If you delete the sales channel and run the script again, every other stage runs again without checking for duplicates, because the workflows it calls do not deduplicate by handle.

See [Customize Seed Data](https://docs.gorgojs.com/tools/medusa-dtc-starter/customize-seed-data) for the file formats, currency rules, and the pre-launch checklist.

## Switching a Stand to a Copy of the Live Database

[`scripts/stand-use-live-copy.mjs`](scripts/stand-use-live-copy.mjs) moves the stand of this checkout onto a fresh copy of a database restored from live. It never drops a database and writes only to the copy it creates.

```bash
node scripts/stand-use-live-copy.mjs --target upready_store_ex_17c --restart
pnpm stand:use-live-copy --target upready_store_ex_17c --restart    # the same, through package.json
```

| Flag | Default | What it does |
|---|---|---|
| `--target <db>` | required | The database to create. The run stops when it already exists. |
| `--source <db>` | `upready_store_live_copy` | The database to copy from. |
| `--restart` | off | Restarts this checkout's `medusa develop` on `PORT` once `.env` is switched, and refuses when another directory holds that port. |
| `--allow-undecryptable` | off | Switches even when the copy's shop secrets do not decrypt under your key. |
| `--probe-port <port>` | a free port | The port of the probe backend. |
| `--storefront-dir <path>` | `../storefront` | The storefront whose fetch cache the run clears. |
| `--log <path>` | `$TMPDIR/stand-backend-<PORT>.log` | The log of the restarted backend. |

The script runs these steps in order and stops at the first failure:

1. Preflight. `DATABASE_URL` in `.env` has to point at a local Postgres, the source has to exist and the target must not, and `.env` has to set `INTEGRATION_ENCRYPTION_KEY` and `MP_SCHEDULER=off`.
2. Copy with `pg_dump -Fc | pg_restore --no-owner --no-acl`, because `createdb -T` refuses a source that has open connections.
3. `medusa db:migrate --skip-scripts --execute-safe-links`.
4. Every shop whose main address is a public domain gets a local one (`olavka.com` becomes `olavka-com.localhost`), and the local one becomes primary. Without it the storefront answers every other address of the shop with a 301 to the live domain.
5. The encryption probe decrypts every shop secret of the copy and prints `ok` or `fail` per row, never a value.
6. The storefront's `.next/cache/fetch-cache` is removed.
7. A probe backend boots against the copy on a spare port. The run asks it for `/health` and for `/storefront/by-host` of every local main address, then stops it.
8. The switch backs `.env` up to `.env.bak-<date>-<time>` and rewrites `DATABASE_URL` and `DB_NAME`.

Two of those steps guard against what a copy of live data does to a plain `db:migrate` and `medusa develop`. A live database records its migration scripts under their compiled names, such as `initial-data-seed.js`. Run from sources, Medusa takes `initial-data-seed.ts` for a new script and seeds a second store profile, «My Store», into the copy. `--skip-scripts` prevents that, and the script counts the rows of `store` and `sales_channel` after the copy and after every later step, failing on any growth. `MP_SCHEDULER=off` keeps the five-minute marketplace sync in [`src/jobs/marketplace-sync.ts`](src/jobs/marketplace-sync.ts) from calling Wildberries or Ozon with the shops' own keys.

A `fail` from the encryption probe means the copy was encrypted under another `INTEGRATION_ENCRYPTION_KEY`. Put that key into `.env`, or run again on a new target with `--allow-undecryptable`, and those integrations show as unreadable on the stand. The run leaves its target in place whenever it stops, so drop it with `dropdb <name>` once you no longer need it.

Restart the storefront after the switch. Its middleware keeps the shop behind each host in memory for a minute (`TTL_MS` in `apps/storefront/src/lib/tenant/resolve.ts`).

A copy of live holds real buyers' data. Anonymize it before a stand runs on it, with [`src/scripts/tenant-only`](src/scripts/tenant-only/README.md):

```bash
npx ts-node src/scripts/tenant-only/cli.ts --db postgres://…/<copy> --mark --source <live-copy>
npx ts-node src/scripts/tenant-only/cli.ts --db postgres://…/<copy> --anonymize
npx ts-node src/scripts/tenant-only/cli.ts --db postgres://…/<copy> --anonymize --verify
```

The same tool keeps one shop in a copy (`--keep <handle>`), which is how a shop moves to a server of its own through [`deploy/scripts/tenant-only-dump.sh`](../../deploy/scripts/tenant-only-dump.sh). An anonymized copy has no passwords left, so give the stand its logins back with `ensure-accounts.js` (step 4 of the boot above).

## What is Medusa?

Medusa is a set of commerce modules and tools for building commerce applications without reinventing core commerce logic. The modules are open source, published on npm, and can be composed into stores, marketplaces, or anything else that needs commerce primitives.

Read about [Medusa's architecture](https://docs.medusajs.com/learn/introduction/architecture) and [commerce modules](https://docs.medusajs.com/learn/fundamentals/modules/commerce-modules) in the docs.

## What is Gorgo?

Gorgo builds and maintains open-source integrations, extensions, and starters for Medusa, so that adapting the platform to a local market costs less time and code. This starter is one of them. Gorgo also curates a catalog of community and official Medusa plugins and runs the Medusa developer community on Telegram.

Learn more on the [Gorgo website](https://gorgojs.com), browse the [plugin catalog](https://gorgojs.com/medusa/plugins), or read the [DTC Starter documentation](https://docs.gorgojs.com/tools/medusa-dtc-starter).

## Support and Community

Connect with other Medusa developers on Telegram — [@medusajs_chat](https://t.me/medusajs_chat)

More Medusa channels: [GitHub Discussions](https://github.com/medusajs/medusa/discussions), [Discord](https://discord.com/invite/medusajs), [Medusa blog](https://medusajs.com/blog/), [Gorgo blog](https://gorgojs.com/blog/)

## License

MIT — see [LICENSE](../../LICENSE).
