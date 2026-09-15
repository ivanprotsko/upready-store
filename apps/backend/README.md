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
- **Translations feature flag** – Medusa's Translation Module is enabled, which is what the seeded locale data and the storefront's translated catalog rely on.
- **Optional Redis and S3** – the cache, event bus, and workflow engine switch to Redis in production as soon as `REDIS_URL` is set, and in development once you also set `USE_REDIS=true`. File uploads move to S3-compatible storage once `S3_BUCKET` is set and `NODE_ENV` is `production`.

## Requirements

- Node.js v20.19+ (or v22.12+)
- PostgreSQL v15 or later
- Redis, optional in development. Development runs the in-memory cache, event bus, and workflow engine unless you set `USE_REDIS=true` alongside `REDIS_URL`.

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
`import-cherkashina-reviews.ts`, `prefill-cherkashino-requisites.ts`) run through `medusa exec` and spell
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

Steps 5 and 6 are convergence, not correctness: `set -e` is lifted for them and a failure is logged
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

## Environment Variables

Copy [`.env.template`](.env.template) to `.env`. Only `DATABASE_URL` has to be set for the application to boot, and every `supersecret` value has to be replaced before production.

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres@localhost/$DB_NAME` |
| `DB_NAME` | Database name interpolated into `DATABASE_URL` | `medusa_dtc_starter` |
| `STORE_CORS` | Allowed origins for the Store API | `http://localhost:8000,…` |
| `ADMIN_CORS` | Allowed origins for the Admin API | `http://localhost:5173,http://localhost:9000,…` |
| `AUTH_CORS` | Allowed origins for authentication | `http://localhost:5173,http://localhost:9000,…` |
| `JWT_SECRET` | Signing secret for JWTs | `supersecret` |
| `COOKIE_SECRET` | Signing secret for cookies | `supersecret` |
| `COOKIE_SECURE` | Set to `true` to send cookies over HTTPS only | `false` |
| `REDIS_URL` | Redis instance for the cache, event bus, and workflow engine in production | `redis://localhost:6379` |
| `USE_REDIS` | Set it to `true` to use `REDIS_URL` in development too | unset |
| `CACHE_REDIS_URL` | Separate Redis instance for the cache | `REDIS_URL` |
| `INTEGRATION_ENCRYPTION_KEY` | Encrypts the secret fields the Integration Module stores, and the per-shop payment credentials in `tenant_integration_secret` (`src/tenant-secrets/`) | `supersecret` |
| `BACKEND_PUBLIC_URL` | Public address of this backend, shown to shop owners as the Robokassa Result URL (`<BACKEND_PUBLIC_URL>/robokassa/result`). Falls back to the request host, which is wrong behind the panel proxy | unset |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | SMTP transport for transactional emails | `smtp.example.com`, `587`, `false` |
| `SMTP_USER`, `SMTP_PASS` | SMTP credentials | — |
| `SMTP_FROM`, `SMTP_REPLY_TO` | Sender and reply-to addresses. `SMTP_FROM` carries the address; the name beside it is the shop's own (`tenant_notification_settings.email_from_name`), falling back to `STORE_NAME` | — |
| `TELEGRAM_BOT_TOKEN` | The platform bot that tells a shop owner about a new order. The backend only sends; the long polling belongs to `apps/bot`, which Telegram allows one of per token. Unset means no owner is notified, and each skipped order says so in the log | — |
| `TELEGRAM_BOT_USERNAME` | The `@name` the panel builds its `?start=` deep link on | `upreadystore_bot` |
| `TELEGRAM_LINK_SECRET` | Shared secret for `POST /telegram/link`, the one call the bot makes here. Unset refuses every link attempt | — |
| `PANEL_PUBLIC_URL` | Where the owner opens an order. The Telegram message links to `<PANEL_PUBLIC_URL>/orders/<id>`; falls back to `DEMO_PANEL_URL`, and with neither set the message carries no link | — |
| `STOREFRONT_URL` | Storefront base URL for revalidation webhooks, and the FALLBACK address in customer e-mails. On a multi-tenant deployment the links in a letter are built from the shop the order belongs to (`src/tenant-notifications/storefront-origin.ts`), and this variable only donates the scheme and the port | `http://localhost:8000` |
| `REVALIDATE_SECRET` | Sent as `x-revalidate-secret` to the storefront; must match its value | `supersecret` |
| `STOREFRONT_DEFAULT_LOCALE` | Fallback email language when the buyer's is unknown, one of the locales under `src/emails/i18n` | `en` |
| `STORE_NAME`, `STORE_EMAIL`, `STORE_PHONE`, `STORE_ADDRESS` | Store branding in email templates, and the fallback for a shop that has set none of its own | — |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` | S3-compatible file storage, used when `NODE_ENV=production` | — |
| `MEDUSA_ADMIN_ONBOARDING_NEXTJS_DIRECTORY` | Storefront directory for Medusa's onboarding flow | `medusa-storefront` |

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
