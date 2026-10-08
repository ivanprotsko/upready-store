# Two Instances: Rules for the RU and INTL Deployments of upready-store (t-2026-10-03-23, t-cherk-25)

One codebase, one release, two deploy targets that never share data:

- **RU** — `cherkashino.ru`, hosted on Timeweb in Moscow. Subject to Federal Law 152-FZ.
- **INTL** — `cherkashino.com` and every other shop this codebase serves, hosted on Contabo in
  Germany. The operating entity has no jurisdiction of its own yet (see "Ivan's words" below), so
  this document treats it as subject to the GDPR and German law, because the server and the
  storefront's actual processing happen there.

Every rule below is enforced in code by `deploy/instances/ru.json`, `deploy/instances/intl.json`
and `deploy/scripts/instance-check.mjs`, or is a paper process this document is the record of. Read
[processors.json](processors.json) for the data-processor registry these rules point at.

## Ivan's words (verbatim)

Order t-2026-10-03-23, 2026-10-03 ~17:20 WITA:

> я хочу чтобы ты завёл и решил задачу в результате которой будут разработаны правила, инструменты и
> прочее, что может понадобится для того, чтобы у нас появилась строгая дисциплина разработки, деплоя
> и обслуживания двух экземпляров upready-store: один, который будет на русском сервере и один на
> зарубежном. 2.1. для русского сервера нужно строго соблюдать закон 152-ФЗ. 2.2. для зарубежного
> тоже нужно определить правила для которых будет создана дисциплина обеспечивающая все ключевые
> требования к соблюдению защиты персональных данных и прочих международных требований. Зарубежная
> версия пока у нас не будет иметь никакой юридеческой страны, но судя по всему раз сервер в германии,
> то нужно придерживаться стандартов германии и евросоюза?

Order t-2026-10-03-33 / the com-entity note, 2026-10-03 ~18:00 WITA, on the intermediary company and
crypto that this document's INTL rules make room for without implementing yet:

