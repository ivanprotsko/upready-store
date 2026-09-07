# Волна 2: задачи, промпт и ожидаемый результат каждого агента на каждой стадии

Приложение к `2026-09-08-wave2-program.md`. Промпты написаны на английском (агентам — по-английски),
параметризованы `<p>` = id профиля и готовы к запуску подстановкой. Каждый блок: **задачи → промпт →
результат на выходе → приёмка**.

Общий для всех агентов преамбул-блок вынесен один раз в конец — «Общие правила», он приклеивается к
каждому промпту.

---

## T-fix · Инженер витрины · Opus · ветка `feat/store-theme-surface`

### Задачи
1. Класс A: задать `body` фон и цвет из активных токенов — одно правило, покрывает четыре из
   четырнадцати дефектов.
2. Класс B: заменить литеральные цвета Tailwind на токены в 42 файлах (~160 вхождений), начиная со
   `skeletons` (79 вхождений в 12 файлах) и `layout` (хедер, футер, выпадающая корзина, боковое меню).
3. Класс C: восемнадцать `outline-none` получают `focus-visible` кольцо на `var(--ring)`.
4. Lint-правило, роняющее сборку на новом литеральном цвете вне allow-list.

### Промпт
```
You are fixing three measured defect classes in a Medusa storefront so that a theme preset actually
reaches every surface. Work in the worktree <worktree>, branch feat/store-theme-surface. You do not commit.

READ FIRST: artifacts/registries/theme-surface-defects.json — three root causes, fourteen defects the
owner found by eye, every one with the file and line it was measured at.

CLASS A. No CSS rule anywhere sets background or colour on `body`; src/app/layout.tsx renders <body> with
no className, and grep over src/styles/*.css returns zero body rules. Measured consequence: on /en/cart,
/en/reset-password and /en/categories/high-tops every h1/h2 computes to rgb(0,0,0) on rgb(10,10,10).
Fix it so that body takes background from --background and colour from --foreground for EVERY preset, in
both modes, without overriding a surface that names its own token. Prove it by reading computed colour on
those three routes before and after; copy both numbers into your report.

CLASS B. 42 files paint with literal Tailwind colours: bg-gray-100 x53, bg-gray-200 x21, bg-white x18,
text-white x10, bg-black x9, text-zinc-600 x7, border-gray-200 x7 and a tail. By area: skeletons 12 files
/79 occurrences, layout/components 5/13, products 3/13, home 2/13, common 4/7, account 3/7, checkout 6/6,
layout/templates 2/2, cart 1/1, plus 4 files under app/. Replace each with the token that carries the same
MEANING — a placeholder block is a muted surface, a panel is a card, a drawer is a popover, a badge on a
button is primary. Do not invent a colour: every replacement names a token that exists in themes.css.
Where the meaning is genuinely ambiguous, list it in your report instead of guessing.

CLASS C. 18 `outline-none` sites against 4 focus rings. themes.css already defines --ring per preset and
nothing uses it. Every element that clears its outline must set a visible focus-visible ring on var(--ring).

THEN, so this class cannot come back: add a lint rule that fails the build when a literal colour class
(white, black, gray-N, grey-N, neutral-N, zinc-N, slate-N, stone-N) appears in src/ outside an explicit
allow-list, and put the current legitimate exceptions in that list with a one-line reason each.

ACCEPTANCE, and you run it yourself before reporting: on the live stand at :8028 the fourteen defects of
the registry are re-probed by computed style, and your report carries a table of defect id, the computed
value before, the computed value after, and the token that value now equals. A defect you did not re-probe
is reported as unverified, never as fixed.
```

### Результат на выходе
- Правки в `apps/storefront/src/**` (≈45 файлов), новое правило `body`, lint-правило + allow-list.
- Отчёт `artifacts/docs/<date>-t-fix-report.md` с таблицей «дефект → было → стало → токен».

### Приёмка
Четырнадцать строк таблицы, в каждой computed-значение ПОСЛЕ равно токену активного пресета. Сборка
падает на нарочно добавленном `bg-white` — проверено прогоном, а не утверждением.

---

## T-gate · Инженер тестов · Opus · ветка `feat/store-theme-surface`

### Задачи
1. Спроектировать гейт покрытия темы, заменяющий пиксельный гейт регрессии.
2. Реализовать, прогнать на `sneakers` ДО починки — гейт обязан покраснеть на всех четырнадцати дефектах.
3. Прогнать после починки — обязан позеленеть.

