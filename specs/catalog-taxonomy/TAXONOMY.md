# Справочники: сферы торговли и торговые категории

**Статус:** спека трека «абстрактные наборы данных», задача `t-2026-09-12-catalog-taxonomy`,
2026-09-12. Термины — по `GLOSSARY.md` (канон Ивана). Оба справочника **необязательны**: магазин без
сферы торговли получает абстрактный набор данных (`ABSTRACT-DATASETS.md`).

## 1. Источник — один, назван

**Google Product Taxonomy, версия 2021-09-21**, файлы с числовыми id на двух языках:

- `https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt`
- `https://www.google.com/basepages/producttype/taxonomy-with-ids.ru-RU.txt`

Скачаны 2026-09-12 в `~/upready/research/raw/2026-09-12-google-product-taxonomy/` (по 5596 строк,
версия в заголовке файла), запись `r-2026-09-12-google-product-taxonomy` в `~/upready/research/registry.jsonl`.

**Почему он, а не GS1 GPC и не ОКПД2.**

| Кандидат | Что это | Почему нет |
|---|---|---|
| Google Product Taxonomy | розничный рубрикатор товарных фидов (Merchant Center, Shopify, Meta) | **выбран**: уровень 1 = масштаб «сферы торговли», уровень 2 = «торговой категории»; официальная русская локализация; стабильные числовые id; продавец его уже знает |
| GS1 GPC | четыре уровня Segment / Family / Class / Brick для цепочек поставок | выдача по регистрации (XLSX/JSON), ориентация на логистику и B2B, нет розничной русской локализации в открытом файле |
| ОКПД2 | статистический классификатор продукции по видам экономической деятельности | классифицирует ПРОИЗВОДСТВО, а не розницу; только RU; уровни не ложатся на «сферу / категорию» магазина |

## 2. Правило уреза — код, не ручной список

`apps/backend/scripts/catalog-taxonomy/build.mjs` читает сырой файл и пишет три JSON и один TSV.
Урез — две таблицы в коде с причиной на каждую строку; `--check` ловит дрейф между кодом и файлами.

**Сфера торговли** (уровень 1) остаётся, если небольшой магазин физических товаров для конечного
покупателя может работать в ней на нашей витрине как она есть сегодня. Оставлено **14 из 21**,
отброшено 7, у каждой названа недостающая возможность: Business & Industrial (B2B — это другая ось,
«сфера деятельности»), Hardware, Mature (нет возрастного гейта), Media (ISBN, цифровая доставка),
Religious & Ceremonial, Software (лицензии), Vehicles & Parts (нет полей подбора по авто).

**Торговая категория** (уровень 2 под оставленными сферами) остаётся, если это розница физических
товаров без регуляторных ограничений. Оставлено **116 из 135**, исключено 19 (Live Animals, Event
Tickets, Tobacco Products, промышленная электроника, охранное и печное оборудование, бассейны).
Остальные узлы уровня 2 взяты дословно, без ручной правки имён.

Файлы:

| Файл | Схема | Содержимое |
|---|---|---|
| `trade-spheres.json` | `upready.trade-spheres/v0` | 14 сфер: `slug`, `gptId`, `name.en`, `name.ru`; блок `dropped` с причинами |
| `trade-categories.json` | `upready.trade-categories/v0` | 116 категорий: `slug`, `gptId`, `sphere`, `name.en`, `name.ru`; блок `excluded` |
| `products-mapping.json` / `.tsv` | `upready.products-taxonomy-mapping/v0` | разметка 67 товаров, сводка по наборам, `uncovered`, `crossSphere` |

`slug` выводится из английского имени (`Apparel & Accessories` → `apparel-and-accessories`) и
уникален в своём справочнике. `gptId` — ключ для сверки с будущими выпусками таксономии.

## 3. Модель — обе книги необязательны

По GLOSSARY.md: профиль магазина МОЖЕТ нести сферу торговли и торговые категории, а может и не нести.
Поля (для следующей волны — шаг мастера и админка, здесь не реализуются):

```
tradeSphere:      string | null   // slug из trade-spheres.json, null = не указана
tradeCategories:  string[]        // slug'и из trade-categories.json той же сферы, [] = не указаны
```

Инварианты: `tradeCategories` непусто ⇒ `tradeSphere` указана и каждая категория лежит под ней;
пустая сфера ⇒ магазин наполняется абстрактным набором по теме. Категории товаров магазина
(его собственные разделы) с этими полями не связаны (GLOSSARY.md, правило 4).

## 4. Разметка 67 товаров пяти существующих наборов

Правило разметки: каждому товару назначен **лист** Google-таксономии (по категории набора, а где
категория набора смешивает узлы — по handle), сфера и торговая категория читаются с пути листа.
Лист — свидетельство, его id и путь записаны рядом с каждым товаром.

| Набор | Сфера торговли | Торговые категории | Товаров | Вне сферы набора |
|---|---|---|---|---|
| electronics | electronics | audio, electronics-accessories | 14 | 0 |
| home-goods | home-and-garden | decor, kitchen-and-dining, linens-and-bedding | 12 | 0 |
| sneakers | apparel-and-accessories | shoe-accessories, shoes | 14 | 1 |
| supplements | health-and-beauty | health-care | 15 | 0 |
| womens-fashion | apparel-and-accessories | clothing, clothing-accessories | 12 | 0 |

**Непокрытых товаров нет: 67 из 67** лежат в оставленных сферах и категориях.

**Кросс-сферный — один, назван поимённо:** `sneakers / care-kit` («Care kit · three piece», средства
ухода за обувью). Google кладёт уход за обувью в `Home & Garden > Household Supplies > Shoe Care &
Tools` (id 628), а не в Apparel. Товар размечен честно в чужой сфере и помечен `crossSphere: true`;
торговые категории набора sneakers его сферу не расширяют.

Заметки, которые не видны по имени категории набора:

- `home-goods / kitchen-textiles` — три товара разошлись по двум торговым категориям: фартук →
  Kitchen & Dining (id 639), вафельные полотенца и раннер → Linens & Bedding (4257, 6325).
- `home-goods / storage-and-light` — канистра → Kitchen & Dining > Food Storage (2626), подсвечник и
  рейка с крючками → Decor (2784, 5708).
- `womens-fashion` — шарф и платок → Clothing Accessories > Scarves & Shawls (177), кардиган и
  джемпер → Clothing > Shirts & Tops (212): у Google нет отдельного узла «трикотаж».
- `sneakers / care-and-spares` — шнурки → Shoe Accessories > Shoelaces (1856), набор ухода — см. выше.

## 5. Как пересобрать

```bash
cd apps/backend
node scripts/catalog-taxonomy/build.mjs          # пишет четыре файла в specs/catalog-taxonomy/
node scripts/catalog-taxonomy/build.mjs --check  # ненулевой код при дрейфе
```

Новый выпуск таксономии: положить оба файла в новый каталог `research/raw/<дата>-google-product-taxonomy/`,
поменять `RAW_DIR` и `SOURCE.version` в скрипте, пересобрать, прочитать diff.
