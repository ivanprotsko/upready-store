# f16-category-image-not-shown — картинка категории видна там, где витрина эту категорию выводит

_Отчёт написан 2026-09-15 17:08 WITA_

Ветка `fix/day16-category-image-not-shown`, база `dev`.

## Коротко

Панель писала правильное поле — витрина его почти нигде не читала. Теперь одна загруженная
картинка видна на трёх поверхностях сразу: на странице самой категории, плиткой в каталоге и
плиткой на главной. Порог «минимум три картинки» на главной снят. В панели владелица видит,
что именно сохранилось: превью в форме и колонка «Изображение» в списке категорий.

## 1. Доходит ли `image_url` из панели в данные витрины — да

Первый вопрос задачи. Ответ измерен на живом магазине (чтение, ничего не менял):

```
$ curl -s -H "x-publishable-api-key: pk_8198573d6…" \
    "https://shipshift.dev/store/tenant/product-categories?fields=handle,name,+metadata&limit=100"
count 9
asd-cherkashino | {"image_alt":null,"image_url":null,"source_id":"pcat_01KRT1MD7QGX7MFR2CCK2BETT5",
                   "migrated_from":"chrxnasdmds","source_handle":"asd"}
```

Ключи `image_url`/`image_alt` стоят ровно там, где их пишет форма панели
(`edit-category-form.tsx:138-142` → `metadata.image_url`), и приходят в тот самый ответ, из которого
витрина строит страницы (`lib/data/categories.ts` запрашивает `+metadata`). Значения `null` — потому
что приёмка q02 после своей проверки картинку убрала; поле живо, дефект не в записи.

То же самое, но на локальном стенде и с непустым значением — см. §4, шаг «панель → витрина».

## 2. Что было сломано на самом деле

Читателя поля было ровно полтора:

| Поверхность | До |
|---|---|
| Главная, блок плиток | читала `metadata.image_url`, но отдавала собственные плитки **только при `own.length >= 3`**, иначе откатывалась к списку из профиля сборки — то есть одна картинка не показывалась нигде и ничего об этом не сообщалось (`app/[locale]/(main)/page.tsx`, `tilesForThisShop`) |
| Каталог `/ru/store` | категории выводились только текстовым списком в сайдбаре — картинку не читал никто |
| Страница категории | рисовала плитки **дочерних** категорий (`CategoryChildTiles`), а картинку самой открытой категории — нет. У «АСД» детей нет, поэтому пусто |

## 3. Что изменено

Витрина:

- `apps/storefront/src/lib/util/category-image.ts` — **новый**. Один читатель поля на все поверхности:
  `categoryImage()` (url + alt, с нормализацией пустой строки в `null`) и `categoriesWithImages()`
  (кто попадает в блок плиток, в каком порядке, сколько). Правило «листья, если хоть у одного листа
  есть картинка, иначе всё, у чего она есть» сохраняет вид стартовых каталогов
  (`migration-scripts/data/abstract-datasets.ts` ставит `image_url` и корням, и листьям) и при этом
  не оставляет плоский магазин без плиток.
- `apps/storefront/src/lib/util/category-image.test.ts` — **новый**, 8 юнит-тестов на обе функции.
- `apps/storefront/src/app/[locale]/(main)/page.tsx` — порог `own.length >= 3` заменён на
  `own.length`; отбор и порядок отданы общему `categoriesWithImages`.
- `apps/storefront/src/modules/categories/components/category-header-image/` — **новый** компонент:
  картинка самой категории рядом с её заголовком (4:5, 64 px на телефоне, 96 px от `small`). Нет
  картинки — нет и элемента.
- `apps/storefront/src/modules/categories/components/category-child-tiles/` →
  `category-image-tiles/` — переименован, потому что теперь у него два места вызова, и второе — не
  дети. Добавлен режим `dense` (6 колонок вместо 3) для полосы в каталоге: одна плитка в каталоге не
  должна занимать треть страницы. `data-testid` стали `category-image-tiles` / `category-image-tile`.
