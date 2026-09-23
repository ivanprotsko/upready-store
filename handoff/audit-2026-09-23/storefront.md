# Аудит storefront — 2026-09-23

## Охват и метод

Ветка `dev` в основном чекауте, `git rev-parse --short HEAD` → `f72def34`. Читался только
`/Users/ivanprotsko/upready/projects/upready-store/apps/storefront` (481 файл `.ts`/`.tsx` под `src`)
плюс источник тем `/Users/ivanprotsko/upready/projects/upready-store/specs/design-system/themes/`.
Ворктри открытых PR #114/#115/#116 не открывались — там перестраивается страница товара, и находки по
`[locale]/(main)/products/[handle]` относятся к `dev` как он есть.

Прочитано целиком: `src/middleware.ts`, `next.config.js` (выборочно: `images`, `headers`,
`experimental`), `src/app/layout.tsx`, `src/app/[locale]/layout.tsx`, `src/app/sitemap.ts`,
`src/app/robots.ts`, `src/app/[locale]/(main)/products/[handle]/page.tsx`, `src/lib/data/products.ts`
(первые 90 строк), `src/lib/util/legal-links.ts` (первые 60 строк), `src/lib/util/money.ts`,
`src/modules/layout/templates/footer/variants/f1.tsx`,
`src/modules/home/components/category-tiles/index.tsx`,
`src/modules/checkout/templates/checkout-form/index.tsx`,
`src/modules/checkout/components/submit-button/index.tsx`,
`src/modules/checkout/components/error-message/index.tsx`,
`src/modules/common/components/input/index.tsx`,
`src/modules/common/components/analytics/index.tsx`,
`src/modules/common/components/google-analytics/index.tsx`,
`src/styles/themes.css` (блок пресетов целиком, машинно). Остальное — адресные grep-выборки по `src`
с исключением `node_modules`/`.next`/`dist`/`.turbo`.

Применённые стандарты из `standards.md`: Core Web Vitals (LCP, CLS, TTFB), Next.js 15 App Router
(границы server/client, кэш `fetch`, `next/image`, `generateMetadata`, стриминг), WCAG 2.2 AA
(SC 1.1.1, 1.4.3, 1.4.11, 2.4.1, 2.4.4, 2.4.7, 3.1.1, 4.1.2, 4.1.3), Google Search Essentials
(canonical, hreflang, sitemap, robots, структурированные данные), ICU MessageFormat, 152-ФЗ (политика
и оферта на сайте, согласие на аналитику), ISO 25010 (удобство использования, сопровождаемость).

Команды (все под `nice -n 15`, по одной, без сети):

| Команда | Код | Результат одной строкой |
|---|---|---|
| `node -e '<парити 36 каталогов из AGENTS.md>'` в корне репозитория | 0 | `checked 36 catalogs against 532 keys; divergent: 0` — расхождений нет |
| `node scripts/check-locale-catalogs.mjs` | 0 | `OK — 3 catalogs, 36 codes each, all agree` |
| `node -e '<разбор themes.css, расчёт отношений контраста по WCAG>'` | 0 | 30 блоков пресетов, нарушений в 14 (см. B-06 и B-11) |
| `node -e '<поиск вызовов convertToLocale без locale>'` | 0 | ни одного: все 39 вызовов передают локаль |
| `grep -rl '"use client"' src --include='*.tsx' --include='*.ts' \| wc -l` | 0 | 127 файлов |
| `grep -rl '"use server"' src …` | 0 | 27 файлов |
| `grep -rn 'next/dynamic' src --include='*.tsx'` | 1 | ни одного вхождения |
| `grep -rn 'generateStaticParams' src/app -r` | 1 | ни одного вхождения |
| `find src/app -name 'loading.tsx' \| wc -l` | 0 | 4 при 32 `page.tsx` |
| `grep -rln 'Suspense' src/app src/modules --include='*.tsx' \| wc -l` | 0 | 8 файлов |
| `grep -rn 'aria-invalid\|role="alert"\|aria-live' src --include='*.tsx' \| wc -l` | 0 | 3 вхождения на всю витрину |
| `grep -oE '(one\|few\|many\|other) \{' messages/ru.json \| sort \| uniq -c` | 0 | по 9 каждой формы — все 9 plural-строк полные |

