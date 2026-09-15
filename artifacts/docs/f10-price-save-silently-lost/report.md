# f10-price-save-silently-lost — сохранение цены больше не теряет введённое значение

Отчёт написан 2026-09-15 16:28 WITA. Замеры — на живом магазине Оксаны (тенант `cherkashino`, товар
«Свечи АСД с чесноком» `prod_01M2GRC5XMX78M72NZSXTM8B6X`, вариант
`variant_01M2GRC6CJB0VZGW034SG084G0`), витрина `https://cherkashino.shipshift.dev`.

## 1. Диагноз: что теряет значение (по коду и замерам, не по гипотезе)

Гипотеза из задачи («грид коммитит ячейку только по Enter/blur, а «Сохранить» отправляет форму
без незакоммиченной правки») **подтвердилась в первой половине и оказалась неполной во второй**.

1. Все редактируемые ячейки дата-грида отдают значение форме **только на blur** — в коде это
   написано прямым текстом: `apps/tenant-panel/src/components/data-grid/components/data-grid-number-cell.tsx:77`
   («We propagate the change to the field only when the input is blurred»), то же в
   `data-grid-currency-cell.tsx:126-131` (цена), `data-grid-text-cell.tsx:66-70`,
   `data-grid-toggleable-number-cell.tsx:193-197` (склад). До blur значение живёт в локальном
   `useState` ячейки, и форма о нём не знает.

2. **Клик мышью по «Сохранить» blur вызывает** — и значение доезжает. Замер порядка событий на
   живой панели (`raw/p02-probe.json`, миллисекунды от старта страницы):
   `mousedown BUTTON «Сохранить» 14220 → blur INPUT variants.0.prices.rub val="1 400" 14220 →
   focus BUTTON 14244 → click 14245 → submit FORM 14245`, в запросе уехало `"amount":1400`,
   цена на движке стала 1400. То же в WebKit — 2 из 2 сохранений (`raw/p03-live-webkit-before.json`).

3. **Потерю даёт `Cmd/Ctrl+Enter`** — родной для панели способ сохранить форму
   (`components/utilities/keybound-form/keybound-form.tsx`: форма submit-ится только по meta/ctrl+Enter).
   Он отправляет форму **прямо из ячейки**, blur не происходит вообще, и в запрос уезжает СТАРАЯ цена:
   0 из 2 на живой панели (`raw/p03-live-chromium-metaenter-before.json`) и 0 из 2 на локальном
   стенде до фикса (`raw/p03-stand-before-metaenter.json`) — дровер закрывается, ошибок нет,
   в панели и на витрине остаётся прежняя цена. Это ровно тот симптом, который описан в задаче.

4. **Почему значение «терялось» и в прогоне QA с кликом мышью.** Скрипт q02 доходил до колонки
   «Цена RUB» нажатиями Tab и останавливался, когда в DOM появлялся её **заголовок**, а
   виртуализация рендерит заголовок раньше, чем якорь до него доезжает. Замер
   (`drv/p04-qa-anchor.mjs`, 4 прогона, `raw/p04-qa-anchor.json`):

   | прогон | нажатий Tab | ячейка, в которую вошла правка |
   |---|---|---|
   | 1 | 95 | `variants.0.prices.rsd` (соседняя слева) |
   | 2 | 96 | `variants.0.prices.rub` |
   | 3 | 95 | `variants.0.prices.rsd` |
   | 4 | 95 | `variants.0.prices.rsd` |

   Отсюда и лишняя цена варианта в RSD = 1355, созданная 2026-09-15 07:24 WITA
   (`price_01M2H3R4MR570Y8E7NBYXFWQE7`, время из ULID; RUB и USD созданы 2026-09-15 04:05 WITA
   при миграции): 1400 и 1355 уходили в соседнюю валюту, а RUB оставался 1355. То есть «2 из 6»
   в отчёте `q02` — артефакт харнесса приёмки, а не второй дефект панели. Но опасность он
   показывает настоящую: колонка рублёвой цены 89-я среди сотни одинаковых «Цена XXX», и запись
   в соседнюю валюту выглядит для владелицы точно так же, как потеря (это задача `f09`).

## 2. Что изменено

