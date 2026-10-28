# Unified owner cabinet: «Сводка» across sales sources, one sign-in, totals-only relay (t-2026-10-20-23, stage 1)

Stage 1 is design only. No live server was touched and no production code changes here. Stage 2
starts when Ivan approves the prototype.

**v4 of this note (24.10, after Ivan's 18 marks on prototype v3).** Mark 33 changes the sign-in:
one session across all the owner's shops, a second confirmation only on pages with confidential
data (§3 is rewritten). The other marks change the screens only.

**v2 of this note (20.10, after Ivan's 13 marks on prototype v1).** Two marks change the design, not
only the screens. Mark 6: «колонка "данные" не нужна, данные должны быть всегда актуальные на
момент загрузки страницы» — totals are no longer pushed every five minutes and kept; each page
asks for them when it loads (§4). Mark 1: «Предлагаю сделать заголовок "Источники продаж", чтобы в
список можно было добавить маркетплейсы wildberries и ozon» — a row is a sales source, a shop's
storefront or one of its marketplace accounts, and the contract carries `source` (§4).

## Ivan's words (verbatim)

20.10.2026, comments on answer A-2026-10-20-15:

> заводи и запускай выполнение прямо сейчас

> значит нужно поднять какой-то сервер, который будет принимать данные без данных покупателей и уже
> оттуда отправлять за границу

His idea (A-2026-10-20-15 §4.2): each shop's cabinet keeps its own «Обзор»; the «…» menu in the
sidebar switches between cherkashino.com and cherkashino.ru without a second sign-in; the first
section, «Сводка», shows the totals of all the owner's shops.

## 1. The decision in five lines

1. **The owner's identity lives in Russia.** The RU backend is the one place the owner signs in.
   The .com panel never sees her password.
2. **Signed in to one shop — signed in to all.** One owner session, held in Russia, opens every shop.
   .com gets it by an invisible hop: the RU backend signs a one-minute, single-use ticket, the .com
   backend checks it with RU's public key. No call goes from abroad into RU. Pages with buyers'
   personal data ask to confirm the sign-in again after 15 minutes (§3).
3. **A small relay on the RU host carries totals out.** It is its own container with no database
   access. The RU backend hands it a payload; the relay checks it against a closed schema, signs
   it and sends it to .com.
4. **Totals are fetched when a page loads, never cached.** On cherkashino.ru the relay makes one
   outbound call to .com and gets the .com totals in the answer. For cherkashino.com the RU relay
   keeps one connection open *from* Russia to .com; a .com page load asks over it, and the RU relay
   answers with fresh RU totals. Nothing on the RU host listens to the internet for this.
5. **Only totals cross.** The contract is `contract/shop-summary.v1.schema.json`: sums, counts,
   the shop's own product titles, review counts by star. No buyer's name, phone, address, e-mail,
   order number, review text or review author.

## 2. What exists today and what is new

| Piece | Today | New |
|---|---|---|
| Shop switch inside one instance | `POST /tenants/me/switch`, `GET /tenants/me/shops` (`apps/backend/src/api/tenants/me/`), a submenu «Сменить магазин» in `main-layout.tsx` | the list moves up into the «…» menu flat, each shop by its domain only, the current one with a check |
| Group of sites of one client | `tenant_group`, `tenant.group_id` (`docs/multitenancy/sites-one-db-many-storefronts.md`) | a group still lives inside one database; the owner link below joins shops across the two databases |
| Shop's «Обзор» | `routes/home/home.tsx` over `GET /tenants/analytics/summary` | unchanged; «Сводка» reuses its shapes |
| Cross-instance flow | the one-way catalog sync .ru → .com (`t-cherk-24`), product data only (`docs/instances/RULES.md` §1) | a second flow: totals, both ways, through the relay |
| Single sign-in pattern | the school's SSO (`api/store/tenant/sso/`): a 60 s single-use code the school's server redeems at the shop | same idea, but signed so that .com never calls into RU |

## 3. Identity: one sign-in for all the owner's shops, kept in Russia

**v4 (Ivan 21.10, mark 33 on prototype v3, verbatim):** «я же говорил что у нас должна быть
центральная авторизация, вошел в один магазин - вошел во все. А если это не безопасно, то можно к
конфиденциальным данным при переходе на страницу, которая их содержит запрашивать авторизацию
отдельно. так много где сделано.» This section is rewritten to that model: one session across the
owner's shops, and a second confirmation only on pages with confidential data.

The owner of cherkashino.ru and cherkashino.com is a Russian citizen. 152-FZ art. 18 p. 5 wants her
personal data recorded and kept first in a database in Russia. So the account that every panel
trusts lives in the RU database, and the one sign-in form is the RU one.

**Records.**

- RU database, new table `owner_identity`: `id` = `owner_sub` (`own_<ULID>`), the link to her
  existing `tenant_admin` row on RU, `created_at`, `confirmed_at` (the last confirmation, see below).
  Her e-mail and password stay where they are today (the RU `auth_identity`).
- INTL database, new table `owner_link`: `owner_sub`, `tenant_admin_id` (her .com row),
  `linked_at`. No e-mail is copied for this; the .com row already has the e-mail it had before.

**Signed in to one shop — signed in to all.**

1. The owner signs in once, on the RU form (`login-ru`): e-mail and password or Telegram. That
   creates the owner session on RU. It covers every shop of the owner on RU at once (the existing
   `POST /tenants/me/switch` inside one instance).
2. The .com panel has no sign-in form of its own for her. When it has no session, it sends the
   browser to `panel.cherkashino.ru/owner-sso?aud=intl&state=<nonce>` at once. The RU session is
   alive, so nothing is asked: the RU backend signs a ticket (ES256 JWT, `iss` = RU, `aud` =
   `panel.cherkashino.com`, `sub` = `owner_sub`, `tenants` = the .com tenant ids she may open,
   `auth_time`, `nonce`, `jti`, `exp` = 60 s) and sends the browser back to
   `panel.cherkashino.com/sso#ticket=…`. The fragment never reaches a server log.
3. The .com backend checks the signature with RU's public key (pinned in its environment, two
   keys during a rotation), `aud`, `exp`, `nonce` against its own cookie, and that `jti` was never
   used. Then it mints the usual panel session for her `tenant_admin` row.
4. The whole hop is a pair of redirects, well under a second, with no screen of its own. The owner
   sees the .com page open (`overview-com`, `menu-com`). If a ticket comes late or twice, the .com
   panel silently starts the hop again; there is no error screen for it.
5. If the owner opens cherkashino.com first, with no RU session, the hop lands on the RU sign-in
   form; after it she is back on the .com page she asked for and every other shop is open too.
6. The .com session never outlives the RU one: it is capped at the RU session's end (carried in
   the ticket), and «Выйти из всех магазинов» ends the RU session and sends a signed sign-out for
   `owner_sub` to .com over the relay's outbound connection (§4), which ends the .com sessions.