`tsc`, `next lint`, `next build`, тесты и dev-серверы не запускались по условиям задания.

## Итог одной строкой

**Оценка C.** Витрина сильна в SEO и i18n (парити 36 каталогов зелёный, hreflang с `x-default`,
JSON-LD Product/Offer/BreadcrumbList, `noindex` на корзине и кабинете, аналитика не грузится до
согласия), но три вещи бьют по покупателю: (1) ни один футер не выводит ссылку на политику и оферту —
риск по 152-ФЗ; (2) в пресете по умолчанию в тёмном режиме текст на основной кнопке даёт контраст
2,29:1 против нормы 4,5:1, то есть подпись «В корзину» и «Оформить заказ» нечитаема; (3) на 32
страницы всего 4 `loading.tsx` и 8 `Suspense` при полном отсутствии статики, поэтому LCP и TTFB
целиком наследуют задержку бэкенда.

## Находки

| ID | Серьёзность | Стандарт | Где (абсолютный путь:строка) | Что не так | Риск | Что сделать | Объём |
|---|---|---|---|---|---|---|---|
| B-01 | High | 152-ФЗ (политика на сайте), WCAG 2.2 SC 2.4.4 | `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/modules/layout/templates/footer/variants/f1.tsx:43,61,81,104` | Ни один из шести вариантов футера не разрешает legal-слоты: `grep -rln '@lib/data/legal-links\|util/legal-links' src` даёт 20 файлов, и среди них нет ни одного под `src/modules/layout`. F1 выводит только `/`, категории, коллекции и `/pages/${page.key}` — то есть те страницы, которые магазин опубликовал сам. Магазин, не опубликовавший `privacy`/`offer`, не имеет ссылки на политику ни на одной странице кроме оформления заказа (`src/app/[locale]/(checkout)/layout.tsx`) и входа (`src/modules/account/templates/login-template.tsx`) | Обработка персональных данных без доступной с любой страницы политики — прямое нарушение 152-ФЗ; покупатель не находит оферту до оплаты | Вставить в общий блок футера ряд из `legalHref()` тем же резолвером, что уже работает в оформлении заказа (`src/lib/data/legal-links.ts` + `src/lib/util/legal-links.ts`), с фолбэком на страницы-заглушки стартера | S |
| B-02 | Medium | WCAG 2.2 SC 1.4.3 (контраст текста 4,5:1) | `/Users/ivanprotsko/upready/projects/upready-store/specs/design-system/themes/medusa.theme.json:53-54,61-62`, сгенерировано в `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/styles/themes.css:268-269,259-260` | Посчитано по формуле WCAG: в блоке `[data-theme="medusa"][data-mode="dark"], [data-theme="default"][data-mode="dark"]` пара `--primary-foreground` `rgba(24,24,27,1)` на `--primary` `rgba(82,82,91,1)` даёт **2,29:1**, пара `--destructive-foreground` `rgba(255,255,255,1)` на `--destructive` `rgba(251,113,133,1)` даёт **2,69:1**. Норма для обычного текста 4,5:1. Это пресет по умолчанию: `src/app/layout.tsx:44-47` фиксирует, что магазин без профиля попадает на `default`, а `themes.css` разрешает `default` в пресет `medusa` | Подпись на основной кнопке («В корзину», «Оформить заказ») и текст на кнопке удаления в тёмном режиме почти нечитаемы; это единственная пара из 30 блоков, где падает контраст именно текста, и падает она в дефолтном оформлении | Поднять `--primary-foreground` тёмного medusa до светлого (как в шести других пресетах, где эта пара проходит) и `--destructive` затемнить; правка в `specs/design-system/themes/medusa.theme.json` плюс `pnpm themes:build`, CSS генерируемый и руками не правится | S |
| B-03 | Medium | CWV LCP/TTFB, Next.js 15 App Router (стриминг) | `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/app` (весь каталог: 32 `page.tsx`, 4 `loading.tsx`, 8 файлов с `Suspense`, 0 `generateStaticParams`) | Ни одного `generateStaticParams` и ни одного статически сгенерированного маршрута: магазин резолвится из заголовка `Host` в `src/middleware.ts`, поэтому каждый рендер динамический. При этом `loading.tsx` есть только у `account`, `account/@dashboard`, `cart`, `order/[id]/confirmed`; у `/store`, `/categories/[...category]`, `/collections/[handle]`, `/products/[handle]`, `/journal` его нет, и `Suspense` в них не используется | Белый экран до полного ответа Medusa на каталожных и товарных страницах; LCP и TTFB целиком наследуют задержку бэкенда, порог 2,5 с недостижим при медленном ответе | Добавить `loading.tsx` четырём каталожным сегментам и обернуть в `Suspense` блоки ниже первого экрана (отзывы, похожие товары) — скелеты в модулях уже есть | M |
| B-04 | Medium | Google Search Essentials (лимит sitemap 50 000 URL), CWV TTFB | `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/app/sitemap.ts:50-59,65-89,107-117,140-150,191-209` | Один файл на всё: каждый товар, категория, коллекция и статья умножаются на все локали магазина (до 36) во вложенных циклах. Товары читаются последовательным `while` по 100 штук (строки 65-89), и весь sitemap собирается на каждый запрос, без ревалидации по времени. Превышение лимита в 50 000 URL — **предположение**: зависит от числа товаров магазина, которое я не измерял (36 локалей × 1 400 товаров уже за лимитом) | Sitemap выше лимита Google игнорируется целиком, и магазин теряет индексацию каталога; на большом каталоге сам запрос `/sitemap.xml` держит соединение десятки секунд | Разбить через `generateSitemaps` по локали (каждый шард ≤ 50 000 URL), добавить сегментный `revalidate`, страницы каталога тянуть по 1 000 | M |
| B-05 | Medium | WCAG 2.2 SC 4.1.3 (сообщения о состоянии, AA) | `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/modules/checkout/components/error-message/index.tsx:19-24` | Единственный компонент вывода ошибок витрины рендерит обычный `<div>` — без `role="alert"`, без `aria-live`, и без `aria-invalid` на самом поле. Он подключён в 15 файлах, включая все листы оформления заказа, выпадающую корзину, кнопку оплаты и регистрацию (`src/modules/account/components/register/index.tsx:86`). На всю витрину найдено 3 вхождения `aria-invalid`/`role="alert"`/`aria-live`, и два из них в служебной панели и галерее, а не в покупательских формах | Покупатель со экранным диктором отправляет форму оформления заказа, получает отказ и не слышит причину: ошибка появляется в DOM молча. Это самый дорогой экран магазина | Добавить `role="alert"` в `ErrorMessage` (одна строка) и пробросить `aria-invalid` в поле, когда ошибка относится к нему | S |
| B-06 | Medium | Next.js 15 App Router (явные `fields`), CWV TTFB | `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/lib/data/products.ts:77-79` | Единственный список `fields` на все вызовы `listProducts`: `*variants.calculated_price,+variants.inventory_quantity,*variants.images,*variants.options,+options.values.metadata,+metadata,+tags,*categories,*categories.parent_category,*categories.parent_category.parent_category`. Тот же запрос обслуживает сетку каталога, где карточка (`src/modules/products/components/product-preview/index.tsx`) показывает только миниатюру, название и цену | Сетка из 12 товаров тянет все варианты со всеми изображениями, опциями, метаданными и тремя уровнями родительских категорий; ответ Medusa и объём JSON в RSC-потоке кратно больше нужного | Ввести второй, короткий набор `fields` для списков (`thumbnail,title,handle,*variants.calculated_price`), полный оставить странице товара | S |
| B-07 | Medium | WCAG 2.2 SC 2.4.1 (уровень A) | `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/app/[locale]/(main)/layout.tsx:87` | `<main id="main-content">` есть, а ссылки на этот якорь нет: `grep -rn 'main-content' src --include='*.tsx'` возвращает ровно эту одну строку. Цель для пропуска блоков подготовлена, механизм не дописан | Клавиатурный и screen-reader покупатель на каждой странице проходит шапку, меню, поиск и переключатели языка и региона до контента | Добавить первым дочерним элементом `(main)/layout.tsx` ссылку `<a href="#main-content">` с классом `sr-only focus:not-sr-only`, плюс строку в 36 каталогов | S |
| B-08 | Medium | CWV CLS, Next.js 15 (`next/image`) | `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/modules/layout/components/site-logo/index.tsx:36,43,45` | Три сырых `<img>` — единственные в витрине (`grep -rn '<img ' src --include='*.tsx'` даёт только их) — без `width`/`height`, без `next/image`. Логотип магазина стоит в шапке над первым экраном | Сдвиг макета шапки при загрузке логотипа на каждой странице: CLS растёт ровно там, где вклад заметнее всего; изображение не оптимизируется и не отдаётся в AVIF/WebP | Проставить явные `width`/`height` (или `next/image` с фиксированными размерами; светлый и тёмный вариант остаются двумя элементами) | S |
| B-09 | Medium | ISO 25010 производительность, Next.js 15 (разделение кода) | весь `src`: `grep -rn 'next/dynamic' src --include='*.tsx'` → 0 вхождений при 127 файлах с `"use client"` | Ленивой загрузки нет вообще. Клиентские подграфы при этом большие: 20 файлов оформления заказа (`src/modules/checkout/components/checkout-*-sheet/index.tsx` и соседние), галерея товара `src/modules/products/components/image-gallery/gallery.tsx` (≥374 строк), скрытая панель настроек `src/modules/studio/components/theme-panel/`. Панель монтируется из корневого layout (`src/app/layout.tsx:151`) на каждой странице. Величину эффекта не измерял — **предположение**; отсутствие разделения проверено | Лишний JavaScript в первой загрузке всех маршрутов бьёт по INP и по LCP на мобильном | Обернуть `StudioMount` и листы оформления заказа в `dynamic(() => …, { ssr: false })`; начать со студии, она нужна только владельцу с cookie | M |
| B-10 | Low | WCAG 2.2 SC 1.4.11 (контраст нетекстовых элементов 3:1) | `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/styles/themes.css:19-234` (все семь пресетов, оба режима; источники — `/Users/ivanprotsko/upready/projects/upready-store/specs/design-system/themes/*.theme.json`) | Расчёт по WCAG дал `--border`/`--background` и `--input`/`--background` ниже 3:1 в 12 блоках из 14: `geist` светлый 1,19, `medusa`/`default` светлый 1,27, `sneakers` светлый 1,27, `supplements` светлый 1,32, `womens-fashion` светлый 1,33, `home-goods` светлый 1,36, тёмные варианты 1,31-1,51. У `geist` светлого не проходит и `--ring` (2,58). В `medusa`/`default` граница задана как `rgba(255,255,255,0.08)`, и мой расчёт проигнорировал альфу, то есть там отношение фактически ещё ниже. Строгость нарушения — **предположение**: поле ввода в этой витрине имеет ещё и собственную заливку (`bg-ui-bg-field` в `src/modules/common/components/input/index.tsx:52`), а SC 1.4.11 требует 3:1 только когда граница — единственный признак элемента | Границы полей и разделители почти не видны при ярком свете и на плохом экране; покупатель не понимает, где заканчивается одно поле формы оформления заказа и начинается другое | Поднять `--border` до 3:1 хотя бы для полей ввода (отдельный токен `--input` уже есть, достаточно затемнить его в семи JSON-файлах и пересобрать) | M |
| B-11 | Low | ICU / i18n, AGENTS.md «Never hardcode a user-facing string» | `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/app/start/layout.tsx:23,25`; `…/src/app/start/plan/page.tsx:24`; `…/src/app/start/pay/page.tsx:11,13,15,17`; `…/src/app/start/pay/pay-form.tsx:74,190,200`; `…/src/app/start/service/page.tsx:19,28,29`; `…/src/app/start/onboarding/page.tsx:26`; `…/src/app/start/onboarding/wizard.tsx:9,84,209,357,379` | Воронка создания магазина живёт вне сегмента `[locale]`, next-intl до неё не доходит, и все её строки вписаны по-русски в TSX («Создать магазин · Upready», «Касса не ответила…», «Проводим платёж…»). В покупательских модулях под `[locale]` кириллица встречается только в комментариях — проверено отдельно по десяти файлам из списка | Воронку нельзя показать на другом языке; строки правятся в коде, а не в каталоге | Либо признать воронку русской и записать это решение рядом, либо завести для неё отдельный каталог сообщений | M |
| B-12 | Low | i18n (`Intl` с локалью запроса) | `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/modules/studio/components/theme-panel/save-bar.tsx:35`; `…/src/lib/demo/catalog.ts:196` | Две точки форматирования с жёстко вписанной локалью: `toLocaleDateString("en-GB", …)` в панели и `toLocaleString("ru-RU")` для рублей в демо-каталоге. Все остальные идут через локаль запроса — проверено машинно: из 39 вызовов `convertToLocale` ни один не опускает `locale` | Дата в панели владельца всегда британская, цена демо-каталога всегда русская независимо от языка страницы | Передать локаль запроса в оба вызова | S |
| B-13 | Info | Google Search Essentials (canonical) | `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/app/layout.tsx:30-40` | Корневой `generateMetadata` задаёт только `metadataBase` и `icons`: ни `title`, ни `description` по умолчанию, ни `openGraph` уровня сайта. Дефекта нет — все страницы под `[locale]` ставят своё (33 файла с `generateMetadata`), но новая страница без собственных метаданных уедет в индекс без title | Наблюдение; риска сегодня нет | При желании добавить `title.template` и `description` в корневой layout как сетку безопасности | S |
| B-14 | Info | Российская розница (цена как окончательная), ISO 25010 функциональная пригодность | `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/lib/util/get-product-price.ts:22-30`; `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/modules/common/components/cart-totals/index.tsx:65-66` | Цена в карточке и на странице товара берётся из `calculated_price.calculated_amount`, налог выводится отдельной строкой в итогах корзины. Включена ли выводимая цена в налог — **предположение**: это определяет флаг региона на стороне Medusa (`tax_inclusive_pricing`), который я не читал, бэкенд вне моей области | Если регион настроен как tax-exclusive, покупатель видит на витрине одну цену, а в корзине другую — для российской розницы цена на витрине должна быть окончательной | Проверить флаг региона на стенде и, если он выключен, перейти на `calculated_amount_with_tax` в отображении | S |

