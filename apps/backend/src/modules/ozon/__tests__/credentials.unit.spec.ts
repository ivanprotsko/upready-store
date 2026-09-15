import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
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

describe("asking Ozon is journalled, because the journal is the evidence", () => {
  it("writes one ozon_api_call row for the /v1/roles it sent", async () => {
    fetchSpy.mockResolvedValueOnce(
      okResponse({ expires_at: null, roles: [{ name: "Read only", methods: ["/v1/roles"] }] }),
    );
    const journal = jest.fn();

    await inspectCredentials(CREDENTIALS, {
      tenantId: "ten_1",
      journal,
      logger: { info: jest.fn(), warn: jest.fn() },
    });

    expect(journal).toHaveBeenCalledTimes(1);
    expect(journal.mock.calls[0][0]).toMatchObject({
      tenant_id: "ten_1",
      endpoint_id: "access.roles",
      path: "/v1/roles",
      is_fixture: false,
      status: 200,
    });
  });

  /**
   * The class, not the instance (rule 20). Measured on the stand first:
   * `ozon-seed-key.ts` and the status route both asked Ozon without passing a
   * journal, so two real requests left the process and
   * `select … from ozon_api_call` answered "nothing did". A table that lies by
   * omission is worse than no table (rule 20a), so every call site is checked
   * here rather than the three that existed on the day.
   */
  it("every inspectCredentials call site in src passes a journal", () => {
    const SRC = path.resolve(__dirname, "../../..");
    const walk = (dir: string, found: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "__tests__") {
          continue;
        }
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full, found);
        } else if (full.endsWith(".ts")) {
          found.push(full);
        }
      }
      return found;
    };

    const files = walk(SRC);
    expect(files.length).toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      let from = 0;
      for (;;) {
        const at = source.indexOf("inspectCredentials(", from);
        if (at < 0) {
          break;
        }
        from = at + 1;
        // The call's own argument list: from the open paren to the matching
        // close, so a `journal:` belonging to the NEXT statement cannot vouch
        // for this one.
        let depth = 0;
        let end = source.indexOf("(", at);
        for (let i = end; i < source.length; i += 1) {
          if (source[i] === "(") depth += 1;
          if (source[i] === ")") {
            depth -= 1;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        const call = source.slice(at, end + 1);
        // A call with no credentials at all opens no socket, so it needs none.
        if (!call.includes("journal") && !/inspectCredentials\(\s*null/.test(call)) {
          offenders.push(path.relative(SRC, file));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