**The «…» menu.** It lists the owner's shops by domain only (cherkashino.ru, cherkashino.com), the
current one with a check on the right (Ivan 21.10, mark 33). Any shop opens at once: inside one
instance by `POST /tenants/me/switch`, across instances by the hop above.

**A shop on another e-mail.** If one of the owner's .com shops is registered to another e-mail,
the RU identity does not know it is hers yet. Its row in «Сводка» says so (`summary-missing`), and
it is added once, by a code sent to that shop's e-mail (`link-first`), which writes `owner_link`.
After that it opens from the menu like any other shop. (v3 asked for the old .com password here;
a code to the shop's own e-mail proves the same thing without a second password.)

**Pages that ask again.** A page that shows buyers' personal data or changes who can reach the
shops asks the owner to confirm the sign-in if her last confirmation is older than 15 minutes
(`confirm-ru`): the RU password or a Telegram confirmation, on the page itself, the data hidden
until then. On .com the same page starts the hop with `max_age=900`; RU asks for the confirmation
and the new ticket carries the fresh `auth_time`. The pages:

- «Клиенты»: the list of buyers and a buyer's card;
- an order's card with the buyer's name, phone and delivery address;
- exports of orders and customers;
- staff and access rights;
- payout details and payouts;
- the owner's e-mail, password and Telegram link;
- marketplace and payment API keys.

Everything else — «Сводка», «Обзор», a source's statistics, the catalog, orders without the
buyer's data, the switch between shops — never asks.

**What of Ivan's model cannot be done literally, and why.** One cookie cannot cover
cherkashino.ru and cherkashino.com: they are different registrable domains, and browsers do not
share cookies between them. So «signed in to one — signed in to all» is done by the invisible hop
above, not by a shared cookie; for the owner the result is the same. And the sign-in form is always
the RU one, also when she starts on .com: her credentials are personal data first recorded in
Russia (152-FZ art. 18 p. 5), so the .com host never takes her password. Nothing else of the model
is dropped.

**Owners of INTL-only shops** keep the .com sign-in they have (e-mail, Telegram). Nothing in this
note touches them.

**Prototype states, v3 → v4.** `login-com` is removed: .com has no sign-in screen of its own for an
owner whose identity is in Russia. `switching` is removed: the hop has no screen. `ticket-used` is
removed: a late or reused ticket is retried silently. `link-first` is rewritten: only for a shop on
another e-mail, by a code from that shop's e-mail. `confirm-ru` is new: «Клиенты» asking to confirm.
`login-ru` says that one sign-in opens every shop.

## 4. The relay: a server in Russia that takes totals and passes them on

**What it is.** A container `owner-relay` in `deploy/compose.ru-host.yml`, about 300 lines of Node
without a framework. It has no database credentials and no access to the backend's network
except one internal port where the backend hands it payloads. Its outbound traffic is allowed to
one host: the .com relay endpoint.

The same image runs on the INTL host for symmetry. There it is not required by law, but one code
path is easier to check than two.

**What it carries.** `upready.shop-summary/v1` per sales source (`contract/`). A source is a
shop's storefront or one of its marketplace accounts (`source`: `storefront`, `wildberries`,
`ozon`); a marketplace source belongs to its shop and is computed by the instance that holds the
marketplace connection, today the RU one. Per source:

