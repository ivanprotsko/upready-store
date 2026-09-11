import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildSeedPlan,
  listAbstractDatasets,
  resolveAbstractDataset,
  resolveMediaBaseUrl,
  scopedHandle,
} from "../data/abstract-datasets";
import { PROFILES_DIR } from "../data/store-profile";

const PRESETS = ["electronics", "geist", "home-goods", "medusa", "sneakers", "supplements", "womens-fashion"];

describe("abstract datasets", () => {
  it("finds exactly the universal set among the profiles on disk", () => {
    const datasets = listAbstractDatasets();
    expect(datasets.map((d) => d.id)).toEqual(["abstract"]);
    expect(datasets[0].profile.dataset).toEqual({ kind: "abstract", themes: "any", tradeSphere: null, tradeCategories: [] });
  });

  it("resolves every wizard preset to the universal set while no theme-specific set exists", () => {
    for (const preset of PRESETS) {
      expect(resolveAbstractDataset(preset).id).toBe("abstract");
    }
  });

  it("prefers a set that lists the preset over the universal one", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "abstract-datasets-"));
    const copy = (id: string, themes: "any" | string[]) => {
      const src = path.join(PROFILES_DIR, "abstract");
      const dst = path.join(dir, id);
      fs.cpSync(src, dst, { recursive: true });
      const profile = JSON.parse(fs.readFileSync(path.join(dst, "profile.json"), "utf8"));
      profile.id = id;
      profile.dataset.themes = themes;
      fs.writeFileSync(path.join(dst, "profile.json"), JSON.stringify(profile));
    };
    copy("abstract", "any");
    copy("abstract-sneakers", ["sneakers"]);

    expect(resolveAbstractDataset("sneakers", dir).id).toBe("abstract-sneakers");
    expect(resolveAbstractDataset("geist", dir).id).toBe("abstract");
    expect(() => resolveAbstractDataset("geist", path.join(dir, "empty"))).toThrow(/No abstract dataset serves preset "geist"/);
  });

  it("reads the media base from either variable and refuses to guess", () => {
    expect(resolveMediaBaseUrl({ STORE_PROFILES_MEDIA_BASE_URL: "https://shipshift.dev/static/store-profiles/" })).toBe(
      "https://shipshift.dev/static/store-profiles",
    );
    expect(resolveMediaBaseUrl({ STORE_MEDIA_BASE_URL: "https://shipshift.dev/static/store-profiles/sneakers" })).toBe(
      "https://shipshift.dev/static/store-profiles",
    );
    expect(() => resolveMediaBaseUrl({})).toThrow(/STORE_PROFILES_MEDIA_BASE_URL/);
  });

  it("plans a tenant's own copy: suffixed handles and SKUs, absolute images, prices in every seeded currency", () => {
    const dataset = resolveAbstractDataset("geist");
    const plan = buildSeedPlan(dataset, { tenantHandle: "nochlavka", mediaBase: "https://shipshift.dev/static/store-profiles" });

    expect(plan.products).toHaveLength(10);
    expect(plan.categories).toHaveLength(2);
    expect(plan.categories.flatMap((c) => c.children)).toHaveLength(5);
    expect(plan.collections.map((c) => c.handle)).toEqual(["new-arrivals-nochlavka", "bestsellers-nochlavka"]);
    expect(plan.heroImageUrl).toBe("https://shipshift.dev/static/store-profiles/abstract/home-hero.webp");

    for (const product of plan.products) {
      expect(product.handle).toBe(scopedHandle(product.sourceHandle, "nochlavka"));
      expect(product.thumbnail).toMatch(/^https:\/\/shipshift\.dev\/static\/store-profiles\/abstract\/[a-z0-9-]+\.webp$/);
      expect(product.options.length).toBeGreaterThan(0);
      for (const variant of product.variants) {
        expect(variant.sku.endsWith("-NOCHLAVKA")).toBe(true);
        expect(variant.manage_inventory).toBe(false);
        expect(variant.prices.length).toBeGreaterThan(30);
        expect(variant.prices.find((p) => p.currency_code === "usd")?.amount).toBeGreaterThan(0);
      }
    }

    const skus = plan.products.flatMap((p) => p.variants.map((v) => v.sku));
    expect(new Set(skus).size).toBe(skus.length);

    for (const root of plan.categories) {
      expect(root.metadata.image_url).toMatch(/\/abstract\/tile-[a-z]+\.webp$/);
      for (const leaf of root.children) {
        expect(leaf.metadata.image_url).toBe(`https://shipshift.dev/static/store-profiles/abstract/tile-${leaf.sourceHandle}.webp`);
      }
    }
  });

  it("is deterministic: the same tenant gets the same plan twice", () => {
    const dataset = resolveAbstractDataset("geist");
    const a = buildSeedPlan(dataset, { tenantHandle: "acme", mediaBase: "http://localhost:9000/static/store-profiles" });
    const b = buildSeedPlan(dataset, { tenantHandle: "acme", mediaBase: "http://localhost:9000/static/store-profiles" });
    expect(a).toEqual(b);
  });
});
