# t-2026-09-24-n23 — course page «Очищение печени» (W16)

Live render of the worker's own storefront `http://olavka-com.localhost:8243/ru/products/course-ochishchenie-pecheni`
(backend `http://localhost:9241`, database `upready_store_w16_n23`, restored from
`stand-db-before-courses-seed-20260924.dump` + `o24-seed-digital-shipping-option` + `o24-seed-courses` +
`o24-fix-course-inventory` + this task's two commands). Shots by `shoot.mjs` in this folder (Playwright 1.63,
Chromium, `deviceScaleFactor: 1`, viewport height 900, theme set through localStorage `upready-store.mode`).
All PNGs are losslessly recompressed (sharp, PNG level 9); pixels are unchanged.

## Gallery groups

| Folder | What it shows |
|---|---|
| `course-top/` | Viewport at the top of the page: the cover (pre-cut WebP via `srcset`), the centre card with the title and the start of Ivan's 1.2 text, the buy box. 1440: two columns, buy box on the right. 768/390: stacked (cover, centre card, then buy box). |
| `course-sticky-midscroll/` | Scrolled with the wheel until «Вопросы и ответы» is at the top. 1440: the buy box is still in view, pinned at `top: 80px` (measured `buyBoxTop: 80` in both themes). 768 and 390 are below the 1024 breakpoint, so the page is one column and the phone's sticky bar (`mobile-actions`, price + «В корзину») is what keeps buying reachable (measured `mobileBarTop: 775`). |
| `course-about/` | The whole «О программе» card: «Почему вы можете нам доверять», «Откуда вообще камни в печени» (quotes of Надежда Семенова and Наталья), «Что вы получите по окончании программы», «Что входит» (with «Программа длится 7 дней», no 15000/10000 prices), «Об авторе», «Среди участников программ Школы естественного оздоровления». |
| `course-programme/` | The existing lesson list (`CourseBlock`, 20 lessons with locks), now in the content column at the same width as the other sections. |
| `course-faq-open/` | «Вопросы и ответы», 9 items as `<details>`; the first is open by default, the fourth («А это больно?») was clicked open for the shot. |
| `course-testimonials/` | «Отзывы участников», 9 text testimonials, each with its author (two columns from 1024). |
| `regular-product-regression-before/` | An ordinary product (`mumie-altayskoe-ochischennoe-naturalnoe-100-cherkashino`), full page, rendered by the `dev` versions of `templates/index.tsx` and `course-block/index.tsx` (swapped in temporarily on the same server, then restored). |
| `regular-product-regression/` | The same product on this branch. Pixel comparison before vs after (sharp raw buffers): **0 differing pixels** in all six shots (1440/768/390 × light/dark: 2 826 720, 2 469 120 and 1 175 070 px compared). |

## Line 1: the cover in several sizes, request log

`apps/backend/scripts/media/make-image-variants.mjs /Users/ivanprotsko/upready/docs-projects/chrxnasdmds/banner-image/liver.png static/courses/course-ochishchenie-pecheni`
(source 2752×1536 PNG, read by sharp only):

```
wrote static/courses/course-ochishchenie-pecheni/liver-480.webp 480x268 q82 43.7 KB
wrote static/courses/course-ochishchenie-pecheni/liver-768.webp 768x429 q82 101.8 KB
wrote static/courses/course-ochishchenie-pecheni/liver-1080.webp 1080x603 q78 169.6 KB
wrote static/courses/course-ochishchenie-pecheni/liver-1440.webp 1440x804 q78 291.2 KB
wrote static/courses/course-ochishchenie-pecheni/liver-1920.webp 1920x1072 q78 496.4 KB
total 5 file(s), 1102.6 KB
```

Total 1.08 MB (≤ 1.5 MB). AVIF is supported (`--formats webp,avif`) but not used for this course: the five AVIF
files add 707 KB, which would take the total over 1.5 MB, and the page would need a `<picture>` for no visible gain.

`sizes="(min-width: 1440px) 984px, (min-width: 1024px) calc(100vw - 456px), calc(100vw - 32px)"`. Requests to
`liver-*.webp` recorded with `page.on('request')` on a fresh context per width, plus the `<img>`'s `currentSrc`:

| Width | Theme | Requested | currentSrc |
|---|---|---|---|
| 1440 | light | liver-1080.webp | liver-1080.webp |
| 1440 | dark | liver-1080.webp | liver-1080.webp |
| 768 | light | liver-768.webp | liver-768.webp |
| 768 | dark | liver-768.webp | liver-768.webp |
| 390 | light | liver-480.webp | liver-480.webp |
| 390 | dark | liver-480.webp | liver-480.webp |

Each width fetches one file and a different one; nothing goes through `/_next/image`. On a 2× screen the same
rule picks 1920 / 1440 / 768.

## Line 4d: testimonial audit

The landing's review area holds 15 images. Each was downloaded and looked at.

