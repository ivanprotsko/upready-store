# Cherkashino: what the shop's content still needs

Task t-2026-09-21-01 (order o-20260921-01). The storefront code now frames, aligns and filters
whatever the shop holds; this list is what code cannot fix, because it is the shop's own content.
Every line was measured on 2026-09-21 on a read-only copy of the live catalog (32 products) and
on the local stand. Nothing on the live shop was changed.

The owner fixes these in the tenant panel. Order: what a visitor meets first comes first.

## 1. The catalog opens with its weakest products

The default sorting is «Новинки» (newest first). The three newest products are the three without
a photo, and one of them is a test entry:

| Product (handle) | What is wrong |
| --- | --- |
| `nastoyka-50-ml` — «Настойка 50 мл» | No photo, looks like a test product. Delete it or finish it. |
| `maz-balzam-zhivichnyy` | No photo. |
| `propolis` | No photo, description is 59 characters. |

Until they get photos, the first row of the catalog and of the home page is three grey
placeholders «Фото скоро будет». Either add photos or unpublish the three.

## 2. Products with a single photo

The product page now has a thumbnail rail and a zoom; with one photo neither has anything to show.

- `kniga-retseptov-dlya-multivarok-avto-i-dlya-doma-cherkashino`
- `gepachisty-cherkashino`

## 3. Descriptions

- Seven products have an EMPTY description: `gepachisty-cherkashino`,
  `shampun-koncentrat-dlya-bleska-tayskiy-90-gr-cherkashino`,
  `maz-ot-varikoza-s-kashtanom-cherkashino`, `tabletki-ot-varikoza-s-kashtanom-cherkashino`,
  `zubnaya-pasta-tayskaya-s-uglem-cherkashino`, `zubnaya-pasta-tayskaya-s-gvozdikoy-cherkashino`,
  `zubnaya-pasta-tayskaya-otbelivayuschaya-cherkashino`. The page shows the attributes table and
  nothing to read.
- Five products carry one long paragraph of comma-separated search keywords copied from the
  marketplace card. It reads as spam on a shop page. Two or three short paragraphs — what it is,
  how to use it, what is inside — read better and rank better.

## 4. Photos are in different shapes

Marketplace photos are 3:4, some are square, a few are landscape. The storefront now shows every
photo whole inside one 3:4 frame and continues the photo's own edge colour into the free space,
so nothing is cropped and rows stay even. It still looks best when the source photos are 3:4:
a square packshot gets quiet bands above and below.

## 5. Option values are not normalised

The «Фасовка» filter lists every spelling the products use: «2 банки», «30 гр», «15% 100 мл»,
«1 упаковка», «10 шт», «90 гр», «1 шт», «50 гр»… It mixes weight, volume, count and concentration
under one name, so it filters poorly. Use one option per meaning («Вес», «Объём», «Количество»)
and one spelling for units. The storefront already merges the option «Объём» with the
characteristic «Объём, мл» into one filter; it cannot merge different meanings.

## 6. Footer: contacts and legal details

The footer now shows a «Контакты» block (phone, e-mail) and a «Продавец» block (legal name, ИНН,
ОГРН/ОГРНИП, address) — but only what the shop filled in under «Реквизиты». On live the shop has
a Telegram link and working hours on its contacts page and NO requisites. A Russian online shop
is expected to show the seller's legal name, ИНН and ОГРНИП; fill them in the panel and they
appear by themselves.

## 7. Article numbers

The storefront hides the technical suffix (`1199673895-CHERKASHINO` is shown as `1199673895`).
No action needed; listed so that nobody "fixes" the SKUs by hand.