## Что сделано хорошо

- **Парити локализации держится инструментами, а не дисциплиной.** Снипет из AGENTS.md дал
  `divergent: 0` на 36 каталогах и 532 ключах, а `scripts/check-locale-catalogs.mjs` подтвердил, что
  три списка кодов (`apps/storefront/src/i18n/config.ts`, валидаторы бэкенда, каталог панели)
  совпадают.
- **Русские формы множественного числа сделаны правильно.** Все 9 plural-строк в
  `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/messages/ru.json` (строки 154,
  395, 401, 423, 442, 443, 640, 758, 791) несут `one`/`few`/`many`/`other`, а не одну форму.
- **Аналитика не грузится до согласия.** `useIdleAfterConsent` в
  `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/modules/common/components/google-analytics/index.tsx:15,23-25`
  возвращает `null` до согласия, то есть скрипт GA4 в DOM не попадает, а после согласия откладывается
  до простоя. Магазин без настроенных счётчиков не грузит вообще ничего
  (`src/modules/common/components/analytics/index.tsx:21-23`). Для 152-ФЗ это сделано как надо.
- **hreflang сделан централизованно и покрыт тестом.** `buildAlternates` подключён в 14 семействах
  маршрутов, и
  `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/lib/util/alternates.test.ts:9-10`
  проверяет, что языков ровно `locales.length + 1` и что `x-default` указывает на локаль по умолчанию.
