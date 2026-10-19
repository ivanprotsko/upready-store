# Unified owner cabinet: «Сводка» across shops, one sign-in, totals-only relay (t-2026-10-20-23, stage 1)

Stage 1 is design only. No live server was touched and no production code changes here. Stage 2
starts when Ivan approves the prototype.

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
4. **One call every five minutes carries both directions.** RU pushes its totals; the answer
   carries the .com totals back. Nothing on the RU host listens to the internet for this.
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

**What it carries.** `upready.shop-summary/v1` per shop (`contract/`):

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

**How it moves.**

1. Every five minutes the RU backend job `owner-summary-publish` computes one payload per shop
   that has an `owner_identity` and hands them to the relay on the internal port.
2. The relay validates each payload against the schema, refuses any that fails, and writes the
   accepted ones to its own log.
3. It signs the batch (Ed25519, its own key) and sends one `POST /owner-relay/v1/exchange` over
   HTTPS to the .com relay.
4. The .com relay checks the signature, the `seq` of each shop (must grow) and the schema, and
   stores the payloads. Its answer is the .com shops' payloads for the same `owner_sub`, signed
   with the .com key.
5. The RU relay checks that answer the same way and hands it to the RU backend.

Each panel then serves `GET /tenants/owner/summary` (`contract/owner-summary.v1.schema.json`): its
own shop read locally, the other shops as last received, totals per currency, and freshness —
`fresh` under 15 minutes, `late` with the time of the numbers (`summary-late`), `missing` before
the first payload (`summary-missing`).

**What is logged.** The relay keeps every payload it sent or received, in full, for a year, on the
RU host. Since a payload holds no personal data this is safe, and it is the proof of exactly what
left Russia. Plus per call: time, size, `seq` per shop, result.

## 5. Threats and how each is closed

| Threat | Closed by |
|---|---|
| A buyer's data slips into a payload (a new field, a review text) | closed schema checked twice, in the backend job and in the relay; the contract test forbids personal field names; the payload is built from a fixed list of queries, not from rows passed through |
| Someone abroad reads the RU database | no path: the relay has no DB credentials; nothing on the RU host accepts connections from abroad for this |
| The .com host is broken into | the attacker gets totals and the .com panel; RU accepts nothing from .com except signed totals in an answer, which it only stores and shows |
| Forged or replayed totals | Ed25519 signature per batch; `seq` per shop must grow; payloads older than 24 h are refused |
| A stolen sign-in ticket | 60 s life, single use (`jti` stored), bound to the .com browser's `nonce` cookie and to `aud`; carried in the URL fragment, so no server log holds it |
| A stolen RU signing key | key in the RU backend's environment only; two keys pinned on .com so a rotation needs no downtime; a rotation is a runbook step |
| Takeover of the owner's RU account opens both shops | the cost of one sign-in; a second factor for owners (Telegram confirmation) is slice 8 below |
| A small shop's numbers point at one buyer («1 order today») | no geography, no product per order, no time of day in the payload; a count of orders is not a person |
| The relay is down | panels show the last numbers with their time; the shops keep working; nothing else depends on the relay |

## 6. Numbers

- **Payload size.** The RU example is 16 KB of JSON, about 2 KB compressed
  (`contract/example.shop-summary.ru.json`, measured). The test keeps a payload under 32 KB.
- **Request rate.** One call every five minutes per instance pair, whatever the number of shops:
  288 calls a day. For two shops about 9 MB a day uncompressed, about 1 MB compressed.
- **Load.** Computing the totals of one shop is the same work as one opening of today's «Обзор»
  (one analytics query per period). At 288 runs a day per shop this is not measurable next to the
  storefront's traffic.
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

- The prototype's period buttons do not switch the numbers; 7 days is shown.
- Converting currencies into one total is not designed: it is Ivan's call (question in the plan).
- Memory and CPU of the relay are estimates until slice 3.
