# b18-blog-full — полноценный блог («Журнал») для тенантов

Ветка `feat/day16-blog-full`, worktree `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-blog-full`.
Отчёт составлен 2026-09-16 09:37 WITA.

## Приказ Ивана (2026-09-16 08:31 WITA, дословно)

> «https://panel-store.upready.dev/journal - тут странный функционал с указанием адреса статей,
> с отсутствием страниц на которые бы можно было бы добавить сами статьи.
> Нужно сделать полноценный функционал блога.»

## Этап 0 — диагноз живой панели (замер, не догадка)

Полностью: `artifacts/docs/b18-blog-full/diagnosis.md`, скриншоты `before/`, сырой DOM `before/diagnosis-dom.json`.

| Что проверял | Команда / способ | Результат |
|---|---|---|
| Сколько статей у тенанта на живой панели | вход владельцем в https://panel-store.upready.dev, перехват ответа | `GET /tenants/articles → 200 {"articles":[],"count":0}` |
| Что показывает экран при нуле статей | DOM `/journal` | таблица + полоса создания, поля: **«Адрес статьи»**, «Язык», «Заголовок» |
| Гипотеза «на хосте старый билд без редактора» | скачал index.html и все **234** чанка живой панели (2 845 823 байта), искал строки редактора | **отвергнута**: «Текст на языке», «Обложка», «SEO-заголовок», «выделенная врезка» стоят в `/assets/index-DhW3xYc-.js` |

**Диагноз.** Дефект не в деплое, а в устройстве экрана: единственный вход в журнал —
форма, которая первым делом требует придумать URL (латиница, цифры, дефисы), а редактор
живёт дочерним маршрутом `/journal/:slug` и при нуле статей недостижим вовсе. Плюс у журнала
не было того, что делает его блогом: превью markdown, картинок внутри текста, статусов кроме
«опубликована/нет», рубрик, фильтров и поиска, а на витрине — рубрик, времени чтения,
похожих статей, шаринга и хлебных крошек.

## Что сделано

### Панель (`apps/tenant-panel`)
- **Экран «Новая статья»** (`routes/journal/article-new/`, маршрут `/journal/new`): первое поле — заголовок,
  адрес генерируется из него транслитерацией и остаётся редактируемым. Одно сохранение пишет статью целиком.
- **Общие поля** (`routes/journal/components/article-fields.tsx`) — один компонент на «Новую статью»
  и на редактирование, чтобы экраны не разъехались: заголовок, текст, статус, дата/время выхода,
  краткое описание, обложка, рубрика (с подсказками из своих же статей), автор, метки, адрес, SEO.
- **Редактор текста** (`components/markdown-editor.tsx`): панель кнопок (заголовок, жирный, курсив,
  список, врезка, ссылка, **картинка в текст**) и **живое превью рядом с полем**. Превью читает текст
  ТЕМ ЖЕ парсером, что и витрина (`src/lib/markdown.ts`, байт-в-байт копия storefront-овского,
  прибита проверкой `pnpm check:shared-markdown`).
- **Список**: кнопка «Новая статья» вместо полосы полей, фильтр по статусу, фильтр по рубрике,
  поиск по заголовку/адресу/рубрике/меткам, колонка «Статус» и «Рубрика», действие «Открыть на сайте».
- Переименование адреса из формы; удаление с подтверждением (было).

### Бэкенд (`apps/backend`)
- Модель `tenant_article`: `status` (`draft|published|scheduled`) **вместо** булева `published`,
  плюс `category` и `author`. Миграция `Migration20260916090000.ts` — **add → backfill → drop**
  (генератор выдал drop ПЕРЕД add, что превратило бы все опубликованные статьи на всех стендах в черновики).
- Видимость решается в ОДНОМ месте, `isArticleVisible` — запланированная статья становится публичной
  сама в свою минуту, без крона и без второго поля, которое пришлось бы синхронизировать.
