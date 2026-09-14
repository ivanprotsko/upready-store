# Goal

An order can be paid for with no city and no postal code, so the owner cannot post the parcel.

Measured live (QA q01, `https://cherkashino.shipshift.dev`, order #5, 2026-09-15 06:48 WITA). At
`/ru/checkout?step=address` the sheet «Адрес доставки» opens with exactly two fields — «Адрес *» and
«Компания» (`{{MISSION_DIR}}/artifacts/q01-qa-customer/shots/06b-sheet-address-1280x900.png`). One line of free
text was typed, the sheet saved, a delivery method chosen, the demo card filled — «Оплатить» became active and
the order went through. What the shop now holds (`GET /tenants/orders/<id>?fields=shipping_address.*`):

```json
{"first_name":"Иван","last_name":"Тестовый","address_1":"ул. Ленина, д. 1, кв. 2",
 "city":"","province":"","postal_code":"","country_code":"ru","phone":"+79991234567"}
```

Empty city, empty region, empty index — and СДЭК/Почта России need all three.

The fields DO exist: ticking «Ввести адрес вручную» in the same sheet swaps the single input for «Адрес *»,
«Почтовый индекс *», «Город *» and a proper Russian region list
(`{{MISSION_DIR}}/artifacts/q01-qa-customer/shots/06f-sheet-address-manual-1280x900.png`). The default is
`PlainAddressInput` because the suggest provider is unconfigured:
`apps/storefront/src/modules/common/components/address-autocomplete/index.tsx` switches on
`addressAutocompleteProvider` (`@lib/constants`) and falls through to `providers/plain.tsx`; the DaData provider
(`providers/dadata.tsx`) needs `NEXT_PUBLIC_ADDRESS_AUTOCOMPLETE_PROVIDER_API_KEY`, which the multi-tenant host
does not set. So a shop with no suggest key silently collects a quarter of an address.

## What to do

Make the default path collect a postable address. In order of preference — pick from the code, and justify:

1. when no autocomplete provider is configured, render the manual fields instead of the single line (the
   component already has them, `manual-address-fields.tsx`), keeping the checkbox for the suggest case; or
2. keep the single line but require the structured fields before the payment button can be enabled.

Either way the requirement must hold server side too: check what `apps/backend` does with a cart whose
`shipping_address.city` is empty, and make an order without a city impossible rather than merely discouraged.
Say in your report what it would cost to turn on DaData for real (it is a paid key — that is Ivan's decision,
not yours to take).

## Acceptance (measure — rule 18f)

On the live shop, as a guest, with the default (unticked) sheet:

1. an attempt to reach payment without city/index is refused, with a Russian message the buyer can act on —
   screenshot 1280×900 and 390×844;
2. a completed test order carries non-empty `city`, `postal_code` and `province` — paste the
   `GET /tenants/orders/<id>?fields=shipping_address.*` response;
3. the region list stays Russian and the phone is still optional-or-required exactly as before;
4. cancel the test order and name it in your report.
