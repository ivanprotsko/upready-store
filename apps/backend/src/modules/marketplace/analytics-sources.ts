/**
 * What the dashboard is ALLOWED to show, and what it must say instead
 * (w19-mp-analytics).
 *
 * Two blocks of the seller dashboard do not come from our own arithmetic: the
 * seller rating, which only the marketplace knows, and the P&L, which needs
 * the marketplace's finance reports. Both can be unavailable, and an
 * unavailable block has to say WHY — an empty rating reads as «рейтинг ноль»,
 * and a P&L assembled out of what we do have would be an invented margin,
 * the one thing this task forbids outright.
 *
 * PURE, AND IT ASKS NOBODY. The state is decided from two facts the loader
 * already has: whether a key is stored, and what the marketplace answered the
 * last time an import asked — one row of `mp_api_call`. Nothing here inspects
 * a key and nothing opens a socket: `inspectCredentials` on Ozon is a live
 * `POST /v1/roles`, and a screen that made a marketplace request on every open
 * would be a different screen from the read-only one this is (Ivan,
 * 2026-09-16 02:46 WITA). The key's own rights are shown live, once, on
 * «Маркетплейсы»; this screen points there instead of keeping a second copy.
 */

/** One row of `mp_api_call`, as the loader read it. */
export type LastCall = {
  endpoint_id: string;
  status: number | null;
  error: string | null;
  fetched_at: string | null;
};

export type SourceState =
  /** Asked, answered, the number is on the screen. */
  | "ok"
  /** No key for this marketplace at all. */
  | "no_key"
  /** A key, but the marketplace refused this method. */
  | "refused"
  /** A key, the method is allowed, nobody has asked yet. */
  | "never_asked"
  /** Known to be out of reach of this key's category. */
  | "scope_missing";

export type SourceBlock = {
  marketplace: string;
  label: string;
  state: SourceState;
  /** The method this block would read, named so the owner can take it to support. */
  endpoint: string | null;
  /** The marketplace's own answer, as the journal recorded it. */
  refusal: { status: number | null; text: string | null; at: string | null } | null;
  /** What the screen prints. Russian: it is read by the shop owner. */
  detail: string;
  /** Where the live truth about the key's rights is, so nothing here is a stale copy. */
  see: string | null;
};

/** Where the key's own rights are shown, live, for every marketplace. */
const KEY_RIGHTS_SCREEN = "Маркетплейсы → карточка площадки: права ключа, срок, разрешённые чтения";

/**
 * WB's rating method, and why a base token cannot use it.
 *
 * `POST /api/analytics/v2/item-rating` answers `data.sellerRating.current` —
 * Wildberries has no separate seller-rating method, so this is the one. The
 * doc line above it says "Method is available by Personal token, Service
 * token".
 *
 * MEASURED 2026-09-16 on the live cabinet «ФНП / Фабрика Натуральных
 * Продуктов» with the shop's own key: HTTP 403, body
 * `{"detail":"token does not satisfy additional requirements","origin":"ag-contentanalytics"}`.
 * So the refused branch is not a precaution — it is the case that happens, and
 * the screen shows the 403 rather than an empty five-star row.
 */
export const RATING_ENDPOINTS: Readonly<Record<string, string | null>> = {
  wb: "analytics.item-rating",
  /**
   * Ozon has `POST /v1/rating/summary` and `/v1/rating/history`. Neither is
   * registered yet: this shop has no Ozon key, and registering a read nobody
   * has ever got a 200 out of would put a method on the owner's «разрешённые
   * чтения» list on the strength of documentation alone.
   */
  ozon: null,
};