> "Если посредник будет настоящим и договор с ним составит юрист, технически всё готово как есть."
> пока делай так, а также рассмотри возможности, при которых можно будет открыть фирму в какой-нибудь
> стране, где оплата криптой разрешена. В том числе нужно сделать возможность продавать товары, чтобы
> покупатели могли их приобретать через протокол [x402](https://x402.org/)

## 1. Where the data lives

| Data | RU instance | INTL instance |
|---|---|---|
| Customer and order data (database) | RU host only (Timeweb, Moscow). Never copied to Contabo, never queried from Contabo. | EU host only (Contabo, Germany). |
| Primary backup | RU host's own disk, `deploy/backup/` tier 1. | Contabo host's own disk, same tier 1. |
| Second backup copy | RU host **and** an S3-compatible bucket **in Russia** (Timeweb Cloud S3, `S3_ENDPOINT_URL=https://s3.twcstorage.ru` in `deploy/backup/cross-copy.sh`). Never the Contabo host, never any EU/US bucket. | Contabo host **and** an EU-region bucket (Selectel S3 or an EU-region S3-compatible bucket). Never the RU host. |
| Tenant media uploads | RU host only. | Contabo host only. |

What `instance-check.mjs` accepts as a second-copy target today is `s3.twcstorage.ru` on RU and nothing on INTL, until an endpoint is added to `deploy/instances/intl.json`.

This is 152-FZ Art. 18(5) (as amended by 23-FZ, 2025-02-28): recording, systematising, accumulating,
storing, amending and retrieving the personal data of Russian citizens using a database outside the
Russian Federation is not allowed, with narrow exceptions this deployment does not rely on. `cross-copy.sh`
already supports two independent hosts and an S3 push (`t-cherk-36`); the rule here is which bucket
and which host each instance is allowed to point it at, not new code.

**No cross-instance data flow.** A tenant belongs to exactly one instance's database. There is no
replication, no shared database, and no script that copies a RU tenant's rows into the INTL database
or back. The one exception is the one-way catalog sync from `.ru` to `.com` (`t-cherk-24`), which
carries product data, never customer or order data.

**Current violation, recorded here rather than left silent.** As of 2026-10-06 the INTL database
still holds the RU shop's record from before the split into two instances. It is the tenant `olavka`,
with the four RU hosts `cherkashino.ru`, `www.cherkashino.ru`, `xn--80ajkgrgj8cn.xn--p1ai` and
`www.xn--80ajkgrgj8cn.xn--p1ai`, none of them primary. It shares a group with the tenant
`cherkashino-com`, and it carries 41 products and 10 orders of 7 buyers dated 14.09 to 01.10.2026. The
RU database holds the same shop as its one tenant. The record is listed in
`deploy/instances/intl.json` under `tenants.recordedExceptions`, so `instance-check.mjs` prints it as
`KNOWN VIOLATION (recorded)` at every INTL deploy and does not stop the deploy on it. It closes with
Ivan's decision on the RU shop's record in the INTL database, which lead-upready-store asked for on
2026-10-06.

## 2. Which third-party services each instance may use

The allow/deny lists live in [`deploy/instances/ru.json`](../../deploy/instances/ru.json) and
[`intl.json`](../../deploy/instances/intl.json) and are enforced by `instance-check.mjs`. In Ivan's
own terms:

- **RU has no GA4.** Google Analytics 4 sends visitor data to Google in the US with no transfer
  basis this deployment holds. `NEXT_PUBLIC_GA_MEASUREMENT_ID` / `GA_MEASUREMENT_ID` must not be set
  on the RU instance; Yandex Metrica is the only analytics counter allowed there (and on INTL too —
  it already works outside Russia, per the plan's own note).
- **RU has no mail through Resend (US).** Any US-hosted transactional mail API is forbidden; the RU
  instance's outbound mail is the self-hosted relay (`deploy/mt/MAIL.md`'s `mail` service) or another
  provider whose processing stays in Russia or in a country 152-FZ accepts.
- **RU has no crypto, no Tribute, no x402.** Tribute (payments, including Wallet Pay), the x402
  protocol (`t-2026-10-03-33`) and the BTCPay Server and Bitcart crypto providers
  (`ask-20261005-070255-438f`) exist only on INTL. Federal Law 282-FZ of 04.08.2026 «On Digital
  Currencies and Digital Rights», Art. 1 part 6, in force since 2026-09-01, additionally forbids a
  Russian tax resident or a Russian company from accepting cryptocurrency for goods at all,
  independent of where the server sits. It took over the ban of 259-FZ Art. 14(5), which 283-FZ
  Art. 22 repealed from the same date. The backend offers BTCPay, Bitcart and x402 only where
  `PAYMENTS_CRYPTO_AVAILABLE` is exactly `true`, and `ru.json` forbids setting that variable at all,
  every `X402_` variable, and a tenant row for the `x402` provider. Tribute has a switch of its own
  (`t-cherk-22`): the backend offers it, its panel card included, only where `TRIBUTE_AVAILABLE` is
  exactly `true`, and `ru.json` forbids that variable through its `TRIBUTE_` prefix and a tenant row
  for the `tribute` provider.
- **Telegram is allowed on RU**, for sign-in and for the shop bot, but it must be named — including
  the fact that Telegram's own operating entity is outside Russia — in the privacy policy, and the
  buyer's consent to that specific transfer must be separate from the general personal-data consent.
  This is a paper requirement `instance-check.mjs` cannot verify (it is text on a page, not an env
  var or a database row); it is tracked here and in `docs/legal/privacy-policy.md`'s own checklist.
- **INTL has no RU-domestic payment or delivery integration.** Robokassa, CDEK, Pochta Russia,
  Wildberries and Ozon all exist to serve Russian buyers and Russian sellers of record; a tenant on
  the INTL database configuring one of them is a sign that the wrong tenant landed on the wrong
  instance, not a legitimate use. `instance-check.mjs --db` fails on it.
- **RU allows Robokassa, Yandex ID, CDEK, Pochta Russia, Wildberries (read) and Ozon.** All of them
  are Russian entities already represented in `processors.json`; none needs a cross-border consent
  beyond the standard privacy policy.
- **The school signs in through the RU shop only.** The school at `school.cherkashina.ru` keeps no
  login of its own: the RU shop `cherkashino.ru` attests the buyer and hands the school a single-use
  code (`t-2026-10-08-36`). `SCHOOL_SSO_RETURN_HOSTS` names the hosts that may receive one. It is
  set on RU and forbidden on INTL, where `intl.json` lists it, so an INTL backend never mints a
  buyer's token for the school.

## 3. Stands and development: anonymised data only

Every stand and every local development database must run on anonymised or synthetic data. A stand
is not a RU or an INTL instance and inherits neither instance's legal basis for holding a real
customer's name, address, phone number or order history — carrying one into a stand is a 152-FZ and
GDPR violation on its own, independent of which server the stand happens to run on.

**Current violation, recorded here rather than left silent.** The lead's own stand database today is
a copy of the live database with real cherkashino.ru customer data — names, addresses, orders. This
is a standing violation of the rule above. It closes when `t-cherk-14`'s single-tenant extraction tool
(acceptance #1 of that task: a tool that takes the full live copy and produces a database holding
only the `cherkashino.ru` tenant) is extended to strip or synthesise customer PII before any such
export reaches a stand or a laptop — that extension is `t-cherk-14`'s scope, not this task's, and is
not implemented by this change. Until it exists, no stand may be built from a live `pg_dump` without
first running it through an anonymisation pass by hand.

## 4. Release order

One release ref deploys to both servers through `deploy/scripts/deploy-instance.sh <ru|intl>
<git-ref>`, called twice: **INTL first, then RU.** INTL goes first because it is the instance that
has run in production longer and the one most of this codebase's traffic already depends on; RU
follows once INTL's own health and storefront checks (the script's step 6) are green. Each instance
rolls back independently, by its own previous image tag (the script's step 7) — a RU rollback never
touches the INTL host and vice versa, because there is no SSH path between the two hosts at all
(`deploy/RUNBOOK-RU.md`).

## 5. Breach notification

| | RU (152-FZ) | INTL (GDPR) |
|---|---|---|
| Deadline to notify the regulator | 24 hours (initial notice) | 72 hours |
| Deadline for the full report | 72 hours | 72 hours covers both the notice and the initial assessment under the GDPR; a fuller report follows as the investigation allows |
| Who notifies | Roskomnadzor | the competent supervisory authority (named in `docs/legal/requisites.json`'s own placeholder) |

Who does what (a decision this task makes, since neither order named roles):

1. **The lead** (whoever is on call for upready-store) is the first responder: contains the leak,
   establishes what data and how many data subjects are affected, and the probable cause. This has to
   happen inside the first hours of either deadline, because the regulator filing needs these facts,
   not a placeholder.
2. **The lead** drafts the notification text and the technical section of the report, using the
   affected instance's own `processors.json` entries and `deploy/instances/<instance>.json` profile to
   state exactly which third parties had access to the affected data.
3. **Ivan** (or a lawyer Ivan engages) files the regulator notification itself and signs the
   consumer-facing notice if one is required. Filing with Roskomnadzor or a GDPR supervisory authority
   is a legal act on behalf of the operator/controller, and this repository's worker does not have
   that authority and will not act as if it did.
4. Every step above is written down, with timestamps, in the lead's own incident log the same way
   any other incident is — this document does not invent a new log location.

## 6. 152-FZ operator paperwork (RU instance)

Checklist, status as of this task (none of these are filed; this task writes the requirement down,
it does not file anything on a live government portal or sign anything on Ivan's behalf):

| Paper | What it needs | Status |
|---|---|---|
| Roskomnadzor operator notification, naming the database's location | A certificate or written statement from Timeweb confirming the server's physical location (Moscow / Russian Federation) | Not filed. Timeweb's location statement has to be requested before this notification can be submitted; `t-cherk-25`'s runbook does not request it, since that is a paperwork step on Ivan's side, not a deploy step. |
| Separate consent for personal data processing | A consent screen or checkbox distinct from the general terms acceptance, naming each processor in `processors.json`, Telegram included (see §2) | Drafted in `docs/legal/privacy-policy.md`'s structure; the separate-consent flow itself is not part of this task's code change. |
| Privacy policy | 152-FZ's mandatory operator document: what data, why, how long, who it is shared with, the subject's rights | `docs/legal/privacy-policy.md` already exists and is pending the requisites `docs/legal/requisites.json` collects — see that README for the publication gate. This task adds no new legal text; it points the policy at `processors.json` as the source of "who it is shared with." |
| Security level (УЗ-4) | A documented basis for classifying this system at protection level 4, the lowest of the four 152-FZ levels, consistent with the data categories actually processed (standard customer PII, no special categories, no biometric data) | Not yet documented as its own artifact. Recorded here as owed; `apps/backend`'s own access controls (JWT auth, per-tenant scoping, AES-256-GCM at rest for integration secrets, `deploy/backup`'s own retention) are the technical measures a УЗ-4 justification would cite. |
| Processing instruction (поручение на обработку) | A written agreement between the data controller (ИП Черкашина / the shop owner) and upready as the processor operating the RU instance on their behalf | Not drafted. Owed before the RU instance holds its first real customer row (`t-cherk-14`), tracked here rather than assumed. |

## Enforcement

`deploy/scripts/instance-check.mjs --instance ru|intl --env <path> [--backup-env <path>] [--db <postgres-url>]`
reads an env file's variable **names** (never values) against the forbidden names and prefixes in that
instance's profile, and, with `--db`, the providers actually configured by tenants in that instance's
own database. It exits non-zero and lists every violation, one per line, the moment any of §2's rules
is broken. It runs at deploy time (`deploy/scripts/deploy-instance.sh`, step 3) and has its own unit
tests (`deploy/scripts/__tests__/instance-check.test.mjs`).

Three more checks enforce §1.

- **A backup copy outside the instance's country.** With `--backup-env` the tool reads where the
  host's copies go. The profile's `backup.envFileOnHost` names the file on the host that carries
  those keys, and `deploy-instance.sh` hands it to the check. The tool reads the value of
  `S3_ENABLED`, `S3_ENDPOINT_URL` and `CROSS_COPY_SSH_HOST` and of no other key, and it prints the
  key and the verdict, never the value. The profile's `backup.s3EndpointHosts` and
  `backup.crossCopyHosts` are allowlists. An enabled S3 copy fails unless its endpoint host is on
  the first list, and a cross-copy host fails unless it is on the second. A target nobody wrote down
  fails the same way a known foreign one does. Add a host to the profile and to §1 before you point
  a copy at it. A host with no such file copies nowhere, so a missing file is not a violation. The
  tool then prints one line, `backup targets NOT checked`, and the deploy log carries it.
- **A tenant of another instance.** With `--db` the tool reads each tenant's handle and custom hosts
  (`tenant_domain`) and compares the hosts with the `domains` of both profiles. A tenant that
  answers on a domain the other profile names fails on either instance. On RU, where
  `domains.otherShops` is `false`, a tenant with no address on RU's own domains fails too, because
  every other shop belongs to INTL. A message names the tenant's handle and the hosts, never an
  admin, a buyer or an e-mail.
- **A recorded exception.** A known violation that waits for a decision is listed in the profile
  under `tenants.recordedExceptions` with `handle`, `hosts`, `reason`, `recorded` and `closes`. A
  tenant that matches an entry exactly, the handle and every offending host, is printed as
  `KNOWN VIOLATION (recorded)` and does not change the exit code. Any other tenant on the other
  instance's domain fails, and so does one more foreign host on the recorded tenant. An entry
  without one of the five fields is a configuration error. Remove the entry when what it names in
  `closes` has happened.
- **The school on the wrong instance.** The school cabinet (`apps/school`, the `school` service of
  `deploy/compose.mt.yml`, t-2026-10-08-37) reads the buyers and the courses of one shop, so it runs
  on that shop's instance. The tool reads the value of `SCHOOL_DOMAIN` and `SCHOOL_SHOP_ORIGIN` and of
  no other school key. It fails a `SCHOOL_DOMAIN` the profile does not list under `school.domains`
  (`school.cherkashina.ru` on RU, none on INTL) and a `SCHOOL_SHOP_ORIGIN` on a domain of the other
  instance, or on RU, where `domains.otherShops` is `false`, on no domain of RU's own.

One check is not a rule of this page but lives in the same tool, because the mistake it catches is
made in the same env file and fails without a word to anyone.

- **The relay set up as another host.** `deploy/compose.mt.yml` is one file for both hosts, and its
  defaults for the relay's own name and sender domain are the INTL host's. When `SMTP_HOST` is the
  stack's own relay, the tool reads the value of `SMTP_HOST`, `SMTP_FROM`, `MAIL_HOSTNAME` and
  `MAIL_SENDER_DOMAINS` and of no other key, and prints the key, never the value. It fails when
  `SMTP_FROM` is not an address in a domain the relay signs for, on either instance, and on an
  instance whose profile says `mailRelay.defaultsAreThisHost` is `false` (RU) when `MAIL_HOSTNAME`
  or `MAIL_SENDER_DOMAINS` is not set. The steps for a second host are in `deploy/mt/MAIL.md`.

The same tool runs in CI on both profiles (`.github/workflows/pr-checks.yml`, job Deploy Checks),
against the env templates this repository ships. That run needs no secret and no database, so the
tenant check there is covered by the unit tests alone.

`docs/instances/processors.json` is the data-processor registry: every third party, what it receives,
why, which instance(s) may use it, and the legal basis for sending it data. A new payment-* or auth-*
module under `apps/backend/src/modules/` with no matching entry fails `apps/backend`'s own unit suite
(`apps/backend/src/scripts/__tests__/processors-registry.unit.spec.ts`), which already runs in
`pr-checks.yml`'s existing Backend job — no new CI job was needed for that gate.
