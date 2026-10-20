# Unified owner cabinet: «Сводка» across sales sources, one sign-in, totals-only relay (t-2026-10-20-23, stage 1)

Stage 1 is design only. No live server was touched and no production code changes here. Stage 2
starts when Ivan approves the prototype.

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
2. **.com trusts a signed ticket.** The RU backend signs a one-minute, single-use ticket. The .com
   backend checks it with RU's public key and opens a session. No call goes from abroad into RU.
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
| Shop switch inside one instance | `POST /tenants/me/switch`, `GET /tenants/me/shops` (`apps/backend/src/api/tenants/me/`), a submenu «Сменить магазин» in `main-layout.tsx` | the list moves up into the «…» menu flat, with the domain under each name |
| Group of sites of one client | `tenant_group`, `tenant.group_id` (`docs/multitenancy/sites-one-db-many-storefronts.md`) | a group still lives inside one database; the owner link below joins shops across the two databases |
| Shop's «Обзор» | `routes/home/home.tsx` over `GET /tenants/analytics/summary` | unchanged; «Сводка» reuses its shapes |
| Cross-instance flow | the one-way catalog sync .ru → .com (`t-cherk-24`), product data only (`docs/instances/RULES.md` §1) | a second flow: totals, both ways, through the relay |
| Single sign-in pattern | the school's SSO (`api/store/tenant/sso/`): a 60 s single-use code the school's server redeems at the shop | same idea, but signed so that .com never calls into RU |

## 3. Identity: one sign-in, kept in Russia

The owner of cherkashino.ru and cherkashino.com is a Russian citizen. 152-FZ art. 18 p. 5 wants her
personal data recorded and kept first in a database in Russia. So the account that both panels
trust lives in the RU database.

**Records.**

- RU database, new table `owner_identity`: `id` = `owner_sub` (`own_<ULID>`), the link to her
  existing `tenant_admin` row on RU, `created_at`. Her e-mail and password stay where they are
  today (the RU `auth_identity`).
- INTL database, new table `owner_link`: `owner_sub`, `tenant_admin_id` (her .com row),
  `linked_at`. No e-mail is copied for this; the .com row already has the e-mail it had before.

**Sign-in on .com (prototype states «Вход»).**

1. The .com panel shows «Войти через cherkashino.ru» (`login-com`).
2. The browser goes to `panel.cherkashino.ru/owner-sso?aud=intl&state=<nonce>`. If the RU session
   is alive, nothing is asked. Otherwise the owner signs in on RU once (`login-ru`).
3. The RU backend signs a ticket: ES256 JWT with `iss` = RU, `aud` = `panel.cherkashino.com`,
   `sub` = `owner_sub`, `tenants` = the .com tenant ids she may open, `nonce`, `jti`, `exp` = 60 s.
4. The browser carries it to `panel.cherkashino.com/sso#ticket=…`. The fragment never reaches a
   server log.
5. The .com backend checks the signature with RU's public key (pinned in its environment, two
   keys during a rotation), `aud`, `exp`, `nonce` against its own cookie, and that `jti` was never
   used. Then it mints the usual panel session for her `tenant_admin` row.
6. The first time only, `owner_link` is empty for this `owner_sub`. The panel asks for the old
   .com password once (`link-first`), proving the .com row is hers, and writes the link.

**The «…» switch (prototype states «Переключение»).**

- From .ru to .com: the RU panel asks its backend for a ticket for `aud = intl`, then opens
  `panel.cherkashino.com/sso#ticket=…` (`switching`). A ticket used twice or after a minute gets a
  plain explanation (`ticket-used`).
- From .com to .ru: the browser goes straight to `panel.cherkashino.ru`; the RU session is the one
  the owner already has. If it ended, she signs in on RU once.
- Inside one instance the existing `POST /tenants/me/switch` stays as it is.

**Owners of INTL-only shops** keep the .com sign-in they have (e-mail, Telegram). Nothing in this
note touches them.

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

- per period (today, 7 days, 30 days) and per currency: revenue, orders, average order, the same
  for the previous period, cancelled orders;
- the top five products: id, title, quantity, revenue;
- revenue and orders by day for 90 days;
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
| Takeover of the owner's RU account opens both shops | the cost of one sign-in; a second factor for owners (Telegram confirmation) is slice 8 below |
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

- The prototype's period bar does not switch the numbers; «Неделя» is shown. With totals fetched at
  page load the period becomes a request parameter; the contract still carries today, 7 and 30
  days plus 90 days by day, which covers «Вчера» and «Квартал» too.
- Marketplace totals assume the shop's Wildberries and Ozon connections give orders by day; which
  API fields feed `shop-summary/v1` for a marketplace is a stage-2 question.
- Converting currencies into one total is not designed: it is Ivan's call (question in the plan).
- Memory and CPU of the relay are estimates until slice 3.
