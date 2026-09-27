import { planTrialEndsAt } from "../plan";

describe("planTrialEndsAt", () => {
  const now = new Date("2026-09-27T12:00:00.000Z");

  it("is null for a tariff with no trial (the free tier)", () => {
    expect(planTrialEndsAt(null, now)).toBeNull();
    expect(planTrialEndsAt(undefined, now)).toBeNull();
    expect(planTrialEndsAt(0, now)).toBeNull();
  });

  it("is created + the tier's trial days, for a 3-day trial", () => {
    expect(planTrialEndsAt(3, now)).toEqual(new Date("2026-09-30T12:00:00.000Z"));
  });

  it("is created + the tier's trial days, for a 7-day trial", () => {
    expect(planTrialEndsAt(7, now)).toEqual(new Date("2026-10-04T12:00:00.000Z"));
  });

  it("stores exactly what it was called with — this is where a forged trial would have to land, and it never receives one", () => {
    // t-2026-09-27-05: the server route resolves `days` against
    // GET /platform/pricing before this function ever runs, so a URL's
    // `trial=365` never reaches here for a tier whose own trial is 3 days.
    expect(planTrialEndsAt(365, now)).toEqual(new Date("2027-09-27T12:00:00.000Z"));
    expect(planTrialEndsAt(3, now)).not.toEqual(new Date("2027-09-27T12:00:00.000Z"));
  });
});
