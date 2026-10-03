import { claimUpdate } from "../updates";

/**
 * A tiny fake of the one Knex surface `claimUpdate` touches: an insert chain
 * ending in `.returning("id")`, and a separate delete chain for the prune
 * sweep. The fake's `rows` set is the unique-index behaviour for real:
 * `onConflict().ignore()` returns no row for a pair already claimed.
 */
const fakePg = (rows: Array<{ tenant_id: string; update_id: number }>) =>
  Object.assign(
    jest.fn((table: string) => {
      expect(table).toBe("telegram_bot_update");
      let insertedRow: { tenant_id: string; update_id: number } | undefined;

      const insertChain = {
        insert: (row: { tenant_id: string; update_id: number }) => {
          const exists = rows.some(
            (r) => r.tenant_id === row.tenant_id && r.update_id === row.update_id,
          );
          if (!exists) {
            insertedRow = row;
          }
          return insertChain;
        },
        onConflict: () => insertChain,
        ignore: () => insertChain,
        returning: async () => {
          if (!insertedRow) {
            return [];
          }
          rows.push(insertedRow);
          return [{ id: `tgu_${rows.length}` }];
        },
        where: () => insertChain,
        del: async () => 0,
      };

      return insertChain;
    }),
    {},
  );

describe("claimUpdate", () => {
  it("returns true the first time an update_id is claimed for a tenant", async () => {
    const rows: Array<{ tenant_id: string; update_id: number }> = [];
    const pg = fakePg(rows) as never;

    const first = await claimUpdate(pg, "ten_1", 42);

    expect(first).toBe(true);
    expect(rows).toEqual([{ tenant_id: "ten_1", update_id: 42 }]);
  });

  it("returns false for a repeat of the same (tenant_id, update_id)", async () => {
    const rows: Array<{ tenant_id: string; update_id: number }> = [];
    const pg = fakePg(rows) as never;

    await claimUpdate(pg, "ten_1", 42);
    const second = await claimUpdate(pg, "ten_1", 42);

    expect(second).toBe(false);
    expect(rows).toHaveLength(1);
  });

  it("the same update_id claims separately for a different tenant", async () => {
    const rows: Array<{ tenant_id: string; update_id: number }> = [];
    const pg = fakePg(rows) as never;

    const forTenantA = await claimUpdate(pg, "ten_a", 1);
    const forTenantB = await claimUpdate(pg, "ten_b", 1);

    expect(forTenantA).toBe(true);
    expect(forTenantB).toBe(true);
  });
});
