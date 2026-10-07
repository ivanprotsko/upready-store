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

## A Second Host (the RU Instance)

`compose.mt.yml` is one file for every host, and two of the relay's settings default to the INTL
host's own: the name it introduces itself by (`MAIL_HOSTNAME`) and the domains it signs for
(`MAIL_SENDER_DOMAINS`, space-separated). On the RU host both go into `deploy/mt/ru.env`. Without
them the relay says it is the Contabo machine and signs `shipshift.dev` mail with a key whose public
half is in no DNS zone. That is what the RU relay was set to when measured on 2026-10-07, with the
backend's `SMTP_HOST` empty, so no letter left that host at all. `deploy/scripts/instance-check.mjs`
stops a deploy that turns the relay on (`SMTP_HOST=mail`) without the two keys, and on either host a
deploy whose `SMTP_FROM` is in a domain the relay does not sign for.

Four things have to be true on that host before its backend is pointed at the relay. The first two
cannot be done from this repository:

1. **Outbound mail ports are open.** Measured on the RU host on 2026-10-04 and again on 2026-10-07:
   no connection to any receiver on 25, 465, 587 or 2525, while 443 to the same companies connects.
   The host's own firewall has no rule for those ports, so it is the provider's network that drops
   them, and a support request to the provider is what opens them. From the host,
   `timeout 8 bash -c 'exec 3<>/dev/tcp/mx.yandex.ru/25 && head -c 3 <&3'` prints `220` once they
   are open and nothing while they are closed.
2. **The address has a reverse DNS name** (PTR), set in the provider's panel, and that name resolves
   back to the same address. `MAIL_HOSTNAME` is that name.
3. **The relay has a key for the shop's domain.** With `MAIL_SENDER_DOMAINS=cherkashino.ru` in the
   env file the relay generates `/etc/opendkim/keys/cherkashino.ru.{private,txt}` on its next start.
   Read the public half the same way as above, from that file.
4. **The zone of that domain has the records below.**

| Type | Name | Content | Why |
|---|---|---|---|
| A | `mail.cherkashino.ru` | `$RU_HOST_IP` | the name the PTR points at has to resolve back to the address |
| TXT | `mt1._domainkey.cherkashino.ru` | `<the joined line of the public key>` | DKIM public key for selector `mt1` |
| TXT | `cherkashino.ru` | `v=spf1 ip4:$RU_HOST_IP ~all` | lets the host send for the domain. The zone had no SPF record on 2026-10-07; were there one, extend it, a domain has one SPF record |
| TXT | `_dmarc.cherkashino.ru` | `v=DMARC1; p=none` | a failed check gets a letter marked, not rejected, the same as on `shipshift.dev` |

Then, in `deploy/mt/ru.env`:

```
SMTP_HOST=mail
SMTP_PORT=587
SMTP_SECURE=false
SMTP_FROM=noreply@cherkashino.ru
MAIL_HOSTNAME=mail.cherkashino.ru
MAIL_SENDER_DOMAINS=cherkashino.ru
```

and a deploy of that instance (`deploy/scripts/deploy-instance.sh ru <ref>`). Before the first letter,
ask the relay whether DNS answers for the key it signs with:

```bash
docker exec mt-mail opendkim-testkey -d cherkashino.ru -s mt1 \
  -k /etc/opendkim/keys/cherkashino.ru.private -vvv
```

`key OK` means a receiver can verify the signature; `key not secure` on the line before it only says
the zone has no DNSSEC. `keys do not match` or `record not found` means the TXT record is not the
public half of the key this relay holds.

The RU instance sends from the shop's own domain because that whole instance is that shop's. On INTL
the address stays the platform's for every shop
(`apps/backend/src/modules/smtp-notification/services/smtp.ts`), so no shop domain needs a key there.

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
