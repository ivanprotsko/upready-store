# Способы доставки: человеческие названия вместо «Оксана Черкашина pickup» и «courier»

Задача `f06-shipping-method-names`, ветка `fix/day16-shipping-names`, отчёт составлен 2026-09-15 14:26 WITA.

Покупатель на `https://cherkashino.shipshift.dev/ru/checkout` выбирал между «Оксана Черкашина pickup»
и «Оксана Черкашина courier · 10,00 ₽». Теперь — между **«Самовывоз · Бесплатно»** и
**«Курьером · 300,00 ₽»**, у каждого способа строка, объясняющая, что именно произойдёт.

## Что изменено в репозитории

| Файл | Что |
|---|---|
| `apps/backend/src/shipping-tariffs/default-method-names.ts` | ru/en названия, описания для покупателя и подсказка срока; `defaultCourierAmount(currency)` (rub → 300, прочие валюты → прежние 10); `homeCountryForLocale` переехал сюда из `helpers.ts` (им пользуются и провижининг, и скрипт); `LEGACY_COURIER_AMOUNT` — плейсхолдер первой версии |
| `apps/backend/src/shipping-tariffs/tariff.ts` | необязательное поле `tariff_source` в `TenantMethodData` |
| `apps/backend/src/workflows/tenant/provision-tenant-warehouse/index.ts` | новый магазин получает описания, подсказку и цену курьера **по валюте**: 300 ₽ в рублёвом регионе и 10 $ в долларовом, а не одно число во все валюты; курьерский способ помечен `tariff_source: "provisioned-default"` |
| `apps/backend/src/scripts/rename-default-shipping-methods.ts` | к переименованию добавлены описания, разовая переоценка курьера с плейсхолдера 10, фильтр `TENANT=<handle|id>`, сходимость устаревших `type`-строк |
| `apps/backend/src/shipping-tariffs/option-type.ts`, `.../steps/sync-option-type.ts`, `.../update-tenant-shipping-method.ts` | `updateShippingOptionsWorkflow` принимает вложенный `type` и **не пишет его** (замер на 2.19.0, ниже) — поэтому `type`-строка обновляется отдельно: и в скрипте, и при переименовании способа из панели |
| `apps/backend/docker-entrypoint.sh` | шаг 5: скрипт переименования гоняется при каждом старте бэкенда, поэтому следующая волна деплоя сходится сама. Единственный косметический шаг здесь, поэтому `set -e` для него снят: упасть и не пустить бэкенд он не может |
| `apps/tenant-panel/src/routes/shipping/shipping-list/shipping-list.tsx`, `hooks/api/shipping-methods.tsx` | в списке `/shipping` у способа с неподтверждённым тарифом стоит «Стоимость по умолчанию — укажите свою»; пометка снимается, когда владелица сохраняет свой тариф (включение/выключение способа её не снимает — это не решение о цене) |
| `apps/backend/src/shipping-tariffs/__tests__/default-method-names.unit.spec.ts` | 5 тестов: русские имена без имени магазина и английских слов, фолбэк локали, цена по валютам, домашняя страна, узкая рамка `isMachineMadeDefaultName` |

## Решение про 10 ₽ и почему такое

Взят вариант «разумное значение по умолчанию, которое владелица подтверждает», а не «спрятать способ».

