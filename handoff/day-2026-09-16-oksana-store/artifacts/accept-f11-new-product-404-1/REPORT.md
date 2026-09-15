# Приёмка f11-new-product-404 (PR #47), round 1 — ПРИНЯТО

Составлен: см. строку ниже (подставлена вызовом date).

## Что проверено своими замерами

PR: head `fix/day16-new-product-404` → base `dev`, `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`.
Worktree на `58678527` = `origin/fix/day16-new-product-404` (свои коммиты только в HANDOFF.json/артефактах).

### Живая витрина cherkashino.shipshift.dev (Playwright, 1280x900, мои собственные прогоны)

| Название | Идентификатор | HTTP | h1 | «В корзину» | цена |
|---|---|---|---|---|---|
| Прополис | `propolis` | 200 | Прополис | да | 990,00 ₽ |
| Мазь-бальзам живичный | `maz-balzam-zhivichnyy` | 200 | Мазь-бальзам живичный | да | 1 290,00 ₽ |
| Настойка 50 мл | `nastoyka-50-ml` | 200 | Настойка 50 мл | да | 450,00 ₽ |
| Свечи АСД с чесноком (контроль, импортированный) | `svechi-asd-s-chesnokom-10-sht-cherkashino` | 200 | Свечи АСД с чесноком | да | 1 453,00 ₽ |

Карточки в каталоге `/ru/store` — мой замер:
`curl -s -L https://cherkashino.shipshift.dev/ru/store | grep -o '/products/(propolis|maz-balzam-zhivichnyy|nastoyka-50-ml)'`
→ все три ссылки присутствуют, и ссылка совпадает с идентификатором страницы.

Все три товара заведены мастером панели этой ветки: драйвер заполняет только название/описание
(`artifacts/docs/f11-new-product-404/drv/02-create.mjs`), а поле идентификатора прочитано из формы
до сохранения — `handleShownInForm=propolis` / `maz-balzam-zhivichnyy` / `nastoyka-50-ml`
(`raw/02-create-p1..p3.json`). То есть латиницу даёт панель, не ручной ввод.

### Проверки репозитория (worktree ветки)

| Проверка | Результат |
|---|---|
| `apps/storefront`: `npx tsc --noEmit` | rc=0 |
| `apps/storefront`: `npx next lint` | rc=0 (1 pre-existing warning в yandex-metrica) |
| `apps/tenant-panel`: `npm run typecheck` | rc=0 |
| `apps/backend`: `npm run test:unit` | 239 passed, 1 failed — `migration-scripts/profile-data.unit.spec.ts` |
| тот же тест на базе `dev` (main checkout) | тоже FAIL → поломка ПРЕДСУЩЕСТВУЮЩАЯ, не от PR #47 |
| `src/product-csv/__tests__/slugify-twin.unit.spec.ts` (новый) | PASS |

`next build` намеренно НЕ запускался: на машине живут dev-серверы, а сборка переписывает общий
`.next` (правило 5d, инцидент aie-20260915-080025-d004). Типы и линт покрыты отдельно.

### Полнота класса (правило 20)

`grep -E 'params\.(handle|slug|key|category)'` по `apps/storefront/src/app`: сырой сегмент остался
ровно в пяти местах, и все пять — построение URL (`buildAlternates`, `localeUrl`, canonical), где
нужен именно адрес, а не ключ поиска. Все пять роутов-ключей (`products`, `categories`,
`collections`, `journal`, `pages`) идут через `decodeSegment`/`decodeSegments`. Остальные
динамические сегменты — `order/[id]`, `[token]`, `orders/details/[id]` — ASCII-идентификаторы.

Секретов в диффе нет: драйвер читает пароль владелицы из `~/upready/.private/...`, в коде его нет.
Миграций, удалений, правок защищённой инфраструктуры — нет.

## Замечания (не блокируют мерж)

1. Три товара приёмки остались ОПУБЛИКОВАННЫМИ в живом каталоге Оксаны
   (`prod_01M2J05N4CSC2SSF1F6X10RXVF`, `prod_01M2J06HK4BWD486G1RK5KJD8M`,
   `prod_01M2J07FDVTKQNT0JRAXWQBYT5`). Их видит покупатель. Удалить — я этого не делаю сам
   (запись в прод-БД вне моего мандата).
2. Коллизия идентификатора между магазинами (`IDX_product_handle_unique` — общий на платформу) в
   мастере панели по-прежнему не разрулена: второй магазин с «Прополисом» получит ошибку записи.
   Отдельная задача, честно названа в отчёте исполнителя.
3. Правки не задеплоены: половина «витрина декодирует сегмент» живёт только в ветке. После деплоя
   стоит перепроверить кириллический handle прямо на живом адресе.
Составлен: 2026-09-15 15:59 WITA
