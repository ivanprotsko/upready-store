# W14 — courses storefront screenshots (t-2026-09-24-n14)

Tenant cherkashino, locale `ru`, widths 1440 and 390. Taken against W14's own stack
(backend `http://localhost:9221`, storefront `http://cherkashino.localhost:8223`,
database `upready_store_e2e_w14`) via `e2e/courses/course-purchase.spec.ts`'s own
`page.screenshot()` calls during the green Playwright run reported to the lead.

| File | Shows | URL |
|---|---|---|
| `storefront-course-page-desktop-1440.png` / `-mobile-390.png` | Course product page before purchase: all 20 lessons of «Очищение печени» locked (padlock icon, no link), no progress bar | `/ru/products/course-ochishchenie-pecheni` |
| `storefront-checkout-digital-desktop-1440.png` / `-mobile-390.png` | Checkout of an all-digital cart: contacts + order summary + payment method only, no address row, no pickup row, no delivery-method picker | `/ru/checkout` |
| `storefront-lesson-player-desktop-1440.png` / `-mobile-390.png` | Lesson player, first lesson «Приветственное видео от Оксаны», unlocked after purchase, progress bar at 0/20 before «Отметить просмотренным» | `/ru/products/course-ochishchenie-pecheni/lessons/<lessonId>` |
| `storefront-my-courses-desktop-1440.png` / `-mobile-390.png` | «Мои курсы»: the purchased course card with progress 1/20 after marking the first lesson viewed | `/ru/account/courses` |
