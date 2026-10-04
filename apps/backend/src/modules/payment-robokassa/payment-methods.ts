/**
 * Which Robokassa payment methods a shop has switched on (t-2026-10-04-49), so
 * the checkout can offer «Банковская карта», «СБП» and the rest as its own
 * rows and open Robokassa straight on the one the buyer picked.
 *
 * The source is Robokassa's public XML interface `GetCurrencies`: it takes the
 * shop's `MerchantLogin` and no password, and lists the methods the merchant's
 * cabinet has enabled. Each `Currency` element carries a `Label` (`SBPPSR`), an
 * `Alias` (`SBP`) and a display `Name`. The payment page takes the ALIAS: on
 * 2026-10-04 `IncCurrLabel=SBP` reached the page's own context as
 * `incCurrLabel: "SBP"`, while `IncCurrLabel=SBPPSR` reached it as `null`
 * (probe against Robokassa's documented `robo-demo` shop, see the task
 * report). So the alias is the one value this module hands on.
 *
 * Robokassa's `Name` is not trustworthy as a label either: the same answer
 * names `SBPPSR` «Банковская карта». The storefront labels the methods it knows
 * from its own catalogs and falls back to `name_ru`/`name_en` only for an alias
 * it has never heard of.
 *
 * The answer is cached per login, and a failure never reaches the checkout:
 * a stale list keeps serving while Robokassa is unreachable, and with nothing
 * cached the shop gets {@link ROBOKASSA_FALLBACK_METHODS}, card and SBP.
 */

export type RobokassaPaymentMethod = {
  /** Robokassa's `Alias`, the value `IncCurrLabel` and `Settings.PaymentMethods` take. */
  alias: string;
  name_ru: string | null;
  name_en: string | null;
  /** `MinValue`/`MaxValue` in RUB, `null` when Robokassa sets none. */
  min: number | null;
  max: number | null;
};

export type RobokassaPaymentMethodsSource = "live" | "stale" | "fallback";

export type RobokassaPaymentMethodsResult = {
  methods: RobokassaPaymentMethod[];
  source: RobokassaPaymentMethodsSource;
};

export const ROBOKASSA_CURRENCIES_URL =
  "https://auth.robokassa.ru/Merchant/WebService/Service.asmx/GetCurrencies";

/** What every shop with Robokassa takes, whatever its cabinet says: card and SBP. */
export const ROBOKASSA_FALLBACK_METHODS: readonly RobokassaPaymentMethod[] = Object.freeze([
  { alias: "BankCard", name_ru: "Банковская карта", name_en: "Bank card", min: null, max: null },
  { alias: "SBP", name_ru: "СБП", name_en: "SBP", min: null, max: null },
]);

/** The two methods a buyer looks for first lead the list; the rest keep Robokassa's order. */
const LEADING_ALIASES = ["BankCard", "SBP"];

/**
 * The shape of an alias. Every one Robokassa lists today is a short Latin word
 * (`BankCard`, `SBP`, `BankCardHalva`, `YandexPaySplit`); anything else never
 * reaches a payment URL or a form field.
 */
const ALIAS_PATTERN = /^[A-Za-z0-9_]{1,40}$/;

export const isRobokassaAlias = (value: unknown): value is string =>
  typeof value === "string" && ALIAS_PATTERN.test(value);

/** At most this many aliases ride on a payment session; Robokassa lists about a dozen at most. */
const MAX_ALIASES = 24;

/**
 * The whitelist a payment session carries: well-formed aliases only, each
 * once, in the order given.
 */
export const sanitizeRobokassaAliases = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  const seen = new Set<string>();
  for (const value of values) {
    if (isRobokassaAlias(value) && !seen.has(value)) {
      seen.add(value);
    }
    if (seen.size >= MAX_ALIASES) {
      break;
    }
  }
  return [...seen];
};

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

const decodeXml = (value: string): string =>
  value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return XML_ENTITIES[entity.toLowerCase()] ?? match;
  });

