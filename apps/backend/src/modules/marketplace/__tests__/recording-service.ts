/**
 * A module service that keeps its rows in memory and writes down what every
 * call was handed (t-2026-10-06-21).
 *
 * The bound on a marketplace run is a property of the CALLS, not of the rows
 * that end up in a table: a run that hands 25 597 rows to one `update` leaves
 * the same table as a run that hands them over 500 at a time, and only the
 * first one takes the backend down. So the fake answers the way the generated
 * service does and records, per call, how many rows or keys went in and how
 * many rows came back.
 *
 * It honours what a paged read relies on: equality, a list of values, the
 * `$gt` cursor on a column, `take`, `order` and `select`. A fake that ignored
 * `select` would hide a read of a column the loader no longer asks for.
 */

export type Row = Record<string, unknown> & { id: string };

export type RecordedCall = {
  method: string;
  /** Rows handed to a `create…` / `update…`, ids handed to a `softDelete…`. */
  rows: number;
  /** The longest list of values in the filter of a `list…`. */
  keys: number;
  /** Rows a `list…` answered with. */
  returned: number;
  take: number | null;
  select: string[] | null;
};

type ListConfig = {
  select?: string[];
  take?: number;
  order?: Record<string, "ASC" | "DESC">;
};

/** The filter as one predicate, built once per call: a list of values becomes a set. */
const matcher = (filter: Record<string, unknown>): ((row: Row) => boolean) => {
  const tests = Object.entries(filter).map(([key, value]) => {
    if (Array.isArray(value)) {
      const wanted = new Set(value.map(String));
      return (row: Row) => wanted.has(String(row[key]));
    }
    if (value !== null && typeof value === "object" && "$gt" in value) {
      const after = String((value as { $gt: unknown }).$gt);
      return (row: Row) => String(row[key]) > after;
    }
    return (row: Row) => String(row[key]) === String(value);
  });
  return (row) => tests.every((test) => test(row));
};

const compare = (left: unknown, right: unknown): number => {
  const a = left instanceof Date ? left.getTime() : String(left);
  const b = right instanceof Date ? right.getTime() : String(right);
  return a < b ? -1 : a > b ? 1 : 0;
};

/**
 * `tables` is keyed by the plural the generated methods carry, so
 * `{ WbOrders: [] }` answers `listWbOrders`, `createWbOrders` and
 * `updateWbOrders`. Seed rows go in as they are and keep their ids.
 */
export const recordingService = (tables: Record<string, Row[]>) => {
  const calls: RecordedCall[] = [];
  const api: Record<string, (...input: never[]) => Promise<unknown>> = {};
  let seq = 0;

  const record = (call: Partial<RecordedCall> & { method: string }) => {
    calls.push({ rows: 0, keys: 0, returned: 0, take: null, select: null, ...call });
  };

  for (const table of Object.keys(tables)) {
    api[`list${table}`] = (async (filter: Record<string, unknown> = {}, config: ListConfig = {}) => {
      const [[orderBy, direction]] = Object.entries(config.order ?? { id: "ASC" });
      const found = tables[table]
        .filter(matcher(filter))
        .sort((a, b) => compare(a[orderBy], b[orderBy]) * (direction === "DESC" ? -1 : 1));
      const page = config.take ? found.slice(0, config.take) : found;

      record({
        method: `list${table}`,
        keys: Math.max(
          0,
          ...Object.values(filter).map((value) => (Array.isArray(value) ? value.length : 0)),
        ),
        returned: page.length,
        take: config.take ?? null,
        select: config.select ?? null,
      });

      const select = config.select;
      return page.map((row) =>
        select
          ? (Object.fromEntries(
              [...new Set(["id", ...select])].map((column) => [column, row[column]]),
            ) as Row)
          : { ...row },
      );
    }) as never;

    api[`create${table}`] = (async (input: unknown) => {
      const drafts = (Array.isArray(input) ? input : [input]) as Record<string, unknown>[];
      record({ method: `create${table}`, rows: drafts.length });
      const created = drafts.map((draft) => {
        seq += 1;
        const row = { id: `${table}_new_${String(seq).padStart(7, "0")}`, ...draft } as Row;
        tables[table].push(row);
        return row;
      });
      return Array.isArray(input) ? created : created[0];
    }) as never;

    api[`update${table}`] = (async (input: unknown) => {
      const patches = (Array.isArray(input) ? input : [input]) as Row[];
      record({ method: `update${table}`, rows: patches.length });
      const byId = new Map(tables[table].map((row) => [row.id, row]));
      for (const patch of patches) {
        const row = byId.get(patch.id);
        if (!row) {
          throw new Error(`${table} with id "${patch.id}" not found`);
        }
        Object.assign(row, patch);
      }
      return input;
    }) as never;

    api[`softDelete${table}`] = (async (ids: string[]) => {
      record({ method: `softDelete${table}`, rows: ids.length });
      const gone = new Set(ids);
      tables[table] = tables[table].filter((row) => !gone.has(row.id));
    }) as never;
  }

  return {
    /** Read through this object and not through a copy: `softDelete…` replaces the array. */
    tables,
    calls,
    service: api,
  };
};

/**
 * The calls that carried more than `bound`: rows or ids into a write, values
 * into a filter, or rows out of a read. An empty answer is the whole claim of
 * t-2026-10-06-21.
 */
export const callsOverBound = (calls: RecordedCall[], bound: number): RecordedCall[] =>
  calls.filter((call) => call.rows > bound || call.keys > bound || call.returned > bound);

/**
 * A row with EVERY column of a model filled, so a normalizer that reads a
 * column the loader no longer selects produces a different draft instead of a
 * `null` that happens to match. `model` is a `model.define(…)` result.
 */
export const fullRow = (
  model: { schema: Record<string, unknown> },
  id: string,
  overrides: Record<string, unknown>,
): Row => ({
  ...Object.fromEntries(Object.keys(model.schema).map((column) => [column, `${column} of ${id}`])),
  ...overrides,
  id,
});
