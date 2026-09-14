# Goal

Let a shop describe its products with its own characteristics, show them on the product page, and let customers
filter by them.

Today a product carries only Medusa's built-in fields (weight, dimensions, material, country, HS code) plus a
free `metadata` bag, with no schema and no filters
(`{{MISSION_DIR}}/research/upready-store-capabilities.md` §3 row «Каталог», «нет схемы произвольных
характеристик и фильтров по ним»). InSales makes this the centre of the product card and of its SEO filters
(`insales-combo-features.md`, ids `svoystva-i-parametry-tovara`, `seo-filtry`).

The client's own mock-ups named the characteristics out loud: артикул, состав, объём, страна
(`{{MISSION_DIR}}/research/telegram-digest.md` §3, «Каталог / товары», #460492). For supplements, composition
and volume are what a buyer compares.

## Step plan

1. **Schema per tenant.** A characteristic has a name, a machine key, a type (text, number with a unit, choice
   from a list, boolean), an optional unit, a display order, and two flags: «показывать на карточке» and
   «использовать как фильтр». It belongs to the tenant and optionally to a category, so a shop can have
   composition on supplements and screen size on electronics without showing both everywhere.
2. **Values on the product.** The panel's product screen gets a «Характеристики» section that renders the
   fields defined for that product's category, with the right control per type. Values are stored so that they
   can be queried: a number stored as text cannot be filtered by range, so store typed values and say in the PR
   where they live.
3. **Product page.** A «Характеристики» block on the PDP: name, value and unit, in the owner's order, only the
   ones marked for display, only the ones with a value. No empty rows, no «не указано» filler.
4. **Filters.** In the catalogue, a characteristic marked as a filter becomes a facet: a value list for choices
   and text, a range for numbers. Facets show real counts and a value with zero matching products in the current
   selection is disabled rather than hidden, so the buyer can see what exists. Combine with the existing option
   filters rather than replacing them, and do not reintroduce the duplicate-chip defect that `t07` fixes.
5. **Localisation.** The characteristic name and its choice values are texts a visitor reads, so they follow the
   catalogue translation path (`x-medusa-locale`, the Medusa translation module) the way product titles do.
6. **Import.** If task `t14-product-import` has landed by the time you work, characteristics belong in the CSV
   as `attr:<key>` columns; if it has not, leave a note in the PR of what the column shape should be. Do not
   block on it.
7. **Performance.** Facet counts over a few thousand products must not be a query per value. Measure against a
   seeded catalogue and put the numbers in the PR.

## Commands

```
cd apps/backend && npx medusa lint && npx tsc --noEmit && pnpm test:unit
cd apps/backend && DB_HOST=localhost PORT=9199 pnpm test:integration:http
cd apps/tenant-panel && pnpm typecheck && pnpm lint
cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build && pnpm test
```

## Acceptance (measured, quoted in the PR body)

- The owner defines «Состав» (text) and «Объём» (number, ml) on a category, fills them on two products, and both
  appear on the product pages. Screenshots of the panel and of both PDPs.
- «Объём» appears as a range filter in the catalogue; selecting a range returns exactly the products whose value
  falls inside it. Quote the URL, the returned count, and the same count computed directly from the data.
- A characteristic marked «не показывать» is absent from the PDP but still filterable if marked so, and vice
  versa. Quote both cases.
- A second tenant does not see the first tenant's characteristics. Quote the request.
- Facet rendering over the seeded catalogue takes under 1 second; quote the measurement and the method.
- Suites pass; quote whole-file result lines.

## What NOT to do

- Do not turn every `metadata` key that happens to exist into a public characteristic: the schema is what the
  owner declares.
- Do not build SEO landing pages per facet today: that is a separate feature and a separate PR.
- Do not show a filter with no values, and do not show a facet count you did not compute.
- Do not deploy.
