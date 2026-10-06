import { chunk, cursorPages, MP_BATCH_SIZE, pagesOf, readInPages, type PageConfig } from "../batch";

/**
 * The paged read every bounded run is built on (t-2026-10-06-21).
 *
 * The bound is only as good as this loop: a page that comes back full has to
 * be followed by a read that starts AFTER it, and a list that ignores the
 * cursor has to stop the run instead of feeding it the same page until the
 * process runs out of memory, which is the failure the bound exists to end.
 */
type Row = { id: string; value: number };

const table = (count: number): Row[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `row_${String(index).padStart(6, "0")}`,
    value: index,
  }));

const listOver = (rows: Row[]) => {
  const asked: { filter: Record<string, unknown>; config: PageConfig }[] = [];
  const list = async (filter: Record<string, unknown>, config: PageConfig) => {
    asked.push({ filter, config });
    const after = (filter.id as { $gt?: string } | undefined)?.$gt;
    return rows.filter((row) => !after || row.id > after).slice(0, config.take);
  };
  return { asked, list };
};

describe("pagesOf", () => {
  it("reads every row once, a page of the bound at a time, by an id cursor", async () => {
    const rows = table(MP_BATCH_SIZE * 2 + 7);
    const { asked, list } = listOver(rows);

    const pages: Row[][] = [];
    for await (const page of pagesOf(list, { tenant_id: "ten_1" }, ["id", "value"])) {
      pages.push(page);
    }

    expect(pages.map((page) => page.length)).toEqual([MP_BATCH_SIZE, MP_BATCH_SIZE, 7]);
    expect(pages.flat()).toEqual(rows);
    expect(asked.map((ask) => ask.filter)).toEqual([
      { tenant_id: "ten_1" },
      { tenant_id: "ten_1", id: { $gt: rows[MP_BATCH_SIZE - 1].id } },
      { tenant_id: "ten_1", id: { $gt: rows[MP_BATCH_SIZE * 2 - 1].id } },
    ]);
    for (const ask of asked) {
      expect(ask.config).toEqual({
        select: ["id", "value"],
        take: MP_BATCH_SIZE,
        order: { id: "ASC" },
      });
    }
  });

  it("asks once more after a full last page and ends on the empty one", async () => {
    const { asked, list } = listOver(table(MP_BATCH_SIZE));
    expect(await readInPages(list, {})).toHaveLength(MP_BATCH_SIZE);
    expect(asked).toHaveLength(2);
  });

  it("stops loudly when the list ignores the cursor", async () => {
    const rows = table(MP_BATCH_SIZE);
    const stuck = async () => rows;
    await expect(readInPages(stuck, {})).rejects.toThrow(/did not move past id row_000499/);
  });
});

describe("cursorPages", () => {
  it("never reads the id of a short page, so a row without one ends the read", async () => {
    const pages: unknown[][] = [];
    for await (const page of cursorPages(async () => [{ endpoint_id: "stocks.list" }])) {
      pages.push(page);
    }
    expect(pages).toEqual([[{ endpoint_id: "stocks.list" }]]);
  });
});

describe("chunk", () => {
  it("cuts a list into batches of the bound and loses nothing", () => {
    const batches = chunk(table(MP_BATCH_SIZE * 3 + 1));
    expect(batches.map((batch) => batch.length)).toEqual([
      MP_BATCH_SIZE,
      MP_BATCH_SIZE,
      MP_BATCH_SIZE,
      1,
    ]);
    expect(chunk([])).toEqual([]);
  });
});