export const ratingBlock = (input: {
  marketplace: string;
  label: string;
  hasKey: boolean;
  lastCall: LastCall | null;
  /** The seller rating, once an import has mirrored one. `null` — we have none. */
  rating: number | null;
}): SourceBlock => {
  const endpoint = RATING_ENDPOINTS[input.marketplace] ?? null;
  const base = { marketplace: input.marketplace, label: input.label, endpoint };

  if (!input.hasKey) {
    return {
      ...base,
      state: "no_key",
      refusal: null,
      see: KEY_RIGHTS_SCREEN,
      detail:
        `Рейтинг знает только площадка, а ключа ${input.label} у магазина нет — ` +
        "спросить некого. Ключ добавляется на экране «Маркетплейсы».",
    };
  }

  if (input.rating !== null) {
    return {
      ...base,
      state: "ok",
      refusal: null,
      see: null,
      detail: `Рейтинг продавца по данным самой площадки ${input.label}.`,
    };
  }

  const refusal =
    input.lastCall && input.lastCall.status !== null && input.lastCall.status >= 400
      ? { status: input.lastCall.status, text: input.lastCall.error, at: input.lastCall.fetched_at }
      : null;

  if (refusal) {
    return {
      ...base,
      state: "refused",
      refusal,
      see: KEY_RIGHTS_SCREEN,
      detail:
        `Площадка отказала: HTTP ${refusal.status}. Метод рейтинга ${input.label} доступен ` +
        "по персональному или сервисному токену, базовому ключу — нет. " +
        "Чтобы рейтинг появился, нужен ключ такого вида; кодом это не обходится.",
    };
  }

  if (!endpoint) {
    return {
      ...base,
      state: "scope_missing",
      refusal: null,
      see: null,
      detail:
        `Метод рейтинга ${input.label} у нас не зарегистрирован: мы регистрируем чтение только ` +
        "после того, как оно ответило на живом ключе, а ключа этой площадки у магазина не было.",
    };
  }

  return {
    ...base,
    state: "never_asked",
    refusal: null,
    see: null,
    detail:
      "Рейтинг у площадки ещё не запрашивался: метод лимитирован, поэтому его спрашивает импорт, " +
      "а не открытие экрана.",
  };
};

/**
 * The P&L, and the only honest thing that can be said about it today.
 *
 * A P&L needs the marketplace's finance category: commission, logistics,
 * storage, penalties, what was actually paid out. None of it is in our mirror,
 * and there is no estimated-margin branch here on purpose — revenue, price and
 * discount are all already on this screen, and multiplying them into
 * «прибыль» would be a number the owner would act on and nobody could check.
 *
 * Each marketplace's sentence is a MEASUREMENT with its date in it, not a
 * belief: a record carrying a date is a snapshot of that date, and the live
 * state of the key lives one screen away (`see`).
 */
export const PNL_DETAIL: Readonly<Record<string, string>> = {
  wb:
    "P&L неполный: нет доступа к категории Finance у ключа WB (бит 13 не выставлен, finance-api " +
    "отвечает 403 «scope is not allowed for this resource»). Замер 2026-09-16: маска ключа — " +
    "1073742014, то есть биты 1, 2, 3, 4, 5, 7 и 30; тринадцатого в ней нет. Комиссия, логистика, " +
    "хранение и штрафы площадки нам поэтому недоступны, и прибыль на этом экране не считается и " +
    "не оценивается. Чтобы P&L стал полным, нужен ключ WB с категорией «Финансы» — это решение " +
    "владельца кабинета.",
  ozon:
    "P&L по Ozon не считается: финансовые отчёты (`/v1/finance/cash-flow-statement/list`, " +
    "`/v1/finance/realization/by-day`) у нас не зарегистрированы, а часть их требует подписки " +
    "Premium Plus/Pro. Ключа Ozon у магазина нет, поэтому что именно ответит кабинет — " +
    "неизвестно, и мы этого не выдумываем.",
};

export const pnlBlock = (input: {
  marketplace: string;
  label: string;
  hasKey: boolean;
  /** A recorded answer of a finance method, if one was ever asked for. */
  lastCall: LastCall | null;
}): SourceBlock => {
  const base = { marketplace: input.marketplace, label: input.label, endpoint: null };
  const measured =
    PNL_DETAIL[input.marketplace] ??
    `P&L по ${input.label} не считается: финансовых отчётов площадки в зеркале нет.`;

  if (!input.hasKey) {
    return {
      ...base,
      state: "no_key",
      refusal: null,
      see: KEY_RIGHTS_SCREEN,
      detail: `Ключа ${input.label} у магазина нет. ${measured}`,
    };
  }

  const refusal =
    input.lastCall && input.lastCall.status !== null && input.lastCall.status >= 400
      ? { status: input.lastCall.status, text: input.lastCall.error, at: input.lastCall.fetched_at }
      : null;

  return {
    ...base,
    state: "scope_missing",
    refusal,
    see: KEY_RIGHTS_SCREEN,
    detail: measured,
  };
};
