# Goal

The shop tells the buyer a letter was sent, and no letter exists. Both halves are measured on the live shop
(QA q01, order #5, 2026-09-15 06:48 WITA):

1. The confirmation page says, in Russian: «Подтверждение заказа отправлено на ivanprotsko+qa1@ivanprotsko.com.»
   (screenshot `{{MISSION_DIR}}/artifacts/q01-qa-customer/shots/08-order-confirmed-1280x900.png`).
2. The backend, at the same second, logged:

   ```
   {"level":"error","message":"[order-placed-email] Failed to send the letter for order
    order_01M2H1PTXG9AA891PXEM78QF12 to ivanprotsko+qa1@ivanprotsko.com:
    Could not find a notification provider for channel: email ...","timestamp":"2026-09-14 22:48:22"}
   ```

   (`ssh -i ~/.ssh/id_ed25519_contabo root@84.46.251.149 'docker logs mt-backend --since 30m | grep -i notif'`;
   host clock is CEST, 22:48 CEST = 06:48 WITA.)

Why there is no provider — already measured by the deploy task d02
(`{{MISSION_DIR}}/artifacts/d02-deploy-mt-2/report.md`, находка №3): t08 added `SMTP_*` to
`deploy/mt/shipshift.env.example`, but **`deploy/compose.mt.yml` does not pass a single one of them into the
`backend` service** (`grep -n "SMTP\|TELEGRAM\|BACKEND_PUBLIC_URL" deploy/compose.mt.yml` = 0 matches on the
deployed sha `2508708`), so even filling `shipshift.env` on the host changes nothing. The same holds for
`TELEGRAM_BOT_TOKEN/USERNAME/LINK_SECRET` and `BACKEND_PUBLIC_URL` (the last one is what Robokassa needs).

This is not a cosmetic bug: the letter is also the ONLY way a guest can attach an order to an account
(see the sibling task about the personal cabinet) — no letter, no order history, no tracking link.

## What to do

1. **Wire the variables.** Add `SMTP_HOST/PORT/SECURE/USER/PASS/FROM/REPLY_TO`, `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_BOT_USERNAME`, `TELEGRAM_LINK_SECRET` and `BACKEND_PUBLIC_URL` to the `environment:` block of the
   `backend` service in `deploy/compose.mt.yml`, in the same optional style as the neighbouring blocks (an unset
   variable must keep the backend starting — `useSmtp = Boolean(SMTP_HOST)` already guards the provider).
   No secret values in the repository.
2. **Stop the shop from lying.** When no e-mail provider is configured, or the send fails, the confirmation page
   must not claim the letter was sent. Either the page states what is true («Заказ принят. Номер …»), or the
   claim is rendered only when the backend reports a sent letter. Decide from the code which of the two is
   honest and cheap; a swallowed failure has to surface both in the operator log (it already does) and to the
   person waiting (it does not).
3. **Say what Ivan must fill in.** The values themselves are Ivan's to supply; your deliverable ends at the
   wiring plus a one-screen note in the report listing exactly which variables the host still needs and where
   they go (`/opt/upready-store/mt/deploy/mt/shipshift.env`). Do not deploy (rule 21c) and do not edit that file.

## Acceptance (measure — rule 18f)

- `git grep -n "SMTP_HOST\|TELEGRAM_BOT_TOKEN\|BACKEND_PUBLIC_URL" deploy/compose.mt.yml` returns the new lines,
  and `docker compose -f deploy/compose.mt.yml config` (or the project's own lint) parses without error.
- With SMTP unset, a locally started backend still boots and an order still completes — paste the check you ran.
- The confirmation page, measured on a stand or with the component's own test, no longer says a letter was sent
  when no provider exists; paste the before/after text of that line.
- Your report names the exact variables still missing on the host and the file they belong in.
