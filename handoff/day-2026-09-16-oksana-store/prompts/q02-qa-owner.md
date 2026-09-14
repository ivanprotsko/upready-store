# Goal

Use the client's shop the way Оксана would: log into the panel and run the shop for half an hour. Everything
that a shop owner cannot do, or can only do with a developer's help, is a defect, and you file it as a task.

The owner here is a person who writes «Я ничего не поняла» when shown technical text
(`{{MISSION_DIR}}/research/telegram-digest.md` §7), delegates forms to assistants, and answers in one line. A
control that needs an explanation has failed.

## Access

Panel: `https://panel-store.upready.dev`. The owner credentials created by the import task are recorded in
`/Users/ivanprotsko/upready/.private/upready-store-day-2026-09-16/cherkashino-owner.md` — read them from there,
and never print the password into your output or into any report.
Read `{{MISSION_DIR}}/artifacts/x01-tenant-live-import/report.md` and
`{{MISSION_DIR}}/artifacts/d02-deploy-mt-2/report.md` first, so you know what is live and what is known missing.

## The path, in order, every step measured

Playwright, screenshots at 1280x900 into `{{MISSION_DIR}}/artifacts/{{TASK_ID}}/shots/`, plus the time each
screen took to become usable. The panel is a Vite SPA; the product list has been measured at 14 to 45 seconds
live and once hung in its skeleton — time every list.

1. Log in. How many steps, is there a password reset, is anything in English?
2. The home screen: does it tell the owner anything about her shop today?
3. Products: open the list (time it), open one product, change its price, save, and check the storefront shows
   the new price and how long that took.
4. Upload a photograph to a product and check it appears on the storefront.
5. Create a product from scratch with a price, a photograph, a category and stock, publish it, find it in the
   catalogue, then unpublish it.
6. Categories: rename one, set its picture, check the storefront tile.
7. Home settings: change the hero title and the composition, check the storefront.
8. Pages: create a page, publish it, find it in the footer.
9. Promotions: create a percentage promo code with a budget, then use it on the storefront yourself to see that
   it applies.
10. Orders: open the order that `q01-qa-customer` created, change its state through the flow the panel offers
    (fulfil, ship, mark delivered), write a tracking number if the field exists, and see what the customer sees.
11. Customers, delivery, analytics, branding, reviews, journal, import: whichever of today's tasks have landed.
    For each, say whether an owner could use it without being told how.
12. Settings: address of the shop, languages, requisites, payment credentials. Do not enter a real secret.

## What counts as a defect

- A control that does nothing, a save that does not stick, a list that never loads, a number that is wrong.
- English text, a machine-made name («<Магазин> courier»), a raw enum shown to a human, a label that needs a
  developer to read.
- A screen where the owner cannot tell whether something is loading, missing, or turned off.
- Anything that takes more than ten seconds without telling the owner it is working.

File each one exactly as `q01-qa-customer.md` describes: a JSON task through
`node {{MISSION_DIR}}/dispatcher.mjs add-task`, plus a prompt file you write yourself, priorities from 50
upward, at most eight, the rest listed in the report.

## Acceptance for this task

- All twelve steps walked, each with a screenshot and a measured time.
- A table in the report: screen, «может ли владелица сама», time, verdict.
- Every filed defect has a task and a prompt file.
- A report `{{MISSION_DIR}}/artifacts/{{TASK_ID}}/report.md` in Russian, ending with the three changes that
  would most improve the owner's day.

## What NOT to do

- Do not fix anything, do not deploy, do not touch another tenant, do not write to the database directly.
- Do not enter real payment credentials, a real bot token or a real SMTP password anywhere.
- Undo what you created (the test product, the promo code, the test page) and say what you left behind on
  purpose.
- Do not print the owner's password, not even partially.
