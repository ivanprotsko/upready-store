# {{TASK_ID}} — Store templates research: what InSales and Tilda templates DO (functionality, not looks) → feature registry + task list

You are a research worker. Worktree `{{WORKTREE}}`, branch `{{BRANCH}}` cut from `{{BASE}}`. This task ships DOCUMENTS and DATA — no product code. Your PR to `{{BASE}}` contains only `artifacts/research/2026-09-16-store-templates-functionality/**` and `artifacts/docs/{{TASK_ID}}/**` (rule 43: research owned by one repository lives in `projects/<p>/artifacts/research/`).

## Ivan's order (2026-09-16 08:22 WITA, verbatim, Russian)

> «Я предлагаю взять в задачи еще направление по шаблонам. Напомню про коридор вариантов который обсуждали в проекте upready-studio, и по этому принципу мы начали делать некоторые блоки страниц upready-store. Но то что на текущий момент получается выглядит недостаточно качественно. Хотелось бы чтобы был изучен вопрос, и созданы шаблоны с прослеживающимся стилем. А также нужно изучить шаблоны магазинов которые есть на insales.ru и Tilda.cc, не для того чтобы ориентироваться на их визуальный стиль, а для того чтобы посмотреть какая функциональность есть в примерах шаблонов, которые они показывают и учесть в списке задач для реализации в наших шаблонах и функционале бекенда - https://www.insales.ru/collection/themes - у них шаблоны визуально низкого качества, зато их много и мне что-то подсказывает там есть необходимая функциональность так как это большая компания - https://tilda.cc/ru/tpls/ - у тильды визуально выглядят лучше, но менее функционально. Общее впечатление что insales.ru для компаний с большим количеством товара и оборотом, а тильда для мелких предпринимателей. возможно прежде чем делать реальные блоки имеет смысл провести исследование и подготовить какое-то качественное количество шаблонов на html/css/js чтобы я посмотрел и только потом мы их будем переносить на storefront»

Meaning for THIS task: two sources — https://www.insales.ru/collection/themes (many themes, visually weak, probably feature-complete: InSales serves merchants with large catalogs and turnover) and https://tilda.cc/ru/tpls/ (visually better, less functional: small entrepreneurs). Study them for FUNCTIONALITY visible in the template demos — blocks, pages, widgets, store mechanics — never to copy visual style. Output = a feature registry with evidence, mapped to what upready-store already has, plus a task list (storefront templates + backend capabilities). A sibling task `tp01-store-templates-lab` builds our own HTML/CSS/JS templates in parallel and consumes your registry — the registry is the product, the prose is its cover.

## Economy with quality (Ivan's standing principle, 2026-09-16 08:22 WITA — rule 47)

- Fetch by SCRIPT, read by model: write `scripts/fetch.mjs` (Node, no extra packages beyond what the repo has; `cheerio` or a regex tag-stripper) that downloads pages and saves TEXT EXTRACTS; the model reads extracts, never raw HTML.
- Extract features per template with `sonnet` subagents (Agent tool, `model: "sonnet"`) against a strict JSON schema, ≤8 templates per subagent call; you (opus) merge and synthesize. Gate every subagent return in code: a return with < 3 features or without evidence is retried once, then recorded as a hole — never glued in silently.
- Report in `report.md` §Экономия: pages fetched by script, pages read by the model itself, subagent calls per model, bytes of raw HTML vs chars of extracts, what you automated and what you would automate next time.

## Sources and fetch rules (anti-bot: this machine's public IP was banned by a marketplace's developer portal on 2026-09-16 07:07 WITA after headed-browser fetches; do not repeat that)

- Sequential, ONE request at a time, ≥ 2 s delay, honest User-Agent `upready-research/1.0 (+https://upready.dev)`, timeout 20 s, cap 80 pages per source, NO retries on 403/429/5xx or on an anti-bot page: stop that source, log the status, continue with what you have. Never open these sites in a headed browser, never use Ivan's Chrome. Headless Playwright is allowed ONLY for a page that renders no content without JS (Tilda previews may) — same limits, same cap.
- Save every fetched page as `raw/<source>/<slug>.md` with the header `# Source: <url>` / `# Fetched: <ISO datetime>` / `# Topic: store-templates-functionality` / `# HTTP: <status>` followed by the extracted text (tags stripped, links kept as `[text](href)`, nav noise trimmed). No images, no 404s, no duplicates (rule 43).
- Marketplace developer documentation (WB, Ozon) is out of scope for this task and stays closed, as the preamble says.

