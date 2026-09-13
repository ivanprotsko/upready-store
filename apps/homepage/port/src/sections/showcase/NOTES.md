# showcase — "Примеры"

What it is: five cards, one per live demo storefront, each a link that opens in
a new tab.

Copy source: concept §3 "Примеры", verbatim. The five addresses answered 302 to
`/en` when measured on 2026-09-13 (concept §6). Screenshots come from
`public/showcase/<slug>.jpg`, already in the repository.

What a reviewer must know:

- The card image is set through `background-image` in an inline style. That is
  the one data-driven style value on the page; everything else lives in this
  module.
- `background: ... center top / cover` crops from the top, so a storefront's
  header stays visible in a 4:5 card.
- The section describes the demo stores as differing in theme, fonts and
  photography on one engine. Do not turn this into a claim about clients: these
  are our own demos, and the old Medusa social proof was removed for exactly
  that reason (concept §0).
- Grid goes five, three, two columns at 1440, 1024 and 768.
- Slugs in `data.ts` double as image filenames. Renaming one means renaming the
  file in `public/showcase` too.
