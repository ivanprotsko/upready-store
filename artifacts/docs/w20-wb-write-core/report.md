# w20-wb-write-core — слой записи в WB, ядро

Отчёт исполнителя. Раунд 1 — 2026-09-16 06:07 WITA, раунд 2 (по находкам приёмки) — 2026-09-16 06:43 WITA.
Ветка `feat/day16-wb-write-core`, база `dev`.

## Что сделано

Общее ядро записи в маркетплейсы `apps/backend/src/modules/marketplace-write/` плюс
адаптер `apps/backend/src/modules/wb-write/`. Мутация физически невыразима, пока не
открыты **пять гейтов** — они стоят в `execute.ts` последовательно, каждый отказ пишет
строку аудита и бросает `MarketplaceWriteRefused` с именем гейта:

| гейт | что проверяет | текст отказа |
|---|---|---|
| (a) `credential` | ключ записи лежит в **отдельном слоте** `wildberries_write` | «read key is a different secret and is never used to write» |
| (b) `credential_usable` | что ключ говорит о себе сам (бит 30, срок) | причина от адаптера |
| (c) `enabled` | переключатель записи у этого арендатора | «Writing to wb is switched off for this shop» |
| (d) `consent` | согласие владелицы **на класс операций** | «Consent is given per class and never globally» |
| (e) `WB_WRITE_LIVE === "1"` | живой режим | иначе dry-run, наружу не уходит ничего |

Между (d) и (e) тело валидируется схемой из реестра, отказ идёт под гейтом `body` со
ссылкой на страницу документации WB.

**Allowlist мутаций** — `wb-write/write-endpoints.ts`, 7 записей с `docUrl` у каждой.
Классы: `stocks`, `prices`, `feedback_answers`, `fbs_orders`. Эндпоинта нет в реестре —
вызвать его нечем.

**Dry-run по умолчанию**: `WB_WRITE_LIVE` не выставлена нигде в репозитории.

**Журнал аудита** — `marketplace_write_audit`; **согласия** — `marketplace_write_consent`;
**переключатель** — `marketplace_write_setting`.

**API и панель (добавлено в раунде 2)**: `GET/PUT /tenants/wb/write-settings` — состояние
переключателя, согласия по классам, последние 20 строк аудита, плюс **отчёт** о гейтах
(a)/(b)/(e), которые отсюда выставить нельзя. Раздел «Запись в Wildberries» на странице
Wildberries в панели: переключатель, кнопки согласия по классам с диалогом подтверждения
(диалог называет, что именно класс разрешает, и перечисляет вызовы), таблица журнала.

**Живых вызовов нет**: тест `no-live-write-call-site.unit.spec.ts` держит инвариант.
Новый маршрут его не нарушает — он не вызывает `wbWrite`, а читает и пишет строки,
которые гейты (c) и (d) потом спрашивают.

## Конкурент (InSales Combo)

Дословно из `handoff/day-2026-09-16-oksana-store/research/insales-combo-features.md`:

- строка 91: «Товарный учёт и остатки | Контроль остатков, редактирование и синхронизация
  с площадками» — Комбо, линейка, https://www.insales.ru/page/combo
- строка 197: «Единый остаток и таблица цен | Цены и остатки всех площадок правятся в одной
  таблице» — платформа, https://www.insales.ru/page/marketplace
- строка 199: «Автоответы на отзывы Wildberries | AI-генератор ответов на отзывы» — Комбо,
  линейка, https://www.insales.ru/page/combo
- строка 194: «Схемы FBS, FBO, DBS | Поддержка всех трёх схем работы» — Комбо, линейка,
  https://www.insales.ru/page/combo

Вывод: у конкурента запись в маркетплейсы есть по всем четырём классам, и она подана как
обычная функция тарифа. Отличие нашей конструкции — не в наборе, а в том, что запись
закрыта пятью гейтами и согласие берётся на класс; у InSales в публичных материалах такого
разделения прав не описано.

## Аналог Ozon по классам

По сохранённой документации `artifacts/docs/w10-marketplace-spec/docs/ozon-methods-index.tsv`
и якорям из `docs.ozon.ru-api-seller-index.links.txt`; база URL — https://docs.ozon.ru/api/seller/