## What already exists (read first, ≤ 10 minutes, do not redo)

- `artifacts/research/2026-09-12-competitor-nav-shopify-insales/` (IA/navigation of Shopify and InSales stores, `pages.json`).
- `/Users/ivanprotsko/upready/research/reports/2026-09-14-content-pages-competitors/` (content pages: categories, blogs, Q&A).
- Our current block corridor: `apps/storefront/src/lib/theme/composition.ts` (headers H1–H6, hero G–M, listing P1–P5, footer F1–F6), composition rules `/Users/ivanprotsko/upready/memory/page-composition-rules-storefront-2026-09-09.md`; what the storefront can do: `apps/storefront/src/modules/**`; backend capabilities: `apps/backend/src/modules/**`, `apps/backend/src/api/**`. `docs/` is a read-only archive.
- Live reference of our own product: https://cherkashino.shipshift.dev/ru (storefront) and https://panel-store.upready.dev (owner panel, read-only look — no login needed for this task).

## Method

1. Index: fetch the two listing pages (plus their pagination/category pages) → `templates-index.tsv` (source, template name, url, demo url if exposed, industry/category, price if shown). Record the total count per source even where you sample.
2. Sample: InSales — themes up to the cap, prioritising distinct industries; Tilda — store-related categories only («Интернет-магазин», «Товары», «Лендинг товара» and the like), up to the cap. For each template fetch its page AND, when a demo URL is exposed, the demo home page; catalog/product pages of the demo only while under the cap.
3. Extract per template (sonnet subagents, schema): features SEEN in the extract — `{id, name_ru, category, evidence, page_url}`, category ∈ {navigation, catalog-listing, filters-search, product-page, cart-checkout, promo-marketing, content, trust-reviews, account, b2b-wholesale, integrations, seo-perf, admin-customization}. Only what is visible in the text; nothing inferred from a template's name.
4. Merge → `features.json`: one row per distinct feature: `{id, name_ru, name_en, category, insales: {count, templates: [url…]}, tilda: {count, templates: [url…]}, upready_store: "есть" | "частично" | "нет", upready_where: "<file path or route or live URL>", backend_needed: boolean, backend_what: "<data/API needed>", priority: "must" | "should" | "later", note}`. The `upready_store` column is MEASURED by reading our code and the live site, never from memory.
5. `report.md` (Russian, for Ivan): §1 итог в 10 строк (что есть у InSales и нет у Tilda, наоборот, чего нет у нас); §2 таблица функций по категориям с числами «в скольких шаблонах»; §3 структура шаблонов — страниц на шаблон, типы блоков, типичная композиция главной (счётчики); §4 задачи (таблица со ссылкой на id); §5 что не удалось получить (URL, статус); §Экономия.
6. `templates-tasks.json`: an ARRAY of dispatcher tasks in the exact shape of entries in `handoff/day-2026-09-16-oksana-store/tasks.json` (id `tp02…`, Russian title, kind "build", lane "build", model "opus", effort "high", branch `feat/day16-<id>`, deps, softDeps, priority, `acceptance` measurable, `why` naming the feature ids and, for EACH task, «есть у InSales: да/нет; есть у Tilda: да/нет»), plus an English prompt draft per task in `prompts/<id>.md` (order → sources → what to build → measurements → report). Storefront-template tasks and backend-capability tasks are separate entries; every backend task names the data/API it needs.

## Deliverables

- `artifacts/research/2026-09-16-store-templates-functionality/{raw/, scripts/, templates-index.tsv, features.json, report.md, templates-tasks.json, prompts/}` — ≤ 15 MB in total.
- `artifacts/docs/{{TASK_ID}}/report.md` + `report.json` per the preamble; "where to look" links point at report.md, features.json and templates-tasks.json.

## Rules of evidence

- Every feature row carries at least one template URL where it was seen; "unknown" is a valid cell; an invented feature is a defect.
- No product code, no changes under `apps/*`, no migrations, no API keys.
- Open the PR when `features.json` holds ≥ 40 rows with evidence and the report is written; commit as you go.
