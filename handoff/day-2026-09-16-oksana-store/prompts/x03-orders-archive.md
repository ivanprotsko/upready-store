# Goal

Produce the archive of the client's old shop: 88 orders and 46 customers, as spreadsheets she can open, plus a
short note explaining what they are.

Orders and customers are deliberately **not** migrated between the old store and the new one: there is no
recorded consent for moving personal data between operators, and re-creating orders on a new platform would
falsify their history. That decision is recorded in the migration report
(`/Users/ivanprotsko/upready/worktrees/upready-store/feat/cherkashina-tenant/artifacts/docs/2026-09-12-cherkashina-migration/03-migration-report.md`,
section «Не перенесено»). The right answer is an export, and that is this task.

## Source

`postgres://ivanprotsko@localhost:5433/medusa_chrxn` (PostgreSQL 16, role `ivanprotsko`; the role `medusa` has
no rights on the product and image tables and its dumps come out empty). psql binary:
`/opt/homebrew/opt/postgresql@16/bin/psql`. Counts recorded on 2026-09-12: 88 orders, 46 customers.
If the database is not reachable, the last dump is
`/Users/ivanprotsko/upready/projects/chrxnasdmds/backups/medusa_chrxn.pre-pricelist-sync-20260901-0610.dump`
(custom format) — restore it into a throwaway local database, never into anything that already holds data, and
say in the report that you worked from the dump and from which date.

**Read only.** Do not write a single row to that database, do not commit anything into
`/Users/ivanprotsko/upready/projects/chrxnasdmds`, and do not modify any file there.

## What to produce, in `{{MISSION_DIR}}/artifacts/{{TASK_ID}}/`

1. `orders.csv` — one row per order: number, date, status, payment status, fulfillment status, customer name,
   e-mail, phone, delivery address, delivery method, currency, subtotal, shipping, discount, total, and the
   items as a readable column (`SKU × quantity × price`, separated). If an order has several items and you
   prefer a second file `order-items.csv` keyed by order number, do that and say so.
2. `customers.csv` — one row per customer: name, e-mail, phone, registration date, number of orders, total
   spent, and the address they last used.
3. `README.md` in Russian: where the data came from, the date of the snapshot, what each column means, how many
   rows are in each file, and one sentence saying that the archive is provided because order history is not
   transferred between platforms.

Write CSV with a UTF-8 BOM and `;` separators so that Excel opens Cyrillic and phone numbers correctly, and keep
phone numbers and order numbers as text so a spreadsheet does not eat the leading plus or zero.

## Step plan

1. Count first, export second. Run the count queries, print them, and compare them with the recorded 88 and 46.
   A disagreement is a finding to explain in the README, not a number to quietly adopt.
2. Read the schema before writing the join: Medusa 2.x splits order totals and addresses across tables and this
   database is version 2.17.2. Do not guess a column name; look at it.
3. A NULL is not a zero and a missing value is not a blank pretending to be data: leave the cell empty and say
   in the README which fields were often empty.
4. Sanity-check three orders by eye against the database before you declare the file correct, and put those
   three order numbers and their totals in the report.

## Acceptance

- Both CSV files exist, open in a spreadsheet, and their row counts equal the counts you measured.
- The sums are consistent: the total of the order totals equals the sum reported by a direct aggregate query.
  Quote both numbers.
- Three spot-checked orders match the database row by row. Quote them.

## What NOT to do

- Do not import anything into the new platform.
- Do not publish this data anywhere, do not put it in git, and do not paste personal data into your printed
  output beyond the three spot-checked order numbers and their totals.
- Do not write to the source database or restore a dump over it.

## Finish

```
ARTIFACT: {{MISSION_DIR}}/artifacts/{{TASK_ID}}/orders.csv
ARTIFACT: {{MISSION_DIR}}/artifacts/{{TASK_ID}}/customers.csv
ARTIFACT: {{MISSION_DIR}}/artifacts/{{TASK_ID}}/README.md
RESULT: OK <N заказов, M покупателей, сумма X ₽>
```