- `POST /tenants/articles` принимает статью целиком (раньше создавал пустую строку).
  `PUT /tenants/articles/:slug` умеет `status`, `category`, `author` и **переименование адреса**
  (двигает все языковые строки статьи сразу). Булев `published` принимается как deprecated-алиас —
  живой бандл панели продолжит сохранять в момент обновления бэкенда.
- Новые чтения: `GET /tenants/article-categories` (весь словарь владелицы) и
  `GET /store/tenant/article-categories` (только публичные рубрики).
- `GET /store/tenant/articles?category=` — фильтр ленты; `GET /store/tenant/articles/:slug` отдаёт
  `related` (до трёх, сначала своя рубрика, никогда сама статья и никогда черновик).
- `reading_minutes` считается на бэкенде, чтобы лента, страница и панель показывали одно число.

### Витрина (`apps/storefront`)
- Markdown научился **картинкам** (`![подпись](url)`) — до этого весь токен рендерился текстом,
  вместе с восклицательным знаком. Источник картинки уже́ href-а: только http(s) и путь от корня.
- Лента: чипсы рубрик, время чтения и рубрика на карточке, рубрика сохраняется при перелистывании.
- Страница статьи: хлебные крошки (Главная / Журнал / Рубрика), время чтения, автор, шаринг
  (нативный share, копирование ссылки, Telegram/WhatsApp/VK), блок «Читайте также»,
  `og:type=article` + `article:author`/`article:section`/`article:tag`, JSON-LD с автором-`Person`.
- Новые строки интерфейса добавлены во **все 36** каталогов `messages/` скриптом.

## Как это измерено (правило 18f — живой стенд, не «должно работать»)

Стенд: БД `upready_store_b18` (копия `upready_store_cherkashina`, нативный Postgres 127.0.0.1:5433),
бэкенд `medusa develop` :9118, панель `vite` :5118, витрина `next dev` :8118 (без `--turbopack` —
он падает на этом репозитории), тенант `cherkashino`, витрина `http://cherkashino.localhost:8118`.

### Проверки кода

| Проверка | Команда | Результат |
|---|---|---|
| Типы бэкенда | `cd apps/backend && npx tsc --noEmit` | rc=0 |
| Линт бэкенда | `cd apps/backend && npx medusa lint` | rc=0, `✖ 87 problems (0 errors, 87 warnings)` — предсуществующие |
| Сборка бэкенда как в образе | `pnpm check:backend-build` | rc=0, `Backend build completed successfully (9.93s)` |
| Типы витрины | `cd apps/storefront && npx tsc --noEmit` | rc=0 |
| Линт витрины | `cd apps/storefront && npx next lint` | rc=0 (одно warning `no-img-element` — ровно как у `yandex-metrica`, next/image не годится для хоста арендатора вне allowlist) |
| Сборка витрины | `cd apps/storefront && npx next build` | rc=0, `✓ Compiled successfully`, `✓ Generating static pages (18/18)` |
| Типы панели | `cd apps/tenant-panel && npx tsc --noEmit` | rc=0 |
| Линт панели | `cd apps/tenant-panel && npx eslint src/routes/journal src/hooks/api/articles.tsx src/lib/markdown.ts` | rc=0 |
| Сборка панели | `cd apps/tenant-panel && npx vite build` | rc=0, `✓ built in 5.83s` |
| Две копии парсера markdown совпадают | `node scripts/check-shared-markdown.mjs` | `OK … (350 lines, identical)`, rc=0 |
| Юнит-тесты парсера | `cd apps/storefront && npx vitest run src/lib/util/markdown.test.ts` | rc=0, `Tests 18 passed (18)` (5 новых — картинки) |

### Seam-тесты бэкенда

| Сюита | Команда | Результат |
|---|---|---|
| Новая (статусы, рубрики, переименование) | `DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9251 pnpm test:integration:http -- tenants-articles-status` | rc=0, `Tests: 11 passed, 11 total` |
| Старая t10 (регрессия) | `DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9252 pnpm test:integration:http -- tenants-articles.spec` | rc=0, `Tests: 10 passed, 10 total` |

