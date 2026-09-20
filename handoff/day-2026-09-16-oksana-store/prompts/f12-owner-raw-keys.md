# На экранах владелицы видны сырые ключи перевода и машинные значения

Найдено живой приёмкой панели (`q02-qa-owner`) на реальном магазине Оксаны,
https://panel-store.upready.dev. Это правка КЛАССА, а не одного места: чините все перечисленные
вхождения и пройдите экраны заново.

## Инвентарь находок (замерено 2026-09-15)

| Экран | Что видит владелица | Должно быть |
|---|---|---|
| `/promotions/create`, шаг «Тип» | **весь экран состоит из ключей**: `promotions.templates.amount_off_products.title/.description`, `…amount_off_order…`, `…percentage_off_product…`, `…percentage_off_order…`, `…buy_get…`, `…shipping_discount…` (12 строк) | человеческие названия видов акций |
| `/promotions/create`, шаг «Подробности» | заголовок `promotions.templates.percentage_off_order.title`; поле бюджета `promotions.form.limit.title` / `.description` | «Скидка в процентах от суммы заказа», «Сколько раз можно применить» |
| карточка товара | `products.shippingProfile.header` (заголовок карточки) | «Профиль доставки» |
| мастер создания товара, шаг «Организация» | `products.fields.shipping_profile.label`, `products.fields.shipping_profile.hint` | по-русски |
| меню «…» на карточке товара | `actions.editImages`, `actions.manage`, `actions.goToProductOption` | «Изменить фотографии», «Управлять», «Перейти к опции» |
| карточка заказа | `orders.creditLines.title`, `orders.summary.totalAfterDiscount` | по-русски |
| карточка заказа, блок «Платежи» | `Pp_system_default`, `Canceled`, дата «15 Sep, 2026, 06:57:55» | «Оплата вручную», «Отменён», «15 сент. 2026, 06:57» |
| карточка заказа, адреса | `Russian Federation` | «Россия» |
| список и карточка заказа | «₽ 1 084,00 RUB» (и знак, и код валюты) | «1 084,00 ₽» |
| список заказов, колонка | «Фулфилмент» | «Сборка» / «Отгрузка» |
| карточка товара | «Со скидкой: **ИСТИНА**» | «Скидки применяются: да» |
| карточка созданного товара | «Опции: Default option / Default option value» | по-русски или скрыть, если опций нет |
| выбор канала продаж в мастере | описание `Sales channel of tenant "cherkashino"` | «Магазин Оксаны Черкашиной» |
| вход в панель и `/settings/payments` | кнопка **Show password** (5 раз) | «Показать пароль» |
| вкладка браузера на всех экранах | заголовок **Medusa** | «Панель магазина — Оксана Черкашина» |
| `/home-settings` | английские подсказки: «Header Accent and hero Announcement both fill their bar with the accent, nothing between.», «A row of category tiles under the hero.»; названия блоков «Hero», «Category tiles», «Products» и кнопки «Скрыть «Hero»» | по-русски |
| `/settings/domains` | домен показан как `xn--80ajkgrgj8cn.xn--p1ai` (это `черкашино.рф`, проверено кодеком `url.domainToUnicode`) | `черкашино.рф`, ACE-форму — мелким шрифтом или вовсе не показывать |
| `/settings/notifications` | «Could not find a notification provider for channel: email for notification id noti_…» | «Письмо не ушло: на платформе не настроен почтовый сервер» |
| карточка товара, статусы | «Предложен», «Отклонен» в списке статусов | у магазина таких состояний нет — оставить «Черновик»/«Опубликован» |
| `/categories` | кнопка «Редактировать рейтинг» (это ranking = порядок) | «Изменить порядок» |

Скриншоты и сырые выгрузки: `artifacts/q02-qa-owner/shots/`, `artifacts/q02-qa-owner/raw/` (файлы `s03-*`, `s05-*`, `s09-*`, `s10-*`, `s11-*`).

## Где искать

- Словарь панели: `apps/tenant-panel/src/i18n/translations/ru.json` — ключей `promotions.templates.*`,
  `orders.creditLines`, `actions.editImages` в нём **нет вовсе** (`grep -c` = 0), `shippingProfile` есть
  частично. Проверьте и `en.json`: часть ключей, возможно, отсутствует в обоих.
- Заголовок вкладки: `apps/tenant-panel/index.html` / роутовые `<title>`.
- «ИСТИНА»/«Default option»/«Russian Federation»/`Pp_system_default` приходят значениями из API —
  их надо переводить на экране через карту подписей (правило 18e: сырой enum попадает на экран только
  через карту), а не «как есть».

## Приёмка (замером, на живой панели)

Скрипт-обход владельцем по `/`, `/products`, `/products/<id>`, `/orders`, `/orders/<id>`,
`/promotions/create`, `/categories`, `/pages`, `/home-settings`, `/shipping`, `/settings/domains`,
`/settings/locale`, `/settings/payments`, `/settings/notifications`; на каждом экране поиск по innerText:

- `/[a-z][a-z_]+\.[a-z_]+\.[a-z_]+/` — **ноль совпадений**;
- `Pp_system_default|Canceled|Default option|Sales channel of tenant|Russian Federation|Show password|ИСТИНА|ЛОЖЬ` — **ноль совпадений**;
- в заголовке вкладки нет слова Medusa.

Лог обхода и скриншоты приложить к отчёту.