| Файл | Что |
|---|---|
| `apps/tenant-panel/src/components/utilities/keybound-form/keybound-form.tsx` | Перед чтением формы submit «дожимает» контрол в фокусе: `flushFocusedControl()` снимает фокус с input/textarea/select внутри этой же формы, blur срабатывает синхронно, ячейка отдаёт значение форме — и только потом вызывается `onSubmit`. Лечит КЛАСС, а не один экран: `KeyboundForm` — общая обёртка 35 форм панели, включая все экраны с дата-гридом (цены, склад, мастер товара, мастер варианта) |
| `apps/tenant-panel/src/routes/products/product-prices/pricing-edit.tsx` | Ошибка больше не молчит: (а) значение, которое не превращается в число (`castNumber` → NaN), не уезжает на сервер — ячейка помечается ошибкой формы, показывается тост, дровер НЕ закрывается; (б) неудачный запрос ловится `try/catch` и показывается тостом с сообщением сервера — раньше `mutateAsync` отклонялся в пустоту, и владелица не видела ничего |
| `apps/tenant-panel/src/i18n/translations/ru.json`, `en.json` | `products.toasts.prices.error.header` = «Цена не сохранена», `...invalid` = «Введите цену числом, например 1400» |
| `.gitignore` | скриншоты и playwright-состояние сессии владельца этой задачи — вне git |

Проверки (из `apps/tenant-panel`, как предписывает AGENTS.md для панели):

```
npx tsc --noEmit    # rc=0
npx eslint src      # rc=0 (24 предсуществующих warning, ни одного в тронутых файлах)
```

## 3. Замеры после фикса — приёмка задачи

Стенд: **исправленный код этой ветки** (`vite dev`, порт 5193) против **живого бэкенда** магазина
(`drv/proxy.mjs` переписывает `Host`, потому что vite-прокси ходит с `changeOrigin: false`, а traefik
на хосте маршрутизирует по `Host`). То есть данные, товар, движок и витрина — настоящие; не задеплоено
только на `panel-store.upready.dev` (деплой — не моя задача, правило 21c).

Сценарий из шагов 1–4 задачи (Enter → 10× Backspace → набрать → «Сохранить», **без** Enter и без
ручного снятия фокуса), 5 прогонов подряд; после каждого — перезагрузка карточки варианта в панели
и страницы товара на витрине (`raw/p03-stand-after-click-5.json`):

| попытка | введено | в запросе | в панели после перезагрузки | на витрине |
|---|---|---|---|---|
| 1 | 1 451 | 1451 | 1 451,00 ₽ | 1 451,00 ₽ |
| 2 | 1 452 | 1452 | 1 452,00 ₽ | 1 452,00 ₽ |
| 3 | 1 453 | 1453 | 1 453,00 ₽ | 1 453,00 ₽ |
| 4 | 1 454 | 1454 | 1 454,00 ₽ | 1 454,00 ₽ |
| 5 | 1 455 | 1455 | 1 455,00 ₽ | 1 455,00 ₽ |

Тот же сценарий, но сохранение с клавиатуры `Cmd+Enter` — путь, который терял значение
(`raw/p03-stand-after-metaenter-5.json`):

| попытка | введено | в запросе | в панели после перезагрузки | на витрине |
|---|---|---|---|---|
| 1 | 1 461 | 1461 | 1 461,00 ₽ | 1 461,00 ₽ |
| 2 | 1 462 | 1462 | 1 462,00 ₽ | 1 462,00 ₽ |
| 3 | 1 463 | 1463 | 1 463,00 ₽ | 1 463,00 ₽ |
| 4 | 1 464 | 1464 | 1 464,00 ₽ | 1 464,00 ₽ |
| 5 | 1 465 | 1465 | 1 465,00 ₽ | 1 465,00 ₽ |

До фикса, тот же `Cmd+Enter`: 0 из 2 на живой панели и 0 из 2 на том же стенде с откаченным
`keybound-form.tsx` — в запросе уезжала прежняя 1412 при набранной 1 421 / 1 431.

Регрессия не появилась и на третьем пути (Enter коммитит ячейку, затем клик): 2 из 2
(`raw/p03-stand-after-enter.json`).

Явная ошибка вместо молчания (`drv/p05-error-path.mjs`, запрос сохранения отвечает 500):

| | до фикса (`raw/p05-error-path-before-fix.json`) | после (`raw/p05-error-path.json`) |
|---|---|---|
| тостов на экране | 0 | «**Цена не сохранена** / Цена отклонена сервером (тест)» |
| дровер | остался открыт | остался открыт |
| цена на движке | 1465 (не изменилась) | 1465 (не изменилась) |