| # | File on the landing | What it is | Decision |
|---|---|---|---|
| 1–9 | `photo_2022-06-22_10-/11-*.jpg` (tild3834…, tild3037…, tild3239…, tild3665…, tild3633…, tild6165…, tild3539…, tild3866…, tild6563…) | Portrait photos (avatars beside the landing's text testimonials), no text at all | Nothing to transcribe |
| 10 | `photo_2022-06-18_11-.jpg` tild6631… | Telegram message signed **Наталья** | Included, `source: "image"` |
| 11 | tild3766… | Telegram message signed **Алексей Дорохин** | Included, `source: "image"` |
| 12 | tild6531… | Telegram message signed **Марина Кузнецова** | Included, `source: "image"` |
| 13 | tild6332… | Message about cholesterol, no name in the image | Skipped as an image. The same text is on the landing as a text testimonial signed Евгения Сидоренко, included from there (`source: "text"`) |
| 14 | tild3964… | Message «Я благодарна Оксане…», no name in the image | Skipped as an image. The same text is a text testimonial signed Белоногова Наталья, included from there (`source: "text"`) |
| 15 | tild3862… | Telegram message signed **Мария** | Included, `source: "image"`, transcribed as the image shows it (the landing's text version has two more sentences that are not in the image) |

Text testimonials on the landing with their author in the HTML: Анастасия Иванова, Алексей Дорохин, Светлана Чекалова,
Ирина Антонова, Наталья, Мария, Белоногова Наталья, Марина Кузнецова, Евгения Сидоренко. Four of them are the same
messages as images 10, 11, 12 and 15 and appear once, from the image. Result: 9 testimonials, every one with an author.

**Flagged for Ivan (may belong to another course):**
- Светлана Чекалова — addresses «Женя» («Это прям твоя фишка, Женя…») and talks about group sessions.
- Анастасия Иванова — talks about «практики управления вниманием» and a structure with feedback, nothing about the liver.

Both are included per the rule (author visible); dropping one is a one-line edit of
`apps/backend/scripts/fixtures/data/course-ochishchenie-pecheni.json` and a re-run of the fixture.

## Other notes

- «Среди участников»: the landing has 8 names and 8 portraits (`Rectangle_19..26`), not 9. All 8 are in, with the
  obvious case fixes («МаРИЯ Афонина» → «Мария Афонина», «Евгений коровкин» → «Евгений Коровкин», «Evernow. be» → «Evernow.be»).
- The course entity has no start date or duration fields (`course`: id, product_id, title, slug, description), so the
  landing's «Старт: 14 сентября» is dropped and «Программа длится 7 дней» opens «Что входит».
- FAQ typos fixed as asked («нервыных» → «нервных», «по чиститься» → «почиститься») plus «Потологоанатомы» →
  «Патологоанатомы», «состояние» → «состояния», «чистки» → «чистке». Ivan's 1.2 text is stored exactly as he wrote it
  (bullets «•»/«*» normalised to «- »).
- The mobile sticky bar only appears after a real scroll: a single `window.scrollTo` of several thousand pixels does not
  show the bar on this page in headless Chromium, wheel steps do (measured on 390: jump → bar absent, wheel → bar
  present). The bar's logic (`product-actions/index.tsx`) is unchanged by this task; the shots scroll with the wheel.

## Checks (real output, on commit 2a41ffa4)

| Command | Result |
|---|---|
| storefront `npx tsc --noEmit` | exit 0 |
| storefront `npx vitest run src/modules/products src/lib` | 37 files, 291 tests passed (incl. `src/lib/util/course-page.test.ts`, 8) |
| storefront `npx next lint --file <7 touched files>` | ✔ No ESLint warnings or errors |
| storefront `NEXT_DIST_DIR=.next-build npx next build` | exit 0, `/[locale]/products/[handle]` 17.5 kB / 189 kB; `tsconfig.json` and `next-env.d.ts` reverted after |
| backend `npx tsc --noEmit` | exit 0 |
| `pnpm check:backend-fixtures` | exit 0 |
| backend `TEST_TYPE=unit … npx jest --runInBand --forceExit --testMatch '**/scripts/fixtures/**/*.unit.spec.[jt]s' --testMatch '**/src/scripts/__tests__/fixtures-outside-src.unit.spec.ts'` | 2 suites, 9 tests passed |
| backend `node --test scripts/media/` | 9 tests passed |
| fixture `DRY_RUN=1`, then two real runs | run 1: `wrote description, thumbnail, images, metadata.cover, metadata.course_page`; run 2: `already holds this content, nothing to write` |

The brief's jest line (`TEST_TYPE=unit … --testPathPattern 'scripts/(media|fixtures)'`) matches 0 files: with
`TEST_TYPE=unit` the config's `testMatch` is `**/src/**/__tests__/**/*.unit.spec.[jt]s`, so the `--testMatch` form above
is the one that runs them. The cutter's tests are `node:test` (`.mjs`, the script is plain ESM that jest's swc
transform does not load).

## Servers

Both left running from this branch (commit 2a41ffa4 plus this report): backend `PORT=9241 nice -n 10 npx medusa develop`
(`/health` 200), storefront `nice -n 10 npx next dev -p 8243`.
