import { fixtureEndpointIds, fixtureFor, OzonFixtureMissingError } from "../fixtures";
import { OZON_READ_ENDPOINTS, OzonWriteForbiddenError } from "../endpoints";

/**
 * The fixtures are recorded answers, and their only job is to be SHAPED like
 * Ozon's (w11-ozon-readonly-client). These cases pin the two properties that
 * make them safe to accept work on:
 *
 *   - the guard still stands: an unregistered id is refused in fixture mode
 *     exactly as it is on the wire;
 *   - a fixture that is missing is LOUD. A silent `{}` would make an empty
 *     mirror look like an empty cabinet (rule 20a).
 */

describe("the fixtures cover the registry and nothing else", () => {
  it("has one recorded answer per registered endpoint", () => {
    expect(fixtureEndpointIds()).toEqual(OZON_READ_ENDPOINTS.map((item) => item.id).sort());
  });

  it("refuses an unregistered id, as the transport does", () => {
    expect(() => fixtureFor("product.import", {})).toThrow(OzonWriteForbiddenError);
    expect(() => fixtureFor("/v1/review/comment/create", {})).toThrow(OzonWriteForbiddenError);
  });

  it("is loud when a per-card fixture is missing", () => {
    expect(() => fixtureFor("product.info.description", { product_id: 999 })).toThrow(
      OzonFixtureMissingError,
    );
  });
});

describe("the recorded shapes are Ozon's own", () => {
  it("product.list answers result.items with product_id and offer_id", () => {
    const answer = fixtureFor<{ result: { items: Array<{ product_id: number; offer_id: string }> } }>(
      "product.list",
      {},
    );
    expect(answer.result.items.length).toBeGreaterThan(0);
    expect(typeof answer.result.items[0].product_id).toBe("number");
    expect(typeof answer.result.items[0].offer_id).toBe("string");
  });

  it("posting.fbs.list answers postings at the top level, not under result", () => {
    // The v4 response schema is { cursor, has_next, postings } — the `result`
    // wrapper belongs to other methods, and assuming it is how a mirror ends
    // up silently empty.
    const answer = fixtureFor<Record<string, unknown>>("posting.fbs.list", {});
    expect(answer).not.toHaveProperty("result");
    expect(Array.isArray(answer.postings)).toBe(true);
  });

  it("a posting product carries price as { amount, currency }", () => {
    const answer = fixtureFor<{ postings: Array<{ products: Array<{ price: unknown }> }> }>(
      "posting.fbs.list",
      {},
    );
    expect(answer.postings[0].products[0].price).toEqual({ amount: "1290.00", currency: "RUB" });
  });

  it("product.stocks answers one line per (sku, type)", () => {
    const answer = fixtureFor<{ items: Array<{ stocks: Array<{ sku: number; type: string }> }> }>(
      "product.stocks",
      {},
    );
    const types = answer.items.flatMap((item) => item.stocks.map((line) => line.type));
    expect(new Set(types)).toEqual(new Set(["fbs", "fbo"]));
  });

  it("access.roles answers expires_at and roles[].methods", () => {
    const answer = fixtureFor<{ expires_at: string; roles: Array<{ name: string; methods: string[] }> }>(
      "access.roles",
      {},
    );
    expect(typeof answer.expires_at).toBe("string");
    expect(answer.roles[0].methods.length).toBeGreaterThan(0);
  });

  it("the recorded key grants no mutation, so a fixture run reads as read-only", () => {
    const answer = fixtureFor<{ roles: Array<{ methods: string[] }> }>("access.roles", {});
    const registered = new Set(OZON_READ_ENDPOINTS.map((item) => item.path));
    for (const method of answer.roles.flatMap((role) => role.methods)) {
      expect(registered.has(method)).toBe(true);
    }
  });
});
