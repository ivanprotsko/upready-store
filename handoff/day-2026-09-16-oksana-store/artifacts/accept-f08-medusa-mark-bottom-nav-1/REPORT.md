# Приёмка PR #46 · f08-medusa-mark-bottom-nav · round 1 — MERGED

Приёмщик: headless `claude -p`, основной чекаут `/Users/ivanprotsko/upready/projects/upready-store` (dev).
Ветка `fix/day16-bottom-nav-mark` → base `dev` (совпадает с заданием), `mergeable: MERGEABLE`,
`mergeStateStatus: CLEAN`. Один коммит `885980c`, один файл
`apps/storefront/src/modules/layout/components/bottom-nav/index.tsx` (+17/−5). Точка ветвления
`4840441` — предок `origin/dev` (проверено `git merge-base --is-ancestor`). Скоупкрипа нет,
секретов нет, миграций и удалений нет, защищённая инфраструктура не тронута.

Дерево воркера чисто и стоит на `origin/fix/day16-bottom-nav-mark` (единственное untracked —
`artifacts/docs/f08-medusa-mark-bottom-nav/`, в PR не попало).

## Проверки (в ворктри ветки, `apps/storefront`)

| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | rc=0 |
| `npx next lint` | rc=0, единственный warning — предсуществующий, `modules/common/components/yandex-metrica/index.tsx:45` |
| `npx vitest run --passWithNoTests …` | rc=0, 19 файлов / 182 теста passed |

## Живой замер (390×844)

Ветка не задеплоена на MT-хост, деплой брифом запрещён, поэтому измерялся сервер САМОЙ ветки:
`next dev -p 8077` в её ворктри с `NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://shipshift.dev` (боевой
бэкенд, только чтение). Браузер ходил через собственный HTTP-прокси на 127.0.0.1:8078, который
подставляет `Host: cherkashino.shipshift.dev` — то есть страница резолвила РЕАЛЬНОГО тенанта Оксаны.

Важно: первая версия замера ушла мимо цели — Chromium поднимал `http://cherkashino.shipshift.dev`
до `https://` по HSTS ещё до прокси, и измерялся ЖИВОЙ ПРОД (старый код, `medusa.svg` на месте).
Замер переделан на не-HSTS алиас `f08.test`; то, что Host дошёл до приложения, доказывает
`aria-label = "Оксана Черкашина"` — имя магазина из настроек тенанта.

Критерий 1 — ни одного запроса `medusa.svg` (`page.on('request')`, полный лог в
`network-and-dom-390x844.json`):

```
home    (200): medusaSvgRequests: []   (27 запросов)
product (200): medusaSvgRequests: []   (38 запросов)
cart    (200): medusaSvgRequests: []   (16 запросов)
всего за сессию: 98 запросов, medusaSvgHits: []
DOM: nav img[src] == []  — в нижней панели вообще нет <img>, только inline SVG
pageerror: []
```

Критерий 2 — центральная кнопка ведёт на главную и сохраняет доступное имя. ARIA-снимок
нижней навигации:

```
- navigation:
  - button "Категории": - img
  - button "Поиск": - img
  - link "Оксана Черкашина":
    - /url: /
    - img
  - link "Профиль": - /url: /account
  - link "Корзина (0)": - /url: /cart
  - button "Переключить на тёмную тему"
```

Клик по кнопке с `/ru/cart` и с карточки товара уводит на главную (`/en` — локаль переключилась
из-за `LOCALE_PIN=true`, который выставил Я в своём стенде; к правке отношения не имеет, путь —
корень сайта). `data-testid="bottom-nav-store-link"` и `href="/"` на месте.

Критерий 3 — скриншоты 390×844: `home-390x844.png`, `product-390x844.png`, `cart-390x844.png`.
Глазами: в центре нижней панели — иконка-домик в одну линию с остальными пятью (бургер, поиск,
домик, профиль, корзина, луна), логотипа Medusa нет.

Критерий 4 — `git grep -n "medusa.svg" apps/storefront` в ворктри ветки: **rc=1, ноль вхождений**.
`public/medusa.svg` не удалён — правильно, он остаётся фолбэком одиночного магазина, задача этого
и не просила.

## Ветка «есть логотип»

`hasLogo ? <SiteLogo/> : <House/>`. Ветка с логотипом вживую не сработала: ни у `cherkashino`, ни у
`zolotaya-nit-1057`, ни у `acme` логотип в настройках тенанта не загружен (все три отдали House —
проверено curl'ом по трём Host). Это не дефект: `SiteLogo` + `getSiteBranding` — ровно тот источник,
которым уже живёт хедер (`nav/variants/h1…h6.tsx`), как задача и просила. Нит, не основание для
отклонения.

## Ниты (в блокировку не идут)

1. Ветка `hasLogo` не измерена вживую — не нашлось тенанта с логотипом. Стоит проверить на первом
   же магазине, который логотип загрузит: `SiteLogo` в панели даёт `h-8 w-auto max-w-[10rem]`, а
   полоса нижней навигации — `h-16` с `[&_svg]:size-5`; растровый логотип встанет заметно крупнее
   соседних иконок.
2. Описание PR обещает проверку «против живых данных тенанта cherkashino» — она честная, но это
   сервер ветки, а не `https://cherkashino.shipshift.dev`. Реальный прод-URL закроется ближайшим
   деплоем волны.
