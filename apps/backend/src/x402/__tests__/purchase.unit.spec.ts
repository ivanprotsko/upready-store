import { createKeyedMutex, pickShippingOption, purchaseQuoteKey } from "../purchase";

/** The pure parts of the agent purchase route (t-2026-10-03-33). */

describe("purchaseQuoteKey", () => {
  const base = { items: [{ variant_id: "v1", quantity: 1 }], email: "Agent@Example.com" };

  it("is the same for the same purchase written differently", () => {
    const a = purchaseQuoteKey("ten_1", { ...base, items: [{ variant_id: "v2", quantity: 1 }, { variant_id: "v1", quantity: 2 }] });
    const b = purchaseQuoteKey("ten_1", {
      email: "agent@example.com",
      items: [{ variant_id: "v1", quantity: 1 }, { variant_id: "v2", quantity: 1 }, { variant_id: "v1", quantity: 1 }],
    });
    expect(a).toBe(b);
  });

  it("differs per shop, per quantity, per address and per shipping option", () => {
    const key = purchaseQuoteKey("ten_1", base);
    expect(purchaseQuoteKey("ten_2", base)).not.toBe(key);
    expect(purchaseQuoteKey("ten_1", { ...base, items: [{ variant_id: "v1", quantity: 2 }] })).not.toBe(key);
    expect(purchaseQuoteKey("ten_1", { ...base, shipping_address: { city: "Berlin" } })).not.toBe(key);
    expect(purchaseQuoteKey("ten_1", { ...base, shipping_option_id: "so_1" })).not.toBe(key);
  });
});

describe("pickShippingOption", () => {
  const options = [
    { id: "so_express", amount: 20, metadata: null },
    { id: "so_digital", amount: 0, metadata: { digital_delivery: true } },
    { id: "so_standard", amount: 6, metadata: null },
    { id: "so_calculated", amount: null, metadata: null },
    { id: "so_out", amount: 1, insufficient_inventory: true },
  ];

  it("posts a parcel with the cheapest priced option that is not digital delivery", () => {
    expect(pickShippingOption(options, { needsShipping: true }).option?.id).toBe("so_standard");
  });

  it("gives a course whose product keeps a profile the digital delivery option", () => {
    expect(pickShippingOption(options, { needsShipping: false }).option?.id).toBe("so_digital");
  });

  it("takes the option the agent named, if it is priced", () => {
    expect(pickShippingOption(options, { needsShipping: true, requested: "so_express" }).option?.id).toBe("so_express");
    expect(pickShippingOption(options, { needsShipping: true, requested: "so_calculated" }).error).toBe(
      "shipping_option_not_available",
    );
    expect(pickShippingOption(options, { needsShipping: true, requested: "so_missing" }).error).toBe(
      "shipping_option_not_available",
    );
  });

  it("says when nothing can carry the order", () => {
    expect(pickShippingOption([{ id: "so_digital", amount: 0, metadata: { digital_delivery: "true" } }], { needsShipping: true }).error).toBe(
      "no_shipping_option",
    );
    expect(pickShippingOption([], { needsShipping: false }).error).toBe("no_shipping_option");
  });
});

describe("createKeyedMutex", () => {
  it("runs work on one key one at a time, in arrival order, and frees the key after a failure", async () => {
    const run = createKeyedMutex();
    const log: string[] = [];
    const step = (name: string, ms: number) => async () => {
      log.push(`${name}:start`);
      await new Promise((resolve) => setTimeout(resolve, ms));
      log.push(`${name}:end`);
      return name;
    };
    const failing = run(["k"], async () => {
      log.push("fail:start");
      throw new Error("boom");
    });
    const first = run(["k"], step("a", 20));
    const second = run(["k", "other"], step("b", 1));
    await expect(failing).rejects.toThrow("boom");
    await expect(Promise.all([first, second])).resolves.toEqual(["a", "b"]);
    expect(log).toEqual(["fail:start", "a:start", "a:end", "b:start", "b:end"]);
  });

  it("lets different keys run side by side", async () => {
    const run = createKeyedMutex();
    const log: string[] = [];
    await Promise.all([
      run(["x"], async () => {
        log.push("x:start");
        await new Promise((resolve) => setTimeout(resolve, 20));
        log.push("x:end");
      }),
      run(["y"], async () => {
        log.push("y:start");
        log.push("y:end");
      }),
    ]);
    expect(log.indexOf("y:end")).toBeLessThan(log.indexOf("x:end"));
  });
});