- **`noindex` расставлен там, где нужно.**
  `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/lib/util/robots.ts:3` и его
  9 потребителей закрывают корзину, оформление, кабинет, страницы заказа и сброс пароля; те же пути
  перечислены в `disallow` в `src/app/robots.ts:14-21`.
- **Структурированные данные полные.**
  `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/lib/util/json-ld.ts` собирает
  `Product` с `Offer` на каждый вариант (строки 98-106), `BreadcrumbList` (130-133),
  `Organization`/`WebSite` (147, 154) и `AggregateRating` только при реальных отзывах (196-206) — одним
  `@graph` в одном теге.
- **Sitemap разведён по тенантам осознанно, с комментариями на измеренных случаях.**
  `src/app/sitemap.ts:93-98,120-131` объясняет, почему категории и коллекции читаются через
  tenant-scoped маршруты, и называет конкретный случай пересечения двух магазинов. Проблема в объёме
  (B-04), не в изоляции.
- **Видимый фокус не сломан.** Все шесть найденных `focus:outline-none` идут в паре с
  `focus-visible:ring-2 focus-visible:ring-[var(--ring)]` (например
  `src/modules/common/components/input/index.tsx:52`), то есть SC 2.4.7 соблюдён.
- **Поля формы подписаны программно.** Общий `Input`
  (`/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/modules/common/components/input/index.tsx:45,55-56`)
  связывает `id={inputId}` с `htmlFor={inputId}`, а кнопка показа пароля несёт `aria-label` и
  `aria-pressed` (строки 68-70). Именно поэтому расхождение «72 поля против 20 `htmlFor`» дефектом не
  является.
