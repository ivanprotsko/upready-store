import {
  createRobokassaMethodsCache,
  mergeRobokassaCurrencies,
  parseRobokassaCurrencies,
  ROBOKASSA_CURRENCIES_URL,
  ROBOKASSA_FALLBACK_METHODS,
  sanitizeRobokassaAliases,
} from "../payment-methods";

/**
 * t-2026-10-04-49: the checkout's Robokassa rows come from `GetCurrencies`.
 * The two documents below are the answers Robokassa gave for cherkashino.ru's
 * shop on 2026-10-04, byte for byte apart from the BOM, in Russian and in
 * English. Note `SBPPSR` named «Банковская карта» / «Bank Card»: the reason
 * the storefront labels the methods it knows from its own catalogs.
 */
const LIVE_RU =
  '<?xml version="1.0" encoding="utf-8"?><CurrenciesList xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://merchant.roboxchange.com/WebService/"><Result><Code>0</Code></Result><Groups><Group Code="BankCard" Description="Банковской картой"><Items><Currency Label="BankCardPSR" Alias="BankCard" Name="Банковская карта" /><Currency Label="Card120DaysPSR" Alias="Card120Days" Name="Карта 120 дней без %" /><Currency Label="CardHalvaPSR" Alias="BankCardHalva" Name="Карта Халва" /><Currency Label="SBPPSR" Alias="SBP" Name="Банковская карта" MaxValue="1000000" /></Items></Group></Groups></CurrenciesList>';
const LIVE_EN =
  '<?xml version="1.0" encoding="utf-8"?><CurrenciesList xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://merchant.roboxchange.com/WebService/"><Result><Code>0</Code></Result><Groups><Group Code="BankCard" Description="Bank card"><Items><Currency Label="BankCardPSR" Alias="BankCard" Name="Bank Card" /><Currency Label="Card120DaysPSR" Alias="Card120Days" Name="120 days without % Card" /><Currency Label="CardHalvaPSR" Alias="BankCardHalva" Name="Card Halva" /><Currency Label="SBPPSR" Alias="SBP" Name="Bank Card" MaxValue="1000000" /></Items></Group></Groups></CurrenciesList>';
/** What Robokassa answers for a login it does not know or a shop it has not activated. */
const NOT_FOUND =
  '<?xml version="1.0" encoding="utf-8"?><CurrenciesList xmlns="http://merchant.roboxchange.com/WebService/"><Result><Code>2</Code><Description>Информация о магазине с таким MerchantLogin не найдена или магазин не активирован.</Description></Result></CurrenciesList>';

const respond = (body: string, status = 200) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) });

/** A fetch that answers by `Language`, and counts the calls. */
const robokassa = (answers: { ru?: string | Error; en?: string | Error }) => {
  const calls: string[] = [];
  const fetch = jest.fn((input: string) => {
    calls.push(input);
    const language = new URL(input).searchParams.get("Language") as "ru" | "en";
    const answer = answers[language];
    if (answer instanceof Error) {
      return Promise.reject(answer);
    }
    return respond(answer ?? NOT_FOUND);
  });
  return { fetch, calls };
};

describe("parseRobokassaCurrencies", () => {
  it("reads the live answer: result code 0 and the four methods with their aliases", () => {
    const { code, currencies } = parseRobokassaCurrencies(LIVE_RU);
    expect(code).toBe(0);
    expect(currencies).toEqual([
      { alias: "BankCard", name: "Банковская карта", min: null, max: null },
      { alias: "Card120Days", name: "Карта 120 дней без %", min: null, max: null },
      { alias: "BankCardHalva", name: "Карта Халва", min: null, max: null },
      { alias: "SBP", name: "Банковская карта", min: null, max: 1000000 },
    ]);
  });

  it("reads a refusal as its code with no methods", () => {
    expect(parseRobokassaCurrencies(NOT_FOUND)).toEqual({ code: 2, currencies: [] });
  });

  it("keeps the first of two currencies sharing an alias, decodes entities, and drops a malformed alias", () => {
    const xml =
      '<Result><Code>0</Code></Result><Currency Label="BankCardForeignPSR" Alias="BankCard" Name="Card &amp; more" />' +
      '<Currency Label="BankCardPSR" Alias="BankCard" Name="Second" />' +
      '<Currency Label="Evil" Alias="x&amp;OutSum=1" Name="Evil" />' +
      '<Currency Label="MokkaPNR" Alias="Mokka" Name="&#1052;окка" MinValue="1000" MaxValue="75000" />';
    expect(parseRobokassaCurrencies(xml).currencies).toEqual([
      { alias: "BankCard", name: "Card & more", min: null, max: null },
      { alias: "Mokka", name: "Мокка", min: 1000, max: 75000 },
    ]);
  });
});

describe("mergeRobokassaCurrencies", () => {
  it("puts card and SBP first, keeps Robokassa's order for the rest, and pairs both languages' names", () => {
    const methods = mergeRobokassaCurrencies(
      parseRobokassaCurrencies(LIVE_RU).currencies,
      parseRobokassaCurrencies(LIVE_EN).currencies,
    );
    expect(methods.map((method) => method.alias)).toEqual(["BankCard", "SBP", "Card120Days", "BankCardHalva"]);
    expect(methods[2]).toEqual({
      alias: "Card120Days",
      name_ru: "Карта 120 дней без %",
      name_en: "120 days without % Card",
      min: null,
      max: null,
    });
  });

  it("takes the aliases from the English answer when the Russian one failed", () => {
    const methods = mergeRobokassaCurrencies(null, parseRobokassaCurrencies(LIVE_EN).currencies);
    expect(methods.map((method) => method.alias)).toEqual(["BankCard", "SBP", "Card120Days", "BankCardHalva"]);
    expect(methods.every((method) => method.name_ru === null)).toBe(true);
  });
});

