# Contact sheet — what I saw looking at all four side by side

Shot 2026-09-08, 05:53:04–05:55:33 WITA, 1440×1200 viewport, 18 of 24 cells.
Grid: `artifacts/docs/contact-sheet/index.html`. These are judgements from looking at the
tiles, with a number attached only where I actually measured one.

---

## 1. Four different shops, or one shop in four colour schemes?

**One shop in four colour schemes, with the hero as the only place any of them tries to
differ — and two of the three live themes do not even differ there.** Below the fold every
theme is the same page: the same black announcement strip with the same dismiss ×, the same
thin header with a centred wordmark and the same four icons at the right, the same
breadcrumb, the same left filter rail with checkbox facets over a divider over the category
links, the same "Latest arrivals" select floated right, the same three-column grid of
edge-to-edge images with no card border, and the same footer line of title · price · option
chips. Put `supplements-dark-category` beside `home-goods-dark-category` and the only things
that differ are the wordmark, the hue, and what is in the photograph. The PDPs are the same
story — thumbnail rail left, large image centre, title/price/options right, in all three.

**The two most alike are `womens-fashion` and `home-goods`, and they are alike specifically
in the one place the themes had a chance to separate.** Both open with a full-bleed warm
photograph carrying a left-side dark scrim, the headline in white at the same x and y in the
same size, a sub-line directly under it, and a *pill*-shaped light CTA at the same offset —
`See the autumn edit` and `Shop the kitchen` are the same button in the same seat. Both grounds
are warm cream (`rgb(247,242,233)` and `rgb(253,251,247)`), both sets of packshots are lit
with the same soft directional window light on the same beige seamless sweep, and both carry
the *same defect in the same place* (see §3). Swap the wordmark and the merchandise and I
could not tell you which shop I was in. `supplements` is the only one of the three that
reads as its own brand, and it earns that with **layout** rather than colour: a split hero —
copy on a white panel at the left, packshot on a light grey panel at the right — plus a
square-cornered dark CTA instead of the pill, and a cool mint palette against the other two's
warm sand. `electronics` could not be judged; its stand was down.

---

## 2. Dark mode and the white-backdrop problem

**`supplements` has the problem, and has it badly. `home-goods` and `womens-fashion` do not.
`electronics` could not be judged — the stand was down.**

On `supplements` the product photography sits on a near-white studio backdrop, and the card
has no dark surface and no border of its own — the image *is* the card, edge to edge. So on
the near-black green ground (`rgb(10,19,16)`) the category page is six hard-edged white
rectangles, and it is exactly the light bomb you described. Measured on the shot:
**45.7% of `supplements-dark-category` is above luminance 200 and 13.6% is above 240**, which
is near-pure white; the home and PDP shots are 49.6% and 50.3% above 200. There is a second
problem stacked on top of it — the bottles are white-labelled, so the product's own body
disappears into its own backdrop, and what you see is a white rectangle with a mint band in it.

`home-goods` is the clean one. Same card treatment, same edge-to-edge image, but the sweep is
a warm mid-tone taupe that **tops out at 214–215 luminance and puts 0.00–0.09% of the page
above 240** — nothing on the page reaches white at all. The tiles read as warm lit panels on
a dark ground, which is what dark mode is supposed to look like. `womens-fashion` is close
behind and also safe: **p99 of 223–233, 0.00–0.23% above 240.** Its home and PDP are bright
overall (30% and 45% above 200) because the garments themselves are cream and the frames are
large, but bright-and-warm is not the same failure as blinding-and-white — there is no hard
white edge anywhere, and the whole frame steps down together rather than one rectangle
punching out of the dark.

The short version: it is not the *brightness* of the photography that breaks dark mode, it is
whether the sweep is **white** or **warm**. Two of the three bought a warm sweep and are fine;
`supplements` bought a white one and needs either a re-shoot on a warm or grey sweep, or a
dark-mode card surface behind the image so the rectangle stops being the brightest thing on
the screen.

---

## 3. Two things I did not go looking for

**The hero sub-headline is near-black on a photograph, in both `womens-fashion` and
`home-goods`.** The `h1` above it is correctly white; the paragraph under it is
`rgb(23,20,15)` on `womens-fashion` and `rgb(36,28,22)` on `home-goods` — measured off the
live DOM, both at the same `y=395, x=24`, both `16px`. It is unreadable in both, in both
modes, because the colour is the same regardless of mode: it is over an image. Identical bug,
identical coordinates, identical component — more evidence for §1 than anything I could argue.
`supplements` does not have it, and only because its hero copy sits on a white panel rather
than on a photo, so the dark token happens to be right there.

**`supplements-dark-pdp` landed in `light` mode once.** The first pass forced
`localStorage["upready-store.mode"] = "dark"` before first paint and the document still came
back `data-mode=light` on that one cell, while home and category on the same page object came
back `dark`. I re-measured it 8 more times — 3 fresh contexts on two different PDP handles, 2
full `home → category → pdp` walks on one reused page, and the re-shoot — and it landed `dark`
every time. So: seen once, not reproduced, cause unknown. I have not invented one. The tile in
the grid is the re-shoot and is flagged `re-shot`; `manifest.json` carries the note.

---

## 4. The stand that was down

`electronics` on `localhost:8061` answered **500 on every route** — `/`, `/en`, `/en/store` —
for the whole session. Its backend on `9041` answers `/health` **200**, so the stand is up and
the storefront is the half that is broken. The error off the dev overlay, verbatim:

```
Error: Backend returned 400
    at getRegionMap (…/feat/store/electronics/apps/storefront/.next/server/edge/chunks/…)
```

I did not touch it — the brief said not to stop or restart any stand, and that worktree is not
my file zone. Its six tiles are in the grid as labelled `stand down` cells rather than absent.
Its row in the catalogue table is filled in from its handover, which was written while the
stand still worked.

---

## Поправка архитектора (06:25 WITA)

Суждения выше сформированы, когда стенд `electronics` отдавал 500 на каждом маршруте и в сетке
стояло шесть плиток «стенд лежит». Причина была не в теме: её бэкенд был запущен с `DATABASE_URL`
на общую базу `upready_store`, тогда как витрина предъявляла ключ из `upready_store_electronics`.
Перезапущен из своего каталога в 05:58.

После починки все четыре worktree перемотаны на `dev` (`37d8d10`) с пересборкой профиля каждого,
и **все 24 плитки переснята заново**: 24 из 24 сняты, ни одной сломанной картинки, режим лёг
правильно во всех 24, плиток «стенд лежит» не осталось. Проверено: страница ссылается только на
относительные пути, ни одного внешнего запроса.

Что это значит для двух суждений выше:

- «Один магазин в четырёх цветовых схемах» вынесено по ТРЁМ темам. Четвёртая теперь видна, и её
  стоит пересмотреть глазами — но вывод, скорее всего, только усилится: ниже героя все темы делят
  один и тот же шаблон страницы.
- «Белый фон съёмки в тёмном режиме» замерено по трём темам: беда только у `supplements`
  (45.7 % тёмной страницы категории ярче 200 по яркости, 13.6 % ярче 240). `electronics` тогда
  судить было нельзя; теперь его плитки в сетке и замер по нему НЕ проводился — не выдавать
  отсутствие замера за отсутствие проблемы.
