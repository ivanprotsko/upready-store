import { probeApishipToken } from "../client";

/**
 * The ApiShip probe, against a fake `fetch` (p01-settings-integrations-restructure).
 *
 * The one fact this file exists to pin is the HEADER. ApiShip takes the token
 * BARE, and the `Bearer ` form a reader would guess is the one it rejects —
 * measured 2026-09-16 with the real token: `Authorization: <token>` answered
 * HTTP 200, `Authorization: Bearer <token>` answered HTTP 401. A regression
 * there would look exactly like «the owner typed a bad token», which is the
 * most expensive kind of wrong answer this page can give.
 *
 * The rest is the three-state rule (20a): accepted, rejected, and «ApiShip did
 * not answer», which must never collapse into the rejected one.
 */
describe("apiship: the token probe", () => {
  const response = (status: number, body: unknown) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as unknown as Response;

  it("sends the token bare, with no Bearer in front of it", async () => {
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string> });
      return response(200, { rows: [{ id: "39452", providerKey: "cdek" }] });
    }) as unknown as typeof fetch;

    const probe = await probeApishipToken("tok-123", {
      baseUrl: "https://api.example.test/v1",
      fetchImpl,
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("https://api.example.test/v1/connections");
    expect(seen[0].headers.Authorization).toBe("tok-123");
    expect(probe).toEqual({ ok: true, status: 200, connections: 1, error: null });
  });

  it("reports a rejected token as rejected, with the status ApiShip answered", async () => {
    const fetchImpl = (async () => response(401, {})) as unknown as typeof fetch;
    const probe = await probeApishipToken("tok-bad", { fetchImpl });
    expect(probe.ok).toBe(false);
    expect(probe.status).toBe(401);
    expect(probe.connections).toBeNull();
    expect(probe.error).toBe("ApiShip не принял токен.");
  });

  it("reports a transport failure as its own state, not as a bad token", async () => {
    const fetchImpl = (async () => {
      throw new Error("getaddrinfo ENOTFOUND api.apiship.ru");
    }) as unknown as typeof fetch;

    const probe = await probeApishipToken("tok-123", { fetchImpl });

    // `status: null` is the whole point: nobody answered, so no verdict about
    // the token was given and none is invented (rule 20a).
    expect(probe.ok).toBe(false);
    expect(probe.status).toBeNull();
    expect(probe.error).toContain("ENOTFOUND");
  });

  it("counts the carriers when ApiShip answers a list, and says «unknown» when it does not", async () => {
    const withRows = (async () =>
      response(200, { rows: [{}, {}, {}] })) as unknown as typeof fetch;
    expect((await probeApishipToken("t", { fetchImpl: withRows })).connections).toBe(3);

    // A body of another shape still means the token was ACCEPTED; the count is
    // simply not known, and `null` says that rather than a zero that would read
    // as «no carriers connected».
    const withoutRows = (async () => response(200, { ok: true })) as unknown as typeof fetch;
    const probe = await probeApishipToken("t", { fetchImpl: withoutRows });
    expect(probe.ok).toBe(true);
    expect(probe.connections).toBeNull();
  });
});
