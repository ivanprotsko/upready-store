# Uptime and alert runbook (audit D-04)

Closes audit finding D-04 (High): the mt stack has correct health checks and nothing alerts on
their failure. The three health endpoints already exist and are already correct — this runbook
does not add code, it wires an external prober to them and to the Telegram bot already in the
repo (`apps/bot`). Nothing here has been set up yet: it is a checklist for Ivan, not a completed
install, the same way `deploy/backup/RUNBOOK.md`'s cron install is a checklist and not a completed
one.

## Why external, and why not a script in this repo

A health check that runs ON the host it monitors cannot report the one failure that matters most:
the host itself being down, unreachable, or the container runtime wedged. The audit's own wording
is "external uptime probe" for that reason. A GitHub Actions scheduled workflow was considered and
rejected here: D-02 already hit this repo's Actions budget being refused outright on a single
one-time run (`run 35558214895`, 2026-09-21); a recurring schedule job, even a cheap one, adds a
standing draw on a budget that has already failed once, and there is no reason to accept that risk
when a genuinely free, purpose-built alternative exists that also does not add a maintenance
surface to this codebase.

## The three endpoints to monitor

Domains come from `deploy/mt/shipshift.env` on the host (not committed; the example is
`deploy/mt/shipshift.env.example`):

| Service | Public URL | Expects |
|---|---|---|
| Backend | `https://${ENGINE_DOMAIN}/health` (e.g. `https://shipshift.dev/health`) | `200` |
| Storefront | `https://${STORES_DOMAIN}/healthz` (e.g. `https://stores.shipshift.dev/healthz`) | `200`, body `{"status":"ok"}` — host-agnostic on purpose, see `apps/storefront/src/app/healthz/route.ts` |
| Owner panel | `https://${PANEL_DOMAIN}/healthz` (e.g. `https://panel.shipshift.dev/healthz`) | `200` |

All three are already correct in `deploy/compose.mt.yml:20-21,232-235,291-292` (container-internal
`healthcheck:` blocks) and reachable publicly through the same traefik routers that serve real
traffic — no new endpoint is needed, only something outside the host that calls them on a
schedule.

## Setting it up — Ivan's steps, not automatable from the repo

Account creation and dashboard clicks are Ivan's action; nothing below can be done by a worker
session (outward-facing, needs an account decision).

1. **Pick a free uptime monitor.** UptimeRobot's free plan (50 monitors, 5-minute interval, no
   card required) covers three URLs with room to spare; Better Stack's free Uptime tier is an
   equivalent fallback if UptimeRobot's own alerting integrations turn out to be too limited for
   step 3 below. Either way: three HTTP(S) monitors, one per URL in the table above, expecting
   `200`.
2. **Get the ops chat id for `@upreadystore_bot`.** The bot has no operator/ops chat configured
   today — `apps/bot/.env.example` only has customer-facing config (payment links, the store-link
   secret). From whatever Telegram account should receive alerts, open
   `https://t.me/upreadystore_bot`, send any message (e.g. `/start`), then call
   `https://api.telegram.org/bot<TELEGRAM_UPREADY_STORE_BOT>/getUpdates` (the same token already in
   `apps/bot/.env` on the host) and read `result[0].message.chat.id` from the response. That
   number is the ops chat id — write it down, it is not a secret on its own but treat the bot
   token in that URL as one (never print it in a report or commit it).
3. **Point the monitor's alert at Telegram's own API — no new code.** Both UptimeRobot and Better
   Stack support a generic "Webhook" alert contact with a templated URL. Configure it to call:
   ```
   https://api.telegram.org/bot<TELEGRAM_UPREADY_STORE_BOT>/sendMessage?chat_id=<OPS_CHAT_ID>&text=<MONITOR_NAME>%20is%20<MONITOR_STATUS>
   ```
   using that service's own template variables for `<MONITOR_NAME>`/`<MONITOR_STATUS>` (exact
   variable names differ per provider — UptimeRobot's webhook editor and Better Stack's both show
   the available placeholders in their UI). This reuses the existing bot token as the alert
   transport; it does not touch `apps/bot`'s own long-polling process at all, and does not require
   deploying anything new.
4. **First alert, by hand.** Trigger a test notification from the monitor's dashboard (every
   provider above has a "send test alert" button) and confirm the message actually lands in the
   ops chat before trusting the schedule — the same "run it once, watch it end to end" principle as
   `deploy/backup/RUNBOOK.md` step 4.

## What this does not cover

- No metrics, no error tracking (Sentry/OpenTelemetry/etc.) — D-04's own text only asked for
  "minimal observability", i.e. someone finds out before a customer does. A fuller observability
  stack is separate, larger work, not scoped here.
- No paid tier of any provider — free-tier limits (5-minute check interval, a handful of alert
  contacts) are more than enough for three endpoints on one host.
- The webhook URL above carries the bot token in cleartext to the monitoring provider's servers
  over HTTPS; that is the same exposure as any Bot API call and is Telegram's own supported usage
  pattern, but it does mean the token is now stored in a third party's dashboard config, not only
  in `apps/bot/.env`. If that is unacceptable, use each provider's native Telegram integration
  (their own bot, not `@upreadystore_bot`) instead of step 3 — slightly less on-brand, no token
  exposure to a third party.
