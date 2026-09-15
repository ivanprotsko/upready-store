import {
  grantCoversPath,
  inspectCredentials,
  readOnlyWarning,
  writePathsGrantedBy,
} from "../credentials";
import { resetRateLimiter } from "../transport";

/**
 * `readOnly` is a MEASUREMENT, never a memory (w11-ozon-readonly-client).
 *
 * Ozon's key is an opaque string: unlike a Wildberries JWT there is no bit to
 * read offline. The only documented way to learn what a key may do is to ask
 * Ozon — `POST /v1/roles` answers `{ expires_at, roles: [{ name, methods }] }`.
 * So these cases pin three things:
 *
 *   - a key whose granted methods cover a known mutation is NOT read-only;
 *   - a key Ozon did not answer for is `"unknown"`, never `true`;
 *   - a granted entry is a PREFIX, because Ozon's own example answer grants
 *     `"/v1/posting"`, which is not a method path at all.
 */

const CREDENTIALS = { clientId: "123456", apiKey: "b1f7f0e4-9b0a-4f6d-9d0e-0f1a2b3c4d5e" };

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  text: async () => JSON.stringify(body),
});

let fetchSpy: jest.Mock;

beforeEach(() => {
  fetchSpy = jest.fn(async () => okResponse({}));
  (globalThis as unknown as { fetch: unknown }).fetch = fetchSpy;
  resetRateLimiter();
});

describe("a granted method is a prefix, not an exact path", () => {
  it("covers everything under it", () => {
    // Ozon's own example: { "name": "Posting FBS", "methods": ["/v1/posting"] }.
    expect(grantCoversPath("/v1/posting", "/v1/posting/fbs/split")).toBe(true);
    expect(grantCoversPath("/v1/posting/", "/v1/posting/fbs/split")).toBe(true);
    expect(grantCoversPath("/v3/product/import", "/v3/product/import")).toBe(true);
  });

  it("does not cover a sibling whose name merely starts the same way", () => {
    expect(grantCoversPath("/v1/product/info", "/v1/product/info-extra/update")).toBe(false);
    expect(grantCoversPath("/v1/review/list", "/v1/review/comment/create")).toBe(false);
    expect(grantCoversPath("", "/v3/product/import")).toBe(false);
  });

  it("names which mutations a role list grants", () => {
    expect(
      writePathsGrantedBy([{ name: "Admin", methods: ["/v1/review/comment/create"] }]),
    ).toEqual(["/v1/review/comment/create"]);
    expect(writePathsGrantedBy([{ name: "Read", methods: ["/v3/product/list"] }])).toEqual([]);
  });
});

describe("inspectCredentials asks Ozon and reports what it answered", () => {
  it("is read-only when no granted method covers a mutation", async () => {
    fetchSpy.mockResolvedValueOnce(
      okResponse({
        expires_at: "2026-12-16T09:54:23.296Z",
        roles: [{ name: "Read only", methods: ["/v3/product/list", "/v1/roles"] }],
      }),
    );

    const facts = await inspectCredentials(CREDENTIALS, { logger: { info: jest.fn(), warn: jest.fn() } });

    expect(facts.readOnly).toBe(true);
    expect(facts.writeMethods).toEqual([]);
    expect(facts.expiresAt).toBe("2026-12-16T09:54:23.296Z");
    expect(facts.expired).toBe(false);
    expect(facts.readOnlySource).toContain("/v1/roles");
    expect(readOnlyWarning(facts)).toBeNull();
  });

  it("is not read-only when one does, and names it", async () => {
    fetchSpy.mockResolvedValueOnce(
      okResponse({
        expires_at: "2026-12-16T09:54:23.296Z",
        roles: [
          { name: "Admin", methods: ["/v3/product/list", "/v2/products/stocks"] },
          { name: "Posting FBS", methods: ["/v1/posting"] },
        ],
      }),
    );

    const facts = await inspectCredentials(CREDENTIALS, { logger: { info: jest.fn(), warn: jest.fn() } });

    expect(facts.readOnly).toBe(false);
    expect(facts.writeMethods).toContain("/v2/products/stocks");
    // The prefix grant reaches the FBS actions, which an exact match would miss.
    expect(facts.writeMethods).toContain("/v1/posting/fbs/split");
    expect(readOnlyWarning(facts)).toMatch(/даёт права на запись/);
  });

  it(
    "is unknown, never true, when Ozon did not answer",
    async () => {
      fetchSpy.mockRejectedValue(new Error("fetch failed"));

      const facts = await inspectCredentials(CREDENTIALS, {
        logger: { info: jest.fn(), warn: jest.fn() },
      });

      expect(facts.readOnly).toBe("unknown");
      expect(facts.error).toContain("POST /v1/roles");
      expect(readOnlyWarning(facts)).toMatch(/не удалось выяснить/);
      // A transport failure is retried three times with 2 s and 4 s between
      // them, so this case really does take about six seconds. The timeout is
      // raised rather than the retries mocked away: the six seconds ARE the
      // behaviour, and a test that hid them would stop describing the client.
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    },
    15_000,
  );

  it("is unknown when the answer carries no roles array", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ expires_at: "2026-12-16T09:54:23.296Z" }));

    const facts = await inspectCredentials(CREDENTIALS, { logger: { info: jest.fn(), warn: jest.fn() } });

    // An empty list of methods is missing data, not an absence of rights
    // (rule 20a: zero is not empty).
    expect(facts.readOnly).toBe("unknown");
    expect(facts.expiresAt).toBe("2026-12-16T09:54:23.296Z");
  });

  it("asks nothing and opens no socket when there are no credentials", async () => {
    const facts = await inspectCredentials(null);

    expect(fetchSpy).toHaveBeenCalledTimes(0);
    expect(facts.set).toBe(false);
    expect(facts.readOnly).toBe("unknown");
    expect(facts.last4).toBeNull();
  });

  it("never carries the key into its own answer", async () => {
    fetchSpy.mockResolvedValueOnce(
      okResponse({ expires_at: null, roles: [{ name: "Read only", methods: ["/v1/roles"] }] }),
    );

    const facts = await inspectCredentials(CREDENTIALS, { logger: { info: jest.fn(), warn: jest.fn() } });

    expect(JSON.stringify(facts)).not.toContain(CREDENTIALS.apiKey);
    expect(facts.last4).toBe(CREDENTIALS.apiKey.slice(-4));
  });
});
