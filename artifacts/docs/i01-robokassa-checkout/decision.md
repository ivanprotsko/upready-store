# i01-robokassa-checkout — gorgojs Robokassa или собственный модуль: замер и решение

Дата замера: 2026-09-16 09:17 WITA. Worktree `feat/day16-robokassa-checkout`, стенд:
бэкенд `http://localhost:9061`, витрина `http://cherkashino.localhost:8061`, панель
`http://localhost:5074`, база `upready_store_i01` (клон `upready_store_cherkashina` + миграции).

## Что сравнивали

| | gorgojs | наш модуль |
|---|---|---|
| пакет | `@gorgo/medusa-payment-robokassa` | `apps/backend/src/modules/payment-robokassa/` |
| версии | `latest` 2.0.0-beta.4, `beta` 2.0.0-beta.2, последний стабильный 1.0.0 | — |
| лицензия | MIT (`LICENSE` в тарболе: «MIT License Copyright (c) 2025 Gorgo») | наш код |

Источники замера — не документация, а распакованные тарболы:
`npm pack @gorgo/medusa-payment-robokassa@2.0.0-beta.4` и `@1.0.0`, плюс уже установленный в репозитории
`@gorgo/medusa-integration@0.2.2` (его `lib/catalog.generated.js` содержит запись `robokassa`
и инструкцию по подключению). Сохранённые страницы каталога — `docs/`.

## Таблица (10 строк, каждая — прочитанный код, не обещание)

| # | Признак | gorgojs 2.0.0-beta.4 | наш модуль | Кто нужен платформе |
|---|---|---|---|---|
| 1 | **Учётки на магазин (мультитенант)** | НЕТ. `resolveOptions()` → `resolveIntegrationOptions({identifier, instance_id})`, где `instance_id` — константа из `medusa-config.ts` (`ROBOKASSA_INTEGRATION_ID = "robokassa-1"`). Один инстанс = один MerchantLogin на весь бэкенд; N магазинов = N объявленных инстансов в конфиге + редеплой на каждый новый магазин | ДА. `readRobokassaSecret(pg, tenantId)` читает строку `tenant_integration_secret` того магазина, чей publishable key пришёл в запросе; `data.tenant_id` пишет сервер (`src/api/store/tenant/robokassa.ts`) | наш |
| 2 | **Где владелец вводит ключи** | Medusa **Admin** → Settings → Integrations (персонал платформы). У владельца магазина доступа в Admin нет | **tenant-panel** → Настройки → Приём оплат (`apps/tenant-panel/src/routes/settings/payments/`) | наш |
| 3 | **Хранение секретов** | шифрует `@gorgo/medusa-integration` (`encryptionKey: INTEGRATION_ENCRYPTION_KEY`) | шифруем сами (`src/tenant-secrets/crypto.ts`, тот же `INTEGRATION_ENCRYPTION_KEY`), наружу — только маска `{set, last4}` | паритет |
| 4 | **Подпись платёжной ссылки** | `createSignature(raw, hashAlgorithm)`, порядок `MerchantLogin:OutSum:InvId:[Receipt:][StepByStep:]SuccessUrl2:…:Password#1:Shp_*` | тот же порядок без `Receipt`/`StepByStep` (`robokassaSignature`) | паритет |
| 5 | **Тестовый режим** | ссылка подписывается тестовым паролём #1 (`isTest ? testPassword1 : password1`) | так же | паритет |
| 6 | **Проверка Result-вебхука в тестовом режиме** | `isWebhookEventValid` берёт `options.password2` БЕЗУСЛОВНО (2.0.0-beta.4 стр. 309; в 1.0.0 стр. 320 то же самое). Robokassa в `IsTest=1` подписывает Result тестовым паролём #2 → у магазина в тестовом режиме вебхук не проходит | `verifyResultSignature` → `passwordFor(secret, 2)` с учётом `is_test` | наш |
| 7 | **Ответ Robokassa на Result** | обычный хук Medusa `/hooks/payment/<provider>` — отдаёт HTTP-статус, а не тело `OK<InvId>`, которого Robokassa ждёт (иначе повторяет вызов) | `src/api/robokassa/result/route.ts` отвечает ровно `OK<InvId>`, повтор — идемпотентно `OK<InvId>` снова | наш |
| 8 | **Фискальный чек (54-ФЗ)** | ЕСТЬ: `useReceipt`, `generateReceipt(taxation, taxItemDefault, taxShippingDefault, cart)`, системы налогообложения (`osn`, `usn_income`, `usn_income_outcome`, `esn`, `patent`) и ставки НДС (`vat0…vat120`) | НЕТ | **gorgojs** |
| 9 | **Двухстадийная оплата и статус** | ЕСТЬ: `StepByStep` + `Confirm` (`capturePayment`), опрос статуса через `OpStateExt` с картой кодов состояний | НЕТ: оплата одностадийная, статус берётся из подтверждённого вебхука; возврат — только в ЛК Robokassa | **gorgojs** |
| 10 | **Телеметрия наружу** | ЕСТЬ: `@gorgo/telemetry`, `RobokassaBase.telemetry_.track("plugin.started")` | НЕТ | наш |

## Решение

**Доводим собственный модуль.** Правило задачи — «если провайдер gorgojs ставится сейчас и
закрывает КАЖДУЮ строку, которую закрывает собственный модуль, переходим на него». Он не
закрывает строки 1, 2, 6, 7 — и строка 1 не чинится настройкой: учётные данные у gorgojs
привязаны к инстансу плагина, объявленному в `medusa-config.ts` на этапе сборки, а у нас
магазины заводятся самообслуживанием и владелец вводит свои ключи в своей панели.
Перевод на gorgojs означал бы редеплой бэкенда на каждый новый магазин.

Строки 8 и 9 — реальное преимущество gorgojs, и его стоит забрать **позже и по частям**:
формирование `Receipt` (54-ФЗ) устроено как чистая функция от корзины и настроек
налогообложения, её можно перенести в наш модуль, добавив в форму панели поля «система
налогообложения» и «ставка НДС». Это отдельная задача; в рамках i01 чек не делается.

## Что из этого замера стоит помнить

- `@gorgo/medusa-integration@0.2.2` уже стоит в `medusa-config.ts` с `providers: []` — то есть
  интеграционный модуль подключён, а провайдеров в нём нет. Его каталог знает пять интеграций:
  `1c` (erp), `apiship` (fulfillment), `robokassa`, `tkassa`, `yookassa` (payment).
- Для задачи i02 (ApiShip/CDEK) тот же вопрос решается заново: у fulfillment-провайдера
  `@gorgo/medusa-fulfillment-apiship` учётка тоже одна на инстанс, но у доставки это может быть
  приемлемо — ApiShip-аккаунт платформы, а не магазина. Замер за i02.
