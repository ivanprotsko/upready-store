# t-2026-09-23-01 — «Характеристики и описание» as a side drawer like Wildberries (draft brief, not yet approved by Ivan)

Order: o-20260921-01, follow-up to t-2026-09-22-01 (product page after Ivan's Figma mockup). Written 2026-09-23 ~04:45 WITA by the outgoing
lead (session a71e7cdc) for the next lead; status: Ivan's words received, ONE opener button decided by Ivan (04:42 WITA), branching fork raised to Ivan, no code written.
Vocabulary with Ivan: he asked «что такое "панель"?» — say «шторка» or his own «сайдбар», never «панель» (that is the owner panel for him).

## Ivan's words (2026-09-23 ~04:30 WITA, verbatim)

«1. давай сделаем блок с описанием и характеристиками аналогично как и у wildberries [Image #6] [Image #7]
1.1. он появляется справа в сайдбаре над оверлеем, внизу кнопки которые остаются на месте при прокрутке, а тело может скроллиться
1.2. хедер и кнопка закрыть остаются при прокрутке»

Follow-up (2026-09-23 04:42 WITA, verbatim): «мы оставим одну кнопку, сейчас пришлю скриншот [Image #9]» — the screenshot is
`/Users/ivanprotsko/upready/projects/upready-store/artifacts/docs/o-20260921-01/mockups/wb-center-card-one-button-2026-09-23.png` (Wildberries centre card, 1098×1168), and «запиши это в сейв для передачи другой сессии».

## Design stage (rule 27d)

- Canon: `/Users/ivanprotsko/upready/packages/geist-kit/AGENTS.md` (rule 27) for spacing, type and control sizes; otherwise the storefront's own
  system (`@medusajs/ui` 4.2.1 + Tailwind, theme tokens) and the product-page card language of PR #114.
- Layout artefacts (the reference Ivan sent, copied into the project):
  `/Users/ivanprotsko/upready/projects/upready-store/artifacts/docs/o-20260921-01/mockups/wb-details-drawer-panel-2026-09-23.png` (panel, 1040×1400),
  `/Users/ivanprotsko/upready/projects/upready-store/artifacts/docs/o-20260921-01/mockups/wb-details-drawer-desktop-2026-09-23.png` (page + panel, 2000×1395).
- What the reference shows: a right-side panel (~640 px of a 2000 px page) over a dark overlay; a fixed header with the title «Характеристики и описание»
  and an X at the top right; a scrolling body — a «Документы проверены» badge, group headings («Основная информация», «Дополнительная информация»,
  «Габариты») with rows «name ······ value» joined by a dotted leader (names grey, values dark, values wrap onto several lines, names never truncate),
  then a heading «Описание» and the full text; a fixed footer with the price at the left (red, a delivery date under it) and two pill buttons at the right:
  «Купить» (tinted) and «В корзину» (filled).

## What to build (defaults the lead proposes; Ivan may overrule)

1. A client component `ProductDetailsDrawer` on `@medusajs/ui` `Drawer` (Radix Dialog): `Drawer.Content` is already `fixed inset-y-2 sm:right-2
   sm:max-w-[560px] flex flex-col` (full width minus 16 px on a phone); `Drawer.Header` fixed with the X; `Drawer.Body` gets `overflow-y-auto`;
   `Drawer.Footer` fixed. Title from a new message key (ru «Характеристики и описание»). Esc and the overlay click close it; focus is trapped;
   the page behind does not scroll.
2. Body: section «Характеристики» — every row of `prepareAttributeRows` in the panel's order, name and value joined by the same dotted leader the
   card summary uses (`product-attributes/summary.tsx`), values wrapping, names in `text-ui-fg-subtle`; then section «Описание» — the stripped
   description (`ProductDescription`). The attribute model has no group field, so ONE «Характеристики» section by default; group headings like
   Wildberries need an attribute group in the panel (a separate task, Ivan's call). The «Документы проверены» badge has no source and is not drawn.
3. Footer: the selected variant's price (`ProductPrice`, no delivery date — no source) at the left; «Купить» (secondary pill = add to cart and go to
   `/checkout?step=address`) and «В корзину» (primary pill) at the right — the SAME handlers as the buy box, extracted from `product-actions/index.tsx`
   into a shared hook on the `ProductSelectionProvider` so the cart logic exists once; disabled states identical to the buy box.
4. Opener — ONE button (Ivan's decision, «мы оставим одну кнопку»): the centre card ends with a single bold text button «Характеристики и описание»
   under the description excerpt, exactly as the Wildberries screenshot draws it; it opens the drawer at the top. The two links of unit A
   («Все характеристики» in `product-attributes/summary.tsx`, «Всё описание» in `product-description/excerpt.tsx`) are removed — no other opener.
   What else the screenshot shows for the card (compare with the PR #114 card on stand 8122 before touching anything): title, rating chips, «100 мл»
   photo swatches, six attribute rows in TWO columns with dotted leaders (a long name is cut with an ellipsis there: «Страна производст…»), the
   description cut to three lines with an ellipsis, then the button. The under-cards block `#product-details` (`templates/index.tsx`) is retired —
   Ivan's «блок с описанием и характеристиками» moves into the drawer. `tests/pdp/layout.spec.ts` is re-read and updated for the new positions.
5. Phone (390): the drawer takes the full width, header and footer stay fixed, the body scrolls; the phone buy bar (`MobileActions`) is hidden
   while the drawer is open so two buy bars are never on screen.
6. Messages: new keys in all 36 catalogs via `node apps/storefront/scripts/messages-add-translated.mjs <table.json>` + the AGENTS.md parity snippet.
7. Nothing else of the page changes; only `apps/storefront/**` is touched.

## Where it lives (the fork raised to Ivan, unanswered as of 04:45 WITA)

The drawer replaces links and reuses the selection context and buy handlers that exist only on the PR #114 branch `feat/o22-pdp-figma-layout`.
Rule 21l (move 8) blocks a branch forked off a task branch unless Ivan signs the stack. Options given to Ivan: (a, the lead's recommendation)
a second commit on `feat/o22-pdp-figma-layout` inside the same workspace and PR #114 — Ivan then sees cards and drawer together;
(b) a signed stacked branch on top of #114 (`touch "$TMPDIR/claude-prflow-fork-upready-store-<branch>"`, then `superset ws create … --base-branch feat/o22-pdp-figma-layout`).
Do not start until he answers. Stand for (a): http://cherkashino.localhost:8122 (worktree `/Users/ivanprotsko/upready/worktrees/upready-store/feat/o22-pdp-figma-layout`).

## Acceptance (human eyes, rule 27d; the lead checks on the stand, not in the report)

- At 1184 the drawer opens from the right over a dimmed page; the header with the title and the X does not move while the body scrolls; the
  price and both buttons stay at the bottom while the body scrolls; the body scrolls to the end of the description.
- Names and values are joined by a dotted leader; no name is cut with an ellipsis; long values wrap under themselves, not under the name.
- «В корзину» in the drawer puts the selected variant in the cart exactly as the buy box does (cart count grows by one); «Купить» lands on the checkout.
- Esc, the X and a click on the overlay close it; focus returns to the button that opened it.
- The centre card shows exactly one opener, «Характеристики и описание», under the description excerpt; «Все характеристики» and «Всё описание» are gone.
- At 390 the drawer is full-width, header and footer fixed, the body scrolls, no second buy bar is visible.
- Side by side with the Wildberries panel at similar width the two read as the same layout (title, leaders, footer with price + two pills).
- Machine gates on top: tsc 0, lint 0, vitest green, parity 36 catalogs, `next build` green, `e2e/product-page.e2e.mjs` PASSED, console errors 0, CLS < 0.1.

## Dispatch plan (Ivan's standing order of 2026-09-23 on batches → one Opus worker)

Model Opus (cross-file invariant: one buy handler for the buy box, the phone bar and the drawer; a11y of a modal; test update), ~1–1.5M tokens.
Prompt file `/Users/ivanprotsko/upready/prompts/2026-09-23-pdp-details-drawer.md` (English; the unit C prompt is the template);
`orchestrator.mjs task add --json` with deliverables: the drawer component file, `compare-pdp-drawer-1184-2026-09-23.png`,
`branch-pdp-drawer-390-2026-09-23.png` in the mockups folder, `<worktree>/.ai/progress.md`; verify `npx tsc --noEmit`.
Consent touch `touch "$TMPDIR/claude-orch-ok-<session id>"` as a separate call after Ivan's word. Accept on the stand per the list above.
