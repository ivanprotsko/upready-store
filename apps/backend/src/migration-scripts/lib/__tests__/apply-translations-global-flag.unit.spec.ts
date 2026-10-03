import type { MedusaContainer } from "@medusajs/framework";
import { FeatureFlag, applyTranslations } from "@medusajs/framework/utils";

/**
 * t-cherk-37 PR #218 review: `MEDUSA_FF_TRANSLATION` is Medusa's own
 * `FeatureFlag` singleton (`@medusajs/utils` `flag-router.js`), registered
 * once per backend process at boot — core has no per-tenant hook for it, so
 * it cannot be scoped to one shop without forking the vendored package.
 * What makes the global default safe is `applyTranslations` itself: it
 * matches rows by `reference_id` + `locale_code` only, with no tenant
 * filter, and only overwrites a key when a matching row exists. A tenant
 * that never wrote translations has no rows for any of its entity ids, so
 * the flag being on globally changes nothing for it.
 */
describe("applyTranslations with MEDUSA_FF_TRANSLATION on globally", () => {
  const originalFlag = FeatureFlag.isFeatureEnabled("translation");

  beforeAll(() => {
    FeatureFlag.setFlag("translation", true);
  });

  afterAll(() => {
    FeatureFlag.setFlag("translation", originalFlag);
  });

  const containerWith = (
    rows: { reference_id: string; translations: Record<string, unknown> }[],
  ): MedusaContainer =>
    ({
      resolve: () => ({
        graph: async () => ({ data: rows }),
      }),
    }) as unknown as MedusaContainer;

  it("leaves a tenant's product unchanged when it has no translation rows", async () => {
    const product = {
      id: "prod_other_tenant_1",
      title: "Original title",
      description: "Original description",
      variants: [{ id: "variant_1", title: "Original variant" }],
    };
    const before = JSON.parse(JSON.stringify(product));

    await applyTranslations({
      localeCode: "ru",
      objects: [product],
      container: containerWith([]),
    });

    expect(product).toEqual(before);
  });

  it("still overlays a translated tenant's product, proving the flag is actually on", async () => {
    const product = {
      id: "prod_translated_1",
      title: "Original title",
      description: "Original description",
    };

    await applyTranslations({
      localeCode: "ru",
      objects: [product],
      container: containerWith([
        { reference_id: "prod_translated_1", translations: { title: "Переведённый заголовок" } },
      ]),
    });

    expect(product.title).toBe("Переведённый заголовок");
    expect(product.description).toBe("Original description");
  });
});