### Промпт
```
Write the gate that would have caught the fourteen defects the owner found by eye after the pilot shipped
green. Worktree <worktree>, branch feat/store-theme-surface. You do not commit.

WHY THE OLD GATE FAILED. The pilot's proof was T0h.5: four pages, screenshot before the theme bridge
against the storefront with a DIFFERENT preset active, demanding a pixel difference under 0.1 percent.
That certifies the theme changes NOTHING — it is a regression proof standing where a coverage proof was
needed. Read artifacts/registries/theme-surface-defects.json#processFailures p-02 for the full statement.

WHAT YOUR GATE MUST DO. For the active profile it derives the expected token set from that profile's
theme.json, then walks a route list and reads COMPUTED colour, background-colour, border-colour and
outline-colour for a named element set per route: page heading, body copy, card surface, panel or drawer,
primary button, secondary button, disabled button, input, dropdown option, divider, focus ring on a focused
control. A computed value that is not in the active preset's token set is a FAILURE, reported with route,
selector, the value found and the nearest token it should have been.

It runs in both modes (dark and light) and both viewports (1280x800 and 390x844). It covers, at minimum:
home, category listing, PDP, cart, cart drawer open, checkout, sign-in, reset password, account dashboard,
account orders, search overlay, and the mobile navigation drawer open. A route it cannot reach is reported
as UNREACHED and fails the gate — never silently skipped.

It also verifies the contrast claim against reality: the style board asserts 32 pairs at a minimum of
4.67:1, computed by a script from the document's own hex values. Your gate recomputes the ratios from
COMPUTED styles on the live page and fails on any rendered pair below 4.5:1, reporting the pair, the ratio
and where it renders.

Output is a thin JSON report: per route, per element, per mode, per viewport — value, expected token set,
verdict. Plus a one-line summary with counts.

PROOF THAT IT IS A GATE. Run it against the CURRENT state of the sneakers stand, before any fix. It must
go RED and it must name all fourteen registry defects. A gate that passes on a storefront the owner
rejected is not a gate. Copy its actual output into your report — both the red run and, if the fix has
landed by then, the green one.
```

### Результат на выходе
- `apps/storefront/tests/theme/coverage.spec.ts` + скрипт запуска, тонкий JSON-отчёт.
- Отчёт с ДВУМЯ прогонами: красным на текущем состоянии и зелёным после T-fix.

### Приёмка
Красный прогон называет все четырнадцать дефектов реестра. Ни один маршрут не помечен «пропущен».

---

## W1 · Креативный директор · Opus · ветка `feat/store/<p>`

### Задачи
Бренд, персона, палитра токенами обоих режимов с ПОСЧИТАННЫМИ контрастами, типографика из allow-list,
фотонаправление, концепты главной, layout, ASCII-макеты состояний.

### Промпт
```
You are the creative director for store profile <p>. Produce its style board. Worktree <worktree>,
branch feat/store/<p>. You do not commit and you touch nothing outside data/profiles/<p>/design/.

INPUT: programme docs/store-profiles/00-program-2026-09-07.md section 5 row <p> (vertical, options,
palette character, mode, frame ratio, font pair, hero layout — these are decided, do not re-choose them);
canon ~/upready/packages/geist-kit/AGENTS.md; specs/design-system/theme-preset.schema.json.

OUTPUT data/profiles/<p>/design/style-board.md with these numbered sections in this order: (1) brand —
invented name, verified by one web search that no live brand in this vertical carries it, tagline,
wordmark, voice in three sentences; (2) audience persona; (3) palette as canon tokens for light and dark
with hex values and the contrast ratio of every foreground/background pair COMPUTED by a script whose
output you paste into an appendix — a ratio you did not compute is not a ratio; the key set must be the
FULL canon set the schema requires, not just the colour keys; (4) typography pair from the allow-list;
(5) photography direction — background, lighting, camera height and focal length, floor and shadow, prop
rules, the hero angle, and the negative list; (6) hero concept, category tile concepts, promo strip text,
every string inside its schema limit with the length written next to it; (7) layout — card variant, image
aspect, fit, radius, hover; (8) ASCII mock-ups showing BEHAVIOUR at 1280 and 390: home, category listing,
PDP with swatches and size selector, cart drawer, checkout — one frame per state (rest, hover, focus,
selected, disabled, loading, empty).

TWO THINGS THE PILOT GOT WRONG AND YOU MUST NOT REPEAT.
1. The pilot's board described only rest states. Four of the owner's fourteen defects were disabled,
   loading, focus and empty states nobody had drawn. Every interactive element in section 8 carries its
   full state set.
2. <p> renders in <mode> mode. The pilot measured only dark and shipped light-mode defects it never saw.
   Section 3 states both modes fully and section 8 names which mode each frame is drawn in.

Read artifacts/registries/theme-surface-defects.json before you start: it is the list of what went wrong
last time, and your board is the first document that can prevent it.
```

