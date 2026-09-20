// gen-wave.mjs — волна нагрузки gemini (заказ Ивана 2026-09-18 09:06 WITA): реальные новые задачи research/docs/texts/tests/glossary
// силами agy (смесь gemini-3.8-flash-high / gemini-3.1-pro-high), приёмка sonnet раунд 1, двойников claude нет (режим 08:59: только sonnet + gemini).
// usage: node tools/gen-wave.mjs <out-tasks.json>   → пишет prompts/gw*-gem.md, prompts/gw*-acc.md, папки прогонов, правит lanes/maxSlots/nightOrder.
import fs from 'node:fs'; import path from 'node:path';
const D = '/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store';
const MAIN = '/Users/ivanprotsko/upready/projects/upready-store';
const L = await import(path.join(D, 'lib.mjs'));
const cfg = L.loadTasks();
const RUNS = `${D}/artifacts/agy-runs`;
const FLASH = 'gemini-3.8-flash-high', PRO = 'gemini-3.1-pro-high';
const NET_RESEARCH = 'Network: allowed — open public primary sources (official sites, official docs, laws at publication.pravo.gov.ru / consultant.ru). Never dev.wildberries.ru or docs.ozon.ru. Save every web source you rely on as a local excerpt (text, ≤200 lines) under `sources/` in your working folder, named after the host.';
const NET_REPO = 'Network: NOT needed and not allowed — the facts are in the repository files named below; read them by absolute path.';

