import { matchByVendorCode, planLinkWrites, type StoredLinkRow } from "../link";

/**
 * What an auto-link run writes (w14-mp-catalog-link).
 *
 * The two rules under test are the two ways an auto-link can destroy work
 * nobody would notice was gone: overwriting a person's choice, and keeping a
 * link the matcher no longer supports. Both are silent — the row stays the
 * right SHAPE either way (rule 20a) — so they are checked here rather than on
 * a screen.
 */

const card = (external_id: string, vendor_code: string | null) => ({ external_id, vendor_code });
const variant = (id: string, product_id: string, sku: string | null) => ({ id, product_id, sku });

const stored = (
  id: string,
  external_id: string,
  matched_by: string,
  product_id = "prod_old",
): StoredLinkRow => ({ id, external_id, matched_by, product_id, variant_id: "var_old" });

const draftOf = (outcome: { external_id: string; product_id: string; variant_id: string }) => ({
  external_id: outcome.external_id,
  product_id: outcome.product_id,
  variant_id: outcome.variant_id,
  matched_by: "vendor_code",
});

describe("planLinkWrites", () => {
  it("creates a link for a card that matches exactly one variant", () => {
    const report = matchByVendorCode([card("100", "Сбитень")], [variant("var_1", "prod_1", "Сбитень")]);

    const plan = planLinkWrites(report, [], draftOf);

    expect(plan.create).toEqual([
      { external_id: "100", product_id: "prod_1", variant_id: "var_1", matched_by: "vendor_code" },
    ]);
    expect(plan.update).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it("never rewrites a link a person chose", () => {
    const report = matchByVendorCode([card("100", "Сбитень")], [variant("var_1", "prod_1", "Сбитень")]);

    const plan = planLinkWrites(report, [stored("mplink_1", "100", "manual")], draftOf);

    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.kept_manual).toEqual(["mplink_1"]);
  });

  it("updates a link it wrote itself when the article moved to another product", () => {
    const report = matchByVendorCode([card("100", "Сбитень")], [variant("var_2", "prod_2", "Сбитень")]);

    const plan = planLinkWrites(report, [stored("mplink_1", "100", "vendor_code")], draftOf);

    expect(plan.update).toEqual([
      {
        id: "mplink_1",
        external_id: "100",
        product_id: "prod_2",
        variant_id: "var_2",
        matched_by: "vendor_code",
      },
    ]);
    expect(plan.remove).toEqual([]);
  });

  it("removes its own link once the card became ambiguous", () => {
    const report = matchByVendorCode(
      [card("100", "Сбитень")],
      [variant("var_1", "prod_1", "Сбитень"), variant("var_2", "prod_2", "сбитень")],
    );

    expect(report.ambiguous).toHaveLength(1);

    const plan = planLinkWrites(report, [stored("mplink_1", "100", "vendor_code")], draftOf);

    expect(plan.remove).toEqual(["mplink_1"]);
    expect(plan.create).toEqual([]);
  });

  it("keeps a manual link on a card that became ambiguous", () => {
    const report = matchByVendorCode(
      [card("100", "Сбитень")],
      [variant("var_1", "prod_1", "Сбитень"), variant("var_2", "prod_2", "сбитень")],
    );

    const plan = planLinkWrites(report, [stored("mplink_1", "100", "manual")], draftOf);

    expect(plan.remove).toEqual([]);
    expect(plan.kept_manual).toEqual([]);
  });

  it("removes its own link once the article left the shop", () => {
    const report = matchByVendorCode([card("100", "Сбитень")], []);

    expect(report.notFound).toHaveLength(1);

    const plan = planLinkWrites(report, [stored("mplink_1", "100", "vendor_code")], draftOf);

    expect(plan.remove).toEqual(["mplink_1"]);
  });
});
