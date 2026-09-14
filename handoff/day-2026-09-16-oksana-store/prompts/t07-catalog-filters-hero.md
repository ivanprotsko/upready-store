# Goal

Two small defects that both show up the moment a real catalogue lands on a real shop. One PR.

**1. One filter per option name.** The client's catalogue has 38 products and every one carries its own option
(«Количество», «Фасовка», «Объём», …), so `/ru/store` renders a row of roughly 25 chips whose labels are cut to
«Кол..», «Фас..». The same class was already recorded on the seeded shops as
`t-2026-09-12-seed-option-filter-duplicates` («Size» appearing several times). The rule: options with the same
title collapse into one filter whose values are the union of theirs.

**2. The home hero must show what the owner set.** The migration put the client's banner into the tenant home
document with a title, a subtitle, a call to action and an image — and the hero composition variant «h» draws
three collection photos and ignores `image_url` entirely, so the owner's picture never appears. Both facts are
in the migration report's «Предложения задач»
(`/Users/ivanprotsko/upready/worktrees/upready-store/feat/cherkashina-tenant/artifacts/docs/2026-09-12-cherkashina-migration/03-migration-report.md`).

## Context pointers

- Filters: `apps/storefront/src/modules/store/components/refinement-list`, `category-sidebar`,
  `mobile-refinement`, and whatever feeds them from `apps/storefront/src/lib/data/`.
- Hero: `apps/tenant-panel/src/routes/home-settings` (the owner picks the composition and fills hero
  title/subtitle/CTA/image), the tenant home document `upready.tenant-home/v1`, the public route
  `GET /store/tenant/home`, and the storefront hero variants registry.
- `{{MISSION_DIR}}/research/upready-store-capabilities.md` §3 rows «Главная, hero, блоки» and «Поиск и фильтры».
- DOM evidence from the migration stand, including what the home page actually rendered:
  `…/2026-09-12-cherkashina-migration/shots/checks.json` on that same worktree.

## Step plan

1. Reproduce both before changing anything. Seed or import enough products on the local stand that several
   carry same-named options; screenshot the chip row. Set a hero image in the panel on a variant that ignores
   it; screenshot the home page. Put both «before» shots in the PR.
2. Fix the filter at the data level, not by hiding chips with CSS: group the tenant's options by a normalised
   title (trimmed, case-folded), merge their values, keep the count per value honest, and make the label the
   full option title with an ellipsis only when the container is genuinely too narrow.
3. Selecting a value must still filter correctly across the merged options. Prove it with a request whose
   result set you can count.
4. For the hero: every composition variant that exposes an image slot must render `image_url` when it is set,
   and fall back to its collection photos only when it is empty. If a variant is deliberately photo-only, it
   must not offer an image field in the panel — the panel and the storefront must agree, and saying which way
   you resolved it is part of the PR.
5. Check the mobile breakpoint too (390 px): the chip row is where a phone layout breaks first.

## Commands

```
cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build && pnpm test
cd apps/tenant-panel && pnpm typecheck && pnpm lint
cd apps/backend && npx medusa lint && npx tsc --noEmit
```

## Acceptance (measured, quoted in the PR body)

- Before and after screenshots of `/ru/store` at 1280x900 and 390x844, with the number of chips in each. The
  «after» count equals the number of distinct option titles, and you state both numbers.
- Choosing a filter value returns the right products: quote the URL and the product count, and the same count
  obtained from the API or the database.
- Before and after screenshots of the home page with an owner-set hero image, for each composition variant that
  offers an image field. Name the variants you checked.
- Storefront build and unit suite clean.

## What NOT to do

- Do not hide the duplicate chips with CSS or with a hard cap on the number of filters.
- Do not touch the product options themselves in the database: the fix is in how they are presented.
- Do not redesign the store page or the hero. Two defects, minimal diff.
- Do not deploy.