const TASKS = [
  { id: 'gw01-tenant-panel-owner-guide', model: FLASH, kind: 'docs', canon: 'artifacts',
    title: 'Руководство владельца магазина по панели tenant-panel (по коду, для нетехнического владельца)',
    task: `Write an owner's guide (Russian) to the store owner panel \`${MAIN}/apps/tenant-panel\`. Read the routes in \`src/app\` (every page directory), the Russian UI strings in \`src/i18n\`, and the components each page renders. For EVERY screen write: what it is for, each setting/field in plain language (what changes for the buyer), typical mistakes. Structure: one section per screen in navigation order, a table of contents, a «первые 30 минут» quick start.`,
    deliverables: ['owner-guide.md — the guide', 'screens-index.md — table: route → screen title (RU) → source files → covered in section'],
    net: NET_REPO,
    acceptance: 'каждый маршрут src/app панели имеет раздел; ни одной функции, которой нет в коде (у каждого утверждения — путь к файлу); язык — простой русский без жаргона разработчика' },
  { id: 'gw02-storefront-owner-faq', model: PRO, kind: 'docs', canon: 'artifacts',
    title: 'FAQ владельца по витрине storefront: темы/пресеты/брендинг, аналитика, юр. ссылки, зоны доставки — 25+ вопросов по коду',
    task: `Write a Russian FAQ (at least 25 Q&A) for store owners about the storefront \`${MAIN}/apps/storefront\`: theme and presets, owner branding (colors, fonts, logo — see \`src/lib/theme\`, \`src/lib/profile\`), analytics counters (see \`src/lib/analytics\` or grep «metrika|analytics»), legal links (\`src/lib/util/legal-links.ts\`), shipping zones/weight in checkout (grep «shipping»), languages ru/en (\`messages/\`). Each answer: 2–6 sentences, plain language, and a «Источник» line with the file path(s) the answer is derived from.`,
    deliverables: ['faq.md — the FAQ grouped by topic', 'coverage.md — table: topic → files read → number of questions'],
    net: NET_REPO,
    acceptance: '≥25 вопросов, у каждого ответа строка «Источник» с существующим путём; нет выдуманных функций (приёмщик выборочно откроет 5 источников)' },
  { id: 'gw03-payment-providers-rf', model: PRO, kind: 'research', canon: 'research',
    title: 'Исследование: платёжные провайдеры РФ для малого интернет-магазина (Robokassa, ЮKassa, CloudPayments, Т-Банк, Сбер) — комиссии, подключение ИП/самозанятые, чеки 54-ФЗ, выплаты',
    task: `Compare payment providers for a small Russian online store (owner: individual entrepreneur or self-employed): Robokassa, ЮKassa, CloudPayments, Т-Банк (Tinkoff) Касса, СберPay/Сбер эквайринг, and up to 3 more you find. For each: fees by turnover tier, connection requirements (ИП/самозанятый/ООО), online-receipt (54-ФЗ) options and their price, payout terms, СБП support, test mode/API docs link, subscription/recurring support. Then a recommendation for a store on Medusa with Robokassa already integrated (see \`${MAIN}/apps/backend/src\` — grep «robokassa» — to describe what exists; do not change code).`,
    deliverables: ['report.md — comparison table + recommendation + open questions', 'sources/ — saved excerpts'],
    net: NET_RESEARCH,
    acceptance: 'таблица ≥6 провайдеров с ценами и датой снятия; каждая цена — со ссылкой на первоисточник; рекомендация опирается на факты из кода (что уже подключено)' },
  { id: 'gw04-delivery-services-rf', model: FLASH, kind: 'research', canon: 'research',
    title: 'Исследование: службы доставки РФ для малого магазина (СДЭК, Boxberry, Яндекс Доставка, Почта России, 5Post) — тарифная модель, ПВЗ, API, интеграция',
    task: `Compare delivery services for a small Russian online store: СДЭК, Boxberry, Яндекс Доставка, Почта России, 5Post, DPD (and up to 2 more). For each: pricing model (weight/zone), pick-up point network size, courier delivery, API availability and auth model, contract requirements for ИП/самозанятый, cash-on-delivery, tracking, widget for checkout. Relate to our checkout shipping zones/weight (read \`${MAIN}/apps/backend/src\` — grep «shipping_option|shipping-zone|weight» — describe what exists, do not change code). Recommend 2 services to integrate first and why.`,
    deliverables: ['report.md — table + recommendation', 'sources/ — saved excerpts'],
    net: NET_RESEARCH,
    acceptance: 'таблица ≥6 служб; у каждой строки первоисточник; раздел «что уже есть в коде» с путями' },
  { id: 'gw05-legal-docs-rf-checklist', model: PRO, kind: 'research', canon: 'research',
    title: 'Чек-лист юридических требований к интернет-магазину РФ (152-ФЗ, ЗоЗПП, ПП 2463, оферта, возвраты, cookies) и аудит наших шаблонов tenant-legal',
    task: `Build a checklist of legal requirements for a Russian online store: personal data (152-ФЗ: policy, consent, operator registration in РКН), consumer protection for distance selling (ЗоЗПП ст. 26.1, ПП РФ № 2463 — mandatory information on the site, return/refund terms), public offer, cookies/analytics consent, receipts (54-ФЗ), self-employed specifics. Cite the article/paragraph for every item from publication.pravo.gov.ru or consultant.ru. Then audit our templates in \`${MAIN}/apps/backend/src/tenant-legal\` and \`${MAIN}/apps/homepage/port/plugins/legal-pages.ts\` against the checklist: table item → present/absent/partial → file:line → what to add. Do not change code.`,
    deliverables: ['checklist.md — requirements with citations', 'audit.md — findings table against our templates', 'sources/ — saved excerpts'],
    net: NET_RESEARCH,
    acceptance: 'каждый пункт чек-листа со ссылкой на статью закона; аудит покрывает все файлы tenant-legal; нет юридических утверждений без источника' },
  { id: 'gw06-storefront-seo-audit', model: FLASH, kind: 'docs', canon: 'artifacts',
    title: 'SEO-аудит витрины storefront по коду: metadata, sitemap/robots, schema.org Product/Offer, hreflang ru/en, canonical — находки и чек-лист',
    task: `Audit the Next.js storefront \`${MAIN}/apps/storefront\` for SEO by reading code: generateMetadata usage per route, sitemap/robots (grep «sitemap|robots»), structured data (grep «schema.org|application/ld+json»), hreflang/alternates for ru/en, canonical URLs, Open Graph, image alt texts on product pages, 404/redirect handling. Reference the official guidance (developers.google.com/search/docs, schema.org/Product) — network allowed for these two hosts only. Findings: table check → status (ok/partial/missing) → file:line → recommended change (describe, do not implement).`,
    deliverables: ['seo-audit.md — findings table + top-10 priorities', 'sources/ — saved excerpts of the guidance used'],
    net: 'Network: only developers.google.com and schema.org. Never dev.wildberries.ru or docs.ozon.ru.',
    acceptance: 'каждая находка привязана к file:line; статусы проверяемы (приёмщик откроет 5 из них); нет правок кода' },
  { id: 'gw07-metrika-ecommerce-events-spec', model: PRO, kind: 'docs', canon: 'artifacts',
    title: 'Спецификация событий электронной коммерции Яндекс.Метрики (dataLayer) для витрины: событие → триггер в коде → payload → файл',
    task: `Write a specification of Yandex.Metrika e-commerce events (dataLayer: detail/impressions, add, remove, purchase) for the storefront \`${MAIN}/apps/storefront\`. Read the official spec at yandex.ru/support/metrica (ecommerce section; network allowed for yandex.ru/support only) and map each event to the real trigger in our code: product page view, add-to-cart, remove, checkout completion (grep «cart|checkout|order» in \`src/app\` and \`src/lib\`). Also describe what analytics wiring already exists (grep «metrika|ym(|dataLayer|gtm»). Table: event → trigger (user action) → where in code (file:line) → payload fields and their source → open questions. Do not implement.`,
    deliverables: ['metrika-ecommerce-spec.md', 'sources/ — saved excerpt of the Metrika spec'],
    net: 'Network: only yandex.ru/support. Never dev.wildberries.ru or docs.ozon.ru.',
    acceptance: 'все 4 базовых события описаны с file:line триггеров; payload по официальной спецификации; раздел «что уже есть» по коду' },
  { id: 'gw08-telegram-mini-app-store-research', model: FLASH, kind: 'research', canon: 'research',
    title: 'Исследование: Telegram Mini App для магазина — платежи (Payments/Stars/провайдеры РФ), авторизация initData, ограничения, примеры',
    task: `Research Telegram Mini Apps for an online store from official sources (core.telegram.org/bots/webapps, core.telegram.org/bots/payments, telegram.org/blog): payments options and which work for Russian sellers (Telegram Payments providers list, Stars, external payment links policy), user auth via initData validation, storage/limits, deep links, UI constraints (theme params, viewport), publishing requirements. Add 3–5 documented store examples (public case studies). Relate to our repo: what exists in \`${MAIN}/apps/bot\` (read it, describe, do not change). Output a decision table: capability → available for RF store? → source → implication for our Mini App.`,
    deliverables: ['report.md', 'sources/ — saved excerpts'],
    net: NET_RESEARCH,
    acceptance: 'каждое утверждение о возможностях Telegram — со ссылкой на core.telegram.org; раздел про apps/bot по коду; таблица решений заполнена' },
  { id: 'gw09-onboarding-email-sequence', model: PRO, kind: 'texts', canon: 'artifacts',
    title: 'Тексты серии из 5 онбординг-писем новому владельцу магазина (RU) по реальному потоку start.upready.dev и существующим письмам backend',
    task: `Write a 5-letter onboarding email sequence in Russian for a new store owner who just created a store via the onboarding wizard. First read the real flow and vocabulary: onboarding pages (grep «onboarding» under \`${MAIN}/apps/homepage\` and \`${MAIN}/apps/tenant-panel/src\`), existing email templates and their i18n (\`${MAIN}/apps/backend/src/emails\`), and the panel screens (\`${MAIN}/apps/tenant-panel/src/app\`). Letters: day 0 welcome + first 3 steps, day 1 products & photos, day 3 delivery & payment, day 5 legal pages & receipts, day 7 first sales & analytics. Each: subject (2 variants), preheader, body 120–220 words, one CTA with the real panel route, plain-language tone for a 35–45 y.o. non-technical owner. Only features that exist in code; mark anything uncertain «(уточнить)».`,
    deliverables: ['emails.md — 5 letters', 'facts.md — table: claim in letters → file path proving the feature exists'],
    net: NET_REPO,
    acceptance: '5 писем с темами и CTA на реальные маршруты панели; facts.md подтверждает каждую упомянутую функцию путём; стиль — простой русский' },
  { id: 'gw10-ui-strings-audit-ru', model: FLASH, kind: 'texts', canon: 'artifacts',
    title: 'Аудит русских UI-строк storefront и tenant-panel: опечатки, разнобой терминов, ё/регистр — таблица ключ → сейчас → предложение → причина',
    task: `Audit the Russian UI strings in \`${MAIN}/apps/storefront/messages\` and \`${MAIN}/apps/tenant-panel/src/i18n\` (and \`${MAIN}/apps/backend/src/admin/i18n\` if it has ru). Find: typos, inconsistent terms for the same thing (корзина/заказ/доставка/оплата/товар/вариант), inconsistent capitalization and punctuation, untranslated English, placeholders mismatched between ru and en, overly technical wording for a buyer/owner. Output a table: file → key → current → proposed → reason (one of: опечатка / термин / регистр / англицизм / плейсхолдер / стиль). Do NOT edit the repository files — the table is the deliverable. Finish with a terms glossary (RU term chosen → variants seen → where).`,
    deliverables: ['ui-strings-audit.md — table + glossary + counts per category'],
    net: NET_REPO,
    acceptance: '≥40 строк в таблице с существующими ключами (приёмщик проверит 10 случайных); файлы репозитория не изменены' },
  { id: 'gw11-storefront-e2e-test-plan', model: PRO, kind: 'tests', canon: 'artifacts',
    title: 'Каталог e2e-сценариев витрины (каталог → корзина → оформление → оплата) по коду и существующим Playwright-тестам: пробелы, приоритеты — план без кода',
    task: `Build an end-to-end test scenario catalogue for the storefront \`${MAIN}/apps/storefront\`: read the routes in \`src/app\`, the cart/checkout code (grep «cart|checkout|payment|shipping»), and the EXISTING tests (find «*.spec.ts|*.test.ts|playwright» under apps/storefront and the repo root, excluding node_modules). For every user flow list scenarios (happy path, validation errors, empty states, ru/en, guest vs logged-in, mobile viewport), mark each as covered / partially / not covered by an existing test (name the test file), assign priority P0–P2 with a one-line reason. No code — the plan is the deliverable.`,
    deliverables: ['e2e-test-plan.md — catalogue with coverage and priorities', 'existing-tests-index.md — table: test file → what it checks'],
    net: NET_REPO,
    acceptance: 'покрытие сверено с реальными файлами тестов (каждый названный тест существует); ≥30 сценариев; приоритеты обоснованы' },
  { id: 'gw12-backend-api-docs-digest', model: FLASH, kind: 'docs', canon: 'artifacts',
    title: 'Дайджест собственных API-маршрутов backend (apps/backend/src/api): маршрут → метод → авторизация → payload → файл — для разработчиков панели',
    task: `Document the custom API routes of the Medusa backend \`${MAIN}/apps/backend/src/api\` (all subfolders; skip node_modules). For each route file: HTTP methods, path (from the folder structure), auth/middleware applied (read \`middlewares.ts\` files), request body/query schema (zod or manual validation), response shape, which app calls it (grep the path in \`${MAIN}/apps/tenant-panel/src\` and \`${MAIN}/apps/storefront/src\`), file path. Output Russian docs: one table per area (tenants, domains, legal, analytics, …) plus an «открытые вопросы» section for routes whose auth or shape is unclear.`,
    deliverables: ['api-digest.md', 'routes-index.tsv — path\tmethods\tauth\tfile'],
    net: NET_REPO,
    acceptance: 'каждый файл route.ts под src/api представлен строкой; методы и авторизация сверены с кодом (приёмщик проверит 8 случайных)' },
  { id: 'gw13-competitor-onboarding-review', model: PRO, kind: 'research', canon: 'research',
    title: 'Исследование: первые 10 минут владельца у Tilda, InSales, Shopify, Ecwid — шаги онбординга по официальным справкам, выводы для start.upready.dev',
    task: `Review how Tilda, InSales, Shopify and Ecwid onboard a new store owner in the first session, using only their official help centers / docs / public pages (help.tilda.cc, insales.ru docs, help.shopify.com, support.ecwid.com): steps, what is asked first, defaults, templates, first-sale checklist, trial/paywall moments. Then read our onboarding wizard (grep «onboarding» under \`${MAIN}/apps/homepage\` and \`${MAIN}/apps/tenant-panel/src\`) and produce: comparison table (step → each competitor → ours), 10 concrete recommendations ordered by expected impact, each with the competitor source and the file in our code it would touch (describe, do not implement).`,
    deliverables: ['report.md — table + recommendations', 'sources/ — saved excerpts'],
    net: NET_RESEARCH,
    acceptance: 'сравнение по 4 конкурентам из официальных справок с ссылками; раздел «наш мастер» по коду с путями; рекомендации конкретны и приоритизированы' },
  { id: 'gw14-medusa-owner-glossary', model: FLASH, kind: 'glossary', canon: 'artifacts',
    title: 'Глоссарий понятий Medusa v2 для владельца (region, sales channel, stock location, fulfillment set, price list …) → наши русские термины и экраны панели',
    task: `Build a glossary that maps Medusa v2 concepts to the owner's language and to our panel screens: region, sales channel, stock location, inventory item, fulfillment set/shipping option/shipping profile, price list, customer group, promotion/campaign, product variant/option, collection/category, order/fulfillment/payment collection, tenant (ours). For each term: Medusa definition with the docs.medusajs.com URL (network allowed for docs.medusajs.com only), the Russian term our UI uses (read \`${MAIN}/apps/tenant-panel/src/i18n\` and \`${MAIN}/apps/storefront/messages\`), where the owner meets it (panel route), a plain-language explanation for a non-technical owner, and mismatches (same concept named differently in two places).`,
    deliverables: ['glossary.md — table + mismatches section', 'sources/ — saved excerpts'],
    net: 'Network: only docs.medusajs.com. Never dev.wildberries.ru or docs.ozon.ru.',
    acceptance: '≥15 терминов; у каждого ссылка на docs.medusajs.com и путь к нашей строке i18n или пометка «в UI не встречается»; раздел разнобоя заполнен' },
];

