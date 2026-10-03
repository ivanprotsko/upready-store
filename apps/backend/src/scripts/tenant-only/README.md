# Tenant-Only Copies and Anonymized Stands

This tool turns a scratch copy of the platform database into one of two things.

- A database that holds one tenant and nothing of any other: `--keep <handle>`.
  This is how a shop moves to a server of its own (t-cherk-14, cherkashino.ru to
  a Russian host under 152-FZ) without a single row of another shop travelling
  with it, not even for the length of a restore.
- A stand database with no personal data, no passwords and no secrets:
  `--anonymize`, alone or after `--keep`.

`--verify` checks either result and exits non-zero on any finding.

The work is SQL in [tenant-only.sql](tenant-only.sql). [cli.ts](cli.ts) runs it from
a checkout through `pg`, and [deploy/scripts/tenant-only-dump.sh](../../../../../deploy/scripts/tenant-only-dump.sh)
runs the same file through `psql` inside the postgres container on the host, so
the live host needs no new image for it.

## Running It

From `apps/backend`, against a copy you made yourself:

```bash
npx ts-node src/scripts/tenant-only/cli.ts --db postgres://…/copy --mark --source <original>
npx ts-node src/scripts/tenant-only/cli.ts --db postgres://…/copy --keep olavka --dry-run
npx ts-node src/scripts/tenant-only/cli.ts --db postgres://…/copy --keep olavka
npx ts-node src/scripts/tenant-only/cli.ts --db postgres://…/copy --keep olavka --verify
npx ts-node src/scripts/tenant-only/cli.ts --db postgres://…/copy --anonymize
npx ts-node src/scripts/tenant-only/cli.ts --db postgres://…/copy --keep olavka --anonymize --verify
```

On the mt host, the whole sequence of dump, restore, trim, verify, dump and drop
is one command. For cherkashino.ru moving to the RU host:

```bash
deploy/scripts/tenant-only-dump.sh olavka --dry-run \
  --media-host-from shipshift.dev --media-host-to api.cherkashino.ru \
  --rewrite-host cherkashino.shipshift.dev=cherkashino.ru \
  --drop-customers-by-email-domain upready.dev \
  --forbid-host upready.dev --forbid-host cherkashino.com
deploy/scripts/tenant-only-dump.sh olavka \
  --media-host-from shipshift.dev --media-host-to api.cherkashino.ru \
  --rewrite-host cherkashino.shipshift.dev=cherkashino.ru \
  --drop-customers-by-email-domain upready.dev \
  --forbid-host upready.dev --forbid-host cherkashino.com
```

After the restore on the new host, check it there with the same hosts:

```bash
npx ts-node src/scripts/tenant-only/cli.ts --db postgres://…/medusa_ru --keep olavka --verify \
  --forbid-host shipshift.dev --forbid-host upready.dev --forbid-host cherkashino.com
```

| Exit | Meaning |
|---|---|
| 0 | done |
| 1 | usage, or no tenant with that handle |
| 2 | the guard refused the database |
| 3 | a check failed; nothing was committed |
| 4 | any other error |

The output is counts, table names and check names. No value from a row is ever
printed.

## The Guard and the Marker

A run that writes refuses unless both of these hold.

1. The database is not `medusa_mt` or `medusa_ru` (the live databases of the
   INTL and RU instances), `postgres`, `template0`, `template1`, or a name
   passed with `--protect`.
2. The database comment starts with `upready-scratch-copy`.

`--mark` writes that comment, as `upready-scratch-copy v1 source=<db> at=<UTC time>`,
and refuses a protected name, so the live database can never be marked by the
tool. A database comment is not part of a plain `pg_dump` of the data and the
dump script removes it (`--unmark`) before the final dump anyway, so a database
restored from that dump never looks like a scratch copy.

`--verify` writes nothing and needs no marker, so you can run it against the
restored database on the new host as well.

Every run is one transaction. `--dry-run` executes the same statements and rolls
back, which is why its counts are exact. A run that is not a dry run commits
only when every check passes.

## What `--keep` Removes

| Kept | Removed |
|---|---|
| the tenant with that handle, its admins, settings, pages, redirects, domains, requisites, integration secrets, attributes, courses, marketplace data | every other tenant and every row with another `tenant_id`, in any table that has the column, including tables this file does not name |
| its sales channel and publishable key | other tenants' channels and keys |
| orders and carts in its channel, or linked to it | every other order and cart, with items, shipping, payments, fulfillments, returns, claims, exchanges, addresses |
| customers with an order or cart in its channel, or an account registered on its storefront (`metadata.tenant_id`) | every other customer, their addresses, account holders and logins |
| products sold in its channel | every other product, with variants, prices, inventory and translations |
| categories it owns, unowned ones a kept product sits in, and their ancestors | other tenants' categories and unused platform categories |
| its warehouse, and the platform's per-country warehouses no other tenant uses | other tenants' warehouses with their delivery setup |
| notifications and workflow executions about a kept order, cart or customer | all others |
| regions, currencies, tax, the store, platform users, the platform's own sales channels (emptied) | |

## Moving Hosts

