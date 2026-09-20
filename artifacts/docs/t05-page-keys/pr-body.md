## Что изменилось

`apps/backend/src/modules/tenant/models/tenant-page.ts:11` держал `TENANT_PAGE_KEYS`
закрытым списком из пяти слов. Из-за этого при переносе магазина Оксаны Черкашиной
десять страниц (`delivery`, `faq`, `wholesale`, `returns`, `consent`,
`consent-marketing`, `return-memo` и три англоязычные) остались непереносимыми —
см. `03-migration-report.md`, раздел «Не перенесено».

- **Модель** (`tenant-page.ts`): `key` теперь свободный slug (`PAGE_SLUG_PATTERN`:
  строчные латинские буквы, цифры, дефисы, 2–48 символов). Пять старых ключей —
  `contacts`, `legal`, `about`, `privacy`, `offer` — зарезервированы
  (`isReservedPageKey`) и работают ровно как раньше: их нельзя удалить, при первом
  сохранении они по умолчанию попадают в подвал (backward-compat).
  Добавлены `in_footer: boolean` и `footer_order: number | null`.
- **Миграция** `Migration20260915040800.ts`: добавляет обе колонки и backfill'ит
  существующие строки — `in_footer = true`, `footer_order` по индексу в старом
  порядке `[contacts, legal, about, privacy, offer]` (сохраняет прежнее поведение
  «любая опубликованная из пяти сразу в подвале»).
- **API `/tenants/pages`**: `GET` — пятёрка + кастомные страницы владельца;
  `POST` — создать кастомную страницу (`{slug, title}`, 400 на невалидный/
  зарезервированный slug, 400 на дубликат); `PUT /:key` — апсерт (для reserved —
  как раньше, для custom — только по существующей странице); `DELETE /:key` —
  удаление кастомной (400 на попытку удалить зарезервированную).
- **API `/store/tenant/pages`**: список для подвала теперь строится из ЛЮБЫХ
  опубликованных страниц с `in_footer=true`, в порядке `footer_order` (без —
  в конец, затем по названию), а не по жёсткому списку из пяти ключей.
- **Панель** (`routes/pages`): экран показывает пять разделов + свои страницы;
  форма создания (slug + заголовок), переключатель «В подвале» в форме
  редактирования, кнопки ▲▼ для ручного порядка в подвале, удаление кастомной
  страницы с подтверждением. Публичный URL показан рядом со слагом
  (`<primary_host>/pages/<slug>`).
- **Storefront**: изменений не потребовалось — `[locale]/(main)/pages/[key]` и
  все варианты футера уже читали `key`/`title` как произвольную строку.
- **Тесты**: `tenants-pages.spec.ts` расширен тремя новыми `it`/`describe`:
  400 на невалидный/зарезервированный slug при создании; полный round-trip
  кастомного slug (создание → публикация → включение в подвал → видимость
  только своему тенанту → реордер против другой страницы → удаление → 404
  везде после удаления); зарезервированный ключ по-прежнему нельзя удалить,
  апсерт без `in_footer` в теле (старый контракт) по умолчанию включает
  подвал для reserved-ключа.

## Как измерено

Backend:
```
$ cd apps/backend && npx medusa lint && npx tsc --noEmit
✓ 0 errors (medusa lint: 8 pre-existing warnings, не новые)
✓ tsc: 0 ошибок

$ DB_HOST=localhost DB_PORT=5433 DB_USERNAME=postgres PORT=9243 \
  pnpm test:integration:http -- tenants-pages
Tests:       12 passed, 12 total   ← 9 старых + 3 новых describe/it блока

$ DB_HOST=localhost DB_PORT=5433 DB_USERNAME=postgres PORT=9245 \
  pnpm test:integration:http
Test Suites: 1 failed, 11 passed, 12 total
Tests:       1 failed, 128 passed, 129 total
  ← единственное падение — tenants-domains.spec.ts, «is_primary» отсутствует
    в toEqual; файл этой задачей не тронут, воспроизводится и на dev
    (не наша регрессия).

$ pnpm test:unit
1 failed (profile-data.unit.spec.ts, i18n merge, productOptions) —
  воспроизводится и без изменений этой задачи (проверено git stash).
```

Panel:
```
$ cd apps/tenant-panel && npx tsc --noEmit && npx eslint src
✓ tsc: 0 ошибок
✓ eslint: 0 errors, 23 pre-existing warnings (не в тронутых файлах)
```

Storefront:
```
$ cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build
✓ tsc: 0 ошибок
✓ next lint: No ESLint warnings or errors
✓ next build: rc=0, /[locale]/pages/[key] в маршрутах
```

Живой стенд (backend :9250 на своей БД `upready_store_t05`, storefront :8041,
тенант `oksana-t05`, домен резолвится через `<handle>.localhost`):

- Создание и публикация `delivery` через панельный API → `curl -L --resolve
  oksana-t05.localhost:8041:127.0.0.1 http://oksana-t05.localhost:8041/pages/delivery`
  → `http_code=200`, заголовок «Доставка».
  Скриншот: `artifacts/docs/t05-page-keys/delivery-page.png`.
- Футер: блок «Information» содержит ссылки на «Доставка» и «О магазине» —
  скриншот `footer-with-delivery.png`. После снятия «в подвале»
  (`PUT .../delivery {in_footer:false}`) ссылка пропадает без пересборки —
  `footer-without-delivery.png` (проверено через `document.querySelector('footer')
  .innerText.includes('Доставка') === false`).
- `/ru/pages/about` (зарезервированный ключ) работает без изменений —
  `http_code=200`, скриншот `about-page-unchanged.png`.
- `curl --resolve ... http://oksana-t05.localhost:8041/pages/unknown-slug`
  (после `-L`) → `http_code=404` (реальная 404-страница, не падение).
- `DELETE /tenants/pages/about` → `400 {"type":"invalid_data", ...}` —
  зарезервированный ключ защищён.

## Что НЕ сделано

- Реальные тексты магазина Оксаны (delivery/faq/…) сюда не переносились —
  это `x01-tenant-live-import`/`t12-legal-requisites`, задача открывала только
  сами ключи.
- Деплой не выполнялся (не требовался и не разрешён брифом).
- Порядок в подвале — только ручной (стрелки ▲▼ в панели), без drag-and-drop:
  этого было достаточно для критерия «в выбранном порядке» и не расширяло
  объём задачи сверх нужного.

## Как проверить за 10 минут

1. `cd apps/backend && DB_HOST=localhost DB_PORT=5433 DB_USERNAME=postgres PORT=9300 pnpm test:integration:http -- tenants-pages` — ожидается 12/12.
2. Локальный стенд: создать тенанта, `POST /tenants/pages {"slug":"faq","title":"Вопросы"}`,
   `PUT /tenants/pages/faq {..., "published":true, "in_footer":true}`,
   открыть `http://<handle>.localhost:<порт-сторфронта>/pages/faq` — 200, ссылка в футере.
3. `DELETE /tenants/pages/about` (или любой из пяти) → 400.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
