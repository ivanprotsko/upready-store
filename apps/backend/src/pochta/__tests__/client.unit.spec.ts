import {
  forgetPochtaDirectory,
  listDeliveryPoints,
  otpravkaTariff,
  probePochta,
  publicTariff,
  PochtaError,
  type PochtaCredentials,
} from "../client";

/**
 * The Russian Post client against a scripted `fetch` (46df-pochta). The shapes
 * below are the ones measured on 2026-09-29: `findAll` answers a bare array,
 * the public calculator answers `paynds` in kopecks and `delivery.{min,max}`,
 * a route it does not serve is HTTP 400 with an `errors` list.
 */

const TOKEN_ONLY: PochtaCredentials = { token: "test-token", user_key: null };
const WITH_USER: PochtaCredentials = { token: "test-token-2", user_key: "dXNlcjpwYXNz" };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Call = { url: string; init: RequestInit };

const scriptedFetch = (script: Array<() => Response>) => {
  const calls: Call[] = [];
  let index = 0;
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = script[Math.min(index, script.length - 1)];
    index += 1;
    return next();
  }) as unknown as typeof fetch;
  return { impl, calls };
};

const PPVZ = {
  "delivery-point-index": "980063",
  "type-post-office": "PPVZ",
  "brand-name": "Почта Еком",
  address: { index: "980063", place: "г. Москва", region: "г. Москва", street: "пр-кт Ленинский", house: "148" },
  latitude: "55.655168",
  longitude: "37.492949",
  "work-time": ["пн, открыто: 10:00 - 20:00"],
  "weight-limit": 31500,
  closed: false,
  "temporary-closed": false,
};
const HUB = { "delivery-point-index": "140961", address: { place: "д. Вешки" }, latitude: "55.9", longitude: "37.6" };

beforeEach(() => forgetPochtaDirectory());

describe("listDeliveryPoints", () => {
  it("sends the token as AccessToken and never the user key", async () => {
    const { impl, calls } = scriptedFetch([() => json(200, [PPVZ, HUB])]);
    const points = await listDeliveryPoints(WITH_USER, { fetchImpl: impl, retryDelaysMs: [] });
    expect(points).toHaveLength(2);
    expect(calls[0].url).toBe("https://otpravka-api.pochta.ru/1.0/delivery-point/findAll");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("AccessToken test-token-2");
    expect(headers["X-User-Authorization"]).toBeUndefined();
  });

  it("caches the directory per token for six hours", async () => {
    let now = 1_000;
    const { impl, calls } = scriptedFetch([() => json(200, [PPVZ])]);
    await listDeliveryPoints(TOKEN_ONLY, { fetchImpl: impl, now: () => now });
    now += 5 * 60 * 60 * 1000;
    await listDeliveryPoints(TOKEN_ONLY, { fetchImpl: impl, now: () => now });
    expect(calls).toHaveLength(1);
    now += 2 * 60 * 60 * 1000;
    await listDeliveryPoints(TOKEN_ONLY, { fetchImpl: impl, now: () => now });
    expect(calls).toHaveLength(2);
  });

  it("retries a 5xx and never a 401", async () => {
    const flaky = scriptedFetch([() => json(502, {}), () => json(200, [PPVZ])]);
    await expect(listDeliveryPoints(TOKEN_ONLY, { fetchImpl: flaky.impl, retryDelaysMs: [0] })).resolves.toHaveLength(1);
    expect(flaky.calls).toHaveLength(2);

    forgetPochtaDirectory();
    const rejected = scriptedFetch([() => json(401, { code: "1003", desc: "Authorization is Empty." })]);
    await expect(
      listDeliveryPoints(TOKEN_ONLY, { fetchImpl: rejected.impl, retryDelaysMs: [0, 0] }),
    ).rejects.toMatchObject({ status: 401, code: "1003" });
    expect(rejected.calls).toHaveLength(1);
  });
});

