import WbModuleService from "../service";
import { upsertRows } from "../sync";

/**
 * One ANSWER from WB can carry the same unique key twice
 * (w03-wb-sales-questions-mirror).
 *
 * WB's sales feed repeats an `srid` when the page holds both a sale and the
 * return that cancels it. Matching the batch against the rows already in the
 * database does not catch that: neither copy exists yet, both land in the
 * insert, and the whole batch dies on the unique index having written NOTHING
 * — which is what the first live sales run did at 2026-09-16 05:12 WITA
 * ("Wb sale with tenant_id: …, srid: er.rfa69…, already exists", 0 rows).
 *
 * The live proof of the fix costs a request the base token allows once every
 * two hours, so the invariant lives here instead: a batch is deduplicated
 * against ITSELF, the later row wins, and one create call carries one row per
 * key. This holds for every mirror, not just sales (rule 20 — the class, not
 * the site).
 */
describe("upsertRows deduplicates a batch against itself", () => {
  type Call = Record<string, unknown>[];

  const fakeService = (existing: Array<Record<string, unknown> & { id: string }>) => {
    const created: Call[] = [];
    const updated: Call[] = [];
    const service = {
      listWbSales: async () => existing,
      createWbSales: async (rows: Call) => {
        created.push(rows);
      },
      updateWbSales: async (rows: Call) => {
        updated.push(rows);
      },
    };
    return { service: service as unknown as WbModuleService, created, updated };
  };

  const saleRow = (srid: string, saleId: string, forPay: number) => ({
    keys: { srid, sale_id: saleId },
    values: { for_pay: forPay },
  });

  it("writes one row per key when one answer repeats a key", async () => {
    const { service, created, updated } = fakeService([]);

    const written = await upsertRows(service, "WbSale", "ten_1", [
      saleRow("er.rfa69", "S1", 100),
      saleRow("er.rfa69", "S1", 250),
    ]);

    expect(created).toHaveLength(1);
    expect(created[0]).toHaveLength(1);
    expect(updated).toHaveLength(0);
    expect(written).toBe(1);
  });

  it("keeps the later copy of a repeated key", async () => {
    const { service, created } = fakeService([]);

    await upsertRows(service, "WbSale", "ten_1", [
      saleRow("er.rfa69", "S1", 100),
      saleRow("er.rfa69", "S1", 250),
    ]);

    expect(created[0][0]).toMatchObject({
      tenant_id: "ten_1",
      srid: "er.rfa69",
      sale_id: "S1",
      for_pay: 250,
    });
  });

  it("keeps rows apart when only part of the composite key repeats", async () => {
    const { service, created } = fakeService([]);

    const written = await upsertRows(service, "WbSale", "ten_1", [
      saleRow("er.rfa69", "S1", 100),
      saleRow("er.rfa69", "R1", -100),
    ]);

    expect(created[0]).toHaveLength(2);
    expect(written).toBe(2);
  });

  it("updates a key the database already holds instead of creating it", async () => {
    const { service, created, updated } = fakeService([
      { id: "wbs_1", srid: "er.rfa69", sale_id: "S1" },
    ]);

    const written = await upsertRows(service, "WbSale", "ten_1", [
      saleRow("er.rfa69", "S1", 250),
      saleRow("er.rfa69", "R1", -100),
    ]);

    expect(updated[0]).toEqual([{ id: "wbs_1", for_pay: 250 }]);
    expect(created[0]).toHaveLength(1);
    expect(created[0][0]).toMatchObject({ sale_id: "R1" });
    expect(written).toBe(2);
  });
});