### Миграция — прогон в обе стороны на стенде

Вставил три строки (`published`, `draft`, `scheduled` на послезавтра) → `npx medusa db:rollback tenant` →
булев вернулся `t / f / f` → `npx medusa db:migrate` → `published / draft / draft`.
То есть опубликованная статья переживает миграцию в обе стороны; статья, запланированная на БУДУЩЕЕ,
при откате становится черновиком (у булева нет третьего значения) — потеря в безопасную сторону,
публичным ничего не становится. Записано в шапке миграции.

### e2e: панель → витрина (27 проверок)

```
PANEL_URL=http://localhost:5118 SHOP_URL=http://cherkashino.localhost:8118 \
PANEL_EMAIL=owner-cherkashino@example.test PANEL_PASSWORD=… \
  node apps/storefront/e2e/journal.e2e.mjs
→ 27/27 проверок прошли, rc=0
```

Ключевые строки прогона (полный лог — `artifacts/docs/b18-blog-full/e2e-journal-results.json`):

```
PASS  editor-is-a-page: "http://localhost:5118/journal/new"
PASS  first-field-is-title: true
PASS  slug-derived-from-russian-title: "peptidy-e2e"
PASS  preview-renders-blocks: 7
PASS  inline-image-in-markdown: …![journal-inline](http://localhost:9118/static/tenants/ten_…/…png)
PASS  cover-uploaded: true
PASS  saved-and-left-the-form: "http://localhost:5118/journal/peptidy-e2e"
PASS  feed-shows-the-article: true
PASS  feed-hides-the-draft: false
PASS  no-broken-images: []
PASS  draft-address-is-404: 404
PASS  new-address-opens: 200
PASS  old-address-gone: 404
PASS  deleted-address-is-404: 404
```

### Ручная приёмка по критериям задачи

| Критерий | Замер | Скриншот |
|---|---|---|
| Статья с обложкой, заголовками, картинкой в тексте, списком и рубрикой создана в панели | `after-save-url: /journal/peptidy-havinsona-chto-eto-i-kak-rabotayut` | `shots/04-panel-editor-filled.png`, `shots/05-panel-after-save.png` |
| Живое превью рядом с полем | `preview-rendered-blocks: 8`, `preview-has-img: 1` | `shots/03-panel-editor-with-preview.png` |
| Опубликована → видна на `/ru/journal` | `feed-cards: 2`, `feed-reading-time-shown: true`, чипсы `["Здоровье","Новости"]` | `shots/10-shop-journal-1280x900.png` |
| …и на `/ru/journal/<slug>` с обложкой, датой, OG | `og-type: "article"`, `og-section: "Здоровье"`, `jsonld-author: "Оксана Черкашина"`, `article-broken-images: 0` | `shots/13-shop-article-1280x900.png`, `shots/14-shop-article-full-1280x900.png` |
| Черновик не виден | `draft-status: 404`, `feed-has-no-draft: false` | `shots/16-shop-draft-404.png` |
| Правка обновляет | `shop-title-updated: "Пептиды Хавинсона: разбор по шагам"` | `shots/20-panel-edit-existing.png` |
| Переименование адреса | `shop-new-address: 200`, `shop-old-address: 404` | `shots/21-panel-after-rename.png` |
| Удаление даёт 404 и убирает из списка | `rows 3 → 2`, `shop-deleted-404: 404`, лента `1` карточка | `shots/22-panel-delete-confirm.png`, `shots/24-shop-feed-after-delete.png` |
| Фильтры и поиск в панели | `rows-total: 3`, `rows-drafts-only: 1`, `rows-search-osennie: 1` | `shots/06…08` |
| Рубрика на витрине | `feed-filtered-cards: 1` по `?category=Здоровье` | `shots/11-shop-journal-category-1280x900.png` |
| Мобильный 390×844 | `feed-mobile-cards: 2`, заголовок статьи виден | `shots/12-shop-journal-390x844.png`, `shots/15-shop-article-390x844.png` |
| Карта сайта | `sitemap-has-article: true`, `sitemap-hides-draft: false` | — |

