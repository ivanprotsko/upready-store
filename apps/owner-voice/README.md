# Owner Voice Chat

The shop owner's voice chat (t-2026-10-20-24), stage 1 and stage 2. The owner holds a button and asks a
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

Product and stock search fold ё into е on both sides: speech to text writes «мумие» for «мумиё».
The API's own search does not fold ё, so when it finds nothing the tool reads the list (up to 500
rows) and matches locally.

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

## Stand on a Mac without Docker

One Node process, no build, no Docker. Stage 2 runs on port 5476; the stage 1 stand stays on 5475.

The stand on fixtures, which needs no key at all. It reads the recorded shop, the keyword router
answers, ElevenLabs runs on its fixture:

```bash
cd apps/owner-voice
PORT=5476 MODEL_PROVIDER=rules SHOP_FIXTURES=1 node src/server.ts
```

- `http://localhost:5476` is the owner page: the chat, the command palette on Shift+Cmd+K
  (Shift+Ctrl+K elsewhere), the voice settings behind the gear.
- `http://localhost:5476/assistant` is the buyer assistant: a right panel over the shop, as in the
  chrxnasdmds storefront. It reads the public `/store/*` only, never `/tenants/*`, and masks a
  buyer's email, phone, name and address before the model sees the text.
- `?show=palette`, `?show=exchange`, `?show=voices` on the owner page and `?show=exchange` on the
  assistant play a fixed exchange, for screenshots.

Keys reach the process only through a file you keep outside the repo, read by `node --env-file`.
Never pass a key on the command line or in a chat:

```bash
cd apps/owner-voice
PORT=5476 node --env-file=/path/outside/the/repo/owner-voice.env src/server.ts
```

- The env file holds `STAND_PASSWORD` and the keys you have (`ELEVENLABS_API_KEY`,
  `ANTHROPIC_API_KEY`, the shop login). With any of them set, `STAND_PASSWORD` is required: without
  it the server prints why and exits.
- Leave out a key and that part runs on fixtures. With no `ELEVENLABS_API_KEY` the mic button is
  off and the page says «Голос на этом стенде выключен, спросите текстом».
- `MODEL_PROVIDER=rules` turns the model off and the keyword router answers.
- When the model call fails (an HTTP error such as an empty Anthropic balance, no network, a
  30-second timeout), the keyword router answers the same question. The server log has the cause,
  and `GET /api/status` shows it in `modelFallback` (time and reason, keys masked) until the model
  answers again.
- The page shows the owner plain sentences only. Variable names, HTTP codes and vendor errors
  stay in the server log.
- The browser opens the microphone on `localhost` without HTTPS.

What the stand never does, whatever the keys:

- It writes nothing to the shop. A write command in the chat or the palette shows a card with the
  exact request (method, path, body); «Подтвердить» shows it as a dry-run and sends nothing.
  `src/shop/api.ts` refuses every method but GET before it leaves, the login aside.
- Destructive and financial commands (delete, refund, payouts) are not given to the agent at all.
- It adds no voice to the ElevenLabs account. The settings panel lists the account's voices and
  the public library with GET; a library voice not in the account shows «нужно добавить в аккаунт».
  Adding one is a write to the account and stays off unless `ELEVENLABS_ALLOW_ADD_VOICE=1`.
- The ElevenLabs key stays in the server. The browser keeps the chosen `voice_id` only, and the
  server checks it against the catalog before it speaks. An unknown voice is refused and the page
  forgets it; with no choice the server speaks with `ELEVENLABS_VOICE_ID`.

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
| `ELEVENLABS_API_KEY` | Speech to text and text to speech | speech runs on fixtures, the mic button is off, a typed question still works |
| `ELEVENLABS_VOICE_ID` | The default voice; the settings panel can choose another from the account | Oksana's cloned voice from chrxnasdmds, which plays only on the account that owns it |
| `ELEVENLABS_ALLOW_ADD_VOICE` | `1` lets the settings panel add a library voice to the account, a write to that account | `0`, off: such voices show «нужно добавить в аккаунт» |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | The model | a keyword router answers instead; it also answers any turn the model fails |
| `MODEL_PROVIDER=rules` | The keyword router even with a model key | the model answers when its key is set |
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
