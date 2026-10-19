# Owner Voice Chat

Stage 1 of the shop owner's voice chat (t-2026-10-20-24). The owner holds a button and asks a
question. ElevenLabs turns the speech into text, a model answers with read-only tools that call the
shop's HTTP API, and ElevenLabs speaks the answer while the screen shows it. The data comes from
cherkashino.com through its API and never from a database connection (Ivan, 20.10.2026).

## What It Can Answer

| Tool | Asks the shop | Ported from the chrxnasdmds admin-actions map |
|---|---|---|
| `find_products` | `GET /store/products` (Store API, prices for the region of `SHOP_COUNTRY`) | `products.list`, `products.get` |
| `product_stock` | `GET /tenants/inventory-items` | `inventory.list` |
| `sales_summary` | `GET /tenants/analytics/summary`, computed by the shop's server | `orders.list` (the sums come from the engine's own summary route) |
| `recent_orders` | `GET /tenants/orders`, no customer fields requested | `orders.list` |
| `product_reviews` | `GET /tenants/reviews`, the author's name is dropped | none, a route of this engine |
| `open_product` | `GET /store/products`, then a panel and a storefront link | `products.get` |

Every request is a GET. The client in `src/shop/api.ts` refuses any other path or method before
it leaves, and the only POST is the shop login.

## Run It Locally

You need Node 22.18 or later. There is nothing to build or install for a run.

```bash
cd apps/owner-voice
node src/server.ts                 # the page on port 5470 of localhost
node scripts/fixture-run.ts        # audio in, answer text and audio out, no keys, no network
node --test src/*.test.ts src/**/*.test.ts
npx tsc --noEmit                   # after pnpm install, for the types
```

## Put It on a Stand

1. Copy `.env.example` to `.env` next to `docker-compose.yml` and fill in the keys you have.
2. Run `docker compose up -d --build` in `apps/owner-voice`.
3. Open port 5470 of the host, or put it behind your proxy with HTTPS. The browser opens the
   microphone only on HTTPS or on `localhost`.

The page header names what runs live and what runs on recorded fixtures, part by part. Every
default is in `.env.example` and in `src/config.ts`; they point at cherkashino.com.

| Variable | What it does | Without it |
|---|---|---|
| `SHOP_API_URL` | The engine the shop runs on, the INTL engine for cherkashino.com | the INTL engine |
| `SHOP_HOST` | The shop's domain, which `/storefront/by-host` resolves to the shop and its publishable key | `cherkashino.com` |
| `SHOP_PANEL_URL`, `SHOP_STOREFRONT_URL` | Where the links point | the cherkashino.com panel and storefront |
| `SHOP_LOCALE`, `SHOP_COUNTRY` | Language of the answers and speech, the country whose region prices are read | `ru`, `ru` |
| `SHOP_LOGIN_EMAIL`, `SHOP_LOGIN_PASSWORD` | A shop panel login for orders, sales, stock and reviews. Give it the role `manager` | those four run on fixtures |
| `STAND_PASSWORD` | HTTP Basic password for the page, any user name | required once the shop login, `ELEVENLABS_API_KEY` or `ANTHROPIC_API_KEY` is set: the server refuses to start. Only a stand on fixtures alone runs open |
| `ELEVENLABS_API_KEY` | Speech to text and text to speech | speech runs on fixtures, a typed question still works |
| `ELEVENLABS_VOICE_ID` | The voice | Oksana's cloned voice from chrxnasdmds, which plays only on the account that owns it |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | The model | a keyword router answers instead |
| `SHOP_FIXTURES=1` | The Store API on fixtures as well | the Store API is live, it needs no key |
| `PORT` | The port | `5470` |

To point it at another shop on the same engine, change `SHOP_HOST`, `SHOP_PANEL_URL`,
`SHOP_STOREFRONT_URL` and the login. For the RU shop, change `SHOP_API_URL` to that instance's engine.

## Swap the Model

`src/model/types.ts` is the one interface a model sits behind: it takes the conversation and the
tool specs and returns tool calls or the final text. `src/model/anthropic.ts` is the provider used
in stage 1. A Russian model for the RU shop is one more file of that shape, chosen in `src/app.ts`.

## Fixtures

`fixtures/shop/by-host.json`, `store-regions.json` and `store-products.json` are recorded from
cherkashino.com on 20.10.2026, with the publishable key replaced. The `tenants-*.json` files are
shaped after the backend routes and are not recorded, because the build machine has no shop login;
each says so in its `_fixture` field. `fixtures/voice` holds two generated tones and the sentence
each stands for, so the speech-to-text stand-in is a lookup table, and the fixture speech is a
placeholder tone, not a voice.
