# t-2026-09-21-02 — owner panel UX

Branch `feat/o21-owner-panel-ux`, base `dev`. Read `COMMON.md` next to this file first.

## Objective

A shop owner with no technical background runs her shop from the panel (`apps/tenant-panel`) on her own: the menu is grouped by her jobs, every screen speaks plain Russian with no engineering internals, the core flows take a few obvious steps and work from a phone.

The reference user is Оксана, the owner of the client shop: she sells herbal products, works mostly from her phone, has never seen Medusa and must never need to. Ivan's measure: today he would have to spend «неделю моего времени присутствия и контроля» on this interface. Your job is to remove the need for that week.

## What the lead saw (existing screenshots, read them)

- `/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/w21-wb-write-stocks-prices/panel-wildberries-fullpage.png`: a flat sidebar of twelve items plus a nested marketplace list whose items overlap each other («Синхронизация», «Подключение площадок», «Wildberries» are drawn on top of one another). The screen shows the owner `PUT /api/v3/stocks/985793`, `WB_WRITE_LIVE в окружении бэкенда`, `tenant_integration_secret (provider=ozon)`, `INTEGRATION_ENCRYPTION_KEY`, and a shell command with `pnpm --filter backend ozon:seed-key`. Words such as «вхолостую», «отказано воротами», «ворота закрыты» are internal jargon.
- `…/artifacts/accept-b10-panel-gaps-1/09-page-edit-1280x900.png`: the page editor is a raw Markdown textarea in a monospace font with a one-line syntax hint. A non-technical owner cannot write a table or a link there.
- The earlier owner QA (`…/prompts/f12-owner-raw-keys.md`, its artifacts under `…/artifacts/q02-qa-owner*` if present) lists raw translation keys and machine values. Those were fixed once; the class must stay closed.

## Milestone 1 (first two hours): audit, then a draft PR

1. Bring up a local stand with a realistic shop (products with photos, orders in several states, customers, reviews, pages, shipping, a connected and a not-connected integration). Fixtures exist under `apps/backend/scripts/fixtures/` (`p01-stand-setup.ts`, `t13-seed-test-tenant.ts`, `t17-seed-test-tenant.ts`, `f12-seed-test-order.ts`, `w11-seed-tenant.ts`).
2. Write a Playwright walker that logs in as the owner FROM THE LOGIN SCREEN and visits every route of `apps/tenant-panel/src/routes/**` including create and edit forms, dialogs and empty states, at 1440 and 390, saving a screenshot and the `innerText` of each.
3. Look at every screenshot. Write `docs/tenant-panel/ux-audit-2026-09-21.md`: findings ranked by (how often the owner meets it) times (how badly it stops her), each with the screenshot path, the route and the proposed fix; then the redesign plan per screen following the decisions below. Note where you disagree with a decision and why.
4. Commit, push, open the draft PR with the audit. Continue immediately with Milestone 2; the lead reads the audit in parallel and sends corrections into your terminal.

## Design decisions (made by the lead, implement these)

### P1. Navigation by the owner's jobs

Replace the flat list with collapsible groups, in this order:

- «Обзор»
- «Продажи»: Заказы, Клиенты, Отзывы
- «Каталог»: Товары, Категории, Характеристики (and import or export where it exists)
- «Витрина»: Главная страница, Страницы, Журнал, Оформление (brand: logo, colours, favicon)
- «Маркетинг»: Акции (promotions and campaigns together)
- «Площадки»: one entry that opens a hub for Wildberries and Ozon; the hub has tabs (Подключение, Каталог, Заказы, Отзывы, Синхронизация). Marketplace sub-items leave the sidebar.
- «Настройки»: Доставка, Оплата, Реквизиты, Адрес магазина, Язык и валюта, Уведомления, Профиль

Every existing route stays reachable within two clicks; old URLs keep working (redirect where a route moves). The active item and its group are visibly marked. No overlapping at 1440, 1280, 1024 and 390. On the phone the sidebar is a drawer opened from a top bar that shows the screen title. Counters (new orders, unanswered reviews) sit on the items when the data is cheap to get.

### P2. Overview that answers «что мне сейчас делать»

