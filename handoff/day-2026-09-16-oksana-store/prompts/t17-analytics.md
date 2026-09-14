# Goal

Two things a shop owner needs to know whether the shop works: their own analytics counter on their own
storefront, and a sales summary on the panel's home screen.

Today (`{{MISSION_DIR}}/research/upready-store-capabilities.md` §3 row «Аналитика», §6 gap 10): GA4 is wired
through `NEXT_PUBLIC_GA_MEASUREMENT_ID` in `apps/storefront/src/modules/common/components/google-analytics`,
mounted in `app/layout.tsx:86` — **one id for every shop on the platform**, and on the live host it is not set
at all (measured: `rg -n 'GA_|GOOGLE_ANALYTICS' deploy/mt/shipshift.env.example deploy/compose.mt.yml` → empty).
There is no Yandex Metrica, and the panel's home screen is an overview with no sales numbers. The client asked
for a consolidated view of her products and orders (`{{MISSION_DIR}}/research/telegram-digest.md`, #468851,
#472253).

## Step plan

1. **Per-tenant counters.** Move the measurement id onto the tenant document served by `/storefront/by-host`,
   and support both Yandex Metrica (the counter number) and GA4 (the measurement id). The build-time variable
   stays as the fallback for a single-store install and must never apply to a tenant that has its own. A tenant
   with neither loads no analytics script at all.
2. **Load them correctly.** Both scripts go through Next's script loading with the strategy the existing GA4
   component uses; the Metrica snippet has its own `noscript` pixel — include it. Fire a page view on client-side
   navigation, since this is an App Router SPA and a counter that only counts the first page is a counter that
   lies.
3. **Consent.** The storefront already has a cookie consent component. Analytics must respect it: no counter
   before consent where consent is required. Say in the PR body which behaviour you implemented and where the
   consent state comes from.
4. **E-commerce events.** Send the standard purchase event to whichever counter is configured, with the order
   id, the total and the currency, from the confirmation page. Do this after `t01-checkout-thankyou` has landed,
   or build it so it cannot break that page if it throws: an analytics failure must never take down the page a
   customer sees after paying.
5. **Sales summary in the panel.** On the panel home: revenue, order count and average order value for a period
   the owner picks (today, 7 days, 30 days, custom), the change against the previous period of the same length,
   a simple chart by day, and the five best-selling products. Computed in one backend endpoint over the tenant's
   orders, not by fetching every order into the browser.
6. **Honest empty state.** A shop with no orders shows «заказов пока нет», not zeroes that look like a loss, and
   never a chart of invented data. A period with no data is distinguishable from a period that has not loaded
   (rule 19h: «not answered yet» is a third state, not `false`).

## Commands

```
cd apps/backend && npx medusa lint && npx tsc --noEmit && pnpm test:unit
cd apps/backend && DB_HOST=localhost PORT=9199 pnpm test:integration:http
cd apps/tenant-panel && pnpm typecheck && pnpm lint
cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build
```

## Acceptance (measured, quoted in the PR body)

- Shop A with a Metrica number loads `mc.yandex.ru/metrika/tag.js` and shop B without one loads no analytics
  script. Quote both `curl -s <url> | grep -c` results, and show the network panel screenshot for A.
- The counter fires on an in-app navigation, not only on first load. Say how you observed it.
- The panel home shows revenue, order count and average for a shop with known orders; the numbers match a direct
  query. Quote the query, its result and the screenshot side by side.
- A shop with no orders shows the empty state, not zeroes. Screenshot.
- Suites pass; quote whole-file result lines.

## What NOT to do

- Do not put anyone's real counter id in the repository.
- Do not send customer personal data to an analytics service.
- Do not build attribution, UTM reports or an advertising dashboard: counter plus summary, nothing more.
- Do not deploy.
