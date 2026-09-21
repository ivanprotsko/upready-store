/**
 * o21-owner-panel-ux (P6): wrap a plain `<Table>` in a `div` with this class and
 * below `md` every row becomes a card. The header row is hidden, the cells stack
 * and long addresses wrap, so the page never scrolls sideways on a phone. The
 * shared `_DataTable` has the same behaviour built in, with column names.
 */
export const PHONE_CARDS =
  "max-md:[&_table]:block max-md:[&_thead]:hidden max-md:[&_tbody]:block max-md:[&_tr]:flex max-md:[&_tr]:h-auto max-md:[&_tr]:flex-col max-md:[&_tr]:gap-y-2 max-md:[&_tr]:px-6 max-md:[&_tr]:py-4 max-md:[&_td]:block max-md:[&_td]:h-auto max-md:[&_td]:!p-0 max-md:[&_td]:[overflow-wrap:anywhere] max-md:[&_td:empty]:hidden"