Скриншоты (PNG вне git, правило 21f) — абсолютные пути:
`/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-blog-full/artifacts/docs/b18-blog-full/shots/` и `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-blog-full/artifacts/docs/b18-blog-full/before/`.

### Что приёмка поймала и что было починено в этом же PR

1. **Адрес из русского заголовка не сохранялся.** `toSlugWhileTyping` дописывает хвостовой дефис,
   если последний символ исходной строки не `[a-z0-9]` — у русского заголовка это всегда так.
   Бэкенд такой slug отвергает. Первый прогон: три статьи созданы в UI, **сохранено ноль**, ни одной
   ошибки в логе. Лечение: автогенерация берёт `toSlug`, `toSlugWhileTyping` остался для ручного ввода
   в поле адреса. Приёмочный скрипт теперь **падает** на таком шаге, а не пишет ноль (правило 20a).
2. **После успешного сохранения панель спрашивала «есть несохранённые изменения».** Экран «Новая
   статья» уходил на статью через `navigate`, минуя `handleSuccess` модалки, и её сторож блокировал
   переход. Лечение: форма вынесена внутрь `RouteFocusModal`, переход — через `handleSuccess(path)`.
3. **Превью стояло под полем, а не рядом.** Панель использует стандартные брейкпоинты Tailwind
   (`sm/md/lg`), а не `small/medium/large` витрины — класс `large:grid-cols-2` не породил ни одной
   строки CSS. Проверено по собранному `dist/assets/*.css`. Лечение: `lg:grid-cols-2`.
4. **Ссылка на картинку вела на `localhost:9000`.** Это конфигурация стенда, не дефект продукта:
   `file-local` без `LOCAL_FILE_BACKEND_URL` отдаёт дефолт библиотеки. На стенде переменная выставлена;
   на живом хосте она уже стоит (`LOCAL_FILE_BACKEND_URL=https://shipshift.dev/static`).

## Что НЕ сделано и почему

- **Не задеплоено.** Задача деплой не предписывает (правило 21c). Живая панель и витрина продолжают
  работать на старом коде до отдельной задачи деплоя.
- **Миграция на живой базе не применялась.** Перед применением на `mt-postgres` обязателен
  `pg_dump` (памятка protected-infra `upready-store-mt-platform`):
  `docker exec mt-postgres pg_dump -U medusa -d medusa_mt | gzip > /opt/upready-store/backups/mt-medusa_mt-$(date +%Y%m%d-%H%M%S).sql.gz`.
  Миграция — `Migration20260916090000`, порядок add → backfill → drop, откат проверен.
- **Отложенная публикация без крона.** Сознательное решение: видимость вычисляется на чтении,
  поэтому запланированная статья появляется в свою минуту. Цена — фильтр по видимости идёт в коде,
  а не индексом по одному булеву столбцу; при десятках статей на тенанта это не важно, при тысячах
  надо будет вернуть материализованный флаг и джоб.
- **Переводы новых строк в 34 нерусских/неанглийских каталога сделаны мной, а не носителями.**
  7 коротких ключей (`readingTime`, `related`, `share`, `copyLink`, `linkCopied`, `allCategories`,
  `categories`). Стоит показать носителю перед тем, как включать соответствующую локаль клиенту.
- **18 статей клиента из chrxnasdmds не переносил** — это сделал t10 своим скриптом
  (`apps/backend/scripts/cherkashina-migration/import-articles.mjs`), он продолжает работать
  (deprecated-алиас `published` покрыт seam-тестом). На ЖИВОМ тенанте `cherkashino` статей ноль —
  скрипт там ещё не прогоняли; это отдельная задача, и она не про код.