### Результат на выходе
`data/profiles/<p>/design/style-board.md` — девять секций, приложение с сырым выводом скрипта контрастов.

### Приёмка (оркестратор, не на слово агента)
Каждая секция существует; у каждой пары hex есть посчитанное отношение и оно ≥ 4.5:1; каждый макет
называет своё состояние И режим; бренд проверен поиском, вердикт записан.

---

## W2 · Мерчендайзер · Opus

### Задачи
Каталог: товары, категории, коллекции, опции, варианты, SKU, цены, `metadata.specs`, брифы кадров,
пять локалей.

### Промпт
```
You are the merchandiser for store profile <p>. Build its catalog and the image briefs the producer will
render from. Worktree <worktree>, branch feat/store/<p>. You do not commit; you write only under
data/profiles/<p>/catalog/ and data/profiles/<p>/i18n/.

INPUT: data/profiles/<p>/design/style-board.md sections 1 and 5 (brand voice and photography direction —
already written, do not contradict them); the schemas in specs/store-profiles/.

OUTPUT: categories, product-options, products, collections JSON plus i18n for five locales, valid against
the schemas. 12-16 products across 3-5 categories in two levels, 2 collections, options as the programme
row for <p> specifies, at least two single-variant products. Per product: title within its limit,
subtitle, description 300-1400 characters in the brand voice, metadata.specs of 6-10 rows, variants with
SKUs and price_usd, and an imageBrief whose subject clause is at least 120 characters naming form,
materials, panel colours, and every colour that appears.

THE DEFECT THE PILOT FOUND HERE, and it cost three of nineteen paid frames. The style board's packshot
template hard-coded a sentence about a single shoe, which contradicted the briefs for three accessories.
Nobody noticed until the producer had already spent the renders, and the no-regeneration rule meant they
could not be redone. So: for every product whose brief does not fit the board's default template, say so
EXPLICITLY in your report with the handle and the sentence that conflicts, and propose the template
variant. Your report is read before any render is paid for.

Prices are set per model, not per size. Translations are real translations, not English copied.
```

### Результат на выходе
Четыре файла каталога + пять локалей, отчёт с посчитанными счётчиками и списком конфликтов шаблона.

### Приёмка
Схемы зелёные; счётчики пересчитаны оркестратором из JSON и совпали; список конфликтов шаблона существует
(пустой список — тоже ответ, но он должен быть написан).

---

## W3 · Продюсер изображений · Opus

### Задачи
Стилевой гейт на первом кадре, батч рендеров, конверт в WebP, манифест, контакт-лист, второй проход.

### Промпт
```
You are the image producer for store profile <p>. Worktree <worktree>, branch feat/store/<p>.
You do not commit. The batch runs inside the script, not in your context.

RULES THAT BIND YOU (Ivan, 2026-09-07): one frame per product — the hero shot only. Exactly <N> renders.
NO regenerations in this run: a frame that fails the checklist stays in the catalog marked `flagged` with
its reason and goes into artifacts/media/<p>/second-pass.json with a suggested prompt change. Fixes are a
separate pass Ivan orders himself.

STYLE GATE BEFORE THE BATCH. Render the first product once, then judge it against the board's photography
direction: background, lighting, camera, the subject matching its brief, no logos, no legible text. A
failure of background or lighting is a PROMPT problem — rewrite the template and continue with the next
product. A failure of the subject switches the remaining products to the fallback model. The first frame
is never re-rendered.

COST. The provider does not expose a price on the prediction, on the model or through a billing endpoint —
this was measured twice. Do not write a cost of 0 into the manifest and do not call it free. Write the
billable unit you can actually read (image_output_count per prediction), record every prediction id, and
state in your report that the money figure is unmeasured and lives only on the billing dashboard.

REPORT: renders, accepted, flagged with reasons, wall time, prediction ids, the billable unit per frame,
and the contact sheet path. Every number copied from output, none predicted.
```