- **Двойная отправка заказа закрыта.**
  `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/modules/checkout/components/submit-button/index.tsx:20,27`
  берёт `pending` из `useFormStatus` и переводит кнопку в `isLoading`; кнопка оплаты держит
  `disabled`, пока обязательные поля не заполнены
  (`src/modules/checkout/components/payment-button/index.tsx:59,104`).
- **Ориентиры страницы расставлены осознанно.** Комментарий в
  `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/app/layout.tsx:128-131`
  объясняет, почему корневая обёртка не `<main>`, и каждая группа маршрутов помечает свой контент сама
  (`(main)/layout.tsx:87`, `(checkout)/layout.tsx:83`, `start/layout.tsx:40`, `not-found.tsx:21`).
- **Декоративные изображения помечены правильно.** Все 14 `alt=""` стоят на украшениях; в плитках
  категорий доступное имя ссылки даёт текстовая метка
  (`src/modules/home/components/category-tiles/index.tsx:74-76`), так что SC 2.4.4 не нарушен.
- **Уважение к `prefers-reduced-motion`.** Анимации героев и плиток обёрнуты в медиа-запрос
  (`src/modules/home/variants/hero-ga.module.css:91,187,214`, `hero-gb.module.css:54`,
  `category-tiles.module.css:37`), и `framer-motion` импортируется всего в одном файле.