describe("publicTariff", () => {
  it("turns paynds kopecks into rubles and keeps the term", async () => {
    const { impl, calls } = scriptedFetch([() => json(200, { paynds: 44800, delivery: { min: 2, max: 3 } })]);
    const quote = await publicTariff({ from_index: "101000", to_index: "190000", weight_g: 1000 }, { fetchImpl: impl });
    expect(quote).toEqual({ amount: 448, period_min: 2, period_max: 3 });
    expect(calls[0].url).toContain("/calculate/tariff/delivery?json&object=4030&from=101000&to=190000&weight=1000");
  });

  it("carries the carrier's own sentence when a route is not served", async () => {
    const { impl } = scriptedFetch([
      () => json(400, { errors: [{ msg: "Доставка посылка в 980063 \"МОСКВА ППВЗ\" не осуществляется", code: 1360 }] }),
    ]);
    const failure = publicTariff({ from_index: "101000", to_index: "980063", weight_g: 1000 }, { fetchImpl: impl });
    await expect(failure).rejects.toBeInstanceOf(PochtaError);
    await expect(
      publicTariff({ from_index: "101000", to_index: "980063", weight_g: 1000 }, { fetchImpl: impl }),
    ).rejects.toThrow(/не осуществляется/);
  });
});

describe("otpravkaTariff", () => {
  it("is not called at all without a user key", async () => {
    const { impl, calls } = scriptedFetch([() => json(200, {})]);
    await expect(
      otpravkaTariff(TOKEN_ONLY, { from_index: "101000", to_index: "980063", weight_g: 500, kind: "pvz" }, { fetchImpl: impl }),
    ).rejects.toBeInstanceOf(PochtaError);
    expect(calls).toHaveLength(0);
  });

  it("asks ECOM for a pickup point with both headers and adds the VAT", async () => {
    const { impl, calls } = scriptedFetch([
      () => json(200, { "total-rate": 20000, "total-vat": 4000, "delivery-time": { "min-days": 2, "max-days": 4 } }),
    ]);
    const quote = await otpravkaTariff(
      WITH_USER,
      { from_index: "101000", to_index: "980063", weight_g: 500, kind: "pvz" },
      { fetchImpl: impl },
    );
    expect(quote).toEqual({ amount: 240, period_min: 2, period_max: 4 });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["X-User-Authorization"]).toBe("Basic dXNlcjpwYXNz");
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      "mail-type": "ECOM",
      "delivery-point-index": "980063",
      mass: 500,
    });
  });
});

describe("probePochta", () => {
  it("counts only the buyer points and leaves the user key unasked when there is none", async () => {
    const { impl } = scriptedFetch([() => json(200, [PPVZ, HUB])]);
    await expect(probePochta(TOKEN_ONLY, { fetchImpl: impl })).resolves.toEqual({
      ok: true,
      status: 200,
      points: 1,
      user_key: null,
      error: null,
    });
  });

  it("tells a rejected token from one the carrier never answered about", async () => {
    const rejected = scriptedFetch([() => json(401, {})]);
    const answer = await probePochta(TOKEN_ONLY, { fetchImpl: rejected.impl, retryDelaysMs: [] });
    expect(answer).toMatchObject({ ok: false, status: 401, error: "Почта России не приняла токен." });

    forgetPochtaDirectory();
    const silent = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const unreachable = await probePochta(TOKEN_ONLY, { fetchImpl: silent, retryDelaysMs: [] });
    expect(unreachable.ok).toBe(false);
    expect(unreachable.status).toBeNull();
  });

  it("reports the user key's own verdict", async () => {
    const { impl } = scriptedFetch([() => json(200, [PPVZ]), () => json(401, { code: "1011" })]);
    const answer = await probePochta(WITH_USER, { fetchImpl: impl, retryDelaysMs: [] });
    expect(answer.ok).toBe(true);
    expect(answer.user_key).toEqual({ ok: false, status: 401, error: "Почта России не приняла ключ пользователя." });
  });
});
