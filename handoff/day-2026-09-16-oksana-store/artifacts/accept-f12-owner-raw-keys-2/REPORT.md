# Приёмка f12-owner-raw-keys, раунд 2 — MERGED

PR #50 · ветка `fix/day16-owner-raw-keys` (286292c) · база `dev` · mergeable=MERGEABLE, CLEAN

Приёмщик поднял СВОЙ стенд из worktree ветки (стенд воркера был погашен — порт 5190 пуст на момент
приёмки) и переизмерил сам, не переиспользуя выгрузки воркера.

## Стенд приёмщика

- БД `upready_store_f12` (postgres :5433, клон `upready_store_cherkashina`) — существует, проверено.
- backend `medusa develop` :9040 (лог `/tmp/f12-accept-backend.log`, «Server is ready on port: 9040»).
- панель `vite` :5190, отдаёт ЭТОТ worktree.
- Скрипт обхода приёмщика: `/tmp/f12-accept-walk.mjs` (собственный, 17 экранов), лог
  `/tmp/f12-accept-walk.log`, выгрузка `acceptor-walkthrough.json`, скриншоты `a*-1280x900.png`.

## Замер по критериям задачи (17 экранов, innerText)

| Критерий | Ожидалось | Измерено |
|---|---|---|
| `/[a-z][a-z_]+\.[a-z_]+\.[a-z_]+/` | 0 | **0** сырых ключей. Два формальных совпадения — реальные доменные имена `cherkashino.upready.dev`, `stores.upready.dev` на `/pages` и `/settings/domains` |
| `Pp_system_default\|Canceled\|Default option\|Sales channel of tenant\|Russian Federation\|Show password\|ИСТИНА\|ЛОЖЬ` | 0 | **0** видимых. Единственное совпадение — `Show password` на `/settings/payments`, замер DOM приёмщика: `span.sr-only`, 1×1 px, `clip: rect(0,0,0,0)` → `visible:false`. Зрячей владелице не показывается |
| В заголовке вкладки нет слова Medusa | нет | **нет** ни на одном из 17 экранов; заголовки вида «Заказы — Оксана Черкашина» |
| доп. список приёмщика: `Фулфилмент\|Редактировать рейтинг\|Header Accent\|Category tiles\|Предложен\|Отклонен\|Medusa\|\d RUB\|₽ \d` | 0 | **0** |

Глазами (18f), скриншоты приложены:
- `a05-order-detail`: «1 084,00 ₽» (не «₽ 1 084,00 RUB»), «Оплата вручную» (не `pp_system_default`),
  «Получен» (не `Canceled`), «15 сент. 2026 г. 17:01» (не английский месяц), адрес «Россия».
- `a06-promotions-create`: шесть человеческих названий видов акций вместо 12 строк ключей.
- `a06b-promotions-details`, `a09-home-settings`, `a03-product-detail`: по-русски, страницы
  отрисованы (не пустые и не экраны ошибки).

## Прочие проверки

- `apps/tenant-panel`: `corepack pnpm run typecheck` → rc=0.
- `apps/storefront`: `npx vitest run src/lib/util/option-filter-groups.test.ts` → rc=0, 6/6
  (заявленные +2 на русский сентинел есть).
- `lib/idn.ts` сверен приёмщиком с `require("url").domainToUnicode` на 4 доменах
  (`xn--80ajkgrgj8cn.xn--p1ai` → `черкашино.рф`, `xn--d1acufc.xn--p1ai`, `xn--80apaahi7a3c.xn--p1ai`,
  `example.com`) — совпадает во всех.
- Секретов в диффе нет, миграций и удалений данных нет, protected-infra не тронута.
  `apps/backend/src/scripts/f12-seed-test-order.ts` — throwaway-фикстура той же формы, что уже
  лежащие в `dev` `t13-seed-test-tenant.ts`/`t17-seed-test-tenant.ts`.
- Все четыре находки раунда 1 закрыты: конфликт с `dev` разрешён (мерж d2764b3, CLEAN),
  живой обход со скриптом и артефактами есть, `Sales channel of tenant` убран из панели,
  «Default option» починен по всей цепочке сидов + защищён от регрессии на витрине.

## Мелочи (не основание для отклонения, вынесены комментарием к PR)

1. `/products/<id>`, блок «Профиль доставки»: значение из БД — «Default Shipping Profile / default».
   Тот же класс, что «Default option», но в инвентаре задачи его не было.
2. `/home-settings`: подсказка плиток категорий — «Ряд плиток категорий под хиро», тогда как сам
   блок назван «Первый экран». Тело PR явно обещало не плодить «хиро» — один хвост остался.
3. `/orders/<id>`: бейдж «Ожидает фулфилмента» (в списке заказов колонку уже переименовали в «Отгрузку»).