Top: what needs attention, computed from real data and each line a link to the exact filtered screen (orders to ship, orders awaiting payment, unanswered reviews, products out of stock or without photos or without price). Then a launch checklist with progress (payment connected, delivery set, requisites filled, legal pages published, own domain attached, first product added); a finished checklist collapses. Then today and seven-day numbers (orders, revenue in one currency, average order), honest about empty data. A «Открыть магазин» button that opens the storefront is always visible in the top bar.

### P3. Plain language, zero internals

On owner screens there must be no HTTP verbs or paths, environment variable names, table or column names, provider ids, CLI commands, stack traces, English fallback strings, or internal jargon. Rewrite every such text in plain Russian that says what happened and what the owner can do next. Where a capability is switched off by the platform, say «Отправка на Wildberries пока выключена на платформе. Напишите в поддержку, чтобы включить» instead of naming a flag. Technical detail that support may need goes into a collapsed «Подробности для поддержки» block with a «Скопировать» button. Write a small glossary `docs/tenant-panel/owner-glossary.md` (one owner term per internal term) and hold to it everywhere: «вхолостую» becomes «пробный прогон, ничего не отправлено», «ворота» disappears.

### P4. Page editor an owner can use

Keep Markdown as storage. Give the textarea a formatting toolbar (heading, bold, italic, list, numbered list, link with a dialog, table with a grid picker, horizontal rule), keyboard shortcuts, and a live preview rendered by the SAME renderer the storefront uses (`scripts/check-shared-markdown.mjs` guards that the two copies stay identical; keep it green). Side by side on desktop, tabs «Текст / Предпросмотр» on the phone. A «Посмотреть на витрине» link after saving. Apply the same editor wherever the panel edits long text that the storefront renders as Markdown (pages, journal articles, product description if it is Markdown there).

### P5. Forms, tables, feedback

- One price format everywhere («1 084,00 ₽»), one date format («15 сент. 2026, 06:57»), human statuses through maps, never raw enums.
- Every list has a designed empty state with one primary action and a sentence of guidance; loading skeletons; human error messages with a retry.
- Saving gives a toast and keeps the owner in place; leaving a dirty form asks first; destructive actions ask with the object's name.
- Product creation: photos first (drag and drop, reorder, choose the cover, progress and errors per file), then name, price in the shop currency, stock, category. The advanced Medusa concepts (options, variants, shipping profile, sales channel) are tucked under «Дополнительно» with defaults that work. A «Посмотреть на витрине» link on every product, page, category and article.
- Orders: the list answers «что отправить сегодня»; the order card has one obvious next action per state («Собрать», «Передать в доставку» with a tracking number, «Отменить»), customer contacts are tappable on the phone.

### P6. Phone

At 390 px: no horizontal scroll on any screen, tables become cards or scroll inside their own container with the first column sticky, primary actions are reachable with the thumb (sticky bottom bar on forms), dialogs are full-screen sheets, touch targets at least 44 px.

### P7. Do not fork Medusa harder than needed

The panel is a copy of Medusa Admin screens. Prefer wrappers, route-level composition and dictionary changes over rewriting copied internals, and list in the PR which copied files you had to change, so a future Medusa update stays feasible.

## Layout artefact (rule 27d): wireframes and the named reference

Canon for tokens, spacing and type: `/Users/ivanprotsko/upready/packages/geist-kit/AGENTS.md` (rule 27: Geist everywhere; the panel keeps `@medusajs/ui` primitives, the canon governs spacing, hierarchy and density decisions). The «before» reference is your own Milestone 1 walker output: every «after» frame is compared against its «before» frame of the same route and width, dimension by dimension (navigation depth, number of visible controls, first actionable element, words an owner would not understand, horizontal overflow), and each claimed improvement is re-verified on the frame.

Shell at 1440 and at 390:

```
1440                                                   390
┌ Магазин Оксаны ▾ ┬ Заказы            [Открыть магазин]┐  ┌ ☰  Заказы   [Магазин ↗]┐
│ Обзор            │                                    │  │                        │
│ ▾ Продажи        │  screen content                    │  │ cards instead of table │
│    Заказы     3  │                                    │  │ ┌────────────────────┐ │
│    Клиенты       │                                    │  │ │ №1042 · 1 355,00 ₽ │ │
│    Отзывы     2  │                                    │  │ │ Ожидает сборки     │ │
│ ▸ Каталог        │                                    │  │ │ [ Собрать ]        │ │
│ ▸ Витрина        │                                    │  │ └────────────────────┘ │
│ ▸ Маркетинг      │                                    │  │                        │
│   Площадки       │                                    │  │ drawer: the same groups│
│ ▸ Настройки      │                                    │  └────────────────────────┘
└──────────────────┴────────────────────────────────────┘
```

Overview:

```
┌ Требует внимания ───────────────────────────────────────┐
│ ● 3 заказа ждут сборки                        [Открыть] │
│ ● 2 отзыва без ответа                         [Ответить]│
│ ● 4 товара без фото                           [Показать]│
├ Запуск магазина  ████████░░  4 из 6 ────────────────────┤
│ ✓ Первый товар   ✓ Доставка   ✓ Реквизиты   ✓ Страницы  │
│ ○ Подключить оплату [Настроить]  ○ Свой домен [Привязать]│
├ Сегодня / 7 дней ───────────────────────────────────────┤
│ Заказы 5 · Выручка 8 420,00 ₽ · Средний чек 1 684,00 ₽  │
└─────────────────────────────────────────────────────────┘
```

Page editor at 1440: `[toolbar: H  B  I  •  1.  🔗  ▦  —]` above two panes, left «Текст» (the textarea), right «Предпросмотр» (storefront renderer); at 390 the panes are tabs; footer `[Посмотреть на витрине] [Отмена] [Сохранить]`.

## Human-eyes criteria (rule 27d; the lead judges these by looking at the running panel, a screenshot file is not a verdict)

- A person who has never seen Medusa, shown the sidebar for ten seconds, can say where orders, products, the home page and delivery settings live.
- No screen shows a word the owner would have to ask a developer about (HTTP verbs, flags, table names, «вхолостую», «ворота», «фулфилмент»).
- No sidebar item overlaps another, at any width, with every group expanded.
- The overview reads as «what do I do now», not as a dashboard of decorations: the first thing the eye lands on is the attention list.
- The page editor lets her make a table and a link without knowing Markdown, and the preview looks like the shop page.
- On the phone every core screen is usable with one thumb: no sideways scrolling, the primary button is visible without hunting.
- Empty lists look intentional, with one clear next step, not like a broken page.

## Files you may change

`apps/tenant-panel/**`, docs under `docs/tenant-panel/`, a walker and probes under `scripts/` or `apps/tenant-panel/e2e/`. Backend only for an endpoint the overview or the counters need, smallest possible, with tests and `pnpm check:backend-build` green; say so in the PR. Do not touch `apps/storefront/**` except reading the Markdown renderer (if the shared copy must change, change both copies identically and keep `node scripts/check-shared-markdown.mjs` green).

## Acceptance (the lead checks each line on a running instance)

1. The menu is grouped by the owner's jobs; at 1440, 1280 and 390 no items overlap; any screen within two clicks; a drawer on the phone.
2. A probe over all owner routes: `innerText` has zero HTTP verbs with paths, environment variable names, table names, CLI commands and raw translation keys outside the collapsed support block. Commit the probe; it fails on a match.
3. The overview shows what needs attention and the launch checklist computed from real data; each line leads to the right screen.
4. The page editor has a toolbar and a live preview by the same renderer as the storefront, tables included; a saved page equals the storefront page.
5. Flows walked from the login screen on the local stand: a product with three photos and a price becomes visible on the storefront; an order placed on the storefront appears in the panel and is marked as packed; an edit of the contacts page is visible on the storefront. Screenshots per step.
6. At 390 the core screens have no horizontal scroll (`document.scrollingElement.scrollWidth <= 390`) and the primary action is reachable.
7. `apps/tenant-panel`: typecheck, lint and build green, `ru` and `en` dictionaries in parity, no new raw keys.
8. The audit document exists and was reviewed by the lead.
9. Gemini Pro critique attached, valid findings closed.

## Verify yourself before finishing

The walker and both probes against your local stand, the panel checks, `node scripts/check-shared-markdown.mjs`, the three flows from the login screen, and your own eyes on every screenshot at 1440 and 390.
