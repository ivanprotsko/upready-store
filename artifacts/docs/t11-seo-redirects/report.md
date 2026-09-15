# t11-seo-redirects — отчёт

2026-09-15 06:29 WITA. Стенд собран для приёмки на месте: своя БД
`upready_store_t11acc` (127.0.0.1:5433), backend `:9111`, storefront `:9111`→`:8111`,
тенанты `acme`/`globex`/`initech` (`seed-mt-demo.ts`) + новый `cherkashino` (10 товаров, 7
категорий пресета `supplements` через `POST /tenants/seed`). Стенд временный, локальный,
поднят и остановлен в рамках этой сессии; в прод не деплоилось (правило 21c).

## Что сделано (по шагам ТЗ)

1. **Мета-поля.** `metadata.seo.<locale>.{title,description}` на товаре/категории
   (нет отдельных таблиц у Medusa — использована собственная `metadata`, как и просил
   бриф); `tenant_page` получил колонки `seo_title`/`seo_description`
   (`Migration20260916050500`). Панель страниц (`edit-page-form.tsx`) показывает
   счётчик длины рядом с полем. Storefront (`products/[handle]/page.tsx`,
   `categories/[...category]/page.tsx`, `pages/[key]/page.tsx`) берёт мету из
   `metadata.seo`/`seo_title`/`seo_description`, иначе — старое поведение
   (заголовок/первое предложение).
2. **Слаг.** `POST /tenants/products/:id` и `POST /tenants/product-categories/:id`:
   смена `handle` пишет 301 на каждую включённую локаль тенанта
   (`redirect-helpers.ts` → `recordSlugRedirect`), коллизия хендла — `invalid_data` с
   сообщением (`assertHandleFree`), без молчаливого суффикса.
3. **Sitemap/robots.** `sitemap.ts` был дефектным по умолчанию: секция категорий шла
   через нативный `/store/product-categories`, который категории тенантом НЕ
   фильтрует (в Medusa у категорий нет привязки к sales channel) — двум тенантам это
   отдавало одни и те же 616+ категорий. Переключено на `/store/tenant/product-categories`
   (уже существовавший тенант-скоуп для панели). Добавлены собственные страницы тенанта
   через новый `/store/tenant/pages/sitemap`. `robots.txt` уже был на request-scoped
   `base`, не трогался.
4. **Таблица редиректов.** Модель `tenant_redirect` (`from_path`, `to_path`,
   `status_code`, уникальность на `tenant_id+from_path`), CRUD
   `/tenants/redirects[/​:id]` (панель), публичное чтение `/store/tenant/redirects`.
   `middleware.ts` матчит ДО локальной логики, точное совпадение пути (без
   нормализации локали — исходные URL источника несут двойной `/ru/ru/...`
   буквально). Цепочки редиректов разворачиваются до 20 хопов; цикл (`a→b`, `b→a`)
   отдаёт `508 Loop Detected`, не виснет.
5. **Импорт.** `apps/backend/src/scripts/import-cherkashino-redirects.ts` —
   `medusa exec`, идемпотентный, `dry-run`, читает `02-mapping-registry.json`
   реестра миграции 2026-09-12, берёт `pathname` из `source_url`/`target_url`
   буквально (двойной `/ru/ru/` не регэкспится, а читается как есть).
6. **Верификация поисковиков.** `tenant.metadata.seo_verification.{yandex,google}`,
   `PUT /tenants/seo-verification`, рендер через `Metadata.verification` Next.js в
   `[locale]/(main)/layout.tsx` (`<meta name="google-site-verification">` /
   `<meta name="yandex-verification">`).

## Проверки (команды и их результат)

### Чек-листы AGENTS.md

```
cd apps/backend && npx medusa lint && npx tsc --noEmit
```
→ `medusa lint`: 0 errors, 20 warnings (все — уже существовавший класс
`no-service-mutations-in-api-route`/`use-medusa-error-not-generic-error` на файлах,
включая новые `/tenants/redirects*`, `/tenants/seo-verification` — тот же стиль, что у
соседних `/tenants/pages`, `/tenants/domains`); `tsc --noEmit`: чисто.

```
cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build
```
→ все три — чисто, `next build` собрал все 43 маршрута без ошибок.

```
cd apps/tenant-panel && pnpm typecheck && pnpm lint
```
→ чисто (23 варнинга — все допанельные, `react-hooks/exhaustive-deps` на чужих файлах).

```
cd apps/backend && pnpm test:unit
```
→ 79/80 зелёных; один красный (`profile-data.unit.spec.ts`, i18n merge productOptions,
французская локаль) — **не связан с этой задачей**, воспроизводится на файле, которого
это PR не касается (данные seed-профилей); не чинил, не входит в scope t11.

### 1. Мета-поля

```
curl -sL "http://cherkashino.localhost:8111/en/products/pair-2-cherkashino" -o /tmp/p.html
grep -o '<title>.*</title>' /tmp/p.html
grep -o '<meta name="description"[^>]*>' /tmp/p.html
```
```
<title>Buy Pair No. 2 Grey Set — Cherkashino Shop | Оксана Черкашина</title>
<meta name="description" content="Hand-finished grey pair, ships in 2 days from Cherkashino."/>
```