`--media-host-from shipshift.dev --media-host-to api.cherkashino.ru` rewrites every
URL on the first host, whether it starts with `https://`, `http://` or `//`, to the
second, in every text and JSON column: product, variant and image URLs, the shop's
branding and home page, metadata, page bodies. Only the host itself is rewritten,
never a subdomain of it. The path stays, so the uploads only have to be served
from the new host under the same `/static/` path.

`--rewrite-host <from>=<to>` (repeatable) moves one more host the same way. A
shop's old storefront subdomain needs it: the Robokassa return links in its
payment sessions name it, URL-encoded inside the payment link, and the rewrite
handles that form too. Those are links of finished or abandoned sessions, so the
signature inside a rewritten payment link no longer matters.

`--forbid-host <host>` (repeatable) names hosts no row may mention after the run,
subdomains included. Every rewritten host is always on that list, and inside the
trim's own transaction so is every host name of a removed tenant. Shop addresses
(`tenant_domain`) on a forbidden host are deleted, because on the new server they
would point back at the old one. Any other mention fails the run with a count per
column and a `still linked: <host>` line per host name found, so the operator
maps it with `--rewrite-host` or fixes it in the source shop before running again.

A host inside an e-mail address fails as well, on a line of its own. Rewriting a
person's address would break their login, so the tool does not do it.
`--drop-customers-by-email-domain <domain>` (repeatable) deletes instead, in the
copy only:

- buyers whose address is on the domain or a subdomain of it, with their carts,
  orders, payments, notifications and the shop rows that name them;
- platform users and shop admins on it, apart from the only platform user left,
  a shop's owner (its first admin) and a shop's last admin.

An admin the flag keeps is named on a `KEPT, not deleted` line, and the check then
fails on their address, so the operator decides. On the stand copy the domain was
`upready.dev`, the platform team's test buyers in the live shop.

Decisions behind the less obvious rows:

- **A row of the kept tenant that names another shop's order or buyer goes.**
  On the stand copy, ten course grants of `olavka` were paid on cherkashino.com.
  Keeping them would have kept seven buyers of that site. The rule is that only
  an order, a cart or an account with the kept tenant makes a customer stay.
- **Ownership moves with the sale.** A product sold in the kept channel, or an
  order placed in it, whose ownership link names another tenant is handed to the
  kept tenant, so its panel lists it.
- **The tenant group goes.** The kept tenant is detached from its group and the
  group row is deleted. Alone, it behaves as a one-site shop.
- **A shop admin of a removed tenant who also administers the kept one** (the
  platform admin has a row in every shop) keeps the login, pointed at their row
  in the kept tenant. Any other login whose customer, admin or user is gone is
  deleted.
- **Link rows whose end is missing go**, including ones that dangled before the
  run (the stand copy had twelve `order_cart` rows of hard-deleted orders).
- **Order history is a snapshot.** A line item may name a product that is no
  longer sold here. Medusa keeps such references when a product is deleted, so
  the check reports them as `info` and does not fail.

## What `--anonymize` Changes

- Every e-mail address in every text and JSON column, URL-encoded ones in
  payment links included, becomes `staff-<n>@example.invalid` (shop admins,
  platform users, invites) or `buyer-<n>@example.invalid`. One address maps to
  one stand-in everywhere.
- Columns named for a person's data: phones become `+70000000000`, first and
  last names `Имя` and `Фамилия`, authors `Аноним`, street addresses
  `ул. Тестовая, д. 1`; companies, second address lines, notes, comments, IP
  addresses and Telegram chats are cleared. City, postal code and country stay,
  because delivery prices are computed from them.
- JSON keys that hold a person's data (contact names and phones on carts and
  orders, the customer inside a payment session, Yandex logins, the shop's
  manual-payment contacts, cards and wallets) are rewritten the same way.
- Raw Wildberries and Ozon payloads become `{}`.
- Passwords and provider profiles are removed from every login. Reset tokens,
  MFA, verification codes, invites, shop integration secrets, integrations,
  secret API keys, the notification log and workflow executions are deleted.
  Publishable keys stay, because every storefront sends them in the clear.
- Shop requisites become a stub (`ИП Тестовый Т. Т.`, zero INN and OGRN).

Nobody can log in to an anonymized database with an old password. Give a stand
its logins back with `ensure-accounts.ts` (`apps/backend/README.md`).

Free text the tool cannot parse, such as page bodies, product descriptions and
review texts, is left as it is apart from e-mail addresses in it.

## The Checks

`--verify --keep <handle>` fails on any of these:

- a tenant other than the kept one, or a row with another `tenant_id`
- another tenant's id anywhere in any text or JSON column
- a module link row whose end is missing
- a cart, order or product outside the kept channel, or a customer with no order,
  cart or account there
- an unlinked payment collection, fulfillment or address, a notification about
  something gone, a login naming a missing customer, admin or user
- a translation of a missing row, a tenant group
- inside the trim's own transaction, any e-mail of the removed tenants' buyers
  or staff left anywhere in the database

It also fails when any row mentions a forbidden host or, inside the trim's own
transaction, a host name of a removed tenant, and warns when the kept tenant is
left without a primary domain.

`--verify --anonymize` fails on a real e-mail address anywhere, an IPv4 address
anywhere, a named column still holding personal data, a JSON document with
personal keys, a raw marketplace payload, any password, token or secret listed
above, and, inside the anonymizer's own transaction, any original e-mail or
phone number left anywhere.
