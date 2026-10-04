# t-2026-10-04-48: Robokassa return lands on the filled checkout, branded waiting page

Live render of this branch on the worker's own stand, `next build` + `next start`:

- storefront `[Черкашино](http://olavka-com.localhost:8248)` (tenant `olavka`, «Черкашино»), built from
  `fix/robokassa-return-checkout`;
- backend `[http://localhost:9248](http://localhost:9248)`, `medusa develop` from the same worktree (`lsof -d cwd` checked);
- database `upready_store_t48` on 127.0.0.1:5433, a clone of `upready_store_t_cherk32` plus
  `medusa db:migrate`.

The returns are the real ones: the scenario opens
`/api/payment-return?provider=robokassa&cart_id=…&outcome=fail|success&locale=ru`, the URLs
Robokassa's Fail URL and Success URL point at. Before that, the buyer fills the contacts form (with
another recipient) and ticks both boxes through the UI. The scenario prints states and key names
only, no customer data.

## Groups

| Folder | What it shows |
|---|---|
| `waiting-page/` | Robokassa's success return, at once: the shop's mark, the spinner, «Проверяем оплату», «Сейчас вернём вас в магазин.», «Если этого не произошло, нажмите «Вернуться в магазин».» and the «Вернуться в магазин» link. This tenant has no logo uploaded (the live cherkashino.ru has none either, its header shows the name as text), so `SiteLogo` shows the shop's name, as the shop's own header does. |
| `waiting-page-with-logo/` | The same page with a logo in the tenant's branding: a stand-only test wordmark (light and dark variants) written into `tenant.metadata.branding` of the clone only. The light logo shows in light mode and the dark one in dark mode. |
| `checkout-fail-notice/` | Robokassa's fail return: `/ru/checkout?payment=failed`, notice «Оплата не прошла» / «Данные заказа сохранены: попробуйте ещё раз или выберите другой способ оплаты.» with «К оплате». The contacts section is collapsed with the buyer and the recipient, and both consent boxes are ticked. |
| `checkout-pending-notice/` | Where the waiting page ends when no order appears within the window: `/ru/checkout?payment=pending`, amber notice «Оплата подтверждается» / «Банк ещё не подтвердил оплату. Если деньги уже списаны, не оплачивайте повторно: заказ оформится, как только придёт подтверждение.» with «Проверить ещё раз» (back to the waiting page). Contacts and both boxes as before. |
| `cart-old-link-pending-banner/` | An old link `/ru/cart?error=payment_pending`: the banner still renders, its heading is now «Оплата подтверждается» (it said «Платёж не прошёл»), in amber. |

Each group has `1440`, `768` and `390` in `light` and `dark`. Dark is the storefront's own
`data-mode="dark"` on `<html>`, the attribute the mode switch sets.

## Measured on the stand (scenario output)

```
contacts saved; metadata keys: contact_first_name,contact_last_name,contact_phone,has_different_recipient
consent ticked; metadata keys: checkout_consent,contact_first_name,contact_last_name,contact_phone,has_different_recipient
fail return landed on /ru/checkout?payment=failed in 1065 ms
checkout-fail | notice: "Оплата не прошла Данные заказа сохранены: попробуйте ещё раз или выберите другой способ оплаты. К оплате" | contacts form open: 0 | contacts checkmark: 1 | contacts row lines: 5 | row has buyer+recipient names: true | personal data box: checked | marketing box: checked | pay-hint shown: 0
success return landed on /ru/payment-return | back link visible after 478 ms | link href: /ru/checkout?payment=pending | logo img: 0 | text: "ЧЕРКАШИНО Проверяем оплату Сейчас вернём вас в магазин. Если этого не произошло, нажмите «Вернуться в магазин». Вернуться в магазин"
waiting page gave up after 28619 ms, now on /ru/checkout?payment=pending
checkout-pending | notice: "Оплата подтверждается Банк ещё не подтвердил оплату. …" | contacts form open: 0 | contacts checkmark: 1 | contacts row lines: 5 | row has buyer+recipient names: true | personal data box: checked | marketing box: checked | pay-hint shown: 0
old cart link heading: "Оплата подтверждается"
final metadata keys: checkout_consent,contact_first_name,contact_last_name,contact_phone,has_different_recipient
```

The second line is the root fix at work: the consent write kept every `contact_*` key. Before it,
Medusa replaced `cart.metadata` whole and the live cart `cart_01M42J47P9ST5NJYMB4JBHDWKF` kept
`checkout_consent` alone.

With the test logo set: `[logo] <width> light … site-logo-light 160x32`, `[logo] <width> dark …
site-logo-dark 160x32` at all three widths.

## What the shots show that is NOT this task

- **«Что-то пошло не так. Пожалуйста, попробуйте ещё раз.» with «Повторить» in the payment block.**
  A defect of the stand's database clone. Creating the payment collection fails in the backend with
  `insert into "cart_payment_collection" … on conflict ("cart_id", "payment_collection_id") … - there
  is no unique or exclusion constraint matching the ON CONFLICT specification`: the clone lacks
  that link table's unique index. The same class of error stopped the clone's
  `initial-data-seed` script during `db:migrate` (`publishable_api_key_sales_channel`). This branch
  does not touch payment sessions.
- **Grey product thumbnails.** The snapshot's image URLs point at a stand that no longer exists
  (`memory/cherkashino-local-stand-from-snapshot-2026-09-15.md`).
- **At 390 px the delivery rows' «Укажите адрес — покажем цену и срок» run past the right edge**, so
  the full-page shot is 449 px wide. `checkout-shipping-section` is untouched here.
- **The red dot top right** is the stand's test-mode marker (checkout-v2 A3).
- The success return cannot end on the order page on this stand: no Robokassa payment was made, so
  the backend refuses to complete the cart and the waiting page ends on the pending checkout, which
  is the path measured. The order branch (`checkPaymentReturn` answering the confirmation page) is
  covered by unit tests only.
