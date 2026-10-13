/**
 * t-2026-10-13-30: the box a hand-rolled `Table` of our admin pages sits in, the
 * same guard the tenant panel's `components/table/table-scroll.tsx` carries. A
 * table wider than its card scrolls sideways inside the card; without it the
 * dashboard's own scroller moves and a 390 px screen slides off its left edge,
 * as `/app/tenants/:id` did with the administrators table.
 *
 * `src/admin/__tests__/table-scroll.unit.spec.ts` fails a page under
 * `src/admin/routes` that renders a `Table` outside it.
 */
export const TABLE_SCROLL =
  "w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]"
