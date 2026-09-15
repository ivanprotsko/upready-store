# t16-owner-branding — отчёт

2026-09-15 09:58 WITA

## Что сделано

**Бэкенд** (`apps/backend`):
- `tenant.metadata.branding` — новое поле бренда (логотип светлый/тёмный, фавикон, og-картинка,
  основной цвет, короткое имя, подпись в подвале), тем же приёмом, что `attribution`/`seo_verification`:
  без миграции, слияние по полям при записи.
- `GET/PUT /tenants/branding` (`src/api/tenants/branding/route.ts`) — чтение и запись, каждое поле
  необязательно, `null` явно очищает.
- `POST /tenants/branding/upload` (`src/api/tenants/branding/upload/route.ts`) — отдельный от
  `/tenants/uploads` маршрут: allow-list по mime (`svg`/`png`/`webp`), лимит байт на вид файла,
  проверка размеров через `sharp`, и для SVG — отказ при `<script>`/`on*=`/`javascript:`/`<foreignObject>`
  вместо растеризации (растеризация убила бы смысл векторного логотипа).
- `src/api/tenants/branding/contrast.ts` — WCAG-контраст. **Важная находка (правило 18h):** порог
  4.5:1 (WCAG AA) против автоматически выбранного лучшего из белого/чёрного текста никогда не может
  провалиться — измерено перебором всей шкалы серого, минимум составляет **4.608:1** в точке `#757575`.
  Порог предупреждения поднят до 7:1 (WCAG AAA) — именно он отделяет «нормально» от «цвет средней
  насыщенности, на который трудно положить любой текст».
- `GET /storefront/by-host` теперь отдаёт `branding` вместе с остальным документом — без лишнего
  похода за данными на первом рендере.

**Витрина** (`apps/storefront`):
- `lib/tenant/branding.ts` + `lib/data/tenant-branding.ts` — тот же приём, что `attribution.ts`:
  бэкенд → заголовок `x-tenant-branding` (middleware) → `getSiteBranding()`.
- Шапка (`modules/layout/components/site-logo`) — логотип показывается во всех 6 вариантах шапки
  (h1–h6): один вариант без класса, если загружен только один логотип; два варианта со свитчем
  `.site-logo-light`/`.site-logo-dark` по `[data-mode]`, если загружены оба.
- `<html style="--primary/--primary-foreground/--ring">` в корневом layout — основной цвет владельца
  поверх токенов темы, не вводя вторую систему; без `primary_color` стиль не рисуется вовсе.
- Фавикон — через `generateMetadata().icons` (config-based `icons` побеждает статический
  `icon.svg` на том же сегменте — измерено).
- OG/Twitter-картинка — **важная находка**: статический `opengraph-image.png`/`twitter-image.png`
  ВСЕГДА побеждает `generateMetadata().openGraph.images` того же сегмента (тоже измерено, curl
  показал старую картинку несмотря на выставленное поле). Файлы перенесены в
  `public/og/*-default.png`, вместо них — динамические `opengraph-image.tsx`/`twitter-image.tsx`,
  которые редиректят на `og_image_url` тенанта или отдают дефолт.
- Побочный фикс в `middleware.ts`: превращение og-картинки в динамический роут обнажило баг —
  URL без точки (`/opengraph-image`) не проходил существующий file-passthrough (`pathname.includes(".")`)
  и получал бессмысленный редирект на `/en/opengraph-image` (404). Добавлены два явных исключения.
- Подпись в подвале — `modules/layout/components/footer-credit`, отдельно от постоянной
  `SiteAttribution` (upready), выключена по умолчанию, показывается только если
  `footer_credit.enabled`, во всех 5 реальных вариантах футера (f1/f2/f3/f5/f6; f4 — алиас f1).
- Контраст без логотипа/цвета — байт-в-байт то же, что сегодня (проверено: html без `style`,
  фавикон снова `/icon.svg`, шапка снова текстом).

