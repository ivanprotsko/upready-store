import type { MedusaContainer } from "@medusajs/framework";
import { TENANT_MODULE } from "../../modules/tenant";
import {
  applyCharacteristics,
  emptyCounters,
  type LiveProduct,
  type SchemaCache,
} from "../apply";
import type { DatasetProduct } from "../dataset";

/**
 * The dry run is the safety check before a live run, so its «to write» count
 * has to be what the live run would write. A `select` characteristic used to be
 * counted as written without a look at the stored value, so a second dry run
 * over a shop that already held every value never came down to zero.
 */
describe("applyCharacteristics, dry run", () => {
  const COUNTRY = { id: "attr_country", key: "country", type: "select", name: "Страна" };

  const schema = (choices: { value: string; label: string }[]): SchemaCache =>
    ({
      byKey: new Map([[COUNTRY.key, COUNTRY]]),
      optionsByAttribute: new Map([
        [COUNTRY.id, choices.map((choice, position) => ({ id: `opt_${position}`, position, ...choice }))],
      ]),
    }) as unknown as SchemaCache;

  const writes: string[] = [];

  const containerHolding = (stored: { attribute_id: string; value_text: string | null }[]) =>
    ({
      resolve: (key: string) => {
        if (key !== TENANT_MODULE) {
          throw new Error(`the dry run resolved ${key}, which this spec does not fake`);
        }
        return new Proxy(
          {
            listTenantProductAttributeValues: async () =>
              stored.map((row, index) => ({
                id: `val_${index}`,
                value_number: null,
                value_boolean: null,
                ...row,
              })),
          },
          {
            get: (target, name: string) =>
              name in target
                ? target[name as keyof typeof target]
                : async () => {
                    writes.push(name);
                    return [];
                  },
          },
        );
      },
    }) as unknown as MedusaContainer;

  const product = { id: "prod_1", handle: "tea" } as unknown as LiveProduct;
  const entry = {
    characteristics: [{ name: "Страна производства", value: "Таиланд" }],
  } as unknown as DatasetProduct;
  const options = {
    dryRun: true,
    logger: { warn: jest.fn(), info: jest.fn() },
  } as never;

  beforeEach(() => {
    writes.length = 0;
  });

  it("counts a select the shop already holds as unchanged", async () => {
    const counters = emptyCounters();

    await applyCharacteristics(
      containerHolding([{ attribute_id: COUNTRY.id, value_text: "thailand" }]),
      "tenant_1",
      schema([{ value: "thailand", label: "Таиланд" }]),
      product,
      entry,
      options,
      counters,
    );

    expect(counters.characteristics_written).toBe(0);
    expect(counters.characteristics_unchanged).toBe(1);
    expect(writes).toEqual([]);
  });

  it("counts a select the shop holds with another value as one write", async () => {
    const counters = emptyCounters();

    await applyCharacteristics(
      containerHolding([{ attribute_id: COUNTRY.id, value_text: "india" }]),
      "tenant_1",
      schema([
        { value: "thailand", label: "Таиланд" },
        { value: "india", label: "Индия" },
      ]),
      product,
      entry,
      options,
      counters,
    );

    expect(counters.characteristics_written).toBe(1);
    expect(counters.characteristics_unchanged).toBe(0);
    expect(writes).toEqual([]);
  });

  it("counts a choice the shop has not declared yet as one write and declares nothing", async () => {
    const counters = emptyCounters();

    await applyCharacteristics(
      containerHolding([]),
      "tenant_1",
      schema([]),
      product,
      entry,
      options,
      counters,
    );

    expect(counters.characteristics_written).toBe(1);
    expect(counters.characteristics_dropped).toBe(0);
    expect(writes).toEqual([]);
  });
});
