/**
 * The bound on one module-service call of a marketplace run (t-2026-10-06-21).
 *
 * MEASURED, not guessed. On 2026-10-06 the backend of the Russian host died
 * five times in four and a half hours with `JavaScript heap out of memory`
 * while a Wildberries sync was running. One statistics answer carried 25 597
 * orders, the import handed all of them to a single `updateWbOrders`, and the
 * generated service loads every targeted row whole, by one `id = ?` comparison
 * per row, before it writes (`@medusajs/utils` 2.19,
 * `modules-sdk/medusa-internal-service.js`, `update`). Postgres spent more
 * than six minutes on each of those statements. Next to it every projection
 * read whole mirror tables and the whole transport journal, with every column.
 *
 * So no call of a sync or a projection run hands a service more rows or ids
 * than `MP_BATCH_SIZE`, and no read brings back more rows than that at once.
 * The number is the one `project.ts` already measured for its own writes.
 *
 * This file imports nothing of this repository, because the adapters and the
 * core both need it and the adapters are imported by the core's registry.
 */
import { MedusaError } from "@medusajs/framework/utils";

export const MP_BATCH_SIZE = 500;

export const chunk = <T>(items: readonly T[], size: number = MP_BATCH_SIZE): T[][] => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
};

/** What a paged read asks of a generated `list…` method. */
export type PageConfig = {
  select?: string[];
  take: number;
  order: { id: "ASC" };
};

/** A generated `list…` method, as much of it as a paged read needs. */
export type PagedList<Row> = (
  filter: Record<string, unknown>,
  config: PageConfig,
) => Promise<Row[]>;

/**
 * Rows in id order, `MP_BATCH_SIZE` at a time.
 *
 * The cursor is the id of the last row of the previous page, not an offset. A
 * row written while the read is under way lands after the cursor instead of
 * shifting every later page by one, and Postgres answers each page from the
 * primary key instead of counting the skipped rows again.
 */
export async function* cursorPages<Row>(
  fetchPage: (after: string | null, take: number) => Promise<Row[]>,
): AsyncGenerator<Row[]> {
  let cursor: string | null = null;

  for (;;) {
    const page: Row[] = await fetchPage(cursor, MP_BATCH_SIZE);

    if (page.length) {
      yield page;
    }
    if (page.length < MP_BATCH_SIZE) {
      return;
    }

    const last = String((page[page.length - 1] as { id?: unknown }).id);
    if (last === cursor) {
      /**
       * A full page that ends where the previous one ended is a list that
       * ignored the cursor. Reading on would never end, so it stops loudly.
       */
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `A paged read did not move past id ${last}; the list ignores the id cursor.`,
      );
    }
    cursor = last;
  }
}

/**
 * The rows a filter matches, through `cursorPages`.
 *
 * `select` names the columns the caller reads. A mirror row carries the
 * marketplace's whole answer in `raw`, and a read that leaves it out is most
 * of what keeps a page small.
 *
 * The cursor is written into the filter as `id`, so a filter that already
 * names ids is refused. The cursor would replace that list on the second page
 * and the read would walk the rest of the table instead of ending.
 */
export const pagesOf = <Row>(
  list: PagedList<Row>,
  filter: Record<string, unknown>,
  select?: string[],
): AsyncGenerator<Row[]> => {
  if ("id" in filter) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "A paged read pages by id and cannot take a filter on id. Read a list of ids in one call.",
    );
  }
  return cursorPages((after, take) =>
    list(after === null ? filter : { ...filter, id: { $gt: after } }, {
      ...(select ? { select } : {}),
      take,
      order: { id: "ASC" },
    }),
  );
};

/** Every row a filter matches, read through `pagesOf` and kept as the columns `select` names. */
export const readInPages = async <Row>(
  list: PagedList<Row>,
  filter: Record<string, unknown>,
  select?: string[],
): Promise<Row[]> => {
  const rows: Row[] = [];
  for await (const page of pagesOf(list, filter, select)) {
    rows.push(...page);
  }
  return rows;
};
