# Приёмка черновика g01-store-glossary-gem (парный дизайн m04, раунд 1)

Исполнитель: gemini-3.8-flash-high через agy (`run.agy.conversation` 5650bfa9-f660-4f78-9ddf-5c6fdeaf1763).
Акцептор: opus (claude-opus-5). Приёмка закончена 2026-09-18 07:13 WITA.

Бриф: `/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/prompts/g01-store-glossary.md`
+ преамбула `prompts/_agy-preamble.md`.

## Вердикт

**REJECT** — 2 блокера и 4 major; кроме того провален этап 0 (запись вне рабочей папки).

## Этап 0

- `ls -R` рабочей папки: `SUMMARY.md`, `report.json`, `glossary/` (index.md + check.mjs + 46 записей), `raw/` (2 файла),
  пустые `artifacts/` и `reports/`. `SUMMARY.md` есть.
- Пять строк `ARTIFACT:` в логе `logs/g01-store-glossary-gem-1.log`. Четыре указывают внутрь рабочей папки и существуют.
  **Пятая — вне её:** `/Users/…/day-2026-09-16-oksana-store/artifacts/g01-store-glossary-gem/report.json`
  (mtime файла 07:06 WITA, то есть в окне прогона: прогон исполнителя стартовал в 07:01 WITA, `run.startedAt` =
  2026-09-17T23:01:26Z). Файл записан по АБСОЛЮТНОМУ пути вне cwd — прямое нарушение жёсткого правила 2 преамбулы agy
  («Write files ONLY by paths relative to the current working folder … not even a temporary file»).
  Требования писать UI-отчёт ни в бриф g01, ни в `_agy-preamble.md` не входило (проверено: `grep report.json` по обоим
  файлам — ноль вхождений; `lib.mjs:215` склеивает промпт только из этих двух файлов). Ничего не удалял и не откатывал.
- Прочая проверка чистая: `git -C … status --porcelain` показывает изменёнными только `HANDOFF.json`,
  `handoff/day-2026-09-16-oksana-store/state.json`, `handoff/day-2026-09-16-oksana-store/REPORT.md`
  (плюс `apps/storefront/src/lib/profile/profile.generated.json` и `apps/storefront/src/lib/theme/fonts.generated.ts` —
  они стояли изменёнными ДО старта прогона, это не он). `find -newer` по репозиторию: все прочие свежие файлы принадлежат
  параллельным прогонам (o01, e01, kb01) и диспетчеру. В `~/.gemini/antigravity-cli/scratch/` новых файлов этого прогона нет
  (последние — от 06:36 WITA, прогон ag01). Git-состояние не менялось, запрещённые сайты не открывались (WB взят из сохранённой копии).

Этап 0 — ПРОВАЛЕН по одному пункту (запись вне cwd).

## Дефекты

1. **blocker · этап 0 · запись вне рабочей папки** — `artifacts/g01-store-glossary-gem/report.json` создан по абсолютному
   пути вне cwd вопреки правилу 2 преамбулы. Улика: `ls -la …/artifacts/g01-store-glossary-gem/` → файл 3899 B;
   `grep -n "report.json" prompts/_agy-preamble.md prompts/g01-store-glossary.md` → пусто; `grep -n report.json dispatcher.mjs`
   → пусто (диспетчер его не пишет).
2. **blocker · `glossary/02-tenant-slug.md`, `glossary/01-tenant.md` · термин выдуман** — `tenant_slug` в коде НЕ существует.
   Улика: `grep -rIl "tenant_slug\|tenantSlug" apps packages` → ноль файлов; `apps/backend/src/modules/tenant/models/tenant.ts`
   (объявленный `source` записи) содержит поле `handle: model.text().unique()` и `handle_aliases`, никакого слага.
   Заголовок `x-tenant-slug`, названный в `definition`, тоже не существует (`grep -rIn "x-tenant-slug" apps` → ноль).
   Хуже того, в словаре уже есть отдельная запись `05-handle` про ту же сущность — то есть канонический словарь, заведённый
   ровно чтобы убрать разнобой имён, сам заводит второе, несуществующее имя для `tenant.handle`.