- `apps/storefront/src/modules/categories/templates/index.tsx` — картинка категории в шапке.
- `apps/storefront/src/modules/store/templates/index.tsx` — полоса плиток над каталогом, максимум 12
  (`CATALOG_TILE_LIMIT`); магазин без картинок не получает ничего (компонент отдаёт `null`).

Панель:

- `apps/tenant-panel/src/routes/categories/category-edit/…/edit-category-form.tsx` — превью картинки
  рядом с полем адреса; подсказка теперь называет места: «Показывается на странице самой категории,
  плиткой в каталоге и на главной».
- `apps/tenant-panel/src/routes/categories/category-list/…/use-category-table-columns.tsx` — колонка
  «Изображение»: миниатюра или «нет».
- `…/category-list-table.tsx` — в оба запроса списка добавлено `metadata`
  (и `category_children.metadata` для дерева), иначе колонке нечего читать.
- `apps/tenant-panel/src/i18n/translations/{ru,en}.json` — новый текст подсказки и ключ
  `categories.fields.image.none`. В панели два словаря, оба обновлены.

Бэкенд не тронут: поле, запись и загрузка файла работали и до этого.

## 4. Как измерено (стенд)

Стенд поднят из снимка магазина Черкашиной, потому что на живой хост эта задача не деплоится:

- БД — клон `upready_store_cherkashina` → `upready_store_f16` (localhost:5433), 9 категорий тенанта
  `cherkashino`, миграции накатаны (`npx medusa db:migrate`, rc=0);
- бэкенд `npx medusa develop` на :9046 («Server is ready on port: 9046»);
- витрина `npx next dev -p 8046`, тенант резолвится по Host: `http://cherkashino.localhost:8046`
  (`GET /storefront/by-host?host=cherkashino.localhost` → `{"handle":"cherkashino", …}`);
- панель `npx vite --port 5196`, вход владелицей `owner-cherkashino@example.test`
  (пароль выставлен локальным скриптом только на этом клоне).

### 4.1 До и после, одним и тем же скриптом

Скрипт считает в отрендеренном DOM ссылки на категории и картинки внутри них.

| Страница | ссылок категорий | из них с `<img>` — ДО | из них с `<img>` — ПОСЛЕ | картинка в шапке — ПОСЛЕ |
|---|---|---|---|---|
| `/ru` | 13 → 14 | **0** | **1** | — |
| `/ru/store` | 22 → 23 | **0** | **1** | — |
| `/ru/categories/asd-cherkashino` | 22 | **0** | 0 (плиток детей нет) | **1** |

Замеры сняты на 1280×900 и 390×844 — цифры одинаковые на обоих вьюпортах.
«ДО» — на коде `4c8f30f` с той же картинкой в БД, то есть дефект воспроизведён, а не описан.

`img src` картинки на каждой странице (одна и та же загрузка, разные размеры `next/image`):

```
/ru                              …/_next/image?url=…/static/tenants/ten_01M29Q4…/1789462339529-f16-asd-photo.png&w=384&q=60
/ru/store                        …/_next/image?url=…/static/tenants/ten_01M29Q4…/1789462339529-f16-asd-photo.png&w=256&q=60
/ru/categories/asd-cherkashino   …/_next/image?url=…/static/tenants/ten_01M29Q4…/1789462339529-f16-asd-photo.png&w=96&q=60
```

### 4.2 Полный круг «панель → витрина», в браузере, без обходных HTTP-вызовов

Один Playwright-прогон: вход в панель, форма категории, кнопка «Загрузить», «Сохранить», затем
чтение витрины.