- **Один язык на экране «Новая статья».** Вторая локаль добавляется на экране статьи (как было в t10).

## Как приёмщику проверить за 10 минут

```bash
cd /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-blog-full
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
createdb -h 127.0.0.1 -p 5433 -U ivanprotsko upready_store_b18check -T upready_store_cherkashina

# 1. бэкенд (в apps/backend/.env: DB_NAME/DATABASE_URL на …b18check, PORT=9118,
#    LOCAL_FILE_BACKEND_URL=http://localhost:9118/static)
cd apps/backend && npx medusa db:migrate && npx medusa develop &
npx medusa exec ./scripts/fixtures/w13-reset-owner-password.ts   # логин ниже

# 2. панель и витрина
cd ../tenant-panel && printf 'VITE_MEDUSA_BACKEND_URL=http://localhost:9118\n' > .env.local && npx vite --port 5118 &
cd ../storefront && npx next dev -p 8118 &          # без --turbopack

# 3. один прогон, 27 проверок
PANEL_URL=http://localhost:5118 SHOP_URL=http://cherkashino.localhost:8118 \
PANEL_EMAIL=owner-cherkashino@example.test PANEL_PASSWORD=w13-acceptance-scratch \
  node e2e/journal.e2e.mjs
```

Глазами: http://localhost:5118/journal → «Новая статья» → заголовок по-русски (адрес подставится сам),
текст с `##`, списком и `>`, кнопка «Картинка в текст», превью справа, статус «Опубликована» →
Сохранить → http://cherkashino.localhost:8118/ru/journal.

Логин стенда: `owner-cherkashino@example.test` / `w13-acceptance-scratch` (фикстура
`apps/backend/scripts/fixtures/w13-reset-owner-password.ts`, только для скрэтч-базы).

## Экономия

| Что | Решение | Замер |
|---|---|---|
| «Устарел ли живой билд панели» | не открывать 234 чанка глазами — **скрипт** `fetch-panel-bundle.mjs` качает бандл и ищет маркерные строки | 1 вызов, ~9 c, гипотеза отвергнута фактом, а не чтением |
| Диагноз живой панели | **скрипт** `live-panel-look.mjs`: вход, DOM, перехват API, скриншоты | этап 0 занял ~20 мин вместо часа переписки со скриншотами |
| 7 новых строк × 36 каталогов i18n | **скрипт** `add-journal-keys.mjs` с одной таблицей: ключи только добавляются, порядок существующих не трогается | 36/36 файлов, диф 288 вставок / 36 правок запятой; руками это 252 правки и гарантированный пропуск |
| Две копии парсера markdown (Dockerfile панели копирует только свою папку) | **проверка в коде** `scripts/check-shared-markdown.mjs` + `pnpm check:shared-markdown` вместо «не забыть» | rc=1 на любом расхождении, называет первую разошедшуюся строку |
| Приёмка UI | **Playwright-скрипт** в репозитории (`apps/storefront/e2e/journal.e2e.mjs`), а не ручной клик-тест | 27 проверок за один прогон; **поймал 3 реальных дефекта** (хвостовой дефис в адресе, диалог «несохранённые изменения», превью не рядом), которые раунд критика описал бы словами, а прогон показал числами |
| Фикстуры-картинки | генерируются в самом скрипте (zlib + CRC32, ~50 строк) | ноль бинарников в истории (правило 21f) |
| Сабагенты | **не звал ни одного** | задача связная, фан-аут дал бы склейку чужих контекстов дороже, чем стоит |

Что автоматизировал бы дальше: (1) хук/линт на классы брейкпоинтов — панель и витрина используют
РАЗНЫЕ наборы, и `large:` в панели молча не порождает CSS; (2) проверку, что каждый ключ
`messages/*.json` есть во всех 36 каталогах (сегодня это ловится только падением рендера).
