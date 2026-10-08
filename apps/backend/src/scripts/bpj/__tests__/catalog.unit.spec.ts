import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_OPTION_TITLE, DEFAULT_OPTION_VALUE } from "../../../migration-scripts/data/abstract-datasets";
import { convertBpjCatalog, countBpjPlan, parseYen, priceFromYen } from "../catalog";
import { isInside, main, parseConvertArgs } from "../convert-catalog";
import { sampleCatalog } from "./sample-catalog";

const options = { tenantHandle: "sakura", currency: "rub", rateFromJpy: 0.55 };
const byTitle = (plan: ReturnType<typeof convertBpjCatalog>, title: string) => {
  const found = plan.seed.products.find((product) => product.title === title);
  if (!found) throw new Error(`no product "${title}" in the plan`);
  return found;
};

describe("convertBpjCatalog", () => {
  it("files every product under its brand inside the one root `brands-<shop>`", () => {
    const plan = convertBpjCatalog(sampleCatalog(), options);

    expect(plan.seed.categories).toHaveLength(1);
    const [root] = plan.seed.categories;
    expect(root).toMatchObject({ handle: "brands-sakura", sourceHandle: "brands", name: "Бренды" });
    // The busiest brand first, a tie by name.
    expect(root.children.map((leaf) => [leaf.handle, leaf.name])).toEqual([
      ["lebel-sakura", "Lebel"],
      ["tokio-sakura", "Tokio"],
      ["mizutani-sakura", "Mizutani"],
      ["olaplex-sakura", "Olaplex"],
    ]);
    for (const leaf of root.children) expect(leaf.children).toEqual([]);

    const leafOf = new Map(root.children.map((leaf) => [leaf.sourceHandle, leaf.name]));
    for (const product of plan.seed.products) {
      expect(leafOf.get(product.categorySourceHandle)).toBe(product.metadata.brand);
      expect(product.collectionSourceHandle).toBeNull();
    }

    // A category's picture is a product's own picture, the root takes its first brand's.
    expect(root.children[1].metadata.image_url).toBe("https://static.example.test/comb.jpg");
    expect(root.metadata.image_url).toBe(root.children[0].metadata.image_url);
    expect(JSON.stringify(plan)).not.toContain('"starter"');
  });

  it("prices a variant at its own yen times the rate, the product's yen as the fallback, and keeps both yen amounts", () => {
    const plan = convertBpjCatalog(sampleCatalog(), options);

    const shampoo = byTitle(plan, "Шампунь Утренняя роса");
    expect(shampoo.metadata).toMatchObject({ brand: "Lebel", price_jpy: 3500, tilda_uid: 1001 });
    expect(shampoo.variants.map((variant) => [variant.title, variant.prices, variant.metadata])).toEqual([
      ["250 мл", [{ currency_code: "rub", amount: 1925 }], { price_jpy: 3500, tilda_uid: 2001 }],
      ["1000 мл", [{ currency_code: "rub", amount: 4950 }], { price_jpy: 9000, tilda_uid: 2002 }],
    ]);
    expect(shampoo.options).toEqual([{ title: "Объем", values: ["250 мл", "1000 мл"] }]);

    const scissors = byTitle(plan, "Ножницы Ветер");
    expect(scissors.variants.map((variant) => variant.prices[0].amount)).toEqual([28600, 28600]);
    expect(scissors.variants[1].metadata).toEqual({ price_jpy: 52000, tilda_uid: 2005 });

    const rounded = convertBpjCatalog(sampleCatalog(), { ...options, roundTo: 100 });
    expect(byTitle(rounded, "Шампунь Утренняя роса").variants.map((variant) => variant.prices[0].amount)).toEqual([1900, 5000]);
  });

  it("makes a draft of every product without a yen price and publishes the rest", () => {
    const plan = convertBpjCatalog(sampleCatalog(), options);

    const status = Object.fromEntries(plan.seed.products.map((product) => [product.title, product.status]));
    expect(status).toEqual({
      "Шампунь Утренняя роса": "published",
      "Маска Тихий сад": "draft",
      "Ножницы Ветер": "published",
      "Bond Oil": "published",
      "Расчёска Гребень": "published",
      "Сыворотка Без фото": "draft",
    });
    expect(byTitle(plan, "Маска Тихий сад").variants[0].prices).toEqual([]);
    expect(byTitle(plan, "Маска Тихий сад").metadata.price_jpy).toBeNull();
  });

  it("gives a product without options Medusa's placeholder option and keeps the first of two editions nothing tells apart", () => {
    const plan = convertBpjCatalog(sampleCatalog(), options);

    const comb = byTitle(plan, "Расчёска Гребень");
    expect(comb.options).toEqual([{ title: DEFAULT_OPTION_TITLE, values: [DEFAULT_OPTION_VALUE] }]);
    expect(comb.variants).toHaveLength(1);
    expect(comb.variants[0]).toMatchObject({ title: "Расчёска Гребень", options: { [DEFAULT_OPTION_TITLE]: DEFAULT_OPTION_VALUE } });
    expect(comb.variants[0].prices).toEqual([{ currency_code: "rub", amount: 3850 }]);
    expect(plan.droppedEditionsOf).toEqual([1005]);

    // Only an option some variant names reaches the shared library, values in first-seen order.
    expect(plan.seed.sharedOptions).toEqual([
      { title: "Объем", values: ["250 мл", "1000 мл"] },
      { title: "Длина", values: ["5.5", "6.0"] },
    ]);
  });

  it("scopes handles and SKUs to the shop, transliterates a Russian-only title and keeps pictures as they are", () => {
    const plan = convertBpjCatalog(sampleCatalog(), options);

    expect(plan.seed.products.map((product) => product.handle)).toEqual([
      "morning-dew-shampoo-sakura",
      "maska-tihiy-sad-sakura",
      "wind-scissors-sakura",
      "bond-oil-sakura",
      "rascheska-greben-sakura",
      "syvorotka-bez-foto-sakura",
    ]);
    expect(byTitle(plan, "Шампунь Утренняя роса").variants.map((variant) => variant.sku)).toEqual(["BPJ-2001-SAKURA", "BPJ-2002-SAKURA"]);
    expect(byTitle(plan, "Шампунь Утренняя роса").images).toEqual(["https://static.example.test/dew-1.jpg", "https://static.example.test/dew-2.jpg"]);
    expect(byTitle(plan, "Шампунь Утренняя роса").thumbnail).toBe("https://static.example.test/dew-1.jpg");

    const bare = byTitle(plan, "Сыворотка Без фото");
    expect(bare.images).toEqual([]);
    expect("thumbnail" in bare).toBe(false);
  });

  it("puts the English texts of a Russian product aside for the `en` translation, and an English-only product keeps its English as the base", () => {
    const plan = convertBpjCatalog(sampleCatalog(), options);

    expect(plan.translations).toEqual({
      locale: "en",
      products: [
        { handle: "morning-dew-shampoo-sakura", title: "Morning Dew Shampoo", description: "A gentle shampoo." },
        { handle: "wind-scissors-sakura", title: "Wind Scissors" },
      ],
    });
    expect(byTitle(plan, "Bond Oil")).toMatchObject({ description: "An oil for the ends.", metadata: { source_site: "EN", tilda_uid: 1004 } });
  });

  it("counts what the plan holds", () => {
    const plan = convertBpjCatalog(sampleCatalog(), options);

    expect(plan.counts).toEqual({
      categories: 5,
      brands: 4,
      products: 6,
      published: 4,
      drafts: 2,
      variants: 8,
      pricedVariants: 6,
      droppedEditions: 1,
      images: 6,
      productsWithoutImages: 1,
      sharedOptions: 2,
      translations: 2,
    });
    expect(countBpjPlan(plan, 1)).toEqual(plan.counts);
  });

  it("is deterministic and refuses options it cannot price or scope with", () => {
    expect(convertBpjCatalog(sampleCatalog(), options)).toEqual(convertBpjCatalog(sampleCatalog(), options));

    expect(() => convertBpjCatalog(sampleCatalog(), { ...options, currency: "RUB" })).toThrow(/ISO 4217/);
    expect(() => convertBpjCatalog(sampleCatalog(), { ...options, rateFromJpy: 0 })).toThrow(/positive number/);
    expect(() => convertBpjCatalog(sampleCatalog(), { ...options, tenantHandle: "Sakura Shop" })).toThrow(/URL handle/);
    expect(() => convertBpjCatalog([], options)).toThrow(/no product/);
  });

  it("stops on a brand without a single picture instead of inventing one", () => {
    const catalog = sampleCatalog().filter((product) => product.brand !== "Tokio" || !product.gallery.includes("comb"));
    expect(() => convertBpjCatalog(catalog, options)).toThrow(/brand "Tokio" has a picture/);
  });
});

