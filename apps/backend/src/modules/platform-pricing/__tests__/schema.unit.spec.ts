import { PostAdminPlatformPricingSchema, PricingDocumentSchema, isAllowedHref } from "../schema";
import { OKSANA_3TIER_PRICING } from "../seed/oksana-3tier";

/** A deep copy the case can break without touching the seed. */
function page() {
  return JSON.parse(JSON.stringify(OKSANA_3TIER_PRICING));
}

function messages(input: unknown): string[] {
  const result = PricingDocumentSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("PricingDocumentSchema", () => {
  it("accepts the seeded page", () => {
    expect(messages(page())).toEqual([]);
  });

  it("refuses a row with no value for one of the tiers, naming the row and the tier", () => {
    const doc = page();
    delete doc.sections[1].rows[2].values.scale;
    expect(messages(doc)).toEqual(['sections.1.rows.2.values.scale: no value for tier "scale"']);
  });

  it("refuses a value for a tier that does not exist", () => {
    const doc = page();
    doc.sections[0].rows[0].values.enterprise = { type: "yes" };
    expect(messages(doc)).toEqual(['sections.0.rows.0.values.enterprise: "enterprise" is not a tier id']);
  });

  it("refuses two tiers with one id", () => {
    const doc = page();
    doc.tiers[1].id = "start";
    expect(messages(doc)).toContain('tiers.1.id: duplicate tier id "start"');
  });

  it("accepts every button action with its own fields, and refuses a card trial without its length", () => {
    const doc = page();
    doc.tiers[0].button.action = { type: "onboarding_free" };
    doc.tiers[1].button.action = { type: "pay_first" };
    doc.tiers[2].button.action = { type: "card_trial", trial_days: 14 };
    expect(messages(doc)).toEqual([]);

    doc.tiers[2].button.action = { type: "card_trial" };
    expect(PricingDocumentSchema.safeParse(doc).success).toBe(false);

    doc.tiers[2].button.action = { type: "card_trial", trial_days: 0 };
    expect(PricingDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("refuses an unknown action", () => {
    const doc = page();
    doc.tiers[0].button.action = { type: "subscribe" };
    expect(PricingDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("needs a tariff on the final button once it enters the funnel", () => {
    const doc = page();
    doc.final.tier_id = null;
    expect(messages(doc)).toEqual([]);

    doc.final.button.action = { type: "pay_first" };
    expect(messages(doc)).toEqual(['final.tier_id: action "pay_first" needs a tariff']);

    doc.final.tier_id = "nope";
    expect(messages(doc)).toEqual(['final.tier_id: "nope" is not a tier id']);
  });

  it("refuses unbalanced bold marks in a page text", () => {
    const doc = page();
    doc.page.note = "**Магазин остаётся вашим — без аренды";
    expect(messages(doc)).toEqual(["page.note: unbalanced ** (bold) marks"]);
  });

  it("allows anchors, paths and web addresses in a link, and nothing that runs", () => {
    for (const ok of ["#final", "#", "/start", "https://upready.dev/", "mailto:a@b.c", "tel:+7900"]) {
      expect(isAllowedHref(ok)).toBe(true);
    }
    for (const bad of ["javascript:alert(1)", "//evil.test", "data:text/html,x", "final", " #final"]) {
      expect(isAllowedHref(bad)).toBe(false);
    }
  });

  it("wraps the page and the revision in the admin write body", () => {
    expect(PostAdminPlatformPricingSchema.safeParse({ pricing: page(), revision: 3 }).success).toBe(true);
    expect(PostAdminPlatformPricingSchema.safeParse({ pricing: page(), revision: null }).success).toBe(true);
    expect(PostAdminPlatformPricingSchema.safeParse({ pricing: page() }).success).toBe(false);
  });
});
