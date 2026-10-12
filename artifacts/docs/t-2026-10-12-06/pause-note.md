# t-2026-10-12-06: заметка о паузе (лимит COO, 12.10.2026 ~14:52 WITA)

Сессия direct-t06, worktree [t-2026-10-12-06-pdp-details-panel/](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t-2026-10-12-06-pdp-details-panel), ветка `feat/t-2026-10-12-06-pdp-details-panel` (база dev c52e51ee). Код компонентов ещё НЕ правился, коммитов нет.

## Где остановился

- Стенд остановлен: бэкенд `medusa develop` :9761 (proc 20261012-064124-74347) и `next dev` (webpack) :8761 (proc 20261012-064153-87430). Порты свободны.
- Новых сборок и прогонов нет. Уже сделано: `pnpm install` в worktree (rq-20261012-063748-17b0), один прогон vitest (rq-20261012-064958-34cd).
- Не закоммичено, лежит в worktree: новый тест [index.test.tsx](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t-2026-10-12-06-pdp-details-panel/apps/storefront/src/modules/products/components/product-details-drawer/index.test.tsx). На dev все 5 тестов красные, как и задумано (лог [vitest-drawer-on-dev.log](/Users/ivanprotsko/upready/evidence/upready-store/t-2026-10-12-06/before/vitest-drawer-on-dev.log)).
- Файлы стенда, оба в .gitignore: [.env](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t-2026-10-12-06-pdp-details-panel/apps/backend/.env) бэкенда (копия .env стенда ivan-1001 с портом 9761, базой upready_store_t1012_06 и без переменных YANDEX_*) и [.env.local](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t-2026-10-12-06-pdp-details-panel/apps/storefront/.env.local) витрины (бэкенд :9761).
- База стенда `upready_store_t1012_06` на 127.0.0.1:5433 — копия `upready_store_ivan_1003` (createdb -T). Хост `cherkashino-ru.localhost` в ней ведёт на тенант `olavka` «Черкашино». Ничего не удалялось.
- Доказательства: [t-2026-10-12-06/](/Users/ivanprotsko/upready/evidence/upready-store/t-2026-10-12-06/) (job-tree.md и content-contract.md заполнены; снимки «до» в before/).
- Решения записаны через decide.mjs (3 штуки, --task upready-store/t-2026-10-12-06).

## Что найдено

1. **Пункт 4.1 воспроизведён на стенде.** На dev «В корзину» в панели доводит строку до сервера: POST /api/cart отвечает 200 на 1280, 1000 и 390 px, и счётчик в шапке становится 1. Но покупатель этого не видит.
   - Ниже 1024 px `openCartSidebar()` ничего не делает, а панель закрывает страницу (на телефоне целиком). Счётчик и «В корзине − N +» в карточке покупки меняются за ней, а кнопка в самой панели не меняется.
   - От 1024 px боковая корзина ложится поверх открытой панели только за счёт порядка порталов, оба слоя на z-80. После переноса панели вправо (пункт 4) обе панели оказались бы у одного края.
   - Товар с вариантами без выбора: в панели серая «В корзину», причина не названа. У всех 33 товаров cherkashino по одному варианту, поэтому этот случай закрыт тестом, а не браузером.
   - Снимки: [03-after-add-1280.png](/Users/ivanprotsko/upready/evidence/upready-store/t-2026-10-12-06/before/03-after-add-1280.png), рядом -1000.png и -390.png, логи log-*.txt там же.
2. **Решение D2 (decide.mjs):** после успешного добавления панель закрывается, затем идёт тот же отклик, что у карточки покупки: боковая корзина от 1024 px, ниже — счётчик и «В корзине − N +». Надпись кнопки в панели берётся та же, что в карточке покупки («Выберите вариант» / «Нет в наличии» / «В корзину»).
3. **Пункт 5, все места с «Купить» на витрине:** их только два — карточка покупки ([index.tsx:187-197](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t-2026-10-12-06-pdp-details-panel/apps/storefront/src/modules/products/components/product-actions/index.tsx:187-197), test id `buy-now-button`) и панель ([index.tsx:152-161](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t-2026-10-12-06-pdp-details-panel/apps/storefront/src/modules/products/components/product-details-drawer/index.tsx:152-161), `product-details-buy-now`).
   - Других кнопок покупки сразу в оформление нет: ни в карточках товаров, ни в Telegram mini app, ни на страницах курсов. Других `push("/checkout…")` нет, кроме корзины и сайдбара («Оформить заказ» / «К оформлению» — это не «Купить»).
   - Ключи каталогов: `ProductActions.buy` («Купить») используется только в этих двух местах. `ProductActions.buyNow` («Оплатить») не используется нигде. Оба ключа убираются из всех 36 каталогов.
   - Селекторов e2e на `buy-now-button` нет.
4. **Решение D3 (decide.mjs):** `busy`/`setBusy` контекста выбора и `isAdding` ставил только `handleBuyNow`, поэтому они удаляются вместе с ним. Это затрагивает variant-picker.tsx (`disabled={busy}`) и mobile-actions.tsx (`isAdding`).

## Следующий шаг (после снятия паузы)

1. use-product-purchase.ts: убрать `handleBuyNow`, `useRouter`, `busy`. Добавить третий параметр `{ onAdded }`: он вызывается после `queue.add` и до `openCartSidebar()`. Добавить `addLabel`: `!isValidVariant ? "selectVariant" : product && !inStock ? "outOfStock" : "addToCart"`.
2. product-selection/index.tsx: убрать `busy`/`setBusy`. variant-picker.tsx: убрать `disabled={busy}`. product-actions/index.tsx: убрать кнопку «Купить» и `isAdding`, надпись — `t(addLabel)`. mobile-actions.tsx: убрать `isAdding`.
3. product-details-drawer/index.tsx:
   - Классы от xsmall: `xsmall:!right-2 xsmall:!left-auto`, без `slide-*-left`. Ширина при 512–655 px — `calc(100%-16px)`, чтобы отступы были одинаковыми.
   - Комментарий: правит слово Ивана от 12.10 «показывать справа» вместо 24.09 «слева».
   - Подвал: цена `shrink-0` и одна кнопка `min-w-0 flex-1 rounded-full`, как в липкой полосе телефона.
   - `onAdded: () => setDetailsOpen(false)`. В `onCloseAutoFocus` не возвращать фокус на opener, если он уже в другом диалоге (боковая корзина).
4. Убрать `ProductActions.buy` и `ProductActions.buyNow` из всех 36 каталогов, затем прогнать сниппет паритета из AGENTS.md.
5. Тесты:
   - vitest: новый тест панели должен позеленеть; добавить тест карточки покупки без «Купить».
   - Playwright: tests/pdp/layout.spec.ts — панель справа на 1280, во весь экран на 390, «В корзину» в панели закрывает её и открывает боковую корзину.
6. Через run-queue: `npx tsc --noEmit`, `npx next lint` (скрипт lint), `npm test`, `npx next build`.
7. Стенд снова (proc-run, сначала бэкенд, потом `next start` по сборке): снимки 1280×800 и 390×844, ui-shoot light/dark, 0 ошибок в консоли. Снимки положить в [t-2026-10-12-06](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t-2026-10-12-06-pdp-details-panel/artifacts/docs/t-2026-10-12-06/). Затем PR в dev, стенд остановить, сигнал done.