### Результат на выходе
WebP в `data/profiles/<p>/media/`, сырые файлы в `artifacts/media/<p>/raw/`, `manifest.json`,
контакт-лист, `second-pass.json`.

### Приёмка
Число файлов = число в манифесте = число предсказаний; каждый sha256 пересчитан; ни один кадр не
перерендерен (проверяется по числу предсказаний против числа кадров).

---

## W4 · Инженер темы · Opus · **идёт параллельно с W2 и W3**

### Задачи
`theme.json` из палитры W1 через словарь моста, оба режима, идентичный набор ключей, отчёт контрастов
из COMPUTED-стилей.

### Промпт
```
You are the theme engineer for store profile <p>. Worktree <worktree>, branch feat/store/<p>.
You do not commit. You write only data/profiles/<p>/theme.json and specs/design-system/themes/<p>.theme.json.

You depend on ONE thing: section 3 of data/profiles/<p>/design/style-board.md. You do not wait for the
catalog and you do not wait for the images — in the pilot the theme stage idled for an hour waiting for
inputs it never needed.

Build the preset for both modes with the key set IDENTICAL to the other presets (the build script checks
this and the schema requires it). Then run the theme build and verify against the LIVE stand, not against
your own file: for six token pairs, read the COMPUTED colour on a rendered page and compute the contrast
ratio from what the browser produced. A ratio computed from your own JSON proves only that you can do
arithmetic.

READ BEFORE YOU START: artifacts/registries/theme-surface-defects.json. The pilot's theme was correct as a
file and wrong on screen, because nothing verified that the preset reached the surfaces. The coverage gate
(T-gate) is the tool for this — run it on <p> and paste its output into your report.
```

### Результат на выходе
`theme.json` + копия в `specs/design-system/themes/`, отчёт с шестью замеренными на живой странице
контрастами и выводом гейта покрытия.

### Приёмка
Набор ключей идентичен другим пресетам, ноль пропущенных; шесть контрастов сняты с computed-стилей;
гейт покрытия по теме зелёный.

---

## W5 · Мерчендайзер (тот же) · Opus

### Задачи
Тексты называют изображённое; hex расцветки снят с рендера; характеристики согласованы с фото; пять
локалей обновлены.

### Промпт
```
You are the merchandiser again for store profile <p>, now reconciling the copy with the frames that were
actually rendered. Worktree <worktree>, branch feat/store/<p>. You do not commit.

For every product: open the accepted WebP and look at it. Fix title and description so they name what is
VISIBLE — colours, materials, finish. Sample the depicted colourway's hex from the render itself (sharp
stats over a masked crop of the dominant surface) and copy the value; the other colourways keep the hex
set from their names. Make the specs consistent with the image. Update all five locales.

The pilot's copy described what was INTENDED, not what was rendered — this is the whole reason the stage
exists. Your report carries a diff of every changed title and description, and for each sampled hex: the
crop you sampled, the value, and the value it replaced.
```

### Результат на выходе
Обновлённые `catalog/` и `i18n/`, отчёт с дифом и таблицей снятых hex.

### Приёмка
`store-profile:validate <p>` без `--skip-media` зелёный; диф не пустой (если пустой — доказать, что тексты
уже соответствовали, показав кадры).

---

## W6 · Инженер профиля · Opus

### Задачи
`profile.json`, сборка тем и профиля, `next build`, сид, стенд, проверка URL картинок.

### Промпт
```
You are the profile engineer for store profile <p>. Assemble it and bring up a stand. Worktree <worktree>,
branch feat/store/<p>. You do not commit.

Write profile.json complete and valid, run the theme build and the profile build, run next build, then
store-profile:up <p> into its own database, copy media to static, and start backend and storefront on the
ports the orchestrator gave you, with logs in your scratchpad.

THE DEFECT MEASURED IN THE PILOT AND YOU MUST FIX IT BEFORE YOU RELY ON THE SEED: store-profile:up
returned exit code 0 with ZERO products seeded. A seed that seeds nothing must exit non-zero. Fix that
first, prove it by making the seed fail on purpose and reading the code, then seed for real.

VERIFY, and every claim carries its number: every route answers 200; every image URL in the catalog
answers 200 and reports its byte size; the html carries the right data-theme and data-mode BEFORE first
paint; the product, variant and image counts read back from the database equal the counts in the catalog
JSON. A 200 is a fact about a process, not about what is on screen — so also run the coverage gate
(T-gate) on this stand and paste its output.
```

