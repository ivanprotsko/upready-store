import { isPromoCodeEnabled } from "../promo-code";

describe("isPromoCodeEnabled", () => {
  it("keeps the field for a shop that never set the switch", () => {
    expect(isPromoCodeEnabled(null)).toBe(true);
    expect(isPromoCodeEnabled(undefined)).toBe(true);
    expect(isPromoCodeEnabled({})).toBe(true);
    expect(isPromoCodeEnabled({ promo_code: null })).toBe(true);
    expect(isPromoCodeEnabled({ promo_code: {} })).toBe(true);
  });

  it("takes the field away only on an explicit false", () => {
    expect(isPromoCodeEnabled({ promo_code: { enabled: false } })).toBe(false);
    expect(isPromoCodeEnabled({ promo_code: { enabled: "false" } })).toBe(false);
  });

  it("reads anything else as on", () => {
    expect(isPromoCodeEnabled({ promo_code: { enabled: true } })).toBe(true);
    expect(isPromoCodeEnabled({ promo_code: { enabled: 0 } })).toBe(true);
    expect(isPromoCodeEnabled({ promo_code: false })).toBe(true);
  });
});