const amount = (value: string | undefined): number | null => {
  if (value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

type ParsedCurrency = { alias: string; name: string | null; min: number | null; max: number | null };

/**
 * One `GetCurrencies` answer: its `Result/Code` (0 means success) and every
 * `Currency` across all groups, one per alias. The document is small and flat,
 * so a pattern over the self-closing `Currency` elements reads it without an
 * XML dependency.
 */
export const parseRobokassaCurrencies = (xml: string): { code: number | null; currencies: ParsedCurrency[] } => {
  const codeMatch = xml.match(/<Result>\s*<Code>\s*(-?\d+)\s*<\/Code>/);
  const code = codeMatch ? Number(codeMatch[1]) : null;
  const currencies: ParsedCurrency[] = [];
  const seen = new Set<string>();
  for (const element of xml.matchAll(/<Currency\b([^>]*?)\/?>/g)) {
    const attributes: Record<string, string> = {};
    for (const attribute of element[1].matchAll(/([A-Za-z_][\w.-]*)\s*=\s*"([^"]*)"/g)) {
      attributes[attribute[1]] = decodeXml(attribute[2]);
    }
    const alias = attributes.Alias;
    if (!isRobokassaAlias(alias) || seen.has(alias)) {
      continue;
    }
    seen.add(alias);
    currencies.push({
      alias,
      name: attributes.Name?.trim() || null,
      min: amount(attributes.MinValue),
      max: amount(attributes.MaxValue),
    });
  }
  return { code, currencies };
};

/**
 * The Russian and English answers folded into one list. The aliases come from
 * whichever answer succeeded (the Russian one first); the other only lends its
 * names.
 */
export const mergeRobokassaCurrencies = (
  ru: ParsedCurrency[] | null,
  en: ParsedCurrency[] | null,
): RobokassaPaymentMethod[] => {
  const primary = ru ?? en ?? [];
  const ruByAlias = new Map((ru ?? []).map((currency) => [currency.alias, currency]));
  const enByAlias = new Map((en ?? []).map((currency) => [currency.alias, currency]));
  const methods = primary.map((currency) => ({
    alias: currency.alias,
    name_ru: ruByAlias.get(currency.alias)?.name ?? null,
    name_en: enByAlias.get(currency.alias)?.name ?? null,
    min: currency.min,
    max: currency.max,
  }));
  const rank = (alias: string) => {
    const index = LEADING_ALIASES.indexOf(alias);
    return index === -1 ? LEADING_ALIASES.length : index;
  };
  // A stable sort: the leading two move up, everything else keeps Robokassa's order.
  return methods
    .map((method, index) => ({ method, index }))
    .sort((a, b) => rank(a.method.alias) - rank(b.method.alias) || a.index - b.index)
    .map(({ method }) => method);
};

type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

type WarnLogger = { warn: (message: string) => void };

export type RobokassaMethodsCacheOptions = {
  fetch?: FetchLike;
  now?: () => number;
  /** How long a successful answer is served before it is asked again. */
  liveTtlMs?: number;
  /** How long a failed refresh waits before Robokassa is asked again. */
  failureTtlMs?: number;
  timeoutMs?: number;
};

type CacheEntry = {
  methods: RobokassaPaymentMethod[];
  source: RobokassaPaymentMethodsSource;
  expiresAt: number;
};

const LIVE_TTL_MS = 10 * 60_000;
const FAILURE_TTL_MS = 60_000;
const TIMEOUT_MS = 3_000;

const fallbackMethods = (): RobokassaPaymentMethod[] => ROBOKASSA_FALLBACK_METHODS.map((method) => ({ ...method }));

/**
 * A per-login cache over `GetCurrencies`. Exported as a factory so a test can
 * hand it its own `fetch` and clock; the app uses {@link robokassaPaymentMethods}.
 *
 * - A fresh entry is served as is.
 * - An expired one is refreshed; concurrent callers share the one request.
 * - A refresh that fails keeps the last live list (`stale`), or, with none,
 *   the fallback, and either is held for `failureTtlMs` so a Robokassa outage
 *   costs one timed-out request a minute, not one per checkout.
 */
export const createRobokassaMethodsCache = (options: RobokassaMethodsCacheOptions = {}) => {
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? Date.now;
  const liveTtlMs = options.liveTtlMs ?? LIVE_TTL_MS;
  const failureTtlMs = options.failureTtlMs ?? FAILURE_TTL_MS;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const entries = new Map<string, CacheEntry>();
  const inflight = new Map<string, Promise<RobokassaPaymentMethodsResult>>();

  const ask = async (
    merchantLogin: string,
    language: "ru" | "en",
    logger: WarnLogger | undefined,
  ): Promise<ParsedCurrency[] | null> => {
    const query = new URLSearchParams({ MerchantLogin: merchantLogin, Language: language });
    try {
      const response = await fetchImpl(`${ROBOKASSA_CURRENCIES_URL}?${query.toString()}`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        logger?.warn(`[robokassa] GetCurrencies (${language}) answered HTTP ${response.status}`);
        return null;
      }
      const { code, currencies } = parseRobokassaCurrencies(await response.text());
      if (code !== 0 || !currencies.length) {
        logger?.warn(
          `[robokassa] GetCurrencies (${language}) answered code ${code ?? "none"} with ${currencies.length} methods`,
        );
        return null;
      }
      return currencies;
    } catch (error) {
      logger?.warn(
        `[robokassa] GetCurrencies (${language}) failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  };

  const refresh = async (merchantLogin: string, logger: WarnLogger | undefined): Promise<RobokassaPaymentMethodsResult> => {
    const [ru, en] = await Promise.all([ask(merchantLogin, "ru", logger), ask(merchantLogin, "en", logger)]);
    if (ru || en) {
      const methods = mergeRobokassaCurrencies(ru, en);
      entries.set(merchantLogin, { methods, source: "live", expiresAt: now() + liveTtlMs });
      return { methods, source: "live" };
    }
    const previous = entries.get(merchantLogin);
    const kept: CacheEntry =
      previous && previous.source !== "fallback"
        ? { methods: previous.methods, source: "stale", expiresAt: now() + failureTtlMs }
        : { methods: fallbackMethods(), source: "fallback", expiresAt: now() + failureTtlMs };
    entries.set(merchantLogin, kept);
    return { methods: kept.methods, source: kept.source };
  };

  /** The shop's methods; never throws, never answers an empty list. */
  const methodsFor = async (
    merchantLogin: string,
    logger?: WarnLogger,
  ): Promise<RobokassaPaymentMethodsResult> => {
    const login = merchantLogin.trim();
    if (!login) {
      return { methods: fallbackMethods(), source: "fallback" };
    }
    const entry = entries.get(login);
    if (entry && entry.expiresAt > now()) {
      return { methods: entry.methods, source: entry.source };
    }
    const pending = inflight.get(login);
    if (pending) {
      return pending;
    }
    const request = refresh(login, logger).finally(() => inflight.delete(login));
    inflight.set(login, request);
    return request;
  };

  return { methodsFor };
};

const sharedCache = createRobokassaMethodsCache();

/** The app-wide cache: the store route and the payment provider read the same entries. */
export const robokassaPaymentMethods = (
  merchantLogin: string,
  logger?: WarnLogger,
): Promise<RobokassaPaymentMethodsResult> => sharedCache.methodsFor(merchantLogin, logger);
