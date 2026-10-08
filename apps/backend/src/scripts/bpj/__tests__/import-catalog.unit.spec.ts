import { convertBpjCatalog } from "../catalog";
import { parseImportArgs, runBpjImport, type ImportDeps, type ImportShop } from "../import-catalog";
import { sampleCatalog } from "./sample-catalog";

const plan = () => convertBpjCatalog(sampleCatalog(), { tenantHandle: "sakura", currency: "rub", rateFromJpy: 0.55 });

const emptyShop: ImportShop = { id: "tenant_1", handle: "sakura", sales_channel_id: "sc_1", productCount: 0, categoryCount: 0 };

/** Stand-ins for the database: every call is recorded, nothing is written anywhere. */
const fakeDeps = (shop: ImportShop | null = emptyShop) => {
  const lines: string[] = [];
  const errors: string[] = [];
  const deps = {
    findShop: jest.fn(async () => shop),
    findShippingProfileId: jest.fn(async () => "sp_1"),
    seed: jest.fn(async (input: Parameters<ImportDeps["seed"]>[0]) => ({
      product_ids: input.plan.products.map((_, index) => `prod_${index}`),
      category_ids: ["cat_root", ...input.plan.categories[0].children.map((_, index) => `cat_${index}`)],
    })),
    findProductIdsByHandle: jest.fn(async (handles: string[]) => new Map(handles.map((handle) => [handle, `id_of_${handle}`]))),
    writeTranslation: jest.fn(async () => undefined),
    revalidate: jest.fn(async () => undefined),
    info: (line: string) => lines.push(line),
    error: (line: string) => errors.push(line),
  } satisfies ImportDeps;
  return { deps, lines, errors };
};

const writers = (deps: ReturnType<typeof fakeDeps>["deps"]) => [deps.seed, deps.writeTranslation, deps.revalidate, deps.findShippingProfileId];

describe("parseImportArgs", () => {
  it("reads key=value arguments, dry-run with or without dashes, and the environment twins", () => {
    expect(parseImportArgs(["tenant=sakura", "plan=/p.json", "dry-run"], {})).toEqual({ tenantHandle: "sakura", planPath: "/p.json", dryRun: true });
    expect(parseImportArgs(["tenant=sakura", "plan=/p.json", "--dry-run"], {})).toEqual({ tenantHandle: "sakura", planPath: "/p.json", dryRun: true });
    expect(parseImportArgs([], { TENANT_HANDLE: "sakura", BPJ_PLAN: "/p.json", DRY_RUN: "true" })).toEqual({
      tenantHandle: "sakura",
      planPath: "/p.json",
      dryRun: true,
    });
    expect(parseImportArgs(["tenant=sakura"], {})).toEqual({ tenantHandle: "sakura", planPath: null, dryRun: false });
  });
});

describe("runBpjImport", () => {
  it("prints the plan's numbers in dry-run and writes nothing", async () => {
    const { deps, lines, errors } = fakeDeps();

    expect(await runBpjImport(plan(), { tenantHandle: "sakura", dryRun: true }, deps)).toBe(0);

    for (const writer of writers(deps)) expect(writer).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
    expect(lines).toEqual([
      "bpj import: dry-run, nothing is written. plan for \"sakura\" in rub at 0.55 per yen",
      "bpj import: categories 5 (brands 4)",
      "bpj import: products 6: published 4, drafts 2",
      "bpj import: variants 8: priced 6, editions dropped as indistinguishable 1",
      "bpj import: images 6, products without an image 1",
      "bpj import: shared options 2, english translations 2",
      "bpj import: the shop has products 0, categories 0",
    ]);
  });

  it("refuses a shop that already has products, in dry-run as well, and writes nothing", async () => {
    for (const dryRun of [false, true]) {
      const { deps, errors } = fakeDeps({ ...emptyShop, productCount: 3 });

      expect(await runBpjImport(plan(), { tenantHandle: "sakura", dryRun }, deps)).toBe(1);

      for (const writer of writers(deps)) expect(writer).not.toHaveBeenCalled();
      expect(errors).toEqual(['bpj import: shop "sakura" already has 3 product(s); the import is for a shop without products, so nothing is written.']);
    }
  });

  it("refuses a plan built for another shop, an unknown shop and a shop with no sales channel", async () => {
    const other = fakeDeps();
    expect(await runBpjImport(plan(), { tenantHandle: "fuji", dryRun: false }, other.deps)).toBe(1);
    expect(other.errors[0]).toMatch(/built for shop "sakura", not "fuji"/);
    expect(other.deps.findShop).not.toHaveBeenCalled();

    const missing = fakeDeps(null);
    expect(await runBpjImport(plan(), { tenantHandle: "sakura", dryRun: false }, missing.deps)).toBe(1);
    expect(missing.errors).toEqual(['bpj import: no shop with handle "sakura" on this backend.']);

    const noChannel = fakeDeps({ ...emptyShop, sales_channel_id: null });
    expect(await runBpjImport(plan(), { tenantHandle: "sakura", dryRun: false }, noChannel.deps)).toBe(1);
    for (const writer of writers(noChannel.deps)) expect(writer).not.toHaveBeenCalled();

    const notAPlan = fakeDeps();
    expect(await runBpjImport({ format: "something-else" } as never, { tenantHandle: "sakura", dryRun: false }, notAPlan.deps)).toBe(1);
    expect(notAPlan.errors[0]).toMatch(/not a bpj-import-plan@1/);
  });

  it("seeds an empty shop through the seed workflow, then writes the English texts and asks the storefront to revalidate", async () => {
    const { deps, lines, errors } = fakeDeps();
    const built = plan();

    expect(await runBpjImport(built, { tenantHandle: "sakura", dryRun: false }, deps)).toBe(0);

    expect(errors).toEqual([]);
    expect(deps.seed).toHaveBeenCalledWith({ tenant_id: "tenant_1", sales_channel_id: "sc_1", shipping_profile_id: "sp_1", plan: built.seed });
    expect(deps.writeTranslation.mock.calls).toEqual([
      ["id_of_morning-dew-shampoo-sakura", "en", { title: "Morning Dew Shampoo", description: "A gentle shampoo." }],
      ["id_of_wind-scissors-sakura", "en", { title: "Wind Scissors" }],
    ]);
    expect(deps.revalidate).toHaveBeenCalledWith("sakura");
    expect(lines.slice(-2)).toEqual(["bpj import: written: categories 5, products 6", "bpj import: english translations written 2 of 2"]);
  });

  it("fails loudly when a translation names a product the shop does not have after the import", async () => {
    const { deps, errors } = fakeDeps();
    deps.findProductIdsByHandle.mockImplementation(async () => new Map([["morning-dew-shampoo-sakura", "prod_a"]]));

    expect(await runBpjImport(plan(), { tenantHandle: "sakura", dryRun: false }, deps)).toBe(1);
    expect(deps.writeTranslation).toHaveBeenCalledTimes(1);
    expect(errors).toEqual(["bpj import: 1 translation(s) name a product the shop does not have after the import."]);
  });
});