- per period (today, yesterday, 7, 30, 90 and 365 days, and the range picked in the calendar) and
  per currency: revenue, orders, average order, the same for the previous period (for today:
  yesterday up to the same hour), cancelled orders;
- the top five products: id, title, quantity, revenue;
- revenue and orders by day for 90 days, by hour for today and yesterday, by month over the year
  (the chart: hours for a day, days up to a month, weeks for a quarter, months for a year);
- `fx`: the Bank of Russia's rate, with its date, for every currency other than roubles. Amounts
  stay in their own currency in the payload; the page shows them in roubles at this rate and names
  the real amount, the rate and its date in a tooltip (Ivan 21.10, marks 17, 19, 20 on prototype
  v2). `owner-summary/v1` totals are one rouble figure per period with `by_currency` for the
  popover;
- orders waiting to be packed; published and draft products;
- reviews: published, pending, average, counts by star, new in 30 days.

**What stays out**, by the schema and by the code that builds the payload: buyers' names, phones,
addresses, e-mails, order numbers, delivery data, review texts and authors, any city or region.
Every object of the schema is closed, so an extra field is refused before it leaves the host
(`contract/contract.test.mjs` proves it on five such fields).

**How it moves: at page load, in both directions, every connection opened from Russia.**

From cherkashino.ru (the owner opens «Сводка» or a source page in the RU panel):

1. The RU backend computes the RU sources itself and asks the RU relay for the .com ones.
2. The relay sends one `POST /owner-relay/v1/exchange` over HTTPS to the .com relay, signed
   (Ed25519, its own key), with a request id and the `owner_sub`.
3. The .com relay checks the signature, asks the .com backend for the owner's .com sources, checks
   each payload against the schema, signs the answer with the .com key and returns it.
4. The RU relay checks the answer (signature, request id, schema) and hands it to the backend.

From cherkashino.com (the owner opens the same pages in the .com panel):

1. The RU relay keeps one connection open to the .com relay: a WebSocket it dials itself on
   start, with a ping every 30 s, redialled when it drops. This is outbound from Russia, like the
   call above; the RU host still accepts nothing from abroad.
2. The .com backend asks its relay for the RU sources; the .com relay puts the request (request
   id, `owner_sub`, period) on that connection.
3. The RU relay asks the RU backend on its internal port, checks every payload against the
   schema, signs the batch and sends it back on the same connection.
4. The .com relay checks the signature, the request id and the schema, and hands the totals to its
   backend. Nothing is stored: the page gets them and they are gone.

Each panel serves `GET /tenants/owner/summary` (`contract/owner-summary.v1.schema.json`): every
source of the owner with a `state` per row. `ok` — the totals of this page load. `no_answer` — the
other instance did not answer within 3 s; the row stays in «Источники продаж» with its name, a line
«не ответил при загрузке страницы», a «Повторить» button and no numbers, and the totals above say
which sources they leave out (`summary-late`). `not_connected` — a .com shop of the owner not yet
linked to her RU sign-in; its row says so and leads to the link screen (`summary-missing`). There is
no «Данные» column and no «на 08:13»: the numbers on screen are always those of this page load.

**What is logged.** The relay keeps every payload it sent or received, in full, for a year, on the
RU host. Since a payload holds no personal data this is safe, and it is the proof of exactly what
left Russia. Plus per request: time, direction, request id, size, `seq` per source, result. The log
is the only place totals are kept; no panel caches them.

## 5. Threats and how each is closed

