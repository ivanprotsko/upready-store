# tp06-home-content-blocks-ui — Витрина: блоки преимуществ, FAQ, соцсетей и отзывов о магазине + починка заглушек композиции (hero k, hero l, подвал f4)

Branch `feat/day16-tp06-home-content-blocks-ui`, cut from `dev`, one Superset workspace, one PR into `dev`. Language: Russian is fine for prose and commits, English for identifiers.

## Order

Render the tp05 data as home-page blocks inside our existing composition corridor, and close a measured defect: three of the corridor's choices are silent placeholders.

## Where this comes from

Research `artifacts/research/2026-09-16-store-templates-functionality/` on this repository (task r03). Read `report.md` §2 and the rows of `features.json` whose `id` is one of: `advantages-block`, `faq-block`, `social-follow-share`, `store-reviews`, `widget-library`. Each row carries the templates where the feature was seen and what our own product has today — the `upready_store` and `upready_where` columns are a MEASUREMENT of our code and of the live store, made 2026-09-16, not a memory.

Evidence to look at before you design anything:

  - InSales, «Блок преимуществ магазина»: https://demo-idea.myinsales.ru/
  - InSales, «Блок преимуществ магазина»: https://demo-loft.myinsales.ru/
  - Tilda, «Блок преимуществ магазина»: http://examples-ru.tilda.ws/floristsru
  - Tilda, «Вопросы и ответы (FAQ)»: http://examples-ru.tilda.ws/plantsshopru
  - Tilda, «Вопросы и ответы (FAQ)»: http://examples-ru.tilda.ws/homegoodsru
  - InSales, «Соцсети: подписка и кнопки «поделиться»»: http://demo-fourth.myinsales.ru/
  - InSales, «Соцсети: подписка и кнопки «поделиться»»: http://demo-gift.myinsales.ru/
  - Tilda, «Соцсети: подписка и кнопки «поделиться»»: http://examples-ru.tilda.ws/homegoodsru
  - Tilda, «Соцсети: подписка и кнопки «поделиться»»: http://examples-ru.tilda.ws/shetukaru
  - InSales, «Отзывы покупателей о магазине»: https://demo-idea.myinsales.ru/collection/dlya-devochek/product/medvezhonok
  - InSales, «Отзывы покупателей о магазине»: https://myshop-bcp658.myinsales.ru/
  - Tilda, «Отзывы покупателей о магазине»: http://examples-ru.tilda.ws/newsfeedrealestateru
  - Tilda, «Отзывы покупателей о магазине»: http://examples-ru.tilda.ws/plantsshopru
  - InSales, «Библиотека виджетов страниц (100+)»: https://demo-idea.myinsales.ru/
  - InSales, «Библиотека виджетов страниц (100+)»: https://www.insales.ru/collection/themes-cosmetics/product/shablon-internet-magazina-moon

Do not copy anyone's visual style — only the mechanics. Our design language is Geist plus the composition corridor in `apps/storefront/src/lib/theme/composition.ts`; a sibling task `tp01-store-templates-lab` owns the style specification.

## What to build

- Blocks for advantages (3-4 tiles), FAQ (accordion), social links and store reviews, each self-suppressing when the shop has no data — the idiom `ProfileHero`/`CategoryTiles` already use.
- Each new block becomes a named option of the composition document (`apps/storefront/src/lib/theme/composition.ts`) with a plain-language label and a next-intl key, the way the existing options are done.
- MEASURED DEFECT to fix: `modules/home/variants/index.ts` maps hero `k` and `l` to `ProfileHero`, and `modules/layout/templates/footer/variants/index.ts` maps footer `f4` to `FooterF1`. The owner picks «Карусель с соседями»/«Инвертированный, с рассылкой» and silently gets something else. Implement the three variants, or remove them from the vocabulary — never leave a choice that lies. The f4 newsletter form needs the endpoint from tp09; if tp09 is not merged yet, ship f4 with the form disabled and say so in the PR, do not map it to another footer.

## How it is measured (rule 18f — reality, not «should work»)

- On the local stand, switch every composition option one by one and confirm the storefront actually changes; a screenshot per new block.
- A check (test or script) asserting that every key of the composition vocabulary maps to its OWN component — so this defect cannot come back silently.

Every acceptance line in the PR body quotes the command and its output, or names the screenshot file. Screenshots go to `artifacts/docs/tp06-home-content-blocks-ui/`.

## Boundaries

- Storefront only; if you need data the API does not return, name the missing endpoint in the PR instead of adding a backend model here.
- No changes to another task's area, no history rewrites, no force-push, never commit `HANDOFF.json` on a task branch.
- A schema change on a live database is preceded by `pg_dump`.

## Finish

Checks green (name them with their result lines) → `git push -u origin feat/day16-tp06-home-content-blocks-ui` → `gh pr create --base dev` with the measurements in the body → append a line to `handoff/day-2026-09-16-oksana-store/logs/workers.log` → stop, do not merge your own PR.
