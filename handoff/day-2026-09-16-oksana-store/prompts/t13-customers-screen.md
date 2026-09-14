# Goal

Give the shop owner a customers section in the panel. Today there is none at all: the panel's navigation goes
`/`, `/products`, `/categories`, `/orders`, `/promotions`, `/campaigns`, `/pages`, `/home-settings`, and the
only customer API is `GET /tenants/customers/[id]` (`{{MISSION_DIR}}/research/upready-store-capabilities.md` §3
row «Покупатели / CRM», §6 gap 7). InSales calls this the client base and treats it as a basic function
(`insales-combo-features.md`, ids `klientskaya-baza`, `segmentatsiya-pokupateley`).

## Step plan

1. **API.** Add the tenant-scoped list endpoint next to the existing single-customer one:
   `GET /tenants/customers` with pagination, a text search over name, e-mail and phone, sorting by creation date
   and by order count, and a CSV export in the shape the orders export already uses
   (`apps/backend/src/api/tenants/orders/export/route.ts` — read it and follow it, including how it streams and
   how it escapes).
   A customer belongs to the tenant through their orders on the tenant's sales channel; establish that rule
   once, in one query, and write it down in the route's comment. A customer of another shop must never appear.
2. **Screen.** `apps/tenant-panel/src/routes/customers` — a table (name, e-mail, phone, number of orders, total
   spent, registered), search, pagination, and a «Выгрузить CSV» button. The panel already has the hook
   `apps/tenant-panel/src/hooks/api/customers.tsx`; extend it rather than writing a second data layer.
3. **Customer card.** Clicking a row opens the customer: contacts, addresses, the list of their orders with
   status and total, each linking to the order screen. Reuse the components the orders section already uses.
4. **Navigation.** Add «Клиенты» to the panel navigation in its natural place, after «Заказы».
5. **Performance.** The product list in this panel takes 14–45 seconds live (recorded in the night report), so
   do not repeat whatever causes that: page on the server, select only the columns the table shows, and do not
   fetch every customer's orders to compute a count. Measure your list against 200 seeded customers and put the
   number in the PR.
6. **Guest orders.** An order placed without registration still has a name, an e-mail and a phone. Decide
   whether such a buyer appears in the list, say which you chose and why, and make the screen honest about it
   (a «гость» marker, or their absence explained in the empty state).

## Commands

```
cd apps/backend && npx medusa lint && npx tsc --noEmit && pnpm test:unit
cd apps/backend && DB_HOST=localhost PORT=9199 pnpm test:integration:http
cd apps/tenant-panel && pnpm typecheck && pnpm lint
node apps/tenant-panel/e2e/tenant-panel.e2e.mjs        # 136 checks; read its header for the env it needs
```

## Acceptance (measured, quoted in the PR body)

- The owner of shop A sees their customers and not shop B's. Quote both API responses with their counts.
- Search by a fragment of an e-mail returns the right row; quote the request and the count.
- The CSV opens in a spreadsheet with the right columns and the right number of rows; quote the header line and
  the row count, and screenshot the first rows.
- The list renders in under 3 seconds against 200 customers; quote the measured time and how you measured it.
- The customer card shows that customer's orders and their totals; screenshot.
- Suites pass; quote whole-file result lines.

## What NOT to do

- Do not add customer segmentation, tags or mailing lists: this task is the base, and scope creep here costs the
  day (`insales-combo-features.md` has segmentation as a separate function and it is not today's).
- Do not expose a customer's password hash, tokens or another tenant's data in any response.
- Do not fetch all customers into memory to sort or count them.
- Do not deploy.
