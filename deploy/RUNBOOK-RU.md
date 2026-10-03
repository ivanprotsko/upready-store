# RU host runbook (t-cherk-25 / t-2026-10-03-23)

First boot of the RU instance of upready-store, on a clean Ubuntu 24.04 host (Timeweb, Moscow), from
this machine. Nothing in this runbook has been run against the real host — this task does not touch
a live server (rule: Ivan runs the live steps himself). Read
[docs/instances/RULES.md](instances/RULES.md) first: this runbook is the deploy side of the rules it
states, not a second copy of them.

## What is already true before you start

- Docker is already installed on the host.
- The Docker Hub mirror `dockerhub.timeweb.cloud` is already configured, so `docker compose build`
  does not need to reach Docker Hub directly over whatever route this host has to the outside world.
- There is **no SSH path between this host and the Contabo (INTL) host, and there will not be one**
  (docs/instances/RULES.md §4). Every command below runs from the operator's own machine against
  this host alone.
- This host carries **no customer data yet**. The order in the plan
  (`cherkashino-two-shops/plan.md` §5) is: this runbook stands up an empty stack first, and the real
  cherkashino.ru data moves here only in `t-cherk-14`, a separate, later task.

## Host prerequisites the first run showed were missing (03.10.2026)

- **`postgresql-client` on the host.** `deploy/backup/pg-backup.sh` dumps through `docker exec` but
  checks the archive with the host's own `pg_restore -l`; without it every deploy after the first
  stops at the pre-migration backup. Ubuntu 24.04 ships client 16, the same major as
  `postgres:16-alpine` in `compose.mt.yml`:
  `ssh … root@$RU_HOST_IP 'DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-client'`
- **Swap.** 4 CPU / 8 GB and no swap out of the box; the storefront image build can run out of memory.
  A 4 GB `/swapfile` with `vm.swappiness=10` (`/etc/sysctl.d/99-upready-swap.conf`) is in place.
- **SSH hardening.** Password login is off in `/etc/ssh/sshd_config.d/00-upready-hardening.conf`;
  `ufw` allows 22, 80 and 443 only. The host key is pinned on the operator's machine.

## 0. Credentials and host address

Read `CONTABO_SERVER_IP` in `~/upready/.env.keys` for the pattern this follows, then add this host's
own entries the same way — **not** hardcoded into this file or into any script this task commits:

```
RU_HOST_IP=<the host's public IPv4>
```

SSH key: `~/.ssh/id_ed25519_do` (the key the host was provisioned with, per the plan's own
`t-cherk-03` note) — root login, no password. Confirm access once before anything else:

```bash
export RU_HOST_IP=$(grep '^RU_HOST_IP=' ~/upready/.env.keys | cut -d= -f2)
ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_do root@$RU_HOST_IP 'docker --version; cat /etc/os-release | grep PRETTY'
```

## 1. Ingress: this host's own traefik

