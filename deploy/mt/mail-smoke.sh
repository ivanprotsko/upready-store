#!/bin/sh
# Smoke test for the mt mail relay (t-2026-10-02-mail-relay, deploy/mt/MAIL.md):
# sends one message through `mail` the same way the backend does (nodemailer,
# already a dependency of apps/backend/src/modules/smtp-notification), from
# INSIDE the backend container, then prints Postfix's own delivery-status line
# for that message.
#
# Usage, on the mt host: deploy/mt/mail-smoke.sh <to-address>
#
# What it proves: the backend container can reach `mail` on the private
# network and `mail` accepted the message for delivery (`status=sent`), or
# tells you why it did not (a bounce reason from the line it prints). What it
# does NOT prove: that Gmail or Yandex accepted and inboxed it — this script
# has no mailbox on either to read, so that check happens on live, by hand,
# after DNS has propagated.
#
# No secret is read or printed. The relay takes no SMTP_USER/SMTP_PASS; the
# only credential in play is network membership, which `mynetworks` grants to
# the backend container alone.
#
# Env:
#   BACKEND_CONTAINER  default mt-backend
#   MAIL_CONTAINER     default mt-mail
#   MAIL_HOST          default mail        (the relay's name on mt-private)
#   MAIL_PORT          default 587
#   LOG_WINDOW         docker logs --since value, default 2m
#   WAIT_SECONDS       pause before reading the log, default 5
set -eu

BACKEND_CONTAINER="${BACKEND_CONTAINER:-mt-backend}"
MAIL_CONTAINER="${MAIL_CONTAINER:-mt-mail}"
MAIL_HOST="${MAIL_HOST:-mail}"
MAIL_PORT="${MAIL_PORT:-587}"
LOG_WINDOW="${LOG_WINDOW:-2m}"
WAIT_SECONDS="${WAIT_SECONDS:-5}"

usage() { echo "usage: $0 <to-address>" >&2; exit 2; }
[ $# -eq 1 ] || usage
to="$1"

command -v docker >/dev/null 2>&1 || { echo "no docker on this machine" >&2; exit 2; }
docker inspect "$BACKEND_CONTAINER" >/dev/null 2>&1 || {
  echo "no container named $BACKEND_CONTAINER (set BACKEND_CONTAINER=...)" >&2
  exit 2
}

from=$(docker exec "$BACKEND_CONTAINER" printenv SMTP_FROM 2>/dev/null || true)
from="${from:-noreply@shipshift.dev}"
tag="mt-mail-smoke-$(date +%s)"

echo "Sending one message via $MAIL_HOST:$MAIL_PORT, from $from, to $to, tag $tag ..."

docker exec \
  -e "MT_SMOKE_HOST=$MAIL_HOST" -e "MT_SMOKE_PORT=$MAIL_PORT" \
  -e "MT_SMOKE_FROM=$from" -e "MT_SMOKE_TO=$to" -e "MT_SMOKE_TAG=$tag" \
  "$BACKEND_CONTAINER" node -e '
    const nodemailer = require("nodemailer");
    const t = nodemailer.createTransport({
      host: process.env.MT_SMOKE_HOST,
      port: Number(process.env.MT_SMOKE_PORT),
      secure: false,
    });
    t.sendMail({
      from: process.env.MT_SMOKE_FROM,
      to: process.env.MT_SMOKE_TO,
      subject: process.env.MT_SMOKE_TAG,
      text: process.env.MT_SMOKE_TAG,
    }).then((info) => {
      console.log("handed to the relay:", info.response);
    }, (err) => {
      console.error("the relay refused it:", err.message);
      process.exit(1);
    });
  '

echo "Waiting ${WAIT_SECONDS}s, then reading $MAIL_CONTAINER's own log ..."
sleep "$WAIT_SECONDS"

line=$(docker logs "$MAIL_CONTAINER" --since "$LOG_WINDOW" 2>&1 | grep -F "to=<$to>" | tail -1 || true)

if [ -z "$line" ]; then
  echo "no delivery-status line for $to yet in $MAIL_CONTAINER's log." >&2
  echo "Re-run with a larger WAIT_SECONDS, or read it directly:" >&2
  echo "  docker logs $MAIL_CONTAINER | grep -F '$to'" >&2
  exit 1
fi

echo "$line"
case "$line" in
  *"status=sent"*) echo "status=sent: the relay delivered it to the next hop." ;;
  *"status=bounced"*) echo "status=bounced: the next hop rejected it; the reason is in the line above." ;;
  *"status=deferred"*) echo "status=deferred: the relay will retry; the reason is in the line above." ;;
  *) echo "delivery status unclear; read the line above." ;;
esac