```
--- step 1: the picture the owner already saved
with picture: category=1 store=1 home=1
--- step 2: clear the address in the panel and save
after clearing: category=0 store=0 home=0
--- step 3: upload a file through the panel's Upload button and save
panel field after Upload: http://localhost:9046/static/tenants/ten_01M29Q4…/1789463110124-f16-asd-round-trip.png
after uploading: category=1 store=1 home=1
    category: …1789463110124-f16-asd-round-trip.png&w=96&q=60
    store:    …1789463110124-f16-asd-round-trip.png&w=256&q=60
    home:     …1789463110124-f16-asd-round-trip.png&w=384&q=60
ROUND TRIP OK: all three pages carry the newly uploaded file
```

То есть: загрузила одну картинку — видно на трёх страницах; очистила адрес — исчезла со всех трёх.
Ревалидация витрины после сохранения проходит сама, руками ничего не дёргалось.

### 4.3 Панель

```
list: headers=["Название","Идентификатор","Изображение","Статус","Видимость",""] rows=9 rowsWithImg=1
form.imageUrl = http://localhost:9046/static/tenants/ten_01M29Q4…/1789462339529-f16-asd-photo.png
form.preview  = http://localhost:9046/static/tenants/ten_01M29Q4…/1789462339529-f16-asd-photo.png
form.hint     = Показывается на странице самой категории, плиткой в каталоге и на главной.
                Очистите адрес, чтобы убрать картинку.
```

### 4.4 Магазин, где картинок не загружали, выглядит как раньше

```
$ node neighbour.mjs http://acme.localhost:8046
home   http=200 catalogStrip=0 profileHomeTiles=0 headerImg=0
store  http=200 catalogStrip=0 profileHomeTiles=0 headerImg=0
```

Полоса в каталоге и картинка в шапке появляются только там, где есть что показывать.

### 4.5 Скриншоты

Все — вьюпорты 1280×900 и 390×844, каталог витрины `cherkashino`, PNG вне git:

```
/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-category-image-not-shown/artifacts/docs/f16-category-image-not-shown/before-home-1280x900.png            /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-category-image-not-shown/artifacts/docs/f16-category-image-not-shown/after-home-1280x900.png
/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-category-image-not-shown/artifacts/docs/f16-category-image-not-shown/before-home-390x844.png             /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-category-image-not-shown/artifacts/docs/f16-category-image-not-shown/after-home-390x844.png
/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-category-image-not-shown/artifacts/docs/f16-category-image-not-shown/before-store-1280x900.png           /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-category-image-not-shown/artifacts/docs/f16-category-image-not-shown/after-store-1280x900.png
/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-category-image-not-shown/artifacts/docs/f16-category-image-not-shown/before-store-390x844.png            /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-category-image-not-shown/artifacts/docs/f16-category-image-not-shown/after-store-390x844.png
/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-category-image-not-shown/artifacts/docs/f16-category-image-not-shown/before-category-asd-1280x900.png    /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-category-image-not-shown/artifacts/docs/f16-category-image-not-shown/after-category-asd-1280x900.png
/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-category-image-not-shown/artifacts/docs/f16-category-image-not-shown/before-category-asd-390x844.png     /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-category-image-not-shown/artifacts/docs/f16-category-image-not-shown/after-category-asd-390x844.png
/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-category-image-not-shown/artifacts/docs/f16-category-image-not-shown/after-panel-category-list-1280x900.png     — колонка «Изображение», 1 из 9 строк с миниатюрой
/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-category-image-not-shown/artifacts/docs/f16-category-image-not-shown/after-panel-category-edit-1280x900.png     — превью в форме и новая подсказка
/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-category-image-not-shown/artifacts/docs/f16-category-image-not-shown/after-panel-upload-1280x900.png            — форма сразу после «Загрузить»
/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-category-image-not-shown/artifacts/docs/f16-category-image-not-shown/roundtrip-{category,store,home}-1280x900.png — после круга из §4.2
```