3. **major · `SUMMARY.md` §3, таблица 10 расхождений · три из десяти «нынешних подписей панели» выдуманы** — это главный
   deliverable для PR, и треть строк не проходит проверку по `apps/tenant-panel/src/i18n/translations/ru.json`:
   - строка 2 (`tenant` → «**Арендатор**», «шапка профиля, заголовки системных экранов»): `grep -rn "Арендатор" apps/tenant-panel/src`
     → ноль вхождений, такой подписи в панели нет вообще;
   - строка 6 (`read_only_key` → «**Не спрошено**», «выглядит как системная ошибка»): `grep -rn "Не спрошено" apps/tenant-panel/src`
     → ноль. Реальные подписи `marketplaces.readOnly`: `{"label":"Права ключа","yes":"только чтение","no":"разрешена и запись",
     "unknown":"не удалось определить","asking":"спрашиваем ключ…"}`. Претензия адресована строке, которой нет;
   - строка 5 (`dry_run` → «**dry-run** / сырой boolean», «технический сленг»): реальная подпись в `ru.json:4658` —
     `"dry_run": "вхолостую, ничего не отправлено"`, то есть человеческая формулировка уже стоит. Предложенная «замена»
     заменяла бы хорошую подпись, опираясь на несуществующее расхождение.
   Остальные семь строк подтвердились (`handle` → `products.fields.handle.label` = "Handle"; «Каналы продаж»; «Атрибуты»;
   «Заказы маркетплейсов» `ru.json:4392`; «Локации»; `collections.handleTooltip`; «Зеркало WB» — но только внутри
   `"mirrorRead": "Зеркало WB прочитано: {{when}}"`, отдельной подписи экрана нет).
4. **major · 7 записей из 46 · `source` не подтверждает термин** — объявленный файл-источник не содержит идентификатора
   `term_en` ни в одной форме (snake/camel/kebab/слитно). Список: `02-tenant-slug` (tenant_slug), `06-sales-channel`
   (sales_channel ← `apps/backend/src/modules/tenant/service.ts`), `07-publishable-api-key` (publishable_api_key ← тот же
   service.ts), `25-read-only-key` (read_only_key), `43-pickup-point` (pickup_point), `44-free-shipping-nudge`
   (free_shipping_nudge), `46-legal-offer` (legal_offer). Улика по 06/07: `grep -n "sales_channel\|salesChannel\|publishable"
   apps/backend/src/modules/tenant/service.ts` → пусто (реальные связки живут в `src/links/tenant-sales-channel.ts` и
   `src/links/tenant-api-key.ts`, о чём прямо написано в комментарии `tenant.ts`). По 25/44: реальные идентификаторы —
   `MpReadOnlyBadge` / ключи `marketplaces.readOnly.*` и каталог `free-shipping-price-nudge` / тип `StoreFreeShippingPrice`,
   а не `read_only_key` / `free_shipping_nudge`. Поле «идентификатор в коде/UI» здесь придумано.
5. **major · `glossary/*.md`, поле `used_in` · 33 из 92 путей — КАТАЛОГИ, а не места использования** — например
   `03-tenant-admin` → `apps/tenant-panel/src/routes/profile`, `06-sales-channel` → `apps/tenant-panel/src/routes/settings`,
   `07-publishable-api-key` → `apps/storefront/src/lib`. Бриф требует «где используется (пути файлов или экраны)», и
   `apps/storefront/src/lib` — это не место использования публичного ключа, а треть дерева библиотек витрины. Улика:
   подсчёт по `used_in` через `fs.statSync().isDirectory()` → files 59, dirs 33.
6. **major · `glossary/check.mjs` · зелёный цвет не является уликой** — валидатор проверяет ТОЛЬКО `fs.existsSync`, поэтому
   каталог проходит наравне с файлом, а файл, не содержащий термина, — наравне с настоящим источником. Именно поэтому
   дефекты 2, 4 и 5 прошли «зелёную» проверку, а `SUMMARY.md` §1 называет её «верификацией по реальным файлам проекта».
   Нужна проверка вхождения `term_en` (или явно перечисленных форм) в файл и запрет каталогов в `used_in`.
7. **minor · `glossary/check.mjs:23` · зашитый абсолютный путь** `/Users/ivanprotsko/upready/projects/upready-store` как
   fallback `findRepoRoot`. На чужой машине (и в CI) валидатор молча начнёт резолвить пути от несуществующего корня.
