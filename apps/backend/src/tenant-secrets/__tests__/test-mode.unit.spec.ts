import { testModeOf } from "../test-mode";

/**
 * The storefront's red test-mode dot (t-2026-10-04-21, checkout-v2 A3) reads this: which of the
 * shop's enabled provider accounts are in their test contour, split into payments and delivery.
 */
describe("testModeOf", () => {
  it("nothing in test mode: no dot", () => {
    expect(testModeOf([])).toEqual({ payments: false, delivery: false });
  });

  it("Robokassa in test mode is a test payment", () => {
    expect(testModeOf(["robokassa"])).toEqual({ payments: true, delivery: false });
  });

  it("any of CDEK, ApiShip, Russian Post in test mode is a test delivery", () => {
    expect(testModeOf(["pochta"])).toEqual({ payments: false, delivery: true });
    expect(testModeOf(["cdek"])).toEqual({ payments: false, delivery: true });
    expect(testModeOf(["apiship"])).toEqual({ payments: false, delivery: true });
  });

  it("both at once, and a provider outside both lists counts for neither", () => {
    expect(testModeOf(["robokassa", "pochta"])).toEqual({ payments: true, delivery: true });
    expect(testModeOf(["wildberries", "telegram"])).toEqual({ payments: false, delivery: false });
  });
});
