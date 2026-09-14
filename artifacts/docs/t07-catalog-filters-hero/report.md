# t07-catalog-filters-hero — фильтры каталога без дублей и главная с собственным hero

_2026-09-15 05:21 WITA_

Два дефекта из «Предложения задач» отчёта миграции Черкашиной
(`.../2026-09-12-cherkashina-migration/03-migration-report.md`, строки 127–128). Один PR, минимальный
диф, ничего в БД не трогалось.

## 1. Один фильтр на название опции

**Причина.** `groupOptionFilters()` (`apps/storefront/src/lib/util/option-filter-groups.ts`) группировала
чипы по `option.id`. Medusa создаёт свою `product_option`-строку для КАЖДОГО товара, поэтому одинаковое
название опции («Количество», «Фасовка»…) на разных товарах получает разные `id` и рендерилось отдельным
чипом на товар — тот же класс, что `t-2026-09-12-seed-option-filter-duplicates`.

**Фикс.** Группировка теперь по нормализованному названию (`trim().toLocaleLowerCase()`), значения
объединяются (union) по всем товарам, несущим это название. Ключ отображения (`id` чипа) больше не
завязан на `option.id` — это чисто React-key, на фильтрацию не влияет (см. ниже).

**Юнит-тест** (`option-filter-groups.test.ts`): три товара с «Количество» / «количество» /
«  Количество  » на РАЗНЫХ `option.id` → один чип, значения — union всех трёх.

**Живой замер** на реальном каталоге Черкашиной (импортирован локально скриптом
`apps/backend/scripts/cherkashina-migration/import.mjs` — фазы tenant+categories+products, 38 товаров,
29 опубликованы):

| | До | После |
|---|---|---|
| Различных `option.id` (= чипов до фикса) | 29 | — |
| Различных нормализованных названий (= чипов после фикса) | — | 5 |
| Названия | — | Количество, Фасовка, Объём, Комплектация, Формат |

Скриншоты `/ru/store`, тенант `cherkashino`, вьюпорт 1280×900:
- `before-desktop-1280x900.png` — 29 чипов подряд (десктоп-ряд `OptionsPicker`), `chipCount` замерен через
  DOM-селектор `[class*="max-w-[180px]"]` = **29**.
- `after-desktop-1280x900.png` — тот же URL, тот же тенант, тот же код БЕЗ фикса stash'нут и восстановлен
  (см. ниже) → `chipCount` = **5**.

Мобильный breakpoint 390×844 (там же лист фильтров `MobileRefinement`, тот же источник данных):
- `before-mobile-390x844.png` + открытый лист фильтров: 29 строк групп, с повторами
  («Количество», «Фасовка», «Количество», «Фасовка», …).
- `after-mobile-390x844.png`: 5 строк — по одной на название.

Метод «до/после»: `git stash push -u -- option-filter-groups.ts option-filter-groups.test.ts` (уникальный
тег, снят по SHA, не bare stash — правило про общий стек воркчастей), скриншот, `git stash apply <sha>`,
скриншот, `git stash drop`. Один и тот же `next dev` процесс, один и тот же живой тенант — разница только
в коде.

**Фильтрация по значению не сломана.** Выбор конкретного `option_value_id` под объединённой группой:

```
GET /store/products?option_value_id=optval_01M2GVRESPYSRZHGNREMGHAHMR → count: 1, "Свечи АСД с чесноком"
GET /store/products?option_value_id=optval_01M2GVRF1MYPGKV6YJD7A8CK1Q → count: 1, "Тройчатка плюс"
```

Оба значения лежат под одной объединённой группой «Количество» (у разных товаров, разных бывших
`option.id`) и каждое фильтрует ровно в свой товар — count из HTTP-ответа совпадает со счётом руками по
JSON-снапшоту каталога. Механизм фильтрации (`option_value_id` — нативный параметр Store Products API)
код не менял: чипы влияют только на ОТОБРАЖЕНИЕ, не на то, какие `valueId` уходят в запрос.

## 2. Главная показывает то, что задал владелец

**Аудит вариантов hero** (`apps/storefront/src/modules/home/variants/index.ts` → `HERO_VARIANTS`,
`types.ts` → `HomeHeroProps.imageUrl`):

| Вариант | Панель называет | Использует `image_url`? | Как проверено |
|---|---|---|---|
| g — Витрина | одиночное фото товара | ДА (`imageUrl \|\| product.thumbnail`) | по коду; тенант без `collections` (только `categories`), `getLeadCollection()` возвращает null — живой рендер не поставить без отдельного фикстура, не стал заводить ради этого. |
| h — Полка | 3 фото коллекции | НЕТ (`hero-h.tsx`, три фото — это и есть композиция, `imageUrl` физически не принимается компонентом) | живой прогон: `hero-h-ignores-image-1280x900.png`, `content.hero.image_url` заполнен, hero=h — картинка не появляется, страница не падает (200) |
| j — Три двери | плитки категорий | НЕТ | по коду (`hero-j.tsx` не импортирует `imageUrl`) |
| k — Анонс | тоже ProfileHero | ДА (полностью то же дерево, что l) | живой прогон: `hero-k-owner-image-1280x900.png` — заголовок/подзаголовок/CTA/картинка ровно те, что в `PUT /tenants/home` |
| l — В движении | ProfileHero, full-bleed фото | ДА | живой прогон DOM: `data-hero-layout="full-bleed"`, `<img src>` = загруженный файл владельца |
| m — Без хиро, текст | нет фото вовсе | НЕТ | по коду |
| ga / gb — карусели/полосы | свои фото категорий | НЕТ | по коду |