const brief = (t) => `## Brief — task ${t.id} — «${t.title}» (gemini load wave, Ivan's order 2026-09-18 09:06 WITA; executor ${t.model} via agy)

You are the executor. Nobody answers questions; work alone to the result, inside your working folder only (see the hard rules above).

### Task
${t.task}

### Deliverables (write them INSIDE your working folder, relative paths)
${t.deliverables.map(d => `- \`${d}\``).join('\n')}
- \`SUMMARY.md\` — what was done, the deliverables with relative paths, what could not be done and why, every source used (path or URL), and your own count of facts checked.

### Sources and network
${t.net}
Facts come only from files you opened or pages you actually fetched in THIS run; write «не найдено» instead of guessing. Every factual claim carries its source (path or URL) next to it.

### Acceptance the acceptor (sonnet) will check
${t.acceptance}. Deliverables in Russian. No changes to the repository, no git commands that change state, no commits, no installs.

### Finish
Print \`ARTIFACT: <absolute path>\` for every deliverable (inside your working folder) and end with the line \`RESULT: OK <one-line summary>\` (or \`RESULT: FAIL <reason>\`).
`;

const integrate = (t) => ({
  research: `copy the main report to \`~/upready/research/reports/$(date +%F)-${t.id}.md\` with a first line «Автор: ${t.model} через agy (задача ${t.id}-gem), приёмка sonnet раунд 1, $(date '+%Y-%m-%d %H:%M WITA')», and copy \`sources/\` (if any) to \`~/upready/research/raw/${t.id}/\``,
  artifacts: `copy the deliverables (keeping their relative layout) to \`{{MISSION_DIR}}/artifacts/${t.id}/\` and write \`README.md\` there naming the executor model ${t.model}, task ${t.id}-gem, acceptance round 1 and the verdict`,
})[t.canon];

