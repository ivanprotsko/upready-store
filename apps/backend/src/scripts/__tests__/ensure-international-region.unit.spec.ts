import { parseArgs, planRegionAssignment, type RegionRow } from "../ensure-international-region";

/**
 * Every country on this backend already owns a single-country region
 * (`src/migration-scripts/data/regions/json`, 241 files), so the planner's
 * whole job is the reassignment: whose countries move, and what is left of
 * the regions they move out of.
 */

const soloRegion = (name: string, iso2: string, overrides: Partial<RegionRow> = {}): RegionRow => ({
  id: `reg_${iso2}`,
  name,
  currency_code: "usd",
  countries: [{ iso_2: iso2 }],
  payment_providers: [{ id: "pp_system_default" }],
  ...overrides,
});

describe("ensure-international-region: parseArgs", () => {
  it("reads a comma-separated country list and the dashless flags medusa exec hands over", () => {
    const args = parseArgs(["countries=us,GB, de", "name=International", "dry-run"]);
    expect(args).toEqual({ countries: ["us", "gb", "de"], name: "International", dryRun: true });
  });

  it("defaults to null countries and the standard name with no arguments", () => {
    expect(parseArgs([])).toEqual({ countries: null, name: "International", dryRun: false });
  });

  it("falls back to the COUNTRIES and DRY_RUN environment variables", () => {
    process.env.COUNTRIES = "us,ca";
    process.env.DRY_RUN = "true";
    try {
      expect(parseArgs([])).toMatchObject({ countries: ["us", "ca"], dryRun: true });
    } finally {
      delete process.env.COUNTRIES;
      delete process.env.DRY_RUN;
    }
  });
});

describe("ensure-international-region: planRegionAssignment", () => {
  const russia = soloRegion("Russia", "ru", { id: "reg_ru", currency_code: "rub" });
  const unitedStates = soloRegion("United States", "us");
  const germany = soloRegion("Germany", "de", { currency_code: "eur" });
  const unitedKingdom = soloRegion("United Kingdom", "gb", { currency_code: "gbp" });

  it("never moves ru into the target, named explicitly or not, and says so", () => {
    const plan = planRegionAssignment([russia, unitedStates], ["us", "ru"], "International");

    expect(plan.wanted).toEqual(["us"]);
    expect(plan.protected).toEqual(["ru"]);
    expect(plan.toFree).toEqual([
      { region: unitedStates, countries: ["us"], remaining: [] },
    ]);
    expect(plan.finalCountries).toEqual(["us"]);
  });

  it("takes a requested country away from whichever single-country region owns it today", () => {
    const plan = planRegionAssignment([unitedStates, germany, unitedKingdom], ["us", "de"], "International");

    expect(plan.toFree).toEqual(
      expect.arrayContaining([
        { region: unitedStates, countries: ["us"], remaining: [] },
        { region: germany, countries: ["de"], remaining: [] },
      ]),
    );
    expect(plan.finalCountries).toEqual(["de", "us"]);
    expect(plan.target).toBeNull();
    expect(plan.noopNeeded).toBe(false);
  });

  it("only strips the countries being moved, leaving a multi-country region's others alone", () => {
    const multi: RegionRow = {
      id: "reg_multi",
      name: "Old Bundle",
      currency_code: "usd",
      countries: [{ iso_2: "us" }, { iso_2: "ca" }, { iso_2: "mx" }],
      payment_providers: [],
    };

    const plan = planRegionAssignment([multi], ["us"], "International");

    expect(plan.toFree).toEqual([{ region: multi, countries: ["us"], remaining: ["ca", "mx"] }]);
  });

  it("is a true no-op on a second run with the same list", () => {
    const international: RegionRow = {
      id: "reg_intl",
      name: "International",
      currency_code: "usd",
      countries: [{ iso_2: "us" }, { iso_2: "de" }],
      payment_providers: [{ id: "pp_system_default" }],
    };

    const plan = planRegionAssignment([international], ["us", "de"], "International");

    expect(plan.toFree).toEqual([]);
    expect(plan.finalCountries).toEqual(["de", "us"]);
    expect(plan.noopNeeded).toBe(true);
  });

  it("only grows the target's country list, never drops one missing from a later run", () => {
    const international: RegionRow = {
      id: "reg_intl",
      name: "International",
      currency_code: "usd",
      countries: [{ iso_2: "us" }, { iso_2: "de" }],
      payment_providers: [{ id: "pp_system_default" }],
    };

    // A later run asks for "de" alone (a shorter owner-supplied list): "us"
    // stays, because shrinking the region is a human decision.
    const plan = planRegionAssignment([international], ["de"], "International");

    expect(plan.finalCountries).toEqual(["de", "us"]);
    expect(plan.noopNeeded).toBe(true);
  });

  it("reports needing the system default provider on an existing target that lacks it", () => {
    const international: RegionRow = {
      id: "reg_intl",
      name: "International",
      currency_code: "usd",
      countries: [{ iso_2: "us" }],
      payment_providers: [],
    };

    const plan = planRegionAssignment([international], ["us"], "International");

    expect(plan.finalCountries).toEqual(["us"]);
    expect(plan.noopNeeded).toBe(false);
  });

  it("leaves a country already in the target region out of toFree", () => {
    const international: RegionRow = {
      id: "reg_intl",
      name: "International",
      currency_code: "usd",
      countries: [{ iso_2: "us" }],
      payment_providers: [{ id: "pp_system_default" }],
    };

    const plan = planRegionAssignment([international], ["us", "de"], "International");

    expect(plan.toFree).toEqual([]);
    expect(plan.finalCountries).toEqual(["de", "us"]);
  });

  it("drops a duplicate in the requested list rather than double-counting it", () => {
    const plan = planRegionAssignment([unitedStates], ["us", "us"], "International");
    expect(plan.wanted).toEqual(["us"]);
  });
});