Contabo has Coolify, which already runs its own traefik on a network literally named `coolify`
(`deploy/compose.stand.yml`'s own header comment). This host has no Coolify, so
[`deploy/compose.ru-host.yml`](compose.ru-host.yml) stands up a bare traefik v3.6 that speaks the
exact same contract — entrypoints `http`/`https`, ACME HTTP-01 on the `letsencrypt` resolver, a
Docker provider with `exposedbydefault=false`, and a file-provider directory
`deploy/scripts/tenant-ingress-sync.sh` writes tenant hosts into. Read that file's own header before
changing anything in it.

```bash
ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_do root@$RU_HOST_IP 'mkdir -p /opt/upready-store/mt /opt/upready-store/ru-host/traefik/dynamic /opt/upready-store/ru-host/traefik/acme'
rsync -az --delete --exclude 'node_modules' --exclude '.git' --exclude '.next' --exclude '.turbo' \
  --exclude 'dist' --exclude '.medusa' -e "ssh -o BatchMode=yes -i $HOME/.ssh/id_ed25519_do" \
  ./ root@$RU_HOST_IP:/opt/upready-store/mt/
ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_do root@$RU_HOST_IP \
  'cd /opt/upready-store/mt && ACME_EMAIL=<an address Ivan can read mail at> \
   docker compose -p ru-host -f deploy/compose.ru-host.yml up -d'
```

**Ports: only traefik publishes one.** Docker's own iptables rules bypass `ufw`, so `ufw allow 80,443`
alone is not what makes this host answer — the `ports:` lines in `compose.ru-host.yml` are. No other
compose file in this repository publishes a host port; if a future service needs one, it goes through
this traefik's labels, never a direct `ports:` mapping.

## 2. The mt stack itself

Same `deploy/compose.mt.yml` the Contabo/INTL host already runs — this task changes nothing in that
file. Fill the RU env template:

```bash
ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_do root@$RU_HOST_IP 'test -f /opt/upready-store/mt/deploy/mt/ru.env && echo exists || echo missing'
cp deploy/mt/ru.env.example deploy/mt/ru.env
chmod 600 deploy/mt/ru.env
# fill every blank in deploy/mt/ru.env — see its own header comments
```

Generate each secret separately (`openssl rand -hex 32`): `POSTGRES_PASSWORD`, `JWT_SECRET`,
`COOKIE_SECRET`, `INTEGRATION_ENCRYPTION_KEY`, `REVALIDATE_SECRET`, `STOREFRONT_SETTINGS_SECRET`,
`STOREFRONT_DEVTOOLS_PASSWORD`.

**Check the env file before it ever reaches the host:**

```bash
node deploy/scripts/instance-check.mjs --instance ru --env deploy/mt/ru.env
```

A RESEND_API_KEY, a GA4 id, a TRIBUTE_ or X402_-prefixed variable, or anything else
`deploy/instances/ru.json` forbids fails this check with a `VIOLATION:` line naming exactly what and
why — fix the env file, not the check, and re-run it until it prints "is clean".

Then bring the stack up through [`deploy/scripts/deploy-instance.sh`](scripts/deploy-instance.sh),
which runs this same check again at deploy time (its step 3) before anything below is built:

```bash
deploy/scripts/deploy-instance.sh ru <git-ref> --env-file deploy/mt/ru.env
```

On this FIRST boot there is no `mt-postgres` container yet, so step 3 runs the env-only half of
`instance-check.mjs` and step 4 (the pre-migration backup) is a no-op — both log why, rather than
failing. Every later deploy to this host runs the full `--db` check and a real backup, because by
then the database exists.

## 3. Verifying before DNS points here

`ENGINE_DOMAIN`/`PANEL_DOMAIN`/`STORES_DOMAIN` in `deploy/mt/ru.env` are already the real domains
(`cherkashino.ru` etc.) — traefik's ACME HTTP-01 challenge needs the DNS record to already point at
this host before it can issue a certificate, so this step runs BEFORE DNS is switched, using
`/etc/hosts` to fake the resolution for exactly this one check:

```bash
ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_do root@$RU_HOST_IP \
  'curl -sS -H "Host: cherkashino.ru" http://127.0.0.1/healthz -o /dev/null -w "%{http_code}\n"'
```

A `200` here (over plain HTTP, no TLS yet, since the certificate needs the real DNS record first)
means the backend/storefront/panel triple is up and traefik is routing correctly; `/etc/hosts` on
your own machine with `$RU_HOST_IP cherkashino.ru panel.cherkashino.ru stores.cherkashino.ru` lets you
check the same thing from a browser before DNS exists anywhere public. This is an empty-stack check —
acceptance criterion #4 of this task ("пустой стек отвечает по https на тестовом домене") is this
step, run by the lead once DNS for a test domain (not `cherkashino.ru` itself, to avoid any
production-domain risk before the stack is proven) points here and a real certificate has been
issued.

## 4. DNS records — for Ivan

Once the lead confirms step 3, these are the records Ivan sets at whichever registrar holds
`cherkashino.ru` (read the IP from `~/upready/.env.keys`'s `RU_HOST_IP`, never pasted as a literal
number into this file):

| Host | Type | Value |
|---|---|---|
| `cherkashino.ru` | A | `$RU_HOST_IP` |
| `www.cherkashino.ru` | A | `$RU_HOST_IP` |
| `panel.cherkashino.ru` | A | `$RU_HOST_IP` |
| `stores.cherkashino.ru` | A | `$RU_HOST_IP` |

Lower the TTL to 300 before the switch, the same way `t-cherk-15` in the plan already calls for. This
runbook does not switch DNS itself — that is `t-cherk-14`/`t-cherk-15`'s moment, after real data has
moved here, not this stack's first boot.

## 5. Backups — RU copy stays in Russia

`deploy/backup/RUNBOOK.md` already covers the mechanics (`pg-backup.sh`, `nightly-run.sh`,
`cross-copy.sh`, `install.sh`) end to end for two hosts; nothing here duplicates it. The one RU-specific
rule, from `docs/instances/RULES.md` §1: this host's second backup copy goes to an S3 bucket **in
Russia** (Timeweb Cloud S3), never to the Contabo host and never to an EU/US bucket:

```bash
# in this host's deploy/backup/mt.env (not deploy/mt/ru.env — a separate file, deploy/backup/RUNBOOK.md §"Installing on a host")
S3_ENABLED=1
S3_ENDPOINT_URL=https://s3.twcstorage.ru
S3_BUCKET=<a Timeweb Cloud bucket in a Russian region>
S3_PREFIX=mt
```

`cross-copy.sh`'s own cross-host copy (this host <-> Contabo) stays off for the RU instance until
`t-cherk-14` has actually moved real `cherkashino.ru` data here — until then there is nothing on this
host worth a cross-copy, and turning it on early would be the first thing to audit if a cross-border
copy were ever found where it should not be.

## 6. Monitoring: uptime every minute, CPU/RAM/disk, Telegram alerts

`deploy/observability/RUNBOOK.md`'s external uptime monitor (UptimeRobot/Better Stack) still matters
here too — set it up the same way, it is the only thing that can see this host being down entirely.
It alone is not enough for this task's own requirement: a 5-minute floor on the free tier, and no
visibility into CPU/RAM/disk at all. [`deploy/scripts/ru-host-monitor.sh`](scripts/ru-host-monitor.sh)
runs ON this host, once a minute, and alerts into the same Telegram bot through a plain `sendMessage`
call — no new bot, no new token, same mechanism `deploy/observability/RUNBOOK.md` step 3 already uses.

```bash
ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_do root@$RU_HOST_IP 'mkdir -p /etc/ru-host-monitor'
cat <<'EOF' | ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_do root@$RU_HOST_IP 'cat > /etc/ru-host-monitor/env'
MONITOR_HEALTH_URL=https://cherkashino.ru/healthz
MONITOR_TELEGRAM_BOT_TOKEN=<the same token deploy/observability/RUNBOOK.md's step 2 already found>
MONITOR_TELEGRAM_CHAT_ID=<the same ops chat id from that step>
EOF
ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_do root@$RU_HOST_IP 'chmod 600 /etc/ru-host-monitor/env'
```

Then the systemd unit and a once-a-minute timer:

```ini
# /etc/systemd/system/ru-host-monitor.service
[Unit]
Description=RU host uptime + CPU/RAM/disk monitor (t-cherk-25)

[Service]
Type=oneshot
EnvironmentFile=/etc/ru-host-monitor/env
WorkingDirectory=/opt/upready-store/mt
ExecStart=/opt/upready-store/mt/deploy/scripts/ru-host-monitor.sh
```

```ini
# /etc/systemd/system/ru-host-monitor.timer
[Unit]
Description=Run ru-host-monitor every minute

[Timer]
OnCalendar=*-*-* *:*:00
Persistent=false

[Install]
WantedBy=timers.target
```

`Persistent=false` on purpose: a monitor that fires every minute does not need to "catch up" a missed
minute after a reboot the way a once-a-night backup timer does (`deploy/backup/RUNBOOK.md`'s own
`Persistent=true`) — the next minute's run already covers the host's current state.

```bash
ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_do root@$RU_HOST_IP \
  'systemctl daemon-reload && systemctl enable --now ru-host-monitor.timer && systemctl start ru-host-monitor.service'
```

Run it once by hand first and confirm a test alert actually lands in the ops chat, the same
"run it once, watch it end to end" rule every other runbook in this repository follows:

```bash
ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_do root@$RU_HOST_IP \
  'MONITOR_RAM_THRESHOLD_PCT=0 /opt/upready-store/mt/deploy/scripts/ru-host-monitor.sh'  # forces a RAM alert
```

## What this runbook does not cover

- Moving real `cherkashino.ru` data here — `t-cherk-14`, a separate task, run only after this runbook
  has been proven once on this host.
- Switching DNS — `t-cherk-15`, after `t-cherk-14`.
- The paperwork `docs/instances/RULES.md` §6 lists (Roskomnadzor notification, the processing
  instruction, etc.) — none of it is a deploy step, and none of it is filed by this task.
