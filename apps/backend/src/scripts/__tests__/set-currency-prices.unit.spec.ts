import {
  canOverwrite,
  mergeScriptPriceMetadata,
  parseArgs,
  roundTargetAmount,
  type ScriptPriceStamp,
} from "../set-currency-prices";

describe("set-currency-prices: parseArgs", () => {
  it("reads every flag written without leading dashes, the shape medusa exec hands over", () => {
    const args = parseArgs(["tenant=cherkashino", "currency=usd", "rate=95", "round=0.99", "dry-run"]);

    expect(args).toEqual({
      tenantHandle: "cherkashino",
      currency: "usd",
      rate: 95,
      round: "0.99",
      sourceCurrency: "rub",
      dryRun: true,
      reportPath: null,
    });
  });

  it("accepts the bare handle as the first positional argument", () => {
    const args = parseArgs(["cherkashino", "currency=usd", "rate=95"]);
    expect(args.tenantHandle).toBe("cherkashino");
  });

  it("tolerates a leading -- from a caller who ran the compiled file by hand", () => {
    const args = parseArgs(["--tenant=cherkashino", "--currency=usd", "--rate=95", "--dry-run"]);
    expect(args).toMatchObject({ tenantHandle: "cherkashino", currency: "usd", rate: 95, dryRun: true });
  });

  it("rejects a rate that is not a positive number", () => {
    expect(parseArgs(["rate=0"]).rate).toBeNull();
    expect(parseArgs(["rate=-5"]).rate).toBeNull();
    expect(parseArgs(["rate=abc"]).rate).toBeNull();
  });

  it("rejects a round value outside the two the script supports", () => {
    expect(parseArgs(["round=0.5"]).round).toBeNull();
    expect(parseArgs(["round=1"]).round).toBe("1");
    expect(parseArgs(["round=0.99"]).round).toBe("0.99");
  });

  it("falls back to environment variables, the docker exec shape", () => {
    process.env.TENANT_HANDLE = "cherkashino";
    process.env.CURRENCY = "USD";
    process.env.RATE = "95";
    process.env.DRY_RUN = "true";
    try {
      const args = parseArgs([]);
      expect(args).toMatchObject({ tenantHandle: "cherkashino", currency: "usd", rate: 95, dryRun: true });
    } finally {
      delete process.env.TENANT_HANDLE;
      delete process.env.CURRENCY;
      delete process.env.RATE;
      delete process.env.DRY_RUN;
    }
  });
});

describe("set-currency-prices: roundTargetAmount", () => {
  it("divides by the rate with no rounding mode, to the nearest cent", () => {
    expect(roundTargetAmount(1990, 95, null)).toBeCloseTo(20.95, 5);
    expect(roundTargetAmount(100, 3, null)).toBeCloseTo(33.33, 5);
  });

  it("rounds to the nearest whole unit for round=1", () => {
    expect(roundTargetAmount(1990, 95, "1")).toBe(21);
    expect(roundTargetAmount(2850, 95, "1")).toBe(30);
  });

  it("rounds to the nearest whole unit minus one cent for round=0.99", () => {
    expect(roundTargetAmount(1990, 95, "0.99")).toBe(20.99);
    expect(roundTargetAmount(2850, 95, "0.99")).toBe(29.99);
  });

  it("floors round=0.99 at 0.99 rather than going negative for a cheap item", () => {
    // 50 RUB at a rate of 95 rounds to 1 unit before the charm-pricing cent is
    // taken off, not to -0.01.
    expect(roundTargetAmount(50, 95, "0.99")).toBe(0.99);
  });

  it("keeps a zero or negative source price at 0 regardless of round", () => {
    expect(roundTargetAmount(0, 95, "0.99")).toBe(0);
    expect(roundTargetAmount(-10, 95, "1")).toBe(0);
  });

  it("returns 0 for a non-positive rate rather than dividing by it", () => {
    expect(roundTargetAmount(1990, 0, "1")).toBe(0);
  });
});

describe("set-currency-prices: canOverwrite", () => {
  const stamp = (amount: number): ScriptPriceStamp => ({
    amount,
    rate: 95,
    round: "0.99",
    written_at: "2026-10-01T00:00:00.000Z",
  });

  it("allows writing a currency the variant has no price in yet", () => {
    expect(canOverwrite(undefined, undefined)).toBe(true);
  });

  it("refuses a price the script never stamped, even if a value is present", () => {
    // Seeded or admin-typed: either way, not the script's to touch.
    expect(canOverwrite(20.99, undefined)).toBe(false);
  });

  it("allows overwriting a price whose live amount still matches the script's last stamp", () => {
    expect(canOverwrite(20.99, stamp(20.99))).toBe(true);
  });

  it("refuses a price the owner edited after the script wrote it", () => {
    expect(canOverwrite(25, stamp(20.99))).toBe(false);
  });
});

describe("set-currency-prices: mergeScriptPriceMetadata", () => {
  it("adds the stamp under its own currency without touching the rest of metadata", () => {
    const stamp: ScriptPriceStamp = {
      amount: 20.99,
      rate: 95,
      round: "0.99",
      written_at: "2026-10-01T00:00:00.000Z",
    };

    const merged = mergeScriptPriceMetadata(
      { full_characteristics: { color: "red" }, script_prices: { eur: { amount: 19, rate: 100, round: null, written_at: "x" } } },
      "usd",
      stamp,
    );

    expect(merged).toEqual({
      full_characteristics: { color: "red" },
      script_prices: {
        eur: { amount: 19, rate: 100, round: null, written_at: "x" },
        usd: stamp,
      },
    });
  });

  it("starts a fresh metadata object for a variant that had none", () => {
    const stamp: ScriptPriceStamp = { amount: 20.99, rate: 95, round: "0.99", written_at: "x" };
    expect(mergeScriptPriceMetadata(null, "usd", stamp)).toEqual({ script_prices: { usd: stamp } });
  });
});
