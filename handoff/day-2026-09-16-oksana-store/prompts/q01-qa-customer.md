# Goal

Walk the client's live shop as a customer, from the first page to the letter after the order, and turn every
defect you find into a task the dispatcher will build today.

This is acceptance against reality (rule 18f): the product counts as ready for real customers only when a
customer path has been walked on the real shop at `https://cherkashino.shipshift.dev`, not on a stand.

## What you are testing

The shop of Оксана Черкашина: 29 published products in 9 categories, Russian by default, prices in roubles.
Read `{{MISSION_DIR}}/artifacts/x01-tenant-live-import/report.md` first — it says what was actually imported and
what was already known to be missing, so you do not report the known as new.
Read `{{MISSION_DIR}}/artifacts/d02-deploy-mt-2/report.md` — it says which code is live, so your findings are
about today's build.

## The path, in order, every step measured

Use Playwright (`npx playwright` — check it is available in the checkout, and say which browser you drove). Take
a screenshot of every step at **1280x900** and again at **390x844**, into
`{{MISSION_DIR}}/artifacts/{{TASK_ID}}/shots/`, named by step. Record the HTTP status and the load time of each
page, and collect the browser console errors for each.

1. Home page. Is the hero the owner's? Are the category tiles filled? Is there anything in English on a Russian
   page?
2. Catalogue. Product count, the filter row (how many chips, are any labels cut), sorting, pagination.
3. Search, from the header and from the bottom navigation on mobile. Search for a word that exists in a product
   title and for one that does not.
4. A product page. Photographs load and open in a gallery; the price is in roubles; the description is Russian;
   characteristics and reviews if the day's tasks landed; add to cart.
5. Cart. Change the quantity, remove an item, apply a promo code (create one in the panel first or ask nothing
   and report that you could not test it — do not invent a code that works).
6. Checkout, as a guest. Fill the address, pick a delivery method (is its name human, is its price explained),
   pick a payment method, and read every label: anything machine-made, English, or cut off is a finding.
7. Pay. If Robokassa test mode is live, pay with the test card; otherwise use the demo payment path. Say which
   one you used.
8. The confirmation page. This is where the day's first defect lived: it must show the order number, the items
   and the total, with no `Application error` and no `digest` in the console.
9. The letter. Check whether a confirmation e-mail arrived and whether its links point at
   `cherkashino.shipshift.dev` and not at the engine domain. If no letter arrives, that is a finding with the
   order number attached.
10. Register an account with the same e-mail and open the order in the personal cabinet: is the order there, is
    the tracking field visible, is the timeline readable?
11. Legal pages: `/ru/pages/offer`, `/privacy`, `/contacts`, `/about` and any new ones. Are they Russian, do they
    still show `{{ТОКЕНЫ}}`, and does the footer link them?
12. Mobile specifics at 390 px: the bottom navigation (is there still a Medusa mark there — `t-2026-09-12-medusa-mark-bottom-nav`),
    the sticky add-to-cart, the checkout sheets, and whether anything scrolls horizontally.

## How to file a defect

For each defect, write a task file and hand it to the dispatcher:

```
cat > /tmp/qa-fix-<n>.json <<'EOF'
{ "id": "f01-<kebab-slug>", "title": "<Russian, <= 80 chars>", "kind": "build", "lane": "build",
  "model": "sonnet", "effort": "medium", "branch": "fix/day16-<slug>", "deps": [], "priority": 40,
  "prompt": "f01-<kebab-slug>.md",
  "acceptance": "<measurable, Russian>", "why": "<found by live QA q01>" }
EOF
node {{MISSION_DIR}}/dispatcher.mjs add-task /tmp/qa-fix-<n>.json
```

and write the prompt file `{{MISSION_DIR}}/prompts/f01-<kebab-slug>.md` yourself: goal, the exact URL and steps
to reproduce, the screenshot path, what you expected and what you measured, the files you suspect, and the
acceptance criterion as a measurement. Priorities from 40 upward, in the order you would fix them. Use `opus`
and `effort: high` for anything that touches payment, checkout or data; `sonnet`/`medium` for the rest.
Do not file more than eight: rank them and put the remainder in your report as «не заведено, ниже порога».

## Acceptance for this task

- All twelve steps walked, each with two screenshots, a status code and a load time.
- The console error list per page, or «пусто».
- Every filed defect has a task in `tasks.json` and a prompt file that another agent can act on without asking
  you anything.
- A report `{{MISSION_DIR}}/artifacts/{{TASK_ID}}/report.md` in Russian: the path, what worked, what did not,
  the list of filed tasks with their ids, and the three things that would most embarrass us in front of a real
  buyer.

## What NOT to do

- Do not fix anything yourself. You measure and you file.
- Do not place more than three real orders, and never with a real card. Cancel what you create in the panel if
  it pollutes the owner's order list, and say what you left behind.
- Do not change the shop's settings, catalogue or prices while testing, except a promo code you create for
  step 5 and then delete.
- Do not deploy, do not restart anything, do not write to the database.

## Finish

```
ARTIFACT: {{MISSION_DIR}}/artifacts/{{TASK_ID}}/report.md
RESULT: OK <N шагов пройдено, M дефектов заведено, критичных K>
```