describe("yen helpers", () => {
  it("reads Tilda's yen strings and treats empty, null and zero as no price", () => {
    expect(parseYen("1 936.00")).toBe(1936);
    expect(parseYen("3500.0000")).toBe(3500);
    expect(parseYen("0.0000")).toBeNull();
    expect(parseYen("")).toBeNull();
    expect(parseYen(null)).toBeNull();
    expect(parseYen("по запросу")).toBeNull();
  });

  it("converts at the rate and rounds to the step", () => {
    expect(priceFromYen(810, 0.0067)).toBe(5.43);
    expect(priceFromYen(3500, 0.55)).toBe(1925);
    expect(priceFromYen(3500, 0.55, 10)).toBe(1930);
  });
});

describe("convert-catalog command line", () => {
  it("parses the flags and names what is missing or unknown", () => {
    expect(
      parseConvertArgs(["--catalog", "/a.json", "--tenant", "sakura", "--currency", "RUB", "--rate-from-jpy", "0.55", "--round-to", "1", "--out", "/b.json"]),
    ).toEqual({ catalog: "/a.json", tenant: "sakura", currency: "rub", rateFromJpy: 0.55, roundTo: 1, out: "/b.json" });
    expect(parseConvertArgs(["--catalog", "/a.json"])).toEqual({ error: expect.stringMatching(/missing --tenant, --currency, --rate-from-jpy, --out/) });
    expect(parseConvertArgs(["--catalog", "/a.json", "--dry-run", "yes"])).toEqual({ error: expect.stringMatching(/unknown argument\(s\) --dry-run/) });
    expect(parseConvertArgs(["--catalog"])).toEqual({ error: expect.stringMatching(/needs a value/) });
  });

  it("writes the plan outside the repository and prints numbers, never a product's text", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bpj-convert-"));
    const repository = path.join(dir, "repo");
    fs.mkdirSync(repository);
    const catalog = path.join(dir, "catalog.json");
    fs.writeFileSync(catalog, JSON.stringify(sampleCatalog()));
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const args = ["--catalog", catalog, "--tenant", "sakura", "--currency", "rub", "--rate-from-jpy", "0.55"];
      const inside = path.join(repository, "plan.json");
      expect(main([...args, "--out", inside], repository)).toBe(1);
      expect(fs.existsSync(inside)).toBe(false);
      expect(error.mock.calls.join("\n")).toMatch(/inside the repository/);

      const out = path.join(dir, "evidence", "plan.json");
      expect(main([...args, "--out", out], repository)).toBe(0);
      expect(JSON.parse(fs.readFileSync(out, "utf8")).counts.products).toBe(6);

      const printed = log.mock.calls.join("\n");
      expect(printed).toMatch(/products 6: published 4, drafts 2/);
      expect(printed).toMatch(/categories 5 \(brands 4\)/);
      for (const product of sampleCatalog()) {
        for (const text of [product.title_ru, product.title_en].filter(Boolean)) expect(printed).not.toContain(text);
      }
    } finally {
      log.mockRestore();
      error.mockRestore();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("tells a path inside a directory from one beside it", () => {
    expect(isInside("/r/a/plan.json", "/r/a")).toBe(true);
    expect(isInside("/r/ab/plan.json", "/r/a")).toBe(false);
    expect(isInside("/r/plan.json", "/r/a")).toBe(false);
  });
});