**Панель** (`apps/tenant-panel`):
- `/settings/branding` — загрузка 4 файлов с превью и кнопкой «убрать», основной цвет (color-picker +
  текстовое поле, обе стороны синхронизированы), предупреждение о контрасте, короткое имя, подпись
  в подвале (переключатель + текст + ссылка), миниатюра-предпросмотр шапки и кнопки. Тот же паттерн
  «занято → пусто → форма», что `/settings/notifications`: пока не пришёл ответ, поля реальные, но
  disabled, а не абзац текста (правило 19h).
- Ссылка с домашней страницы панели.

## Как это измерено (не «должно работать»)

Локальный стенд: Postgres 16 (Homebrew), backend на `:9287`, storefront (`next dev`) на `:8123`,
тестовый тенант `t16test` создан through `createTenantWorkflow`.

### Бэкенд: интеграционные тесты (новый файл `integration-tests/http/tenant-branding.spec.ts`)

```
$ cd apps/backend && DB_HOST=localhost PORT=9199 pnpm test:integration:http -- tenant-branding
PASS integration-tests/http/tenant-branding.spec.ts (16.247 s)
  tenant branding: logo/favicon/og image/primary colour/footer credit
    ✓ starts empty and reports no contrast warning with no colour set
    ✓ rejects an upload smaller than the kind's floor
    ✓ rejects a mime type outside the SVG/PNG/WebP allow-list
    ✓ rejects an SVG carrying a <script>
    ✓ accepts a safe SVG and writes it under the tenant's own prefix
    ✓ saves fields, merges rather than clobbering, and clears only what is set to null
    ✓ warns on a colour where even the best of black/white text stays under 7:1
    ✓ rejects a malformed hex colour before it ever reaches the tenant row
    ✓ serves the same branding document to the storefront through /storefront/by-host
    ✓ a second tenant with no branding gets the empty document, not the first tenant's
Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
```

Полный набор `test:integration:http` (18 файлов, включая новый):

```
Test Suites: 3 failed, 15 passed, 18 total
Tests:       11 failed, 174 passed, 185 total
```

Три упавших файла — `tenants.spec.ts`, `tenants-domains.spec.ts`, `tenants-payment-settings.spec.ts` —
**не тронуты этой задачей** (домены/склады/Robokassa) и падают по причинам, не связанным с
брендингом (например `tenants-domains.spec.ts` ожидает объект без поля `is_primary`, которое
добавила более ранняя задача tenant-address-canonical и не обновила этот тест). Не чинил — вне
периметра t16.

### Ручная проверка через curl (тенант `t16test`, backend `:9287`)

Контраст — порог 7:1, не 4.5 (находка выше):
```
$ curl -sX PUT :9287/tenants/branding -d '{"primary_color":"#757575"}' # серый, минимум шкалы
→ "low_contrast": true
$ curl -sX PUT :9287/tenants/branding -d '{"primary_color":"#1a2b3c"}'
→ "low_contrast": false
```

Валидация загрузки:
```
favicon 10×10 → 400 "it needs to be at least 32x32px"
favicon 2000×2000 → 400 "it can be at most 1024x1024px"
image/jpeg → 400 "not accepted here; upload SVG, PNG or WebP"
SVG с <script> → 400 "carries a script or an event handler"
```

`/storefront/by-host?host=t16test.localhost` отдаёт тот же `branding`, что `GET /tenants/branding`.

### Витрина (curl против `next dev` на `:8123`, Host: t16test.localhost)

С логотипом (только светлый) + основным цветом `#1a2b3c`:
```
<html … style="--primary:#1a2b3c;--primary-foreground:#ffffff;--ring:#1a2b3c">
<img src="…branding-logo_light-….png" alt="Тест" class="h-8 w-auto max-w-[10rem] object-contain"/>
```

С обоими логотипами (light PNG + dark SVG):
```
<img …branding-logo_light-….png" class="site-logo-light h-8 w-auto max-w-[10rem] object-contain"/>
<img …branding-logo_dark-….svg" class="site-logo-dark h-8 w-auto max-w-[10rem] object-contain"/>
```
CSS в собранном `layout.css` подтверждён: `.site-logo-dark{display:none}`,
`[data-mode="dark"] .site-logo-light{display:none}`, `[data-mode="dark"] .site-logo-dark{display:inline-block}`.