**Решение.** H (и j/m/ga/gb) — реальная композиция «несколько своих фото» — переделывать в один слот под
владельческую картинку значило бы редизайн (запрещено ТЗ). Поэтому реестр `HERO_SUPPORTS_IMAGE` в
`apps/tenant-panel/src/routes/home-settings/composition.ts` перечисляет, какие варианты ЧИТАЮТ
`image_url` на витрине (g, k, l — `true`; h, j, m, ga, gb — `false`), и `home-settings.tsx` рендерит поле
«Адрес картинки» только когда `HERO_SUPPORTS_IMAGE[doc.settings.hero]` истинно. Панель и витрина теперь
согласованы: если поле не показано — витрина его и не использует, и наоборот.

Ранее сохранённый `image_url` при `hero=h` не пропадает (backward-compat: смена варианта туда-обратно
ничего не стирает), витрина его по-прежнему игнорирует, без ошибок — проверено (`curl` → 200,
`hero-h-ignores-image-1280x900.png`).

Панель проверена `tsc --noEmit` + `eslint` (0 ошибок; тестового раннера у tenant-panel в проекте нет —
`package.json` не объявляет `test`, только `typecheck`/`lint`, как и в AGENTS.md).

## Проверки (команды и результат)

```
cd apps/storefront
npx tsc --noEmit        # rc=0
npx next lint           # rc=0, No ESLint warnings or errors
npx next build          # rc=0
npx vitest run          # Test Files 1 failed | 13 passed (14); Tests 126 passed (126)
```
Единственный «красный» файл — `tests/ui-lab/toolchain.spec.ts`, Playwright-спека, которую подхватывает
vitest-конфиг; это не связано с этой задачей и существовало ДО неё (`git log` на файл → коммит `5c4c6d2`,
2026-09-06, «wire playwright in docker and vitest»).

```
cd apps/tenant-panel
npx tsc --noEmit   # rc=0
npx eslint .       # rc=0, 0 errors / 23 pre-existing warnings (не в тронутых файлах)
```

```
cd apps/backend
npx medusa lint   # rc=0, 0 errors / 9 pre-existing warnings (не в тронутых файлах)
npx tsc --noEmit  # rc=0
```

## Стенд

Локальный: backend `medusa develop` на :9531 (порт :9031 из `.env` задачи занят другим воркером —
`feat/day16-checkout-thankyou`, коллизия портов между воркчастями, не трогал чужой процесс), БД
`t07_catalog_filters_hero` на `localhost:5433`, storefront `next dev` на :8531 (свой `.env.local`,
гитигнорен). Каталог тенанта `cherkashino` — реальный снапшот Черкашиной, импортирован фазами
`tenant,categories,products` скриптом `cherkashina-migration/import.mjs` (данные не трогались, только
чтение снапшота с ветки `feat/cherkashina-tenant`).

Backend не трогал файлы (не писал в `apps/backend` после старта `medusa develop`, чтобы не ловить его
watcher, правило 5d).

## Что НЕ сделано

- Живой прогон для варианта **g** — нужен `product_collection`, у тестового тенанта их нет (только
  категории), а tenant API отдаёт `collections` только на чтение. Правильность подтверждена по коду
  (`imageUrl || product.thumbnail`, идентичная логика уже покрыта живым прогоном для k/l через тот же
  паттерн).
- Мобильный breakpoint для hero не проверялся отдельно — задача просила проверить именно чипы каталога
  на 390px (сделано), про hero на mobile акцептанс не просил отдельного скриншота.

## Файлы

- `apps/storefront/src/lib/util/option-filter-groups.ts` — группировка по названию
- `apps/storefront/src/lib/util/option-filter-groups.test.ts` — юнит-тест на мердж по title
- `apps/tenant-panel/src/routes/home-settings/composition.ts` — реестр `HERO_SUPPORTS_IMAGE`
- `apps/tenant-panel/src/routes/home-settings/home-settings.tsx` — условный рендер поля картинки
- `artifacts/docs/t07-catalog-filters-hero/*.png` — скриншоты до/после (6 файлов)

## Как приёмщику проверить за 10 минут

1. `cd apps/storefront && npx vitest run src/lib/util/option-filter-groups.test.ts` — зелёный, видно тест
   на мердж по title.
2. Открыть любой из PNG в `artifacts/docs/t07-catalog-filters-hero/` — до/после видно на глаз (29 чипов →
   5, повтор названий в мобильном листе → по одному).
3. `apps/tenant-panel/src/routes/home-settings/composition.ts:170` — таблица `HERO_SUPPORTS_IMAGE`,
   сверить с `apps/storefront/src/modules/home/variants/*.tsx` (grep `imageUrl`) — совпадает 1:1.
