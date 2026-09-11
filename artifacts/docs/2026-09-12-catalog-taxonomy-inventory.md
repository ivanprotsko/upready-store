# Каталог и таксономия: что уже есть в коде (замер 2026-09-12)

Задача `t-2026-09-12-catalog-taxonomy`. Ветка `feat/catalog-taxonomy`, база — `fix/mt-tenant-tls-wildcard`
(на `dev` мастера онбординга нет: `apps/storefront/src/app/start/onboarding/wizard.tsx` живёт только на
линии MT — проверено `git ls-tree` по всем веткам, нашлись `feat/mt-deploy` и `fix/mt-tenant-tls-wildcard`).

## 1. Что такое профиль магазина сегодня

`STORE_PROFILE=<id>` (`apps/backend/src/migration-scripts/data/store-profile.ts`) подменяет НЕ каталог,
а весь облик магазина. В `profile.json` каждого профиля лежат: бренд (имя, слоган, wordmark, юрлицо),
персона покупателя, локали, валюта, ТЕМА (`theme.presetId` + шрифты + радиус + режим по умолчанию),
раскладка карточек, копирайт главной (hero-заголовок, подзаголовок, CTA, промо-строка), плитки категорий,
каталог, медиа, style board, пункты самовывоза.

| профиль | `vertical` (свободный текст) | бренд | `theme.presetId` |
|---|---|---|---|
| electronics | audio and gadgets | Ferrite | electronics |
| home-goods | kitchen and home goods | Long Morning | home-goods |
| sneakers | streetwear sneakers | Kerbstone | sneakers |
| supplements | vitamins and supplements | Scruple | supplements |
| womens-fashion | women's clothing | Larchant | womens-fashion |

`vertical` в схеме (`specs/store-profiles/store-profile.schema.json`) — `string`, 3–80 знаков,
«What the store sells, plain language». Это описание, а не справочник: справочника товарных категорий
в коде НЕТ ни одного.

## 2. Категории внутри профилей — ровно два уровня

10 корневых, 24 дочерних, 67 товаров.

| профиль | корневые | дочерние |
|---|---|---|
| electronics | audio, power-and-parts | headphones, earbuds, speakers, power-banks, cables-and-chargers |
| home-goods | the-kitchen, the-house | cookware, tableware, kitchen-textiles, storage-and-light |
| sneakers | footwear, accessories | low-tops, high-tops, runners, trail, care-and-spares |
| supplements | daily-foundations, targeted-support | multivitamins, vitamins-and-minerals, sleep-and-calm, joints-and-mobility, gut-health |
| womens-fashion | clothing, outerwear | dresses, knitwear, shirts-and-blouses, trousers-and-skirts, coats-and-jackets |

Товары привязаны к ДОЧЕРНЕЙ категории (поле `category` в `catalog/products.json`), полный список
товаров с их категориями — `2026-09-12-catalog-taxonomy-inventory-products.tsv` рядом.

## 3. Где профиль уже виден на онбординге

Мастер (`start/onboarding/wizard.tsx`, три шага: Магазин → Доступ → Оформление) на третьем шаге
показывает `THEME_IDS` = `electronics, geist, home-goods, medusa, sneakers, supplements, womens-fashion`,
подписанные ИМЕНАМИ БРЕНДОВ (`THEME_LABELS`: Ferrite, Long Morning, Kerbstone, Scruple, Larchant).
То есть пять id профилей уже выбираются в мастере — но как ОФОРМЛЕНИЕ, не как ассортимент.

Созданный магазин пуст: `POST /api/demo/onboarding` делает register → `POST /tenants` → login →
`PUT /tenants/home` (тема + пустой hero). Каталог не засевается вовсе; экран завершения сам говорит
владельцу «Каталог пустой — это новый магазин».

Тенанты каталог профиля получают только в демо-сценарии `apps/backend/src/scripts/seed-mt-demo.ts`,
где тройка acme/globex/initech жёстко прибита к профилям sneakers/home-goods/electronics.

## 4. Развилка (вынесена Ивану до работы)

Из кода однозначно не следует, как «товарная категория» ложится на профиль:

- профиль ШИРЕ по составу — он несёт бренд, тему и копирайт, а не только ассортимент;
- профиль УЖЕ по охвату — «Обувь» у Ивана это один корень `footwear`, а профиль `sneakers`
  держит ещё и `accessories`, и всё это под конкретным брендом Kerbstone;
- «одну или несколько» товарных категорий на онбординге профилем не выражается: два профиля
  в одном магазине означают два бренда и две темы.

Вопрос и варианты — в чате Ивану 2026-09-12; до ответа таксономия не пишется.
