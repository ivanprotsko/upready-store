# t-2026-10-04-49 Evidence: Robokassa Methods on the Checkout, Payment in Robokassa's Modal

All shots come from a live local render of this branch on 2026-10-04. The stand ran this branch's
backend (`medusa develop` on port 9149, a scratch Postgres database, dropped afterwards) and its
storefront (`next dev` on port 8149). The shop `rk49` (`rk49.localhost`) carried a Robokassa account
in test mode under the real public login of cherkashino.ru's Robokassa shop and fake passwords. So the
method list below is Robokassa's live `GetCurrencies` answer, read by the new backend route, while no
signature from this stand can be valid. Robokassa answers the modal with error 29 for that reason.

Widths are 1440, 768 and 390. `dark` is the storefront's own dark mode (`upready-store.mode`).

## payment-methods-ru

The «Способ оплаты» section on `/ru/checkout`. Robokassa is listed as one row per method the shop
has enabled, in the order card, SBP, then Robokassa's own order: «Банковская карта», «СБП»,
«Карта 120 дней без %», «Карта Халва», each with the subtitle «Robokassa». SBP gets the bolt icon,
the cards the card icon. The first row is preselected.

## payment-methods-en

The same section on `/en/checkout`: «Bank card», «Faster Payments (SBP)», «120 Days Interest-Free
card», «Halva card».

## robokassa-modal

After «СБП» is picked, the consent ticked and «Оплатить» pressed. Robokassa's own modal opens over
the checkout, which stays behind it, blurred. The address bar stays on `/ru/checkout`. The form the
modal posted to `auth.robokassa.ru/merchant/v1/iframe`, as Playwright captured it (signature cut,
buyer's address hidden):

```
MerchantLogin, OutSum 1299.00, InvId, Shp_SessionID, SignatureValue b507149b…, IsTest 1, Culture ru,
SuccessUrl2 …/api/payment-return?provider=robokassa&…&outcome=success&locale=ru, SuccessUrl2Method GET,
FailUrl2 …/api/payment-return?provider=robokassa&…&outcome=fail&locale=ru, FailUrl2Method GET, Email,
IncCurrLabel SBP, Settings {"PaymentMethods":["SBP"],"Mode":"modal"}
```

Robokassa shows «Код ошибки: 29» because the stand's passwords are fake. With the shop's real test
password the same request carries a valid signature: neither `IncCurrLabel` nor `Settings` enters
Robokassa's signature (unit tests in `apps/backend/src/modules/payment-robokassa/__tests__`, and the
probe against Robokassa's documented `robo-demo` shop in the PR body).

## modal-closed

After «Вернуться» inside the modal. The modal is gone, the page is still `/ru/checkout` with
everything filled in, «СБП» is still picked, «Оплатить» is enabled again, and the line under it
reads «Не удалось обработать оплату. Попробуйте ещё раз или выберите другой способ.» (Robokassa
reported the error as `paymentFail`). The red «1 Issue» badge at 390 is the Next dev overlay's
hydration warning about the theme attribute; it does not exist in a production build.

## Not Shown

A successful payment cannot be shown from a stand with fake passwords. The success path sends the
buyer to the session's `SuccessUrl2` (`/api/payment-return?...outcome=success`), the route that waits
for the Result webhook and opens the order. The lead checks it on the live product in test mode.
