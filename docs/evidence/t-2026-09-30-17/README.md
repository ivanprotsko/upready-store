# t-2026-09-30-17 — сид supplements, сетка по количеству, подвал пяти стендов: доказательства

Замеры сняты 30.09 примерно с 11:16 до 11:30 WITA. Стенд работал на портах 9614 (бэкенд, `medusa develop`) и 8614 (витрина, только `next build && next start`), по одному профилю за раз. Панель (5614) не поднималась, для задачи она не нужна. После замера стенд погашен, все пять БД удалены.

| Приёмка | Доказательство |
|---|---|
| «The foundation» показывает ≥4 товаров | Сид supplements: у товара в Medusa одна коллекция, а 5 из 6 товаров foundation стояли и в third-party-tested, и последняя запись побеждала. Замер на БД `upready_store_supplements` (сид до правки): foundation 1, third-party-tested 9. На свежей `upready_store_ex_14_supplements` (сид после правки): **foundation 6, third-party-tested 4**. Главная (`measure-supplements.json`, `shots/supplements-{light,dark}-{1440,390}.webp`): `home-listing-p3` «The foundation», 6 товаров, в обоих режимах и на обеих ширинах |
| Плитки в сиде supplements | `seed-storefront-settings` записал `tiles=on` (лог сида); на главной 3 плитки, все 3 картинки декодированы браузером (`imagesDecoded 3/3`) |
| Сетка сворачивается при 1–3 (скриншоты light/dark) | Только на стенде: листинг supplements переключён на p1 (сетка), в foundation оставлено 1, 2 и 3 товара, после каждого шага сброшен кэш витрины. `measure-grid-n{1,2,3}.json`, `shots/grid-n{1,2,3}-{light,dark}-{1440,390}.webp`. Геометрия карточек на 1440: n=1 одна карточка 448 px по центру (left 496), n=2 две по центру (260 и 732), n=3 три заполняют ряд (24, 496, 968). На 390: n=1 одна по центру, n=3 две в ряд и третья по центру под ними. При 4 и больше сетка прежняя (`display: grid`, у sneakers 12 карточек) |
| Подвал всех пяти стендов: бренд-ссылки профиля, ссылок стартера Medusa нет (grep = 0) | `measure-<профиль>.json`, `shots/<профиль>-{light,dark}-1440.webp`. В каждом подвале только категории и коллекции своего магазина, ссылка на главную с именем бренда и одна внешняя ссылка, атрибуция [Upready — интернет-магазин и Telegram Mini App за 24–48 часов](https://upready.dev). Совпадений с `medusajs.com`, `github.com/medusajs`, `docs.medusajs`, `dtc-starter`, `nextjs-starter-medusa`, `Powered by Medusa` во всём HTML главной: 0 на каждом стенде и в каждом режиме. В коде: `git grep` тех же шаблонов по `apps/storefront/src/modules/layout` — 0 |
| WB-data: текст в git, медиа вне git, дельта размера | Сделано раньше и в другом репозитории. Коммит `f42523a8` в chrxnasdmds (есть в `origin/dev`): 26 файлов в `docs/WB-data/` плюс корневой `.gitignore`, 34,1 МБ (32,5 МиБ) текста; `docs/WB-data/.gitignore` исключает `product_images/`, `wb_media/`, `wb_tmp/` (≈1,3 ГБ медиа). В upready-store файлов WB-data 0, дельта размера репозитория 0. Здесь ничего не добавлялось |

## Проверки

- Витрина: `next build` прошёл 5 раз, по разу на профиль; `next lint` без ошибок, по изменённым файлам ни одного предупреждения; `check-var-colour-opacity` ok; `vitest run` — 66 файлов, 576 тестов зелёные.
- Бэкенд: `medusa lint` без ошибок; юнит-тесты `src/migration-scripts` и `src/scripts` — 5 файлов, 48 тестов зелёные; `tsc --noEmit` — 2 ошибки, обе в `src/tenant-secrets/__tests__/public-secret-reads.unit.spec.ts`.
- `corepack pnpm check:backend-build` **падает (код 1)** на тех же 2 ошибках TS2322 в `public-secret-reads.unit.spec.ts`. Файл пришёл в dev с #190 (17b880f3), эта ветка каталог `src/tenant-secrets` не трогает. Сегментом `__tests__` сборка Medusa файл не исключает. В `apps/backend` эта ветка отличается от `origin/dev` e2eb149d только тремя файлами сида, поэтому гейт красный и на самом dev. Это вывод по диффу: отдельной сборки чистого dev я не запускал.

## Стенды

В копии live (`upready_store_live_copy`) пяти профильных магазинов нет, там 14 других магазинов. Поэтому каждый профиль поднят на свою свежую БД через `apps/backend/scripts/store-profile-up.mjs <профиль> --db upready_store_ex_14_<профиль>` и `seed-storefront-settings.ts` с `STORE_PROFILE=<профиль>`, а витрина собрана с `NEXT_PUBLIC_STORE_PROFILE=<профиль>` и ключом этого магазина. Так устроены и сами стенды пилота: одна пара бэкенд + витрина на профиль.

Медиа профилей в git не лежат. Их скопировали в статику бэкенда стенда из деревьев `feat/store/<профиль>` (sneakers из `feat/store-profiles`) и после замера удалили.

Повтор замера: поднять стенд профиля, затем
`PLAYWRIGHT_PATH=<node_modules/.pnpm/playwright@1.63.0/node_modules/playwright> BASE=http://localhost:8614 TAG=<метка> node docs/evidence/t-2026-09-30-17/measure-home.mjs`
(`MODES` и `WIDTHS` задают режимы и ширины, по умолчанию `light,dark` и `1440,390`).
Скрипт пишет PNG. В репозиторий снимки легли в WebP (`cwebp -q 90`), 24 файла, 13 МБ → 2,8 МБ, и ссылки в `measure-*.json` переписаны на `.webp`.