- **`next/image` с `sizes` и `priority` там, где это LCP.** 17 файлов импортируют `next/image`; первый
  слайд героя и первые четыре карточки получают `priority`
  (`src/modules/home/variants/hero-ga-carousel.tsx:170`,
  `src/modules/home/components/listing-section/index.tsx:74`).
- **Слияние корзины гостя с покупателем есть.** `transferCart()` вызывается и после входа, и после
  регистрации
  (`/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/lib/data/customer.ts:169,279,304-313`),
  плюс `claimGuestOrdersQuietly` на обоих путях (строки 171, 284).
- **Наличие товара считается по правилам Medusa.**
  `src/modules/products/components/product-actions/index.tsx:99-111` учитывает `manage_inventory`,
  `allow_backorder` и `inventory_quantity`, а не только количество.
- **Резолвер юридических ссылок написан с учётом российской практики.** `LEGAL_SLOTS` в
  `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/lib/util/legal-links.ts:47-60`
  ставит ключ `offer` впереди `terms`, и комментарий фиксирует измеренный случай, когда покупателю
  подсовывали заглушку стартера вместо оферты магазина. Не хватает только подключения к футеру (B-01).
- **Форматирование денег и дат всегда с локалью запроса.** Машинная проверка: из 39 вызовов
  `convertToLocale` (`src/lib/util/money.ts:11-26`) ни один не опускает `locale`, несмотря на опасный
  дефолт `"en-US"` в подписи функции.

