# The mt Stack's Own Mail Relay

`t-2026-10-02-mail-relay`. Before this, `SMTP_HOST` on the live mt deployment was empty, so
`useSmtp` in `apps/backend/medusa-config.ts` stayed false, no SMTP provider ever registered, and
every order confirmation, password reset and welcome letter was only logged, never sent
(`apps/backend/src/subscribers/*-email.ts`). This gives that account a sender instead: a
send-only Postfix relay, `mail` in `deploy/compose.mt.yml`, reachable from the backend alone, with
no inbound mail of its own. Landing in spam is acceptable (Ivan, 2026-10-02); not sending at all
is not.

## What You Need Before You Deploy

Nothing on the host changes by itself. Three things do, in this order:

1. Bring `mail` up (`docker compose -p mt -f deploy/compose.mt.yml --env-file deploy/mt/shipshift.env up -d mail`).
   It generates its own DKIM key pair on first boot into the `mail-dkim-keys` volume.
2. Read the public half of that key (below) and add the DKIM and SPF records it needs.
3. Point the backend at it (`SMTP_HOST=mail` and the rest, below) and restart it.

Reversing the order leaves a short window where the backend tries to send and the receiving side
has nothing to verify the signature against. That is not harmful. DMARC on `shipshift.dev` is
`p=none`, so a failed check does not get a letter rejected, only marked.

## Reading the DKIM Public Key

The relay writes it next to the private key the moment it generates one:

```bash
docker exec mt-mail cat /etc/opendkim/keys/shipshift.dev.txt
```

That file is already a DNS TXT record in zone-file syntax, split across quoted strings the way
BIND expects. Cloudflare's UI takes one value, not several quoted fragments, so join them:

```bash
docker exec mt-mail sh -c \
  "grep -o '\"[^\"]*\"' /etc/opendkim/keys/shipshift.dev.txt | tr -d '\"' | tr -d '\n'"
```

That prints one line starting `v=DKIM1; k=rsa; p=...` with no quotes and no line breaks, which is
what the Cloudflare TXT record's content should be, verbatim.

## DNS Records to Add (Cloudflare, shipshift.dev zone)

The lead adds these; this worktree does not touch DNS.

| Type | Name | Content | Why |
|---|---|---|---|
| TXT | `mt1._domainkey.shipshift.dev` | `<the line printed above>` | DKIM public key for selector `mt1` |
| TXT | `shipshift.dev` (edit the existing SPF record) | `v=spf1 include:_spf.mx.cloudflare.net include:_spf.google.com ip4:84.46.251.149 ~all` | authorizes the host's own IP to send for the domain, keeping both existing includes |

Leave the existing MX (Cloudflare Email Routing, inbound) and DMARC (`p=none`) records alone.
Both `proxied=false`, matching every other record in this zone (`deploy/scripts/mt-dns-records.mjs`).

## Wiring the Backend

In `deploy/mt/shipshift.env` (values, not committed):

```
SMTP_HOST=mail
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@shipshift.dev
```

Then `docker compose -p mt -f deploy/compose.mt.yml --env-file deploy/mt/shipshift.env up -d backend`.
No image rebuild: these are runtime variables the entrypoint reads, not build args. Each shop's
own display name and reply-to still come from its own settings
(`apps/backend/src/modules/smtp-notification/services/smtp.ts`); only the envelope address is
the platform's.

## Rolling Back

Set `SMTP_HOST=` (empty) in `deploy/mt/shipshift.env`, then
`docker compose -p mt -f deploy/compose.mt.yml --env-file deploy/mt/shipshift.env up -d backend`.
The provider stops registering and the backend goes back to logging every letter instead of
sending it, the same as before this change. Stop the relay itself with
`docker compose -p mt -f deploy/compose.mt.yml --env-file deploy/mt/shipshift.env stop mail`; the
`mail-dkim-keys` volume and its key survive a `stop`, so restarting `mail` later needs no new DNS
record. Only `down -v` on that volume would, and nothing in this stack's normal operation runs that.

## Rotating the DKIM Key or Selector

Changing `DKIM_SELECTOR` in `compose.mt.yml` (currently `mt1`) makes the relay generate a new key
under the new selector's file name on its next boot, without touching the old one unless the
volume already has a file for that exact selector. Publish the new selector's TXT record before
flipping `DKIM_SELECTOR`, the same order as the initial setup, or signed mail goes out with no
matching DNS record for the days in between.

## Smoke-Testing After a Deploy

`deploy/mt/mail-smoke.sh <to-address>` sends one message through `mail` from inside the backend
container and prints Postfix's own delivery-status line for it. See that script's header for what
it checks and what it does not: real delivery to Gmail or Yandex is not something this worktree can
observe, because it has no mailbox on either to read.

## Testing Locally, Without the Internet

`compose.mt.yml` never publishes a port for `mail` and never points it at a real relay host, so
there is nothing to send to outside the private network it sits on. `mail-test.override.yml` in
this directory adds a throwaway Mailpit container and tells `mail` to hand every message to it
instead of trying the public internet:

```bash
docker compose -p mt-mail-test \
  -f deploy/compose.mt.yml -f deploy/mt/mail-test.override.yml \
  --env-file deploy/mt/shipshift.env.example \
  up -d mail mailpit
```

Mailpit's web UI is published on `localhost:8025` by that override file alone; `compose.mt.yml`
itself still publishes nothing.

```bash
docker compose -p mt-mail-test \
  -f deploy/compose.mt.yml -f deploy/mt/mail-test.override.yml \
  --env-file deploy/mt/shipshift.env.example \
  down -v
```

removes the throwaway project, including its own `mail-dkim-keys` volume, without touching
anything the real `mt` project owns (different compose project name, different volume).