Фавикон с брендом:
```
<link rel="icon" href="…branding-favicon-….png"/>
<link rel="shortcut icon" href="…branding-favicon-….png"/>
<link rel="apple-touch-icon" href="…branding-favicon-….png"/>
```

OG-картинка:
```
$ curl -H "Host: t16test.localhost" :8123/opengraph-image
→ 307 → http://localhost:9287/static/tenants/…/branding-og_image-….png
```
og:image в HTML указывает на `/opengraph-image` (сам роут решает, редиректить на тенантский файл
или отдать дефолт) — исключает дублирование тега.

Без бренда (после `PUT` с явными `null` по всем полям) — byte-identical к состоянию «до задачи»:
```
<html lang="en" dir="ltr" data-theme="sneakers" data-mode="dark" class="…">   ← нет style=
<link rel="icon" href="/icon.svg?…" type="image/svg+xml" sizes="any"/>       ← дефолт
Тестовый бренд                                                                ← текст, не img
$ curl :8123/opengraph-image → 200, PNG 1200×630 (дефолтный файл)
```

### Витрина: юнит-тесты

```
$ cd apps/storefront && npx vitest run --exclude "**/node_modules/**" --exclude "**/.next/**" --exclude "tests/ui-lab/**"
Test Files  15 passed (15)
     Tests  144 passed (144)
```
(добавлен `src/lib/tenant/branding.test.ts`, 3 теста; обновлён `headers.test.ts` — список заголовков
теперь включает `x-tenant-branding`.)

```
$ npx tsc --noEmit    # чисто
$ npx next lint       # чисто
$ npx next build      # успешно, /opengraph-image и /twitter-image — динамические (ƒ), не статика
```

### Панель

```
$ cd apps/tenant-panel && pnpm typecheck   # чисто
$ pnpm lint                                # 0 ошибок, те же 24 предупреждения, что были до задачи
```

## Скриншоты — НЕ сделаны, честно

Это headless worker-сессия без подключённого desktop-приложения Superset
(`superset browser open` → `No browser pane appeared for this workspace`), а Browser Use требует
согласия пользователя на установку, которого получить не у кого (Иван спит/недоступен). Вместо
скриншотов выше — полные curl-замеры HTML/заголовков/CSS для обоих режимов логотипа и для «без
бренда». Чтобы получить сами скриншоты, у ацептора это одна команда:

```
cd apps/backend && DB_HOST=localhost PORT=9287 npx medusa develop &
cd apps/storefront && NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9287 PORT=8123 npx next dev &
# открыть http://t16test.localhost:8123/en — *.localhost резолвится в 127.0.0.1 сам
```
(тенант `t16test` из тестового запуска остался в БД `t16_owner_branding`, локальной — не в проде.)

## Что НЕ сделано и почему

- **Реальные скриншоты 1280×900/390×844, свет/тьма** — недоступен браузер в этой сессии (см. выше).
  Storefront curl-проверки покрывают HTML/CSS напрямую (логотип, фавикон, og-картинка, css-переменные,
  переключение по `[data-mode]`), но не пиксельный рендер.
- **Aspect-ratio для og-картинки** — принята только проверка минимальных размеров (600×315), без
  строгого соотношения сторон 1.91:1: сочтено избыточным для четырёх полей задачи.
- Три пред-существующих упавших теста интеграционного набора (домены/платежи) — не мои, не чинил
  (вне периметра).

## Что проверить за 10 минут

1. `cd apps/backend && DB_HOST=localhost PORT=9199 pnpm test:integration:http -- tenant-branding` —
   10/10.
2. `cd apps/storefront && npx next build` — успешно, `/opengraph-image` и `/twitter-image` — `ƒ`.
3. Поднять оба dev-сервера, открыть `/settings/branding` в панели, загрузить логотип+цвет, сохранить,
   обновить витрину.
