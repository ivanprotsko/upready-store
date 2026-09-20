# Owner Glossary

The tenant panel speaks to a shop owner who has never seen Medusa, an API or a server. This file
fixes one owner term for every internal term, so two screens never name the same thing differently.
You add a row here before you write a new string, and you use the owner term in `ru.json`,
`en.json` and in every hardcoded label you replace.

The reference reader is Оксана, the owner of the client shop. She sells herbal products, works
mostly from her phone and must never need a developer to read a screen.

## What Never Reaches an Owner Screen

These may appear only inside the collapsed «Подробности для поддержки» block, which carries a
«Скопировать» button.

- HTTP verbs and paths, such as `PUT /api/v3/stocks/985793`
- Environment variable names, such as `WB_WRITE_LIVE` or `INTEGRATION_ENCRYPTION_KEY`
- Table and column names, such as `tenant_integration_secret`
- Provider ids, such as `pp_system_default` or `provider=ozon`
- Shell commands, such as `pnpm --filter backend ozon:seed-key`
- Stack traces, raw translation keys and English fallback strings
- Raw enum values, such as `not_fulfilled` or `dry_run`

## Internal Term to Owner Term

| Internal term | Owner term (ru) | Note |
|---|---|---|
| вхолостую, dry run | пробный прогон, ничего не отправлено | The owner needs to know nothing left the shop. |
| ворота, gate, «отказано воротами» | removed | Say what is missing and what to do next, for example «Нужно ваше согласие на отправку остатков. Включите его ниже». |
| ворота закрыты, живой режим выключен, `WB_WRITE_LIVE` | «Отправка на Wildberries пока выключена на платформе. Напишите в поддержку, чтобы включить» | The owner cannot change a platform switch, so the text names the only action she has. |
| согласие на класс операций | разрешение на отправку | For example «Разрешение отправлять остатки». |
| вызовы этого класса отклоняются | пока вы не разрешите, ничего не отправляется | |
| зеркало WB, зеркало Ozon | данные с Wildberries, данные с Ozon | «Зеркало WB прочитано» becomes «Данные с Wildberries обновлены». |
| журнал попыток | история отправок | |
| токен, API-ключ, ключ API | ключ доступа | «Токен ApiShip» becomes «Ключ доступа ApiShip». In the login flow «токен сброса» becomes «ссылка для сброса пароля». |
| бэкенд, сборка, адаптер | платформа | «Ошибка настройки бэкенда» becomes «Ошибка на стороне платформы, напишите в поддержку». |
| окружение, переменная окружения | removed | Never named. See the platform switch row above. |
| fulfillment, фулфилмент, выполнение | сборка заказа | The action is «Собрать». |
| shipment, отгрузка | передача в доставку | The action is «Передать в доставку», with a tracking number field «Номер для отслеживания». |
| `not_fulfilled` | ждёт сборки | |
| `fulfilled` | собран | |
| `shipped` | передан в доставку | |
| `delivered` | доставлен | |
| `canceled` | отменён | |
| payment `awaiting`, `not_paid` | ждёт оплаты | |
| payment `captured` | оплачен | |
| capture payment | подтвердить оплату | |
| sales channel, канал продаж | removed from daily screens | One shop has one channel. It stays under «Дополнительно». |
| shipping profile, профиль доставки | removed from daily screens | A default is applied. It stays under «Дополнительно». |
| variant, вариант | вариант товара | Shown only when a product has more than one. |
| option, опция | свойство для выбора, for example размер | Under «Дополнительно». |
| inventory item, stock location | остаток, склад | |
| handle, slug | адрес страницы | Shown as the visible end of the URL. |
| metadata | removed | Not an owner concept. |
| publishable key | removed | Not an owner concept. |
| promotion, campaign | акция | One section «Акции» holds both. |
| product attribute | характеристика | |
| product category | категория | |
| tenant | магазин | |
| tenant admin | владелец, сотрудник | |
| storefront | витрина, магазин | The button is «Открыть магазин». The link is «Посмотреть на витрине». |
| region | страна продаж | |
| marketplace | площадка | The section is «Площадки». |
| sync, синхронизация | обмен с площадкой | The tab keeps the short label «Синхронизация». |
| article code such as `168523959-CHERKASHINO` | артикул | Shown as «Артикул 168523959», never as a subtitle without a label. |
| FBS | продажа со своего склада (FBS) | The abbreviation is Wildberries' own word, so it stays in brackets. |

## Formats

- Price is written as «1 084,00 ₽», with a non-breaking space before the currency sign.
- Date and time are written as «15 сент. 2026, 06:57».
- A count agrees with its noun: «3 заказа ждут сборки», «1 отзыв без ответа».

## Tone

- Say what happened, then what the owner can do next.
- Address her as «вы», in the active voice.
- One sentence per message where it fits. No exclamation marks in errors.
- An error never blames her for a platform fault.
