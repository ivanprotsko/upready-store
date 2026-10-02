# Walk Fixtures for the Scenario Graph Runner

This directory holds the upready-store part of the devops runner `staff/tools/ui-walk.mjs` (devops task
t-2026-10-03-01). The runner walks a scenario graph against the local stand and shoots every step. The
graph is the cherkashino.com purchase,
[pilot-tree-cherkashino-purchase.json](/Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/design-process/pilot-tree-cherkashino-purchase.json)
(format `scenario-graph/v0`). Its `{fx.*}` values come from `fixtures.mjs`.

| File | What it is |
|---|---|
| `fixtures.mjs` | The hooks the runner calls: `reset`, `seed`, `login`, `api`, plus `stand` |
| `check.mjs` | Runs the hooks against the running stand and writes `check.json` |

Both are plain Node 20 or later with no dependencies. `check.mjs` borrows Playwright from the main
checkout. Neither file starts, stops or rebuilds the stand.

## What the Runner Calls

Import the module once:

```js
import * as fixtures from "/Users/ivanprotsko/upready/worktrees/upready-store/docs/scenario-tree-pilot/walk/fixtures.mjs"
```

For every path, in this order:

1. Open a new browser context and call `await fixtures.reset({ context })`. It clears the context's
   cookies, so there is no cart and no signed-in buyer. It never writes to the database.
2. Call `const fx = await fixtures.seed(pathEdges)`, where `pathEdges` is the path's array of edge
   objects from the graph. `fx` fills every `{fx.*}` placeholder, and `fixtures.stand` fills
   `{stand.storefront}`, `{stand.backend}` and `{stand.panel}`.
   - Each call makes a new buyer, `demo.buyer+<ts>@example.com`, with its own password, so paths
     never share a cart, an account or an order.
   - When the path signs in with `{fx.buyer.email}` (edges `login-ok`, `wrong-password`, `retry` out
     of the login screens), `seed` creates that account first through the Store API, the same calls
     the storefront's signup makes. Registration edges use `{fx.buyer.newEmail}`, which stays free.
   - `fx.receipt.ok`, `fx.receipt.tooLarge` and `fx.receipt.wrongType` are absolute file paths for
     `upload` steps. The 11 MB file is written at run time.
3. At the first edge with `actor: "owner"`, call
   `const owner = await fixtures.login("owner", { browser })`. It returns `{ context, page }`, a
   second context that already holds a panel session. Run every owner step on `owner.page` and close
   `owner.context` when the path ends.
4. For a step with `do: "api"`, call `await fixtures.api(step, { run, fx })`. `run` is the runner's
   object of captured values, such as `run.orderId` from the order URL. For the capture step the hook
   looks up `{run.paymentId}` from `run.orderId` and writes it back into `run`.

`login("buyer", { context, fx })` exists too. It puts the storefront's `_medusa_jwt` cookie for
`fx.buyer` into the context, registering the account when needed. The pilot graph does not need it,
because it signs the buyer in through its own login edges.

## What This Assumes About the Runner

The runner contract fixes only the names `reset()`, `seed(path)` and `login(actor)`. These are the
parts I chose, so the runner can match them or ask for a change:

- `reset` takes `{ context }`, the path's Playwright `BrowserContext`.
- `seed` takes the path as an array of edge objects. Any other shape is treated as a path that signs
  in, which only means one extra test account.
- `login("owner")` takes `{ browser }`, the Playwright `Browser`, and opens its own context.
- `api` is a fourth export, called for `do: "api"` steps with `{ run, fx }`.
- `{locale}` and `{run.*}` are the runner's to fill. The fixtures fill `{fx.*}` and `{stand.*}`.

## Settings

Every setting has a default for the stand `ivan-1001` and can be overridden from the environment.