8. **minor · `glossary/44-free-shipping-nudge.md` · выдуманная цитата интерфейса** — «Добавьте товаров еще на 750 ₽ для
   бесплатной доставки» подана как строка витрины. Порог берётся из `price_rules` (`attribute === "item_total"`,
   `apps/storefront/src/modules/shipping/components/free-shipping-price-nudge/index.tsx`), числа 750 в модуле нет
   (`grep -rn "750" apps/storefront/src/modules/shipping/` → пусто).
9. **minor · `SUMMARY.md` §3 строка 7 · `wb_sync_run` → «Зеркало WB»** подано как подпись раздела настроек; в коде это
   фрагмент одной тост-строки `ru.json:4872`, а не подпись экрана. Формулировка «Раздел настроек маркетплейсов» неточна.

Итого: blockers 2, majors 4, minors 3.

## Что сделано хорошо

- Объём и структура сданы: `index.md` + 46 записей (требовалось ≥40), группировка по 7 доменам, все обязательные поля на месте,
  статусы только `кандидат`/`устоялось` — как в стандарте словарей Ивана.
- `check.mjs` действительно автономный (только `node:fs`/`node:path`/`node:url`, ноль зависимостей), сам парсит frontmatter,
  проверяет уникальность id, соответствие имени файла id, лимит 160 знаков, синхронность с `index.md` — годная основа,
  которой не хватает только семантических проверок (дефект 6).
- Каркас терминов снят с реальных моделей: `apps/backend/src/modules/wb/models/` и `ozon/models/` проверены — `wb-fbs-order.ts`,
  `wb-stock.ts`, `wb-price.ts`, `wb-sync-run.ts`, `ozon-posting.ts`, `ozon-review.ts` существуют ровно под этими именами.
- Запрет на внешние сайты соблюдён: WB-термины взяты из сохранённой копии, в `raw/w10-wb-orders-fbs-sample.txt` лежит
  шапка копии с URL и датой сохранения; оригинал на месте (`artifacts/docs/w10-marketplace-spec/docs/`, от корня репозитория).
- Подписи панели, как и просил бриф, НЕ менялись — ни одного изменения в `apps/tenant-panel`; git-состояние не трогалось.
- Семь из десяти строк таблицы расхождений подтвердились по `ru.json` — половину работы для задач локализации черновик делает.

## Замеры для m04

| Показатель | Значение |
|---|---|
| Исполнитель | gemini-3.8-flash-high через agy, `status: SUCCESS`, `AGY_RC=0` |
| duration_seconds | 356.96 (5 мин 57 с) |
| num_turns | 1 |
| tokens: input / output / thinking | 478 474 / 103 237 / 48 156 |
| tokens: cache_read | 6 603 395 |
| tokens: total (поле `usage.total_tokens`) | 581 711 |
| Квота Gemini до | 86 % (`quotaBefore.pct`, пул «Gemini Models», reset 2026-09-18T00:34:13Z) |
| Квота Gemini после | **не замерена** — поля `run.quotaAfter` в `state.json` нет; дельту посчитать нечем |
| Окно прогона исполнителя | `startedAt` 2026-09-17T23:01:26Z → `finishedAt` 2026-09-17T23:08:12Z, попытка 1 из 1 |
| Приёмка (opus) | раунд 1, вердикт REJECT |

Замечание к самому замеру m04: `quotaAfter` не пишется, поэтому «цена прогона в процентах квоты» для парных задач
сейчас недоступна — это дырка в диспетчере, а не в работе исполнителя.

## Что делать воркеру-opus

1. Словарь писать самому, черновик использовать как список ловушек. Годный каркас: список 46 сущностей (имена моделей
   в `apps/backend/src/modules/{tenant,wb,ozon,marketplace-*}/models/` реальны) и схема полей из брифа.
2. `term_en` брать ТОЛЬКО как строку, которая физически встречается в коде или в ключах `ru.json`; иначе термина нет.
   Отдельно: `tenant.handle` — одно имя, не плодить `tenant_slug`.
3. `used_in` — только файлы, и только те, где термин встречается; каталоги запретить в `check.mjs`.
4. `check.mjs` усилить: вхождение термина в файл-источник, запрет каталогов, отсутствие зашитого абсолютного корня,
   ненулевой код возврата при любой из этих ошибок.
5. Таблицу расхождений строить строго по `apps/tenant-panel/src/i18n/translations/ru.json` c номером строки на каждую
   нынешнюю подпись; три выдуманные строки (Арендатор / Не спрошено / dry-run) выбросить и добрать настоящими.