describe("createRobokassaMethodsCache", () => {
  it("asks GetCurrencies in both languages with the shop's login and answers the live list", async () => {
    const { fetch, calls } = robokassa({ ru: LIVE_RU, en: LIVE_EN });
    const cache = createRobokassaMethodsCache({ fetch });

    const result = await cache.methodsFor("SHOP");

    expect(result.source).toBe("live");
    expect(result.methods.map((method) => method.alias)).toEqual(["BankCard", "SBP", "Card120Days", "BankCardHalva"]);
    expect(calls.sort()).toEqual([
      `${ROBOKASSA_CURRENCIES_URL}?MerchantLogin=SHOP&Language=en`,
      `${ROBOKASSA_CURRENCIES_URL}?MerchantLogin=SHOP&Language=ru`,
    ]);
  });

  it("serves a fresh entry from the cache and asks again only after the TTL", async () => {
    let clock = 0;
    const { fetch } = robokassa({ ru: LIVE_RU, en: LIVE_EN });
    const cache = createRobokassaMethodsCache({ fetch, now: () => clock, liveTtlMs: 1_000 });

    await cache.methodsFor("SHOP");
    clock = 999;
    await cache.methodsFor("SHOP");
    expect(fetch).toHaveBeenCalledTimes(2);

    clock = 1_000;
    await cache.methodsFor("SHOP");
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("keeps one entry per login", async () => {
    const { fetch } = robokassa({ ru: LIVE_RU, en: LIVE_EN });
    const cache = createRobokassaMethodsCache({ fetch });
    await cache.methodsFor("ONE");
    await cache.methodsFor("TWO");
    await cache.methodsFor("ONE");
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("shares one request between concurrent callers", async () => {
    const { fetch } = robokassa({ ru: LIVE_RU, en: LIVE_EN });
    const cache = createRobokassaMethodsCache({ fetch });
    const [a, b] = await Promise.all([cache.methodsFor("SHOP"), cache.methodsFor("SHOP")]);
    expect(a).toEqual(b);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("falls back to card and SBP when Robokassa cannot be reached, and holds that for the failure TTL", async () => {
    let clock = 0;
    const warn = jest.fn();
    const { fetch } = robokassa({ ru: new Error("ETIMEDOUT"), en: new Error("ETIMEDOUT") });
    const cache = createRobokassaMethodsCache({ fetch, now: () => clock, failureTtlMs: 60_000 });

    const first = await cache.methodsFor("SHOP", { warn });
    expect(first).toEqual({ methods: [...ROBOKASSA_FALLBACK_METHODS], source: "fallback" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ETIMEDOUT"));

    clock = 59_999;
    expect((await cache.methodsFor("SHOP")).source).toBe("fallback");
    expect(fetch).toHaveBeenCalledTimes(2);

    clock = 60_000;
    await cache.methodsFor("SHOP");
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("falls back on a refusal (code 2) and on an HTTP error alike", async () => {
    const refused = createRobokassaMethodsCache({ fetch: robokassa({ ru: NOT_FOUND, en: NOT_FOUND }).fetch });
    expect((await refused.methodsFor("UNKNOWN")).source).toBe("fallback");

    const broken = createRobokassaMethodsCache({ fetch: jest.fn(() => respond("<html>502</html>", 502)) });
    const result = await broken.methodsFor("SHOP");
    expect(result.source).toBe("fallback");
    expect(result.methods.map((method) => method.alias)).toEqual(["BankCard", "SBP"]);
  });

  it("keeps serving the last live list while a refresh fails, marked stale", async () => {
    let clock = 0;
    let down = false;
    const fetch = jest.fn((input: string) => {
      if (down) {
        return Promise.reject(new Error("ECONNRESET"));
      }
      return respond(new URL(input).searchParams.get("Language") === "ru" ? LIVE_RU : LIVE_EN);
    });
    const cache = createRobokassaMethodsCache({ fetch, now: () => clock, liveTtlMs: 1_000, failureTtlMs: 500 });

    await cache.methodsFor("SHOP");
    down = true;
    clock = 1_000;
    const stale = await cache.methodsFor("SHOP");
    expect(stale.source).toBe("stale");
    expect(stale.methods.map((method) => method.alias)).toEqual(["BankCard", "SBP", "Card120Days", "BankCardHalva"]);

    clock = 1_499;
    expect((await cache.methodsFor("SHOP")).source).toBe("stale");

    down = false;
    clock = 1_500;
    expect((await cache.methodsFor("SHOP")).source).toBe("live");
  });

  it("answers the fallback for an empty login without asking Robokassa", async () => {
    const fetch = jest.fn();
    const cache = createRobokassaMethodsCache({ fetch });
    expect((await cache.methodsFor("  ")).source).toBe("fallback");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never hands out the shared fallback object itself", async () => {
    const cache = createRobokassaMethodsCache({ fetch: robokassa({}).fetch });
    const result = await cache.methodsFor("SHOP");
    result.methods[0].alias = "Mutated";
    expect(ROBOKASSA_FALLBACK_METHODS[0].alias).toBe("BankCard");
  });
});

describe("sanitizeRobokassaAliases", () => {
  it("keeps well-formed aliases once each, in order, and drops everything else", () => {
    expect(
      sanitizeRobokassaAliases(["BankCard", "SBP", "BankCard", "x&OutSum=1", "", 5, null, "Card120Days", "a".repeat(41)]),
    ).toEqual(["BankCard", "SBP", "Card120Days"]);
  });

  it("answers an empty list for anything that is not an array", () => {
    expect(sanitizeRobokassaAliases("BankCard")).toEqual([]);
    expect(sanitizeRobokassaAliases(undefined)).toEqual([]);
  });
});