### 2 и 4. 301 + петля

Импортированные (реальная таблица, см. §5):
```
curl -sI http://cherkashino.localhost:8111/ru/ru/products/zubnaya-pasta-tayskaya-otbelivayuschaya
→ HTTP/1.1 301 Moved Permanently
  location: /ru/products/zubnaya-pasta-tayskaya-otbelivayuschaya-cherkashino

curl -sI http://cherkashino.localhost:8111/ru/ru/products/zubnaya-pasta-tayskaya-s-gvozdikoy
→ HTTP/1.1 301 Moved Permanently
  location: /ru/products/zubnaya-pasta-tayskaya-s-gvozdikoy-cherkashino

curl -sI http://cherkashino.localhost:8111/ru/ru/categories/dobavki
→ HTTP/1.1 301 Moved Permanently
  location: /ru/categories/dobavki-cherkashino
```

Смена хендла товара пишет свой 301 (проверка шага 2):
```
POST /tenants/products/prod_...S61A7YJ3RQSA988G7F {"handle":"pair-2-cherkashino-renamed"}
→ 200, handle сохранён
POST /tenants/products/<другой товар> {"handle":"pair-2-cherkashino-renamed"}
→ 400 invalid_data: "the handle \"pair-2-cherkashino-renamed\" is already in use"
curl -sI http://cherkashino.localhost:8111/en/products/pair-2-cherkashino
→ HTTP/1.1 301 Moved Permanently
  location: /en/products/pair-2-cherkashino-renamed
```

Петля (созданы вручную `/loop-a → /loop-b`, `/loop-b → /loop-a`, затем удалены):
```
curl -sI http://cherkashino.localhost:8111/loop-a
→ HTTP/1.1 508 Loop Detected
```

### 3. Sitemap — два тенанта, непересекающиеся товары/категории/страницы

```
curl -s http://acme.localhost:8111/sitemap.xml | grep -c '<loc>'        → 1296
curl -s http://cherkashino.localhost:8111/sitemap.xml | grep -c '<loc>' → 1152
comm -12 <(пути acme) <(пути cherkashino) | grep -cE 'products|categories|pages' → 0
```
Пересечение есть только на общих статических путях (`/ru`, `/ru/store`, …) — это не
товарные/категорийные URL и относится к каждому магазину одинаково, как и раньше.
Пример URL с каждой стороны:
`http://acme.localhost:8111/ru/products/flat-waxed-laces`,
`http://cherkashino.localhost:8111/ru/products/pair-2-cherkashino`.

### 5. Импорт

```
npx medusa exec ./src/scripts/import-cherkashino-redirects.ts <02-mapping-registry.json>
→ import-cherkashino-redirects: 47 written, 0 already present, 0 unmapped (tenant cherkashino, dry_run=false)

# повторный запуск
→ import-cherkashino-redirects: 0 written, 47 already present, 0 unmapped (tenant cherkashino, dry_run=false)
```

### 6. Верификация поисковиков

```
PUT /tenants/seo-verification {"yandex":"abc123yandex","google":"def456google"}
curl -s http://cherkashino.localhost:8111/en | grep -o '<meta name="[a-z-]*verification[^>]*>'
→ <meta name="google-site-verification" content="def456google"/>
  <meta name="yandex-verification" content="abc123yandex"/>
```

## Что НЕ сделано и почему

- **Панель**: экрана управления таблицей редиректов и полей SEO-верификации в
  `tenant-panel` нет — API полностью готово (`/tenants/redirects*`,
  `/tenants/seo-verification`), но своя форма для них не добавлена (только
  seo_title/seo_description у страниц получили форму, т.к. это расширение уже
  существующего экрана). Причина — объём: это отдельные экраны, а не поля в
  существующей форме. Задел под задачу.
- **Товар/категория SEO-поля в панели**: тоже только через API (`metadata.seo`), без
  своих input-ов в форме товара/категории панели — по той же причине.
- **Коллекции в sitemap** остаются НЕ tenant-scoped (в Medusa у коллекций нет
  привязки к sales channel/тенанту вообще, отдельного линка не существует) — отмечено
  комментарием в коде; сам по себе не предмет этого ТЗ (в клиентском реестре миграции
  0 непустых коллекций).
- Деплой не делался (не просили).

## Как проверить за 10 минут

1. `cd apps/backend && cp .env.template .env` (свою DB/порт), `npx medusa db:migrate`
   поднимет `tenant_redirect` и `tenant_page.seo_title/seo_description`.
2. `npx medusa develop`, создать тенанта (`POST /admin/tenants`), засеять каталог
   (`POST /tenants/seed {"preset":"..."}`).
3. Storefront на `<handle>.localhost:<port>` — meta-теги на товаре/категории/странице
   видны сразу через `metadata.seo`/`seo_title`.
4. `POST /tenants/redirects` с парой `from_path`/`to_path` → curl на `from_path`
   отдаёт 301 на `to_path` в течение 60 с (TTL кеша миддлвари, как у `regionMap`).
5. `npx medusa exec ./src/scripts/import-cherkashino-redirects.ts <registry.json> dry-run`
   — отчёт без записи; без `dry-run` — пишет.
