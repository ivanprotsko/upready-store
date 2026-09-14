# Goal

When an order is placed, two people must find out: the customer, by e-mail, and the shop owner, in Telegram.
Today neither happens.

Measured state (`{{MISSION_DIR}}/research/upready-store-capabilities.md` §3, rows «Уведомления покупателю» and
«Уведомления владельцу»):

- The subscribers and the React Email templates in 36 languages exist
  (`apps/backend/src/subscribers/order-*-email.ts`, `apps/backend/src/emails/`), but the SMTP provider only
  registers when `SMTP_HOST` is set and `deploy/mt/shipshift.env.example` does not contain it — so on the
  multi-tenant host no letter is ever sent.
- Links in those letters are built from `STOREFRONT_URL`, which on the multi-tenant host is the engine's own
  domain, not the customer's shop. A customer would be sent to the wrong site.
- For the owner there is nothing at all: `order-placed-tenant-link.ts` only links the order to the tenant. A
  search for `telegram` across `apps/backend` returns one README mention and no code.

The client asked for this in her own words: she wants every order in one place and to be pushed when something
happens (`{{MISSION_DIR}}/research/telegram-digest.md`, #468851 «Да, хотела бы»).

## Step plan

1. **Make e-mail possible on the multi-tenant host.** Add the SMTP variables to
   `deploy/mt/shipshift.env.example` and to `deploy/compose.mt.yml` for `mt-backend`, documented in the file the
   same way the neighbouring optional blocks are (`AGENTS.md`: optional infrastructure turns on from its own
   variables and a first run must not require it). Do not put a credential in the repository: the example file
   carries names and a comment, the real values live only in `shipshift.env` on the host.
2. **Fix the link.** Every customer-facing URL in a transactional e-mail must point at the shop the order
   belongs to. The tenant's public origin is already resolvable server side
   (`apps/backend/src/api/storefront/by-host/hosts.ts` derives it from the handle and `TENANT_BASE_DOMAINS`, and
   a tenant with its own domain has `tenant_domain`). Resolve it per order and pass it to the template instead
   of the global `STOREFRONT_URL`, which stays the fallback for a single-store install.
3. **Sender identity per shop.** The owner sets a sender name and a reply-to address in the panel; the platform
   SMTP account does the sending. Do not let the owner set an arbitrary `From` address — that is a deliverability
   and abuse problem; name it in the PR body as a deliberate limit.
4. **Telegram to the owner.** Use the platform bot that already exists (`@upreadystore_bot`, `apps/bot`,
   container `upreadystore-bot`, deploy notes `apps/bot/DEPLOY.md`) rather than asking each shop for a bot
   token: the storage of per-shop tokens is an open question (`q-tg-tenant-token-store`) and you must not open
   it here. The linking flow: the panel shows a one-time code and a deep link `https://t.me/upreadystore_bot?start=<code>`;
   the owner presses it; the bot binds that chat id to the tenant; the panel then shows «подключено» with the
   chat's name and a «Проверить» button that sends a test message. A code expires and is single-use.
5. **The message.** On a placed order the owner gets: shop name, order number, total, the line items with
   quantities, the customer's name and phone, the delivery method and address, and a link that opens the order
   in the panel. Plain text or lightly formatted, in the tenant's default language. Send it from a subscriber
   next to the existing e-mail ones, so it follows the same event.
6. **Failure must surface at both ends** (rule 20a): if Telegram or SMTP fails, the order still completes, the
   failure is logged with the order id, and the panel shows the last delivery status of each channel. Silence is
   not an acceptable outcome.
7. Isolation: tenant A's owner must never receive tenant B's orders. Prove it with two shops.

## Commands

```
cd apps/backend && npx medusa lint && npx tsc --noEmit && pnpm test:unit
cd apps/backend && DB_HOST=localhost PORT=9199 pnpm test:integration:http
cd apps/tenant-panel && pnpm typecheck && pnpm lint
cd apps/bot && pnpm typecheck && pnpm test
```

## Acceptance (measured, quoted in the PR body)

- An order placed on the local stand produces a letter captured by a local SMTP sink (MailHog, `smtp-tester`,
  or a file transport — say which you used) whose body links to `http://<handle>.localhost:8041/...`, i.e. the
  shop, not the engine. Quote the link from the captured message.
- The owner links Telegram in the panel and receives a real message for a real order. Screenshot of the panel
  «подключено» state and of the Telegram message.
- The same order does not reach a second linked owner. Quote the evidence.
- With SMTP unset the backend still boots and the order still completes; the failure is in the log with the
  order id. Quote both lines.
- Seam and unit suites pass; quote the whole-file result lines.

## What NOT to do

- No real SMTP password, bot token or chat id in the repository, in a test fixture or in the PR body.
- Do not invent a per-shop bot token store; that is deliberately out of scope.
- Do not change the 36 e-mail catalogues wholesale; if you add a key, add it to all 36 with a real translation
  (`AGENTS.md`, Localization) and say so.
- Do not deploy and do not restart the live bot container.