| Threat | Closed by |
|---|---|
| A buyer's data slips into a payload (a new field, a review text) | closed schema checked twice, in the backend job and in the relay; the contract test forbids personal field names; the payload is built from a fixed list of queries, not from rows passed through |
| Someone abroad reads the RU database | no path: the relay has no DB credentials; nothing on the RU host accepts connections from abroad for this |
| The .com host is broken into | the attacker gets totals and the .com panel; RU accepts nothing from .com except signed totals in an answer, which it only stores and shows |
| Forged or replayed totals | Ed25519 signature per batch; every answer carries the request id it answers, used once; `seq` per source must grow; payloads older than 1 minute are refused |
| A stolen sign-in ticket | 60 s life, single use (`jti` stored), bound to the .com browser's `nonce` cookie and to `aud`; carried in the URL fragment, so no server log holds it |
| A stolen RU signing key | key in the RU backend's environment only; two keys pinned on .com so a rotation needs no downtime; a rotation is a runbook step |
| Takeover of the owner's session opens every shop | the cost of one sign-in (Ivan's model, mark 33); buyers' data, access rights, payouts and keys ask to confirm the sign-in again after 15 minutes (§3, «Pages that ask again»), so a stolen session cookie alone does not open them; a second factor for owners (Telegram confirmation) is slice 8 below |
| A small shop's numbers point at one buyer («1 order today») | no geography, no product per order, no time of day in the payload; a count of orders is not a person |
| The relay or the connection is down | the other instance's rows say «не ответил» with «Повторить», the totals leave them out and say so; the panel's own sources are unaffected; the shops keep working |
| Page loads used to pull totals out of Russia in bulk | totals leave only for a signed request of the .com relay naming an `owner_sub` with a live session on .com; the RU relay answers at most one request per owner per 2 s and logs every one |

## 6. Numbers

- **Payload size.** The RU example is 16 KB of JSON, about 2 KB compressed
  (`contract/example.shop-summary.ru.json`, measured). The test keeps a payload under 32 KB.
- **Request rate: one relay request per page load of «Сводка» or a source page.** On cherkashino.ru
  it is one outbound HTTPS call to .com. On cherkashino.com it is one request and one answer over
  the standing connection, plus the connection's ping: 2 880 small frames a day. An owner who
  opens these pages 20–50 times a day makes 20–50 requests, fewer than the 288 a day of the v1
  five-minute schedule, and nothing moves while nobody looks.
- **Size per request.** The RU side sends three sources (storefront, Wildberries, Ozon): about
  45 KB of JSON, about 6 KB compressed. The .com side sends one, about 2 KB compressed.
- **Time added to the page.** One round trip Russia–Germany (about 50–80 ms, not measured) plus the
  other backend computing its sources, the same work as one opening of today's «Обзор» per source.
  The page waits at most 3 s for the other instance, then shows its rows as `no_answer`.
- **Load.** Computing the totals of one shop is the same work as one opening of today's «Обзор»
  (one analytics query per period), done once per page load and per source instead of on a
  schedule: not measurable next to the storefront's traffic.
- **Cost.** No new server: one more container on the existing RU and INTL hosts. Expected memory
  30–60 MB each, not measured yet (slice 3 measures it). A separate RU VPS is possible if Ivan
  wants the relay physically apart; its price is not checked here.

## 7. Boundary with the central platform panel (t-2026-10-19-11)

Ivan, 19.10, on that task: «создание центральной панели управления платформами, сейчас у нас есть
платформа на сервере в рф и германии, но будут еще другие версии появляться … в этой панели должна
быть возможность выбирать способы логина в панели, тарифы». That panel is the operator's view of all
platform instances. The owner cabinet is a shop owner's view of her own shops. They are different
layers and do not share screens.

What this task builds so that panel can reuse it:

- **The RU identity service** (`owner_identity`, the ticket signer, the public key) is written as a
  module of its own, not inside the panel routes. The central panel can use it for operators, and
  the sign-in methods it will choose (e-mail, Telegram, Yandex ID) are providers of that module.
- **An instance registry**: `deploy/instances/registry.json` names each instance (`ru`, `intl`,
  later others), its panel URL, its relay URL and its public keys. The relay and the ticket check
  read it. A third instance is one more entry, not new code.
- Tariffs stay out of this task.

## 8. Legal points to confirm with a lawyer

The reading above is the lead's and this line's, not a lawyer's.

1. Are shop totals of this shape not personal data under 152-FZ? The design assumes they are not.
2. The owner's own data (`owner_sub`, the tenants she owns) goes to .com in the ticket. That is a
   cross-border transfer of her data after it was recorded in Russia. It needs her consent and a
   notice to Roskomnadzor under art. 12; Germany is a party to Convention 108, which art. 12 counts
   as adequate protection.
3. The .com `tenant_admin` row with her e-mail exists today. After this change it is a copy of
   data first recorded in Russia, which art. 18 p. 5 allows.

## 9. Gaps of stage 1

- Marketplace totals assume the shop's Wildberries and Ozon connections give orders by day; which
  API fields feed `shop-summary/v1` for a marketplace is a stage-2 question.
- One rate per currency for every period (the rate of the day the totals are computed), not a rate
  per day of each sale: a year's euro sales are converted at today's rate. Exact per-day
  conversion is a stage-2 option if Ivan wants it.
- With totals fetched at page load the period is a request parameter (`?from=&to=`); the payload
  answers the presets and, when named, one `range`.
- Memory and CPU of the relay are estimates until slice 3.