Тост живёт ~4 с (штатная длительность тостов панели) — он снят на 0,6 / 0,9 / 1,5 / 2,5 с после
клика, скриншот `shots/p05-error-toast-1280x900.png`.

**Цена варианта возвращена в 1 355,00 ₽** и проверена в панели и на витрине
(`raw/p03-stand-restore-1355-final.json`).

## 4. Как принять за 10 минут

1. `https://panel-store.upready.dev` → товар «Свечи АСД с чесноком» → `/prices`.
   Это ещё НЕ исправленная сборка: набрать новую цену в «Цена RUB» и нажать `Cmd+Enter` — дровер
   закроется, цена не изменится. Так выглядит дефект.
2. Поднять исправленную панель из этой ветки против живого бэкенда:

   ```
   cd <worktree>/artifacts/docs/f10-price-save-silently-lost/drv && node proxy.mjs 5199 &
   cd <worktree>/apps/tenant-panel && printf 'VITE_MEDUSA_BACKEND_URL=http://127.0.0.1:5199\n' > .env && npx vite --port 5193 --strictPort
   ```

   Войти владельцем (реквизиты — `~/upready/.private/upready-store-day-2026-09-16/cherkashino-owner.md`),
   тот же товар → `/prices` → набрать цену → `Cmd+Enter`: цена сохранится, и она же будет на витрине.
3. Прогнать замер целиком:

   ```
   PANEL_URL=http://localhost:5193 node drv/p03-scenario.mjs --engine=chromium --base=1471 --runs=5 --commit=metaenter --verify-ui --storefront --tag=accept
   PANEL_URL=http://localhost:5193 node drv/p03-scenario.mjs --engine=chromium --base=1355 --runs=1 --commit=click --verify-ui --storefront --tag=restore
   ```

Скриншоты (вне git, абсолютные пути):
`/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-price-save-silently-lost/artifacts/docs/f10-price-save-silently-lost/shots/stand-after-click-5-run1-typed-1280x900.png` … `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-price-save-silently-lost/artifacts/docs/f10-price-save-silently-lost/shots/stand-after-click-5-run5-after-1280x900.png`,
`/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-price-save-silently-lost/artifacts/docs/f10-price-save-silently-lost/shots/stand-after-metaenter-5-run1-typed-1280x900.png` … `-run5-after-1280x900.png`,
`/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-price-save-silently-lost/artifacts/docs/f10-price-save-silently-lost/shots/p05-error-toast-1280x900.png`,
`/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-price-save-silently-lost/artifacts/docs/f10-price-save-silently-lost/shots/live-chromium-metaenter-before-run1-after-1280x900.png` (дефект до фикса).

## 5. Чего НЕ сделано и почему

- **Не задеплоено на `panel-store.upready.dev`** — деплой только по команде Ивана (правило 21c);
  приёмка сделана на исправленной сборке против живого бэкенда. Пока PR не задеплоен, дефект на
  живой панели остаётся.
- **Лишняя цена варианта в RSD = 1355** (`price_01M2H3R4MR570Y8E7NBYXFWQE7`) — мусор от прогона
  приёмки `q02`, а не от миграции. Удаление цены в живой БД моя задача не предписывает; решение за
  приёмщиком (на витрине RSD не показывается, вреда нет).
- **Автотеста нет**: в `apps/tenant-panel` нет тестового рантайма (ни vitest, ни jsdom), а
  единственный e2e-скрипт `e2e/tenant-panel.e2e.mjs` требует локального бэкенда с тенантами
  acme/globex, которого у меня не поднято. Вместо него в репозитории лежат воспроизводимые
  драйверы приёмки (`artifacts/docs/f10-price-save-silently-lost/drv/*.mjs`) — ими снят каждый
  замер выше. Заводить тестовый рантайм панели — отдельная задача, не эта.
- **Колонка «Цена RUB» 89-я** и отсутствие подсказки, в какой валюте стоит курсор — задача `f09`,
  не трогал.
- Тосты об ошибке добавлены только на экране цен. На остальных экранах с дата-гридом
  (склад, мастер товара) значение теперь тоже не теряется (общий `KeyboundForm`), но их обработка
  ошибок осталась прежней — это их задачи.
