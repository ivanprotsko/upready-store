# Handoff: новая таблица InSales vs Shopify → versustable

Эта сессия принадлежит проекту `upready-store` (worktree `hompage`), а `astro-quick-views/apps/versustable` —
чужой репозиторий (свой `.git`). Правило 5k блокирует запись в чужой проект из этой сессии, поэтому файлы
подготовлены здесь и ждут переноса сессией, открытой в самом `versustable`.

## Источник данных

- `insales-vs-shopify-comparison.json` — тарифы InSales и Shopify, собраны 2026-09-12 из
  `https://www.insales.ru/signup` и `https://www.shopify.com/id/pricing` (сырой HTML + WebFetch,
  цифры сверены по `data-price-month`/`data-price-year` в разметке insales.ru).
- Формат совпадает с уже используемым в проекте плоским форматом (см. `src/data/payments-ru-comparison.json`):
  `providers[]` / `columns[]` / `groups[]` / `rows[]`.
- `staff-accounts` для inSales оставлен `null` — на странице `/signup` этих цифр по тарифам нет, значение не придумано (правило 17).

## Куда положить (пути внутри `astro-quick-views/apps/versustable`)

1. `src/data/insales-vs-shopify-comparison.json` ← скопировать `insales-vs-shopify-comparison.json`
2. `src/pages/insales-vs-shopify.astro` ← скопировать `insales-vs-shopify.astro`
3. `src/components/SidebarNav.tsx` — добавить одну строку в массив `ITEMS` (после `payments-crypto`):
   ```ts
   { href: "/insales-vs-shopify", label: "InSales vs Shopify" },
   ```

## Запуск

```
cd astro-quick-views/apps/versustable
npm run dev
# открыть http://localhost:4321/insales-vs-shopify
```

## Что НЕ сделано в этой сессии (сознательно, не забыто)

- Полная фиче-матрица (как в `stores-comparison.json`, 299 строк) не переносилась и не сверялась —
  запрошена была структура именно с данными **тарифов**, не полный аудит функций.
- Существующие колонки `insales`/`shopify` внутри `stores-comparison.json` не трогались: это отдельная,
  более старая таблица (6 платформ), и правка её — отдельная задача, не эта.
- Замечено при сверке: тариф «Профессиональный» (8 330 ₽/мес), который есть в `stores-comparison.json`
  (`insales__professionalnyy`), на живой странице `insales.ru/signup` 2026-09-12 больше не показывается —
  на сайте сейчас 5 тарифов, а не 6. Это можно отдельно поправить в `stores-comparison.json`, если нужно.
