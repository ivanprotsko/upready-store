import {
  citiesMatching,
  fromDeliveryPoint,
  isBuyerPoint,
  placeName,
  pointsInCity,
  pointsNear,
  requestedPoint,
  withoutFarOutliers,
} from "../method";
import { referenceIndexForRegion } from "../regions";
import { forgetPochtaQuotes, quoteToAddress, quoteToPoint } from "../quote";
import { forgetPochtaDirectory } from "../client";

/**
 * Directory search and tariff mapping for Russian Post (46df-pochta).
 */

const raw = (index: string, place: string, region: string, lat: number, lng: number) => ({
  "delivery-point-index": index,
  "type-post-office": "PPVZ",
  "brand-name": "Почта Еком",
  address: { index, place, region, street: "ул. Тестовая", house: "1" },
  latitude: String(lat),
  longitude: String(lng),
  "work-time": ["пн, открыто: 09:00 - 21:00"],
  "weight-limit": 10000,
});

const POINTS = [
  raw("980001", "г. Москва", "г. Москва", 55.75, 37.62),
  raw("980002", "г. Москва", "г. Москва", 55.76, 37.6),
  raw("980003", "г. Клин", "обл. Московская", 56.31, 36.75),
  raw("980004", "г. Клинцы", "обл. Брянская", 52.75, 32.25),
].map(fromDeliveryPoint);

describe("the directory as a buyer sees it", () => {
  it("keeps «Почта Еком» points and drops hubs and closed points", () => {
    expect(isBuyerPoint(raw("980001", "г. Москва", "г. Москва", 55.7, 37.6))).toBe(true);
    expect(isBuyerPoint({ "delivery-point-index": "140961", latitude: "55.9", longitude: "37.6" })).toBe(false);
    expect(isBuyerPoint({ ...raw("980005", "г. Москва", "г. Москва", 55.7, 37.6), "temporary-closed": true })).toBe(false);
    expect(isBuyerPoint({ ...raw("980006", "г. Москва", "г. Москва", 0, 0) })).toBe(false);
  });

  it("maps a directory row to the storefront point", () => {
    expect(POINTS[0]).toMatchObject({
      index: "980001",
      kind: "pvz",
      address: "ул. Тестовая, 1",
      city: "Москва",
      region: "г. Москва",
      lat: 55.75,
      lng: 37.62,
      weight_limit_g: 10000,
    });
  });

  it("strips the settlement prefix", () => {
    expect(placeName("г. Москва")).toBe("Москва");
    expect(placeName("пгт. Новоивановское")).toBe("Новоивановское");
    expect(placeName("с. Пады")).toBe("Пады");
  });

  it("suggests cities that start with the text first, biggest first", () => {
    const cities = citiesMatching(POINTS, "кли");
    expect(cities.map((city) => city.name)).toEqual(["Клин", "Клинцы"]);
    expect(citiesMatching(POINTS, "мос")[0]).toMatchObject({ name: "Москва", points: 2 });
    expect(citiesMatching(POINTS, "м")).toEqual([]);
  });

  it("finds a city's points by name and region, and points near a centre", () => {
    expect(pointsInCity(POINTS, "Клин").map((p) => p.index)).toEqual(["980003"]);
    expect(pointsInCity(POINTS, "г. Москва", "г. Москва")).toHaveLength(2);
    expect(pointsInCity(POINTS, "Москва", "обл. Московская")).toHaveLength(0);
    expect(pointsNear(POINTS, { lat: 55.75, lng: 37.62 }, 5).map((p) => p.index)).toEqual(["980001", "980002"]);
  });

  it("drops a point whose coordinates sit far from its own city", () => {
    const moscow = [
      ...POINTS.slice(0, 2),
      fromDeliveryPoint(raw("980007", "г. Москва", "г. Москва", 55.8, 37.5)),
      fromDeliveryPoint(raw("980008", "г. Москва", "г. Москва", 55.2, 30.2)),
    ];
    expect(withoutFarOutliers(moscow).map((p) => p.index)).toEqual(["980001", "980002", "980007"]);
    expect(withoutFarOutliers(moscow.slice(2))).toHaveLength(2);
  });

  it("accepts only a six-digit index from the client", () => {
    expect(requestedPoint({ pochta_point_index: "980063" })).toEqual({ index: "980063", kind: "pvz" });
    expect(requestedPoint({ pochta_point_index: "98006" })).toBeNull();
    expect(requestedPoint({ pochta_point_index: "101000", pochta_point_kind: "office" })).toEqual({
      index: "101000",
      kind: "office",
    });
    expect(requestedPoint({})).toBeNull();
  });
});