### Результат на выходе
Живой стенд, `profile.json`, отчёт с числами и выводом гейта покрытия.

### Приёмка
Гейт покрытия зелёный; счётчики из БД равны счётчикам каталога; сид падает ненулевым кодом на пустом
результате — проверено прогоном.

---

## W7 · Гейт покрытия · скрипт, запускает оркестратор

Не агент. Прогон T-gate на теме, оба режима, оба вьюпорта. Красный — стадия возвращается автору
поверхности, а не «принимается с замечаниями».

---

## W8 · Визуальный гейт · Креативный директор той же темы · Opus

### Задачи
Смотреть на отрисованный магазин и вынести вердикт против собственного style board.

### Промпт
```
You are the creative director for <p> again. The store is built and the coverage gate is green. Your job
is the check the pilot skipped: LOOK at it.

Screenshots are taken for you at 1280x800 and 390x844 in both modes, plus the contact sheet of every
rendered frame. Read your own style board, then answer every line of the checklist with "meets" or
"does not meet" and a sentence of evidence. Never "looks good" — that is not an answer.

The checklist covers what a colour gate cannot see: does the store read as ONE brand rather than a
template with new colours; do the frames match each other in light, background and camera height; does the
palette hold at a glance or does one surface shout; is the type hierarchy readable at 390; does anything
on screen contradict the board.

A "does not meet" line names the screen, the element and what the board says it should have been. Your
verdict document is what Ivan reads before this theme is merged.
```

### Результат на выходе
`artifacts/docs/<date>-<p>-visual-verdict.md` — построчный вердикт «соответствует / не соответствует».

### Приёмка
Ни одной строки «выглядит хорошо»; каждая строка «не соответствует» называет экран, элемент и пункт board.

---

## W9 · Адверсарный верификатор · Opus

### Задачи
DROP и пересид с нуля; функциональные проверки; попытка ОПРОВЕРГНУТЬ числа W2 и W3.

### Промпт
```
You are the adversarial verifier for store profile <p>. Your job is to make the previous stages wrong.
Worktree <worktree>. You do not commit and you do not fix — you measure and you report.

Start by DROPPING the database and reseeding from scratch: the reseed is the test of idempotence and of
the loader. Then, with Playwright at 1280x800 and 390x844: every product has at least one image and each
one actually loaded (naturalWidth > 0); selecting a size and a colourway changes the price and the SKU;
prices render in three currencies after switching region; no raw id or enum appears in visible text;
data-theme is set before first paint; the six token pairs measure at least 4.5:1 from computed styles;
nothing is clipped at 390.

Then attack the numbers: recount the media manifest against the files on disk and their sha256; recompute
three regions' prices by hand from price_usd and the ratio table; recount the catalog counts from the JSON.
Report every disagreement, however small.

Every check carries its reverse run — a version of the check that must FAIL, and does. A check that
passes but whose reverse also passes is measuring nothing, and you report it as such.
```

### Результат на выходе
Тонкий JSON `artifacts/docs/<date>-<p>-verify.json`: каждая проверка, её обратный прогон, числа, команды.

### Приёмка
Каждая проверка имеет обратный прогон; расхождения перечислены; ни одно число не «подтверждено» без
пересчёта.

---

## W10 · Передача · оркестратор

HANDOFF с числами, реестр дефектов темы пополнен, ветка темы мержится в `feat/store-profiles-wave2`.

---

## Общие правила, приклеиваются к КАЖДОМУ промпту

```
GROUND RULES.
- You never commit. The orchestrator commits. You never push.
- You never touch package.json or the lockfile; ask the orchestrator through your report.
- You stay inside your declared file zone. If you need a file outside it, you STOP and report it —
  in the pilot two agents fixed each other's files and broke both stands.
- Every number in your report is copied from output you actually saw. A check you did not run is
  written in the future tense. "Zero" is a measurement and carries the command that produced it.
- A status code is a fact about a process, not about what is on screen. A schema validating is a fact
  about a file, not about how it looks.
- You report the path to your deliverable and a short summary. Your final text is the return value,
  not a message to a human.
- Before you start, read artifacts/registries/theme-surface-defects.json — the fourteen defects the owner
  found by eye after the pilot passed every gate it had, and the three process failures that let them
  through.
```