## Не покрыто

- **Управление фокусом в 20+ листах оформления заказа и в выпадающей корзине.** Файлы найдены
  (`src/modules/checkout/components/checkout-*-sheet/index.tsx`,
  `src/modules/layout/components/cart-dropdown/index.tsx`), но проверка ловушки фокуса, возврата
  фокуса на триггер и закрытия по Esc требует чтения каждого компонента; сделано не было.
- **Размер цели 24×24 (SC 2.5.8).** Два подозрительных `h-7` оказались неинтерактивными контейнерами
  (`src/modules/order/components/payment-details/index.tsx:39`,
  `src/modules/checkout/components/payment/index.tsx:228`). Кнопки-иконки в шапке, галерее и нижней
  навигации не измерялись — нужен рендер, а не grep.
- **Порядок заголовков (SC 1.3.1).** 31 `<h1>` плюс 7 `<Heading level="h1">` разложены по 26 файлам,
  включая шаблоны, которые могут встретиться на одной странице вдвоём
  (`src/modules/common/components/content-page/index.tsx` и
  `src/modules/content/components/markdown-content/index.tsx`). Проверка «один h1 на страницу и
  никаких пропусков уровней» требует обхода шаблонов, а не подсчёта.
- **Оформление заказа как поток целиком.** Прочитан только шаблон
  `src/modules/checkout/templates/checkout-form/index.tsx` и две кнопки. Шаги адреса, доставки и
  выбора пункта выдачи, состояния ошибок каждого листа и идемпотентность подтверждения заказа не
  разбирались.
- **Промокоды, поиск и фильтры.** Компоненты найдены
  (`src/modules/checkout/components/discount-code/index.tsx`,
  `src/modules/store/components/refinement-list/`, `src/modules/layout/components/search/index.tsx`),
  логика не читалась.
- **Дублирование запросов на странице товара.**
  `src/app/[locale]/(main)/products/[handle]/page.tsx:60,110` вызывает `listProducts` дважды (в
  `generateMetadata` и в самой странице) и `getRegion` дважды (строки 55, 103). При `cache:
  "force-cache"` с одинаковым запросом кэш данных Next должен их слить, но я это не проверял и
  находкой не оформляю.
- **Cookie-баннер как согласие по 152-ФЗ.** Техническая часть проверена (B-«сделано хорошо»), но
  формулировки баннера, срок хранения выбора и наличие отзыва согласия не разбирались.
- **Ворктри PR #114/#115/#116 не открывались**, поэтому по каждой находке нельзя сказать, закрыта ли
  она в переработанной странице товара. B-03, B-06 и B-14 затрагивают `products/[handle]` и могут там
  измениться.
- **`next.config.js` прочитан выборочно** (`images`, `headers`, `experimental` по grep). Заголовки
  безопасности — область A; список `remotePatterns` на предмет лишних хостов не разбирался.
- **Альфа-канал в расчёте контраста.** Мой скрипт отбрасывал прозрачность, поэтому пары с `rgba(…,
  0.08)` (границы пресета `medusa`/`default`) посчитаны оптимистично, а пары поверх полупрозрачных
  подложек не посчитаны вовсе. Все приведённые в B-02 и B-10 числа относятся к непрозрачным цветам и
  верны; отсутствие числа не означает соответствия.