const acc = (t) => `## Acceptance of a gemini-wave run — task ${t.id}, executor ${t.model} via agy, acceptor sonnet, round 1

You are the acceptor (Ivan's order 2026-09-18 09:06 WITA: gemini load wave; model regime 08:59: only sonnet + gemini, no claude twin after a REJECT — a rejected result is simply not accepted). Executor task: \`${t.id}-gem\`; its working folder: \`${RUNS}/${t.id}-gem\`; its brief: \`{{MISSION_DIR}}/prompts/${t.id}-gem.md\`. Acceptance criteria: ${t.acceptance}.

Do, in this order:

0. Machine stage. \`ls -R ${RUNS}/${t.id}-gem\`; every \`ARTIFACT:\` path printed in the run log (\`{{MISSION_DIR}}/logs/\` — the newest \`${t.id}-gem*\` log) must exist and lie inside that folder; \`SUMMARY.md\` must exist. Then check the executor wrote nowhere else: \`git -C ${MAIN} status --porcelain\` must show no files changed during the run window, and \`find ~/upready/research ~/upready/memory {{MISSION_DIR}}/artifacts -type f -newermt "<startedAt>" ! -newermt "<finishedAt>" ! -path "*/agy-runs/${t.id}-gem/*"\` must print nothing — the window is \`tasks["${t.id}-gem"].startedAt\` / \`.finishedAt\` in \`{{MISSION_DIR}}/state.json\` (convert to local time for find). Any write outside the folder is a blocker.
1. Substance. Read every deliverable against the brief and the criteria. Verify facts by opening sources: for repository claims open at least 5 cited paths (or the sample size the criteria name) and confirm the claim; for web claims open at least 3 cited URLs (never dev.wildberries.ru / docs.ozon.ru) or the saved excerpts under \`sources/\` and confirm the numbers. Invented paths, prices, article numbers or features are blockers; missing sources for a claim are majors; style and formatting are minors.
2. Write \`${RUNS}/${t.id}-gem/findings-sonnet-1.md\` with sections: \`## Вердикт\` (ACCEPT or REJECT — REJECT when any blocker, or two or more majors, or the machine stage failed), \`## Этап 0\` (commands and their output, short), \`## Проверенные факты\` (table: claim → source opened → confirmed?), \`## Находки\` (blockers / majors / minors, each with the file and line), \`## Оценка исполнителя\` (3–5 lines: where ${t.model} was strong/weak on this task type).
3. Ledger: append ONE tab-separated row to \`${RUNS}/ledger.tsv\` with the header \`task	executor	executor_model	acceptor_model	round	verdict	blockers	majors	minors	duration_s	tokens_total	quota_before_pct	quota_after_pct	ts_wita\`: task=\`${t.id}\`, executor=\`agy\`, executor_model=\`${t.model}\`, acceptor_model=\`sonnet\`, round=1; duration_s = \`tasks["${t.id}-gem"].run.agy.durationSec\`, tokens_total = \`run.agy.usage.total_tokens\`, quota_before_pct = \`run.quotaBefore.pct\`, quota_after_pct = \`run.quotaAfter.pct\` (all from \`{{MISSION_DIR}}/state.json\`; write \`n/a\` when a field is absent, never a guess); ts_wita = \`$(date '+%Y-%m-%d %H:%M WITA')\`.
4. On ACCEPT: ${integrate(t)}. On REJECT: nothing further (no twin in this regime). Do NOT commit anything (the штаб commits journals).
5. Finish: \`ARTIFACT:\` lines (the findings file and every canon path you wrote), then the last line \`RESULT: OK ACCEPT <summary>\` or \`RESULT: OK REJECT <summary>\` — a REJECT is a successful acceptance run; \`RESULT: FAIL\` only when you could not judge at all.
`;

