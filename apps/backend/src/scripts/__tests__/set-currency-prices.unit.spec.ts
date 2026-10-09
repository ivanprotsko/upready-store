// The script imports `product-csv/apply.ts`, which builds workflows of its own from the real
// core flows at import time, so only the one the script runs is replaced.
jest.mock("@medusajs/medusa/core-flows", () => {
  const run = jest.fn(async () => ({ result: [] }));
  return {
    ...jest.requireActual("@medusajs/medusa/core-flows"),
    __run: run,
    updateProductVariantsWorkflow: () => ({ run }),
  };
});

import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import setCurrencyPrices, {
  canOverwrite,
  mergeScriptPriceMetadata,
  parseArgs,
  roundTargetAmount,
  type ScriptPriceStamp,
} from "../set-currency-prices";

const { __run: workflowRun } = jest.requireMock("@medusajs/medusa/core-flows") as { __run: jest.Mock };

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

  it("reads from= as the source currency the rate is quoted in", () => {
    const args = parseArgs(["tenant=beautyprojapan", "from=jpy", "currency=usd", "rate=158.28", "round=1"]);
    expect(args).toMatchObject({ tenantHandle: "beautyprojapan", sourceCurrency: "jpy", currency: "usd", rate: 158.28 });
    expect(parseArgs(["source=JPY"]).sourceCurrency).toBe("jpy");
  });

  it("keeps RUB as the source when from= is left out, as before from= existed", () => {
    expect(parseArgs(["tenant=cherkashino", "currency=usd", "rate=95"]).sourceCurrency).toBe("rub");
    expect(parseArgs([]).sourceCurrency).toBe("rub");
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

  it("rounds a yen source the same way as a rouble one", () => {
    // 3300 JPY at 158.28 JPY per USD is 20.849…
    expect(roundTargetAmount(3300, 158.28, null)).toBeCloseTo(20.85, 5);
    expect(roundTargetAmount(3300, 158.28, "1")).toBe(21);
    expect(roundTargetAmount(3300, 158.28, "0.99")).toBe(20.99);
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

describe("set-currency-prices: a run over one shop", () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const price = (id: string, currency_code: string, amount: number) => ({ id, currency_code, amount, price_rules: [] });
  const variant = (id: string, prices: ReturnType<typeof price>[]) => ({ id, sku: id, metadata: null, price_set: { prices } });

  // One variant priced in yen (the BPJ import), one in roubles (cherkashino), and one in yen
  // whose dollar price somebody typed by hand: no stamp, so it is never the script's to touch.
  const products = [
    {
      id: "prod_1",
      handle: "lebel-shampoo",
      variants: [
        variant("v_yen", [price("price_jpy", "jpy", 3300)]),
        variant("v_rub", [price("price_rub", "rub", 1990)]),
        variant("v_hand", [price("price_jpy_2", "jpy", 5500), price("price_usd_2", "usd", 40)]),
      ],
    },
  ];

  const container = () => {
    const graph = jest.fn(async ({ entity }: { entity: string }) =>
      entity === "tenant"
        ? { data: [{ id: "ten_1", handle: "beautyprojapan", name: "Beauty Pro Japan", products: [{ id: "prod_1" }] }] }
        : { data: products },
    );
    return { resolve: (key: string) => (key === ContainerRegistrationKeys.LOGGER ? logger : { graph }) } as never;
  };

  beforeEach(() => {
    workflowRun.mockClear();
    logger.error.mockClear();
  });

  it("from=jpy prices USD from the yen price, carries the yen row and stamps the source", async () => {
    await setCurrencyPrices({
      container: container(),
      args: ["tenant=beautyprojapan", "from=jpy", "currency=usd", "rate=158.28", "round=1"],
    });

    expect(workflowRun).toHaveBeenCalledTimes(1);
    const { input } = workflowRun.mock.calls[0][0];
    expect(input.selector).toEqual({ id: "v_yen" });
    expect(input.update.prices).toEqual([
      { id: "price_jpy", currency_code: "jpy", amount: 3300 },
      { currency_code: "usd", amount: 21 },
    ]);
    expect(input.update.metadata.script_prices.usd).toMatchObject({ amount: 21, rate: 158.28, round: "1", from: "jpy" });
  });

  it("without from= converts from RUB exactly as before, and leaves the yen variants alone", async () => {
    await setCurrencyPrices({
      container: container(),
      args: ["tenant=beautyprojapan", "currency=usd", "rate=95", "round=0.99"],
    });

    expect(workflowRun).toHaveBeenCalledTimes(1);
    const { input } = workflowRun.mock.calls[0][0];
    expect(input.selector).toEqual({ id: "v_rub" });
    expect(input.update.prices).toEqual([
      { id: "price_rub", currency_code: "rub", amount: 1990 },
      { currency_code: "usd", amount: 20.99 },
    ]);
    expect(input.update.metadata.script_prices.usd).toMatchObject({ amount: 20.99, rate: 95, round: "0.99", from: "rub" });
  });

  it("writes nothing in dry-run, from=jpy included", async () => {
    await setCurrencyPrices({
      container: container(),
      args: ["tenant=beautyprojapan", "from=jpy", "currency=usd", "rate=158.28", "dry-run"],
    });
    expect(workflowRun).not.toHaveBeenCalled();
  });

  it("refuses a from= that is not a three-letter currency code", async () => {
    await setCurrencyPrices({
      container: container(),
      args: ["tenant=beautyprojapan", "from=yen1", "currency=usd", "rate=158.28"],
    });
    expect(workflowRun).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("from=<code>"));
  });
});
