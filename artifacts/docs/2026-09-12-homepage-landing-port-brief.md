# Landing port brief — L1 of the homepage funnel (2026-09-12, session 01B7q8iX)

Кратко по-русски: перенос лендинга `apps/homepage/index.html` (рендерится рантаймом `support.js`)
в React-компоненты по секциям. Один агент на секцию, отдельный агент-сборщик. Целевой каркас RR7
Иван пришлёт позже, поэтому порт живёт в `apps/homepage/port/` (Vite + React 19 + TS) как
самодостаточный харнесс; позже он переезжает в RR7-маршрут без переписывания компонентов.
Канон дизайна = сама текущая страница (пиксельный эталон), макет = эталонные скриншоты секций.
Ни один сервер из этого документа не работает сам по себе: каждый адрес ниже открывается ПОСЛЕ
команды запуска, которая стоит рядом с ним.

## 0. Facts (measured 2026-09-12)

- `apps/homepage/index.html` — 161 KB. One `<x-dc>` template, 15 `<section>` + `<nav>` + `<footer>`,
  666 inline `style=""` attributes, 1 `<style>` block, 144 `{{ … }}` template expressions (mostly
  boolean flags such as `showPricing`, `showFaq`, `showIncluded`).
- `apps/homepage/support.js` — 69 KB, GENERATED bundle of `dc-runtime` (source is NOT in the repo;
  header: «GENERATED from dc-runtime/src/*.ts — do not edit»). It reads the `<x-dc>` template, the
  `<script type="text/x-dc" data-dc-script data-props="…">` (36 KB: JSON props + page JS), evaluates
  the `{{ }}` expressions and renders through `window.React.createElement`. Interactive behaviour
  (tariff tabs, card rails, FAQ, visibility flags) lives in that page JS and must be re-expressed as
  React state — `support.js` is NOT part of the port.
- Images: `apps/homepage/images/` (12 files). Fonts: see the `<style>` block.
- Toolchain on this machine: node 26.8.1, pnpm 8.12.0, Google Chrome at
  `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (headless screenshots via
  puppeteer-core). No playwright at the repo root. pnpm workspace globs `apps/**`, so
  `apps/homepage/port/package.json` becomes a workspace package automatically.
- Reference render: run `cd apps/homepage && nohup python3 -m http.server 4790 > port/.logs/ref-4790.log 2>&1 &`
  (skip if `lsof -nP -iTCP:4790 -sTCP:LISTEN` already shows a listener), then open
  `http://localhost:4790/index.html`.

## 1. Layout of the port (created by the scaffold agent, frozen for section agents)

```
apps/homepage/
  index.html, support.js, images/      ← legacy reference, UNTOUCHED during the port
  port/
    package.json  vite.config.ts  tsconfig.json  index.html  .gitignore (.logs, shots/out, node_modules, dist)
    public/images -> ../../images       (symlink; the app references /images/<file>)
    src/main.tsx                        ?section=<slug> → renders ONE section; otherwise <App/>
    src/App.tsx                         all sections in DOM order inside the shell (merger owns it)
    src/styles/base.css                 reset + fonts + the legacy <style> block + body/background
    src/sections/index.ts               registry: [{ slug, label, id, Component }] in DOM order (frozen)
    src/sections/<slug>/index.tsx       default export React component (section agent owns the folder)
    src/sections/<slug>/styles.module.css
    src/sections/<slug>/data.ts         section copy/props extracted from data-props
    src/sections/<slug>/NOTES.md        what was ported, what behaviour, measured diff
    reference/props.json                data-props JSON, pretty-printed
    reference/dc-script.js              the page JS from data-dc-script
    reference/style.css                 the legacy <style> block
    reference/raw/<NN>-<slug>.html      raw template HTML of the section (with {{ }})
    reference/rendered/<NN>-<slug>.html outerHTML AFTER support.js rendered it (what the user sees)
    reference/shots/<slug>.png          element screenshot of the rendered section at 1440 px
    scripts/shot.mjs                    --url --selector --out [--width 1440]  (puppeteer-core + local Chrome)
    scripts/diff.mjs                    <a.png> <b.png> → prints {"diffPct": n, "w", "h"} (pixelmatch)
    scripts/split-reference.mjs         produces reference/* from the legacy page
```

Dependencies (installed ONCE by the scaffold, never by section agents): react, react-dom,
vite, @vitejs/plugin-react, typescript, @types/react, @types/react-dom, puppeteer-core,
pixelmatch, pngjs. Install from the repo root: `pnpm install --filter @upready/homepage-port`.

## 2. Section registry (DOM order, slugs are frozen)

| NN | slug | data-screen-label | legacy id | raw bytes |
|---|---|---|---|---|
| 00 | shell | nav + footer («Подвал», footer is `display:none` by default) | — | 3045 + 3828 |
| 01 | hero | Первый экран | — | 3374 |
| 02 | launch-artifact | Артефакт: запуск | — | 8655 |
| 03 | social-proof | Кто уже на этой системе | — | 3955 |
| 04 | proof-full | Почему это про вас | proof-full | 7956 |
| 05 | proof-short | Почему это про вас — коротко | — | 1500 |
| 06 | frame | Рамка | — | 6579 |
| 07 | included | Что входит | sec-included | 39489 |
| 08 | operations | Операции | — | 4555 |
| 09 | pricing | Цены | sec-pricing | 5168 |
| 10 | payments | Оплата | sec-payments | 4705 |
| 11 | delivery | Доставка | sec-delivery | 4363 |
| 12 | showcase | Примеры магазинов | sec-showcase | 3917 |
| 13 | faq | Вопросы | sec-faq | 3030 |
| 14 | tariffs | Тарифы | sec-tariffs | 3765 |
| 15 | final-cta | Финальный призыв | — | 2604 |

## 3. Component contract (every section agent)

1. Own ONLY `port/src/sections/<slug>/**`. Never edit the registry, `App.tsx`, `base.css`,
   `package.json`, other sections, or the legacy files. Need something shared? Write it in NOTES.md
   under «Needs from merger» — the merger decides.
2. Root element: `<section data-section="<slug>" data-testid="sec-<slug>" id="<legacy id if any>">`.
   For `shell`: `<header data-section="shell-nav">` and `<footer data-section="shell-footer">`,
   exported as `Nav` and `Footer` named exports plus a default `Shell` that renders both around `children`.
3. Fidelity: port the RENDERED DOM (`reference/rendered/<NN>-<slug>.html`), not the raw template.
   Inline styles become CSS-module classes with the SAME values (colors, sizes, radii, fonts,
   spacing). Text is copied verbatim into `data.ts`. Images use `/images/<file>`.
4. Behaviour comes from `reference/dc-script.js` — find the code that touches your section
   (tabs, rails/carousels, accordion, toggles, `show*` flags) and re-express it as React state.
   No `window` globals, no `support.js`, no DOM queries outside the component. Visibility flags
   default to the value `reference/props.json` gives them.
5. No new dependencies. TypeScript strict; `pnpm exec tsc --noEmit -p port` must pass for your files.
6. Acceptance (measured, not claimed): start the harness on YOUR port
   (`cd apps/homepage/port && nohup pnpm exec vite --port <port> > .logs/<slug>.log 2>&1 &`, record `$!`,
   wait for the «ready» line in the log), then run
   `node scripts/shot.mjs --url "http://localhost:<port>/?section=<slug>" --selector '[data-section="<slug>"]' --out shots/out/<slug>.png`
   and `node scripts/diff.mjs reference/shots/<slug>.png shots/out/<slug>.png`.
   Target `diffPct` ≤ 2. Report the number you measured, even if it is worse.
   Then stop your vite process (`kill <the recorded PID>`).
7. Never run `git commit`, `git add`, `pnpm install`, or a `turbo` command. Never delete files.
8. Ports: section NN uses `5200 + NN` (shell 5200, hero 5201, … final-cta 5215). Reference is 4790.

## 4. Merger contract

Owns `App.tsx`, `base.css` adjustments and cross-section seams only. Reads every `NOTES.md`,
applies «Needs from merger» items, assembles sections in DOM order inside `Shell`, wires nav anchors
(`#sec-pricing`, `#sec-faq`, …) to the section ids, restores shared flags (`show*`) as one piece of
state in `App.tsx`. Acceptance: start the harness (`cd apps/homepage/port && nohup pnpm exec vite --port 5299 > .logs/merge.log 2>&1 &`),
take a full-page screenshot of `http://localhost:5299/` and of the reference at 4790, run
`diff.mjs` (target `diffPct` ≤ 3), and re-measure every per-section diff. Write `port/REPORT.md`
with the table (slug, diffPct before/after merge, open issues). Stop the harness. Do not commit.

## 5. Human-eyes acceptance (after the merger)

Ivan starts both servers (`cd apps/homepage && python3 -m http.server 4790` and
`cd apps/homepage/port && pnpm exec vite --port 5299`), then opens the port next to the legacy
page at 1440 px and walks it top to bottom: tariff tabs, card rails, FAQ, all anchors from the nav.
Verdict is his, the diff numbers only say where to look first.