const tasks = []; const P = path.join(D, 'prompts');
const common = { deps: [], softDeps: [], applyTo: '', why: 'заказ Ивана 2026-09-18 09:06 WITA (волна нагрузки gemini: реальные новые задачи, замер токенов/времени/результата); режим моделей 08:59 — только sonnet + gemini', source: 'INTAKE.md 09:06' };
let prio = 70;
for (const t of TASKS) {
  fs.mkdirSync(`${RUNS}/${t.id}-gem`, { recursive: true });
  fs.writeFileSync(path.join(P, `${t.id}-gem.md`), brief(t));
  fs.writeFileSync(path.join(P, `${t.id}-acc.md`), acc(t));
  tasks.push({ id: `${t.id}-gem`, title: `[gemini ${t.model}] ${t.title}`, kind: t.kind, lane: 'pair', runner: 'agy', model: t.model, waitOk: true, fallbackModel: 'sonnet', cwd: `${RUNS}/${t.id}-gem`, ...common, priority: prio, acceptance: t.acceptance, prompt: `${t.id}-gem.md`, status: 'queued', maxMin: 60 });
  tasks.push({ id: `${t.id}-acc`, title: `[приёмка sonnet, раунд 1] ${t.title}`, kind: 'accept', lane: 'pair', model: 'sonnet', effort: 'medium', cwd: 'mission', ...common, deps: [`${t.id}-gem`], priority: prio, acceptance: t.acceptance, prompt: `${t.id}-acc.md`, status: 'queued', maxMin: 60 });
  prio -= 1;
}
cfg.lanes.pair = 8; cfg.maxSlots = 10; cfg.fallbackModel = 'sonnet';
cfg.nightOrder = { since: 'подтверждение Ивана 2026-09-18 08:59 WITA (отменяет «не ниже opus» от 06:00 — ошибка, суперэкономия)', rule: 'только sonnet + любые gemini через agy; opus не запускать ни на что; приёмщик sonnet/medium; волна нагрузки gemini по заказу 09:06 — задачи gw01–gw14' };
L.saveTasks(cfg);
fs.writeFileSync(process.argv[2], JSON.stringify(tasks, null, 1));
console.log('prompts + dirs written; tasks', tasks.length, 'models', TASKS.map(t => t.model.includes('flash') ? 'F' : 'P').join(''), 'lanes', JSON.stringify(cfg.lanes), 'maxSlots', cfg.maxSlots);
