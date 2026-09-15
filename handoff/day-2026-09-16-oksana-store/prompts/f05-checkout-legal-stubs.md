# Goal

At the moment of payment the shop asks the buyer to accept documents that are starter placeholders.

Measured live (QA q01, `https://cherkashino.shipshift.dev/ru/checkout`, 2026-09-15). Under the «Оплатить»
button stands: «Нажимая «Оплатить», вы принимаете условия, условия использования и политику возврата, а также
соглашаетесь с политикой конфиденциальности» — four links, to `/terms`, `/terms`, `/returns` and `/privacy`
(`apps/storefront/src/modules/checkout/components/checkout-payment-section/index.tsx`, the four `<Link>`s near
the bottom of the file). Each of those pages answers 200 with:

> «Это страница-заглушка из стартера. Замените текст своим до запуска магазина.»

(measured for `/ru/terms`, `/ru/privacy`, `/ru/returns`, `/ru/shipping`; screenshots
`{{MISSION_DIR}}/artifacts/q01-qa-customer/shots/11-terms-stub-1280x900.png` and `11-shipping-stub-*.png`.)

Meanwhile the shop's REAL documents are published and Russian, at other addresses:
`/ru/pages/offer` (публичная оферта, 19 k characters), `/ru/pages/privacy` (политика, 15 k),
`/ru/pages/contacts`, `/ru/pages/about` — and the footer links to those, not to the stubs. Two sets of legal
pages, and the checkout picked the empty set. The footer of the checkout column also links «Доставка» and
«Правила возврата» to `/shipping` and `/returns` — the same stubs
(`apps/storefront/src/modules/checkout/templates/checkout-form/index.tsx`).

For a Russian shop this is not cosmetic: the offer is the contract the buyer is told they are accepting.

## What to do

Point every legal link a buyer can reach at the tenant's own page when the tenant has one, and keep the starter
stub only for a deployment that has no tenant. The page keys already exist (t05 shipped arbitrary page keys —
`apps/backend/src/api/store/tenant/pages/[key]`, `TENANT_PAGE_KEYS`), and the footer already resolves them, so
reuse that resolution rather than inventing a second mapping. Where a tenant has no page under a key, the link
must not lead to a «заглушка из стартера» text — decide between hiding the link and falling back to the offer,
and say which and why.

Check the same four links in: the checkout payment section, the checkout form footer, the account screens
(«Служба поддержки» → `/customer-service`) and the site footer. Fix the class, not one call site (rule 20).

## Acceptance (measure — rule 18f)

On the live shop:

1. every link under the «Оплатить» button opens a page of Оксана's own text (its first 200 characters pasted
   into your report), and none of them contains the word «заглушка»;
2. `curl -s https://cherkashino.shipshift.dev/ru/terms | grep -c "заглушка"` — paste what it returns and explain
   the state you left that route in;
3. screenshots 1280×900 and 390×844 of the checkout with the links visible;
4. the same check on a tenant-less deployment still renders the starter stubs (or say why that case is gone).
