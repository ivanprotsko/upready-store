import { WB_READ_ENDPOINTS } from "../../wb/endpoints";
import { MARKETPLACE_WRITE_OP_CLASSES } from "../../marketplace-write/types";
import {
  validateWbWriteRegistry,
  WB_MARKETPLACE,
  WB_WRITE_ENDPOINTS,
  WB_WRITE_HOST_SUFFIX,
} from "../write-endpoints";
import { z } from "zod";
import type { MarketplaceWriteEndpoint } from "../../marketplace-write/types";

/**
 * The registry half of the invariant (w20-wb-write-core): what may be
 * expressed at all, and the line between the read registry and this one.
 */

const entry = (overrides: Partial<MarketplaceWriteEndpoint> = {}): MarketplaceWriteEndpoint => ({
  id: "wb.test.entry",
  marketplace: WB_MARKETPLACE,
  method: "PUT",
  host: "marketplace-api.wildberries.ru",
  path: "/api/v3/test",
  opClass: "stocks",
  docUrl: "https://dev.wildberries.ru/en/docs/openapi/item-management",
  summary: "Test",
  bodySchema: z.object({}),
  ...overrides,
});

describe("the WB write registry", () => {
  it("holds only write verbs, each with a doc page, a class and a body schema", () => {
    expect(WB_WRITE_ENDPOINTS.length).toBeGreaterThan(0);

    for (const endpoint of WB_WRITE_ENDPOINTS) {
      expect(["PUT", "POST", "PATCH", "DELETE"]).toContain(endpoint.method);
      expect(endpoint.docUrl).toMatch(/^https:\/\/dev\.wildberries\.ru\//);
      expect(MARKETPLACE_WRITE_OP_CLASSES).toContain(endpoint.opClass);
      expect(endpoint.host.endsWith(WB_WRITE_HOST_SUFFIX)).toBe(true);
      expect(typeof endpoint.bodySchema.safeParse).toBe("function");
      expect(endpoint.summary.length).toBeGreaterThan(0);
    }
  });

  it("shares no (method, host, path) with the read registry of w01", () => {
    const reads = new Set(
      WB_READ_ENDPOINTS.map((read) => `${read.method} ${read.host}${read.path}`),
    );
    const collisions = WB_WRITE_ENDPOINTS.filter((write) =>
      reads.has(`${write.method} ${write.host}${write.path}`),
    ).map((write) => write.id);

    expect(collisions).toEqual([]);
  });

  it("registers the WB paths whose verb is the only difference between a read and a write", () => {
    // /api/v3/stocks/{warehouseId} is a read with POST (w01) and an update
    // with PUT. Both are registered, in different modules, deliberately.
    const stocksRead = WB_READ_ENDPOINTS.find((read) => read.id === "marketplace.stocks");
    const stocksWrite = WB_WRITE_ENDPOINTS.find((write) => write.id === "wb.stocks.update");

    expect(stocksRead?.method).toBe("POST");
    expect(stocksWrite?.method).toBe("PUT");
    expect(stocksRead?.path).toBe(stocksWrite?.path);
  });

  it("accepts the shipped registry", () => {
    expect(() => validateWbWriteRegistry()).not.toThrow();
  });

  it("refuses a read verb", () => {
    expect(() => validateWbWriteRegistry([entry({ method: "GET" as never })])).toThrow(
      /Only PUT, POST, PATCH, DELETE/,
    );
  });

  it("refuses an entry with no documentation page", () => {
    expect(() => validateWbWriteRegistry([entry({ docUrl: "" })])).toThrow(/cites no documentation/);
  });

  it("refuses an unknown operation class", () => {
    expect(() => validateWbWriteRegistry([entry({ opClass: "everything" as never })])).toThrow(
      /nobody can consent to/,
    );
  });

  it("refuses a duplicate id", () => {
    expect(() => validateWbWriteRegistry([entry(), entry()])).toThrow(/Duplicate/);
  });

  it("refuses a host outside Wildberries", () => {
    expect(() => validateWbWriteRegistry([entry({ host: "api.example.com" })])).toThrow(
      /not a \*\.wildberries\.ru host/,
    );
  });

  it("refuses an entry with no body schema", () => {
    expect(() => validateWbWriteRegistry([entry({ bodySchema: undefined as never })])).toThrow(
      /no usable bodySchema/,
    );
  });
});
