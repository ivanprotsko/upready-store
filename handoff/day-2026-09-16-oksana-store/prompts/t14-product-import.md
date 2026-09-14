# Goal

Let a shop owner move their catalogue in and out as a spreadsheet. Export to CSV, edit in Excel or Google
Sheets, import back, see the result on the storefront.

There is no product import at all today (`{{MISSION_DIR}}/research/upready-store-capabilities.md` §3 row
«Массовый импорт/экспорт», §6 gap 8): orders export to CSV and products do not move at all. InSales sells this
as a pillar of the Combo tariff (`insales-combo-features.md`, ids `import-eksport-csv-xls-xlsx`,
`avtoopredelenie-struktury-importa`, `zagruzka-izobrazheniy-po-ssylkam`). For this client it is the difference
between editing 38 positions one by one in a browser and pasting a price list.

## Step plan

1. **Export first, and make the export the contract.** `GET /tenants/products/export` produces a CSV whose
   columns are exactly what the import accepts: handle, title, subtitle, description, status, category path,
   SKU, price per currency, stock, weight, dimensions, image URLs (one column, separated), and the product
   metadata keys the shop uses. A round trip with no edits must change nothing — that is your first test.
   Follow the shape of the existing orders export (`apps/backend/src/api/tenants/orders/export/route.ts`):
   same streaming, same escaping, same file naming.
2. **Import with a dry run that is a real dry run.** Upload the file, the backend parses and validates it and
   returns a per-row report: rows to create, rows to update, rows unchanged, rows rejected with the reason and
   the line number. Nothing is written until the owner confirms. A file with any fatal error (a duplicate
   handle, a price that is not a number, an unknown currency) is rejected as a whole with the list — never half
   applied.
3. **Matching.** A row matches an existing product by handle, or by SKU when the handle is empty. A row that
   matches nothing creates a product in `draft` status, never `published`: a bad import must not put a broken
   card in front of customers.
4. **Images by URL.** An image column may hold public URLs; the importer downloads them through the tenant
   upload route, with a size limit and a content-type check, and reports every URL it could not fetch. A failed
   image never fails the whole row silently: it is in the report.
5. **Categories.** A category path like `Добавки / АСД` creates the missing levels for that tenant, or, if you
   choose to require existing categories, the report says exactly which ones are missing. Say which behaviour
   you built and why.
6. **Encoding and separators, because this is Russia and the file comes from Excel.** Accept UTF-8 with and
   without BOM, accept `;` as well as `,` as the separator, detect which by reading the header, and write the
   export with a BOM so Excel opens Cyrillic correctly. Test with a file saved by a real spreadsheet, not only
   with one you generated.
7. **Panel.** A section on the products screen: «Выгрузить CSV», «Загрузить CSV», the dry-run report as a table,
   the confirm button, and the result. Big files run in the background with a visible state; a page reload must
   not lose the report.
8. **Limits.** State the maximum file size and row count you support, enforce them, and say the numbers in the
   panel before the owner uploads.

XLSX is a nice-to-have: build CSV properly first, and add XLSX reading only if the CSV path is finished and
measured. Say in the PR which you shipped.

## Commands

```
cd apps/backend && npx medusa lint && npx tsc --noEmit && pnpm test:unit
cd apps/backend && DB_HOST=localhost PORT=9199 pnpm test:integration:http
cd apps/tenant-panel && pnpm typecheck && pnpm lint
```

## Acceptance (measured, quoted in the PR body)

- Round trip: export a shop with at least 10 products, import the untouched file, and show that nothing changed
  (quote the report's «unchanged» count equal to the row count, and a diff of the product table before and
  after that is empty).
- Edit a price and a stock number in the exported file, import, and the storefront shows the new price. Quote
  the old and new values and the storefront URL, and screenshot the product page.
- A deliberately broken file (duplicate handle, letters in the price) is rejected with a per-line report and
  writes nothing. Quote the report and prove nothing changed.
- A row with an image URL creates the image; a row with a dead URL is reported and the product is still created.
  Quote both report lines.
- A file saved by Excel in UTF-8 with BOM and `;` separators imports correctly. Say how you produced it.
- Suites pass; quote whole-file result lines.

## What NOT to do

- Do not publish newly created products automatically.
- Do not write half a file. If you cannot make it transactional, then validate everything first and write only
  after validation passes, and say so.
- Do not accept an image URL from a private network address, and do not follow redirects without a hop limit.
- Do not deploy, and do not run an import against the live shop: that is a separate, owner-initiated action.