- Прятать курьера у магазина, который торгует **почтой по всей России** (СДЭК/ВБ вручную — дайджест
  переписки, #463839), значит оставить покупателя без единственного способа получить заказ.
- 10 ₽ — это обещание, которое владелица выполнить не может. 300 ₽ — не выдумка: единственный
  измеренный ориентир по её же доставке это СДЭК, 185 ₽ и 325 ₽ на живом расчёте 01.09
  (`research/chrxnasdmds-digest.md`, строка «Доставка»).
- Обещание с покупателя снято текстом на карточке: «До двери. Стоимость подтвердит магазин.»
- Чтобы «подтверждает владелица» не осталось словами: способ помечен `tariff_source:
  "provisioned-default"`, и в панели рядом с тарифом стоит «Стоимость по умолчанию — укажите свою».
  Пометка исчезает ровно тогда, когда владелица сохранила свой тариф.
- Цена теперь зависит от валюты региона: 300 в рублёвом, 10 в долларовом. Старый код писал одно
  число во все валюты сразу — это и был второй дефект той же строки.

Самовывоз остался 0 ₽: это не плейсхолдер, покупатель забирает заказ сам.

## Что сделано на живом магазине (данные, не деплой)

Образ на хосте собран до этого PR, поэтому его копия скрипта пишет старые описания. Логика PR
перенесена один в один в разовый CommonJS-скрипт `f06-rename-oneoff.js` (в этом каталоге), скопирована
в контейнер, выполнена, удалена. Контейнеры не пересобирались и не перезапускались.

```
$ md5 -q artifacts/docs/f06-shipping-method-names/f06-rename-oneoff.js
4ffdb8e82228e379c76aab15cb644387
$ docker exec mt-backend md5sum /app/src/scripts/f06-rename-oneoff.js
4ffdb8e82228e379c76aab15cb644387

$ docker exec -e LOCALE=ru -e TENANT=cherkashino mt-backend node_modules/.bin/medusa exec ./src/scripts/f06-rename-oneoff.js
[f06-rename-oneoff] Оксана Черкашина: Самовывоз, Курьером
[f06-rename-oneoff] renamed 2 options across 1 tenants (TENANT=cherkashino), 1 courier defaults repriced from the 10 placeholder (home currency rub)
```

Прогон сделан по одному магазину намеренно: остальные тенанты сходятся сами при следующем деплое
(шаг 5 энтрипойнта), уже отревьюенным кодом, а не разовым скриптом.

## Приёмка (замеры)

### 1. `GET /store/shipping-options?cart_id=<cart>` магазина Оксаны

`node artifacts/docs/f06-shipping-method-names/probe-shipping-options.mjs cherkashino.shipshift.dev`
(ключ берётся из `/storefront/by-host`, корзина настоящая, с товаром; полный JSON —
`after-cherkashino.json`, было — `before-cherkashino.json`):

| | было | стало |
|---|---|---|
| имя | `Оксана Черкашина pickup` / `Оксана Черкашина courier` | `Самовывоз` / `Курьером` |
| цена | 0 / **10** | 0 / **300** |
| `data` | `null` | описание, подсказка, `tariff`, `tariff_source: "provisioned-default"` у курьера |
| `type` | `Pickup` / `Pick up at the warehouse.` | `Самовывоз` / `Заберите заказ у продавца.` |

Ни имени магазина, ни английских слов в названиях не осталось; `type.code` (`pickup`/`courier`) —
машинный код, он на экран не попадает.

### 2. Экран чекаута

`node artifacts/docs/f06-shipping-method-names/shot-checkout.mjs https://cherkashino.shipshift.dev/ru …`
кладёт товар в корзину и снимает `/ru/checkout`:

- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-shipping-names/artifacts/docs/f06-shipping-method-names/shots/after-1280x900.png`
- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-shipping-names/artifacts/docs/f06-shipping-method-names/shots/after-390x844.png`

Текст карточек, снятый с самой страницы (оба размера одинаково):

```
Самовывоз
Заберите заказ у продавца.
Адрес и время пришлём после заказа
Бесплатно

Курьером
До двери. Стоимость подтвердит магазин.
300,00 ₽
```

### 3. Повторный прогон ничего не меняет

```
второй прогон:  renamed 0 options across 1 tenants (TENANT=cherkashino), 0 courier defaults repriced …, 2 type rows brought in step
третий прогон:  renamed 0 options across 1 tenants (TENANT=cherkashino), 0 courier defaults repriced …, 0 type rows brought in step
```

Во втором прогоне двойка — это как раз `type`-строки, которые первый прогон записать не смог
(`updateShippingOptionsWorkflow` вложенный `type` игнорирует; ради этого и появился
`option-type.ts`). Третий прогон — все нули.

### 4. Соседний тенант не тронут

`node artifacts/docs/f06-shipping-method-names/probe-shipping-options.mjs zolotaya-nit-1057.shipshift.dev`
(`after-zolotaya-nit.json` побайтово совпадает с `before-zolotaya-nit.json`):

```
[('Золотая нить pickup', 0, {'label': 'Pickup', …}), ('Золотая нить courier', 10, {'label': 'Courier', …})]
```

Store API отдал его опции с кодом 200; его витрина на момент замера отвечала 502 — в эти часы
параллельная сессия `d03-deploy-mt-3` держала стек пересобранным (`mt-storefront` в статусе
`Created`). После её `up -d` витрина Оксаны ответила 200, на ней и сняты скриншоты.

Соседа я не переименовывал сознательно: у него ровно тот же дефект, и вылечится он тем же скриптом
на следующем деплое — уже отревьюенным кодом.

## Проверки

```
apps/backend$ npx tsc --noEmit                      # без вывода, rc=0
apps/backend$ npx medusa lint                       # 59 problems (0 errors, 59 warnings) — ровно столько же, сколько до правок
apps/backend$ TEST_TYPE=unit npx jest src/shipping-tariffs
                                                    # Test Suites: 2 passed, Tests: 15 passed
apps/tenant-panel$ npx tsc --noEmit && npx eslint src
                                                    # rc=0; 24 warnings, все до правок
```

## Чего НЕ сделано

- **Настоящие тарифы Оксаны не заведены** — это её данные (вес/зоны/служба). Экраны для них уже есть
  (t04): `/shipping` в панели, зоны и тарифы `flat`/`per_kg`/`free_above`. У её тенанта сейчас два
  способа в базовой зоне и ничего сверх — именно поэтому курьер помечен как неподтверждённый.
- **Остальные живые тенанты не переименованы** (см. выше): сойдутся при следующем деплое.
- **Панель `/shipping` не снята скриншотом**: вход в панель под владелицей требует её пароля,
  которого у меня нет. Бейдж проверен типами и линтом, но не глазами на живом стенде.
- Строка в карточке самовывоза («Адрес и время пришлём после заказа») занимает две строки и
  прижимает «Бесплатно» — читается, но плотнее, чем у курьера. Если резать, то в
  `default-method-names.ts`, одной строкой.

## Как проверить за 10 минут

```bash
cd <worktree>
node artifacts/docs/f06-shipping-method-names/probe-shipping-options.mjs cherkashino.shipshift.dev
node artifacts/docs/f06-shipping-method-names/probe-shipping-options.mjs zolotaya-nit-1057.shipshift.dev
open https://cherkashino.shipshift.dev/ru/checkout   # положив товар в корзину
```