Скриншоты просмотрены глазами, не только сняты. Серые прямоугольники на месте фотографий ТОВАРОВ —
свойство стенда, а не изменения: в снимке БД у товаров записан абсолютный адрес с портом
`localhost:9033` (стенд, которого уже нет), и самих файлов в этом worktree нет. Картинка КАТЕГОРИИ —
единственная, которая на стенде действительно загружается, и она везде видна.

## 5. Проверки

| Проверка | Команда | Результат |
|---|---|---|
| Типы витрины | `cd apps/storefront && npx tsc --noEmit` | rc=0 |
| Линт витрины | `cd apps/storefront && npx next lint` | rc=0 (единственный warning — в `yandex-metrica`, был до этого) |
| Юниты витрины | `cd apps/storefront && npm run -s test` | Test Files 20 passed, Tests **195 passed** |
| Сборка витрины | `cd apps/storefront && NEXT_DIST_DIR=.next-f16 npx next build` | `✓ Compiled successfully in 7.4s`, сборка прошла целиком (типы и линт — часть сборки) |
| Типы панели | `cd apps/tenant-panel && npx tsc --noEmit` | rc=0 |
| Линт панели | `cd apps/tenant-panel && npx eslint src` | rc=0, 0 errors (24 warning — все предсуществующие) |

Сборка гонялась в отдельный `NEXT_DIST_DIR`, чтобы не перезаписать `.next` под живым `next dev`,
на котором снимались замеры.

## 6. Что НЕ сделано и почему

- **Деплой не делался** — задача его не предписывает, правило 21c. На живом магазине изменение
  появится после слияния и ближайшей выкладки.
- **Живой магазин не трогался.** Уборка, которую просила задача («вернуть категории исходное
  состояние, у «АСД» картинки не было»), уже не нужна: измерено выше — на
  `cherkashino.shipshift.dev` у `asd-cherkashino` сейчас `image_url: null`, приёмка q02 убрала за
  собой. Ничего не писал ни в прод-БД, ни в файлы хоста.
- **Счётчика «у скольких категорий уже есть картинка» в панели нет** — он был нужен как объяснение
  порога, а порог снят. Вместо счётчика колонка «Изображение» отвечает на вопрос, который владелица
  задаёт на самом деле: «моя загрузка сохранилась?». Строка «нет» стоит в каждой категории без
  картинки, так что пересчитать их глазами — секунда.
- **Заголовка над полосой плиток в каталоге нет.** Живой текст на витрине требует ключа во всех 36
  словарях `next-intl` (AGENTS.md, «Localization»), а полоса читается и без него — ровно по той же
  причине, по которой его нет у плиток детей на странице категории (комментарий там стоял до меня).
- **Дерево категорий в панели** (родитель + дети) на этом тенанте плоское, поэтому колонка
  «Изображение» у ВЛОЖЕННЫХ строк проверена только тем, что `category_children.metadata` бэкенд
  принимает и отдаёт. У Оксаны вложенных категорий нет.

## 7. Как приёмщику проверить за 10 минут

1. Поднять стенд: БД-клон магазина Черкашиной, `medusa develop`, `next dev`, панель (адреса и
   команды — §4; в отчёте указаны порты 9046/8046/5196).
2. Панель → Категории. Колонка **«Изображение»**: у всех «нет».
3. Открыть любую категорию → «…» → «Редактировать» → «Загрузить», выбрать любой PNG → «Сохранить».
   Под полем должна стоять подсказка про три места, слева от поля — превью загруженного.
4. Список категорий: у этой строки вместо «нет» миниатюра.
5. Витрина `http://<handle>.localhost:8046`:
   - `/ru/categories/<handle>` — картинка слева от заголовка;
   - `/ru/store` — плитка над списком товаров;
   - `/ru` — плитка в блоке «Категории».
   Ровно одна загруженная картинка, никаких «минимум трёх».
6. Очистить адрес в форме и сохранить — картинка уходит со всех трёх страниц.