| класс | наши вызовы WB | аналог Ozon Seller API |
|---|---|---|
| `stocks` | `PUT`/`DELETE /api/v3/stocks/:warehouseId` | `POST /v2/products/stocks` «Обновить количество товаров на складах» — https://docs.ozon.ru/api/seller/#operation/ProductAPI_ProductsStocksV2 |
| `prices` | `POST /api/v2/upload/task` | `POST /v1/product/import/prices` «Обновить цену» (не больше 10 обновлений в час на товар) — https://docs.ozon.ru/api/seller/#operation/ProductAPI_ImportProductsPrices |
| `feedback_answers` | `POST`/`PATCH /api/v1/feedbacks/answer` | `POST /v1/review/comment/create` «Оставить комментарий на отзыв» (нужна подписка «Управление отзывами» или Premium Pro) — https://docs.ozon.ru/api/seller/#operation/ReviewAPI_CommentCreate; для вопросов — `POST /v1/question/answer/create` «Создать ответ на вопрос» (Premium Plus) — https://docs.ozon.ru/api/seller/#operation/QuestionAnswer_Create |
| `fbs_orders` | `PATCH /api/v3/orders/:orderId/cancel`, `PATCH /api/v3/supplies/:supplyId/deliver` | `POST /v2/posting/fbs/cancel` «Отменить отправление» — https://docs.ozon.ru/api/seller/#operation/PostingAPI_CancelFbsPosting; `POST /v2/posting/fbs/awaiting-delivery` «Передать отправление к отгрузке» — https://docs.ozon.ru/api/seller/#operation/PostingAPI_MoveFbsPostingToAwaitingDelivery |

«Не найдено» нет ни по одному классу: у Ozon есть парный метод везде. Две оговорки, которые
меняют планирование w21–w23: ответы на отзывы и на вопросы у Ozon — **платные подписки**
(у WB такого условия нет), а подтверждение отгрузки FBS (`/v2/posting/fbs/act/create`)
**отключается 7 сентября 2026** с переходом на `/v1/carriage/create` + `/v1/carriage/approve`.

Именно поэтому гейты и журнал лежат в `marketplace-write/`, а не в `wb-write/`: адаптер
`ozon-write` — это второй реестр и второй `send`, гейты не копируются.

## Чем измерено

- `yarn test:unit` в `apps/backend` → **rc=0, 45 сюит, 484 теста**.
- `npx tsc --noEmit` бэкенда → **rc=0**; `npx tsc --noEmit` панели → **rc=0**.
- Локальный стенд: клон `upready_store_w20` из `upready_store_cherkashina` (тенант
  `cherkashino`), бэкенд :9041, панель :5191. `npx medusa db:migrate` → rc=0, три таблицы
  `marketplace_write_*` созданы.
- `GET /tenants/wb/write-settings` → 200, все гейты закрыты. `PUT` (переключатель +
  согласие на `stocks`) → 200, ответ содержит записанное согласие. `PUT` с несуществующим
  классом → **400** от валидатора.
- Прогон через **настоящие** гейты на стенде (скрипт в скретчпаде сессии, не в репозитории):
  `wb.stocks.update` при выданном согласии → `dryRun: true`; `wb.prices.upload-task` без
  согласия → отказ на гейте `consent`; **FETCH COUNT = 0**.
- Журнал на стенде, 4 строки, все с `dry_run=t`:
  `select marketplace, outcome, count(*) from marketplace_write_audit group by 1,2;`
  → `wb|dry_run|1`, `wb|refused|3`. Ни одной строки `sent`.
- Скриншот раздела: `artifacts/docs/w20-wb-write-core/panel-write-section.png`
  (и страница целиком — `panel-write-section-fullpage.png`).

## Что нашёл стенд (и чего не видел ни один зелёный тест)

1. **У модуля не было миграции вовсе.** Модели были объявлены, `db:migrate` печатал
   `MODULE: marketplace_write` и не создавал ничего: миграцию делает `db:generate`.
   Добавлена `marketplace-write/migrations/Migration20260915223734.ts`.
2. **Слот `wildberries_write` не мог принять строку.** `tenant_integration_secret.provider`
   — это `model.enum`, то есть CHECK на уровне БД, и в нём стояли только `robokassa` и
   `wildberries`. Гейт (a) не открылся бы никогда, даже с настоящим ключом, — а типизация,
   юниты и линт были зелёные, потому что ни один из них не вставляет такую строку.
   Список расширен, миграция `tenant/migrations/Migration20260915224049.ts`.

Оба дефекта — цена того, что в раунде 1 не было живого прогона; находка приёмки №1 их и
вскрыла.

## Расхождение в именах таблиц (осознанное)

Приёмка называет таблицу `wb_write_audit`, в коде она `marketplace_write_audit`, рядом
`marketplace_write_consent` и `marketplace_write_setting`. Это следствие требования
адаптерной независимости (приказ Ивана 04:44): таблицы общие для WB и Ozon, маркетплейс
лежит колонкой `marketplace`, иначе для Ozon пришлось бы заводить вторые такие же.

## Чего НЕ сделано

- **Живой записи нет** и не проверялась: ни один запрос к WB не уходил (FETCH COUNT = 0,
  в журнале ноль строк `sent`). Транспорт написан, но гейт (e) его не пускает и боевых
  вызовов нет.
- **Ozon не реализован**: адаптера `ozon-write` в этой ветке нет, есть только разбор его
  методов выше — это задача отдельной фазы.
- **Ключ записи в панели не заводится**: маршрута для сохранения `wildberries_write` нет
  намеренно — появление ключа это решение Ивана, а не действие владелицы из интерфейса.
  На стенде ключ засеян синтетическим скриптом (подпись — литерал `test-signature`),
  чтобы показать строку `dry_run`; в репозитории и в проде его нет.