| Variable | Default | Used for |
|---|---|---|
| `WALK_STAND_ENV` | the stand backend's [.env](/Users/ivanprotsko/upready/worktrees/upready-store/stand/ivan-1001/apps/backend/.env) | `JWT_SECRET` and `DATABASE_URL`, read at run time and never printed |
| `WALK_DB_URL` | `DATABASE_URL` from that file | the lookups below |
| `WALK_PSQL` | `/opt/homebrew/opt/postgresql@16/bin/psql` when present, else `psql` | running the lookups |
| `WALK_SHOP` | `cherkashino-com` | the shop handle every lookup starts from |
| `WALK_OWNER_ADMIN` | the shop's first admin by creation | picking another `tenadm_…` admin |
| `WALK_STOREFRONT` | [Черкашино](http://cherkashino-com.localhost:8700) | `{stand.storefront}` and the publishable key |
| `WALK_BACKEND` | [http://localhost:9700](http://localhost:9700) | `{stand.backend}`, the Store API and the capture |
| `WALK_PANEL` | [Панель магазина · Upready](http://localhost:5700) | `{stand.panel}` |
| `WALK_TMP` | `<os tmpdir>/upready-walk` | receipt files and the check's output |

## Live Mode

The same graph runs against the live shop after a deploy. Set `WALK_MODE=live`, or give an https
`WALK_STOREFRONT`. In live mode:

- **No database and no JWT secret are read.** Nothing is minted.
- **The owner session comes from the lead.** `WALK_OWNER_TOKEN_FILE` is the path of a file that holds
  the owner's bearer token. `login("owner")` trades it for a panel session at `POST /auth/session`, and
  `api` sends it as is. Without the file, every owner step stops with «no fixture».
- **Each buyer is a new [mail.tm](https://mail.tm) inbox.** `fx.buyer.email` is its address, and
  `fx.buyer.mailbox` keeps the address and the inbox password, so the shop's letters (order placed,
  course access) can be read afterwards. A path that registers gets a second inbox for
  `fx.buyer.newEmail`. The account is registered through the Store API, as on the stand.
- **The shop's card and manager contact come from the public `GET /storefront/by-host`.** The first
  lesson comes only from `WALK_LESSON1`. Without it, the lesson steps stop with «no fixture».
- **`{run.paymentId}` is looked up through `GET /tenants/orders/:id` with the owner token.**

| Variable | Live default |
|---|---|
| `WALK_STOREFRONT` | [Черкашино](https://cherkashino.com) |
| `WALK_BACKEND` | [shipshift.dev](https://shipshift.dev) |
| `WALK_PANEL` | none: set it, or owner paths stop with «no fixture» |
| `WALK_OWNER_TOKEN_FILE` | none: the lead gives it |
| `WALK_LESSON1` | none |

Every test buyer and order on live is a real record: a `mail.tm` customer with `metadata.walk = true`.

No id is written into the code. The fixtures look these up by the shop handle:

- the owner, an admin of the shop and the emailpass identity behind the admin's e-mail;
- the products, the course's first lesson, and the shop's first card and Telegram contact from
  `tenant.metadata.manual_payment`;
- the payment of an order;
- the publishable key, through the public `GET /storefront/by-host`.

One person can administer several shops with one identity, and that identity's `app_metadata` then
points at another shop's admin row. That is why the owner is matched by e-mail and not by
`app_metadata`.

## Known Limits

- **`api` steps with `method: "STUB"` throw.** The receipt upload runs in a Next server action that
  calls the backend from the server, so a stub in the browser cannot make it fail. The upload-failed
  node stays unreached until the stand has a fault switch.
- **Steps that wait on an `outbox` are not covered.** The stand has no mail and no Telegram bot, so
  nothing here can read a sent message.
- **Expectations with `testid: "todo"` cannot pass yet.** They mark target states that are not in the
  code yet.
- **Test buyers accumulate on the stand.** Each `seed` that signs in adds one
  `demo.buyer+…@example.com` customer, with `metadata.walk = true`. Each checkout path adds an order.

## Checking the Fixtures

```bash
cd /Users/ivanprotsko/upready/worktrees/upready-store/docs/scenario-tree-pilot
node walk/check.mjs
```

The check does five things:

- runs `seed` for a path that signs in;
- opens the panel as the owner;
- captures the newest uncaptured transfer order of a `demo.buyer…@example.com` buyer for the pilot's
  products, through `api`, and checks the payment and the panel's «Оплачен»;
- signs a buyer in;
- runs `reset`.

When the stand has no such order, the check skips the capture and says so. Results and screenshots
go to `<WALK_TMP>/check/`.