describe("the region reference index", () => {
  it("matches the directory's and the address form's spellings", () => {
    expect(referenceIndexForRegion("г. Москва")).toBe("101000");
    expect(referenceIndexForRegion("обл. Московская")).toBe("143401");
    expect(referenceIndexForRegion("Чувашия Чувашская Республика -")).toBe("428000");
    expect(referenceIndexForRegion("Республика Татарстан")).toBe("420000");
    expect(referenceIndexForRegion("Нижегородская область")).toBe("603000");
    expect(referenceIndexForRegion("обл. Новгородская")).toBe("173000");
  });

  it("never lets a shorter stem inside a longer one win", () => {
    expect(referenceIndexForRegion("обл. Томская")).toBe("634000");
    expect(referenceIndexForRegion("обл. Костромская")).toBe("156000");
    expect(referenceIndexForRegion("обл. Омская")).toBe("644000");
    expect(referenceIndexForRegion("обл. Сахалинская")).toBeNull();
    expect(referenceIndexForRegion("респ. Саха (Якутия)")).toBe("677000");
  });
});

describe("quoteToPoint", () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  beforeEach(() => {
    forgetPochtaQuotes();
    forgetPochtaDirectory();
  });

  it("prices a «Почта Еком» point at the retail parcel rate to its region, marked an estimate", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return json(200, { paynds: 42600, delivery: { min: 2, max: 2 } });
    }) as unknown as typeof fetch;
    const quote = await quoteToPoint(
      {
        credentials: { token: "t", user_key: null },
        sender_index: "101000",
        point: { index: "980003", kind: "pvz", region: "обл. Московская" },
        weight_g: 1200,
      },
      { fetchImpl },
    );
    expect(quote).toMatchObject({
      amount: 426,
      period_min: 2,
      period_max: 2,
      term_label: "2 дня",
      tariff_source: "public-retail-estimate",
      weight_g: 1200,
    });
    expect(urls[0]).toContain("from=101000&to=143401&weight=1200");
  });

  it("prices a post office at the retail rate to the office itself", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return json(200, { paynds: 39000, delivery: { min: 4, max: 5 } });
    }) as unknown as typeof fetch;
    const quote = await quoteToPoint(
      {
        credentials: { token: "t", user_key: null },
        sender_index: "101000",
        point: { index: "391430", kind: "office", region: null },
        weight_g: 500,
      },
      { fetchImpl },
    );
    expect(quote.tariff_source).toBe("public-retail");
    expect(quote.term_label).toBe("4-5 дней");
    expect(urls[0]).toContain("to=391430");
  });

  it("falls back to the public estimate when the contract tariff fails", async () => {
    const warnings: string[] = [];
    const fetchImpl = (async (url: string) =>
      url.includes("otpravka-api")
        ? json(401, { code: "1011" })
        : json(200, { paynds: 36100, delivery: { min: 1, max: 1 } })) as unknown as typeof fetch;
    const quote = await quoteToPoint(
      {
        credentials: { token: "t", user_key: "a2V5" },
        sender_index: "101000",
        point: { index: "980001", kind: "pvz", region: "г. Москва" },
        weight_g: 1000,
      },
      { fetchImpl, retryDelaysMs: [], logger: { warn: (m) => warnings.push(m) } },
    );
    expect(quote.tariff_source).toBe("public-retail-estimate");
    expect(quote.amount).toBe(361);
    expect(warnings[0]).toMatch(/contract tariff failed/);
  });

  it("refuses to quote without the sender's index or a known region", async () => {
    const fetchImpl = (async () => json(200, { paynds: 1 })) as unknown as typeof fetch;
    await expect(
      quoteToPoint(
        { credentials: { token: "t", user_key: null }, sender_index: "", point: { index: "980001", kind: "pvz", region: "г. Москва" }, weight_g: 1 },
        { fetchImpl },
      ),
    ).rejects.toThrow(/индекс отделения отправителя/);
    await expect(
      quoteToPoint(
        { credentials: { token: "t", user_key: null }, sender_index: "101000", point: { index: "980001", kind: "pvz", region: "Атлантида" }, weight_g: 1 },
        { fetchImpl },
      ),
    ).rejects.toThrow(/опорного индекса/);
  });

  it("prices the method card to the buyer's own postcode, not to a 98xxxx one", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return json(200, { paynds: 44800, delivery: { min: 2, max: 2 } });
    }) as unknown as typeof fetch;
    const own = await quoteToAddress(
      { credentials: { token: "t", user_key: null }, sender_index: "101000", postal_code: "190000", province: "Санкт-Петербург", weight_g: 1000 },
      { fetchImpl },
    );
    expect(own?.tariff_source).toBe("public-retail");
    const virtual = await quoteToAddress(
      { credentials: { token: "t", user_key: null }, sender_index: "101000", postal_code: "980063", province: "Москва", weight_g: 1000 },
      { fetchImpl },
    );
    expect(virtual?.tariff_source).toBe("public-retail-estimate");
    expect(urls[1]).toContain("to=101000");
    expect(
      await quoteToAddress(
        { credentials: { token: "t", user_key: null }, sender_index: "101000", postal_code: "", province: "", weight_g: 1000 },
        { fetchImpl },
      ),
    ).toBeNull();
  });
});
