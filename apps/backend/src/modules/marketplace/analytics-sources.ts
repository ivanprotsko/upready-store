/**
 * The seller rating on «Wildberries → Аналитика» (mp-section-design task-06,
 * first built in w19-mp-analytics), and what the screen says when there is
 * none.
 *
 * The rating is the one number of the screen that does not come out of our
 * own arithmetic: only the marketplace knows it. An empty rating reads as
 * «рейтинг ноль», so an absent one says WHY it is absent, in the owner's words,
 * and keeps the technical half (the method, the HTTP status, the
 * marketplace's own text) for «Подробности для поддержки» (rule P3).
 *
 * PURE, AND IT ASKS NOBODY. The state is decided from facts the loader already
 * read out of our own tables: whether a key is stored, the last recorded
 * answer of the rating method in the journal `mp_api_call`, and a rating an
 * import mirrored. Nothing here inspects a key and nothing opens a socket: a
 * screen that asked the marketplace on every open would not be the read-only
 * screen this is (Ivan, 2026-09-16 02:46 WITA).
 */

/** One row of `mp_api_call`, as the loader read it. */
export type LastCall = {
  endpoint_id: string;
  status: number | null;
  error: string | null;
  fetched_at: string | null;
};

/**
 * The method each marketplace keeps its seller rating behind.
 *
 * WB: `POST /api/analytics/v2/item-rating` answers `data.sellerRating.current`;
 * WB has no separate seller-rating method. Its documentation says "Method is
 * available by Personal token, Service token", and on the client's base key
 * it answered 403 `token does not satisfy additional requirements`
 * (measured 2026-09-16, w19). No import kind asks it: on the stand the journal
 * holds not one call of it (2026-10-05), so the screen says so instead of
 * waiting for an answer that cannot come.
 *
 * Ozon: `POST /v1/rating/summary` exists and is not registered; the shop has
 * no Ozon key and a read is registered only after it has answered on one.
 */
export const RATING_ENDPOINTS: Readonly<Record<string, string | null>> = {
  wb: "analytics.item-rating",
  ozon: null,
};

export type RatingState =
  /** A rating an import mirrored is on the screen. */
  | "ok"
  /** No key for this marketplace: there is nobody to ask. */
  | "no_key"
  /** The marketplace was asked and refused; its answer is in the words. */
  | "refused"
  /** Nothing asks for the rating, so there is no number and no refusal. */
  | "not_imported";

export type SellerRating = {
  value: number | null;
  scale: number | null;
  state: RatingState;
  /** When the marketplace answered, with the rating or with the refusal; ISO. */
  as_of: string | null;
  /** What the owner reads, Russian, no method names. */
  detail: string;
  /** What support reads: the method, the status and the marketplace's own text. */
  support: string | null;
};

/** A refusal in the owner's words, by the HTTP status the marketplace answered. */
const refusalWords = (status: number): string => {
  if (status === 401 || status === 403) {
    return "этот ключ не даёт доступа к рейтингу, нужен персональный или сервисный токен";
  }
  if (status === 429) {
    return "площадка попросила подождать, запросов было слишком много";
  }
  if (status >= 500) {
    return "у площадки случился сбой";
  }
  return `площадка ответила ошибкой ${status}`;
};

export const sellerRating = (input: {
  label: string;
  hasKey: boolean;
  /** `RATING_ENDPOINTS[marketplace]`. */
  endpoint: string | null;
  /** The last journal row of `endpoint` for this shop, if it was ever asked. */
  lastCall: LastCall | null;
  /**
   * The rating an import mirrored, with the instant it was measured. No import
   * mirrors one today (see `RATING_ENDPOINTS`); when one does, this is where
   * its number arrives and nothing else changes.
   */
  stored: { value: number; scale: number; at: string | null } | null;
}): SellerRating => {
  if (input.stored) {
    return {
      value: input.stored.value,
      scale: input.stored.scale,
      state: "ok",
      as_of: input.stored.at,
      detail: `Рейтинг продавца по данным ${input.label}.`,
      support: null,
    };
  }

  const none = { value: null, scale: null };

  if (!input.hasKey) {
    return {
      ...none,
      state: "no_key",
      as_of: null,
      detail: `Рейтинг знает только ${input.label}, а ключа площадки у магазина нет.`,
      support: null,
    };
  }

  const call = input.lastCall;
  if (call && call.status !== null && call.status >= 400) {
    return {
      ...none,
      state: "refused",
      as_of: call.fetched_at,
      detail: `${input.label} не отдал рейтинг: ${refusalWords(call.status)}.`,
      support: [`${call.endpoint_id}: HTTP ${call.status}`, call.error].filter(Boolean).join(" · "),
    };
  }

  return {
    ...none,
    state: "not_imported",
    as_of: null,
    detail: input.endpoint
      ? `Рейтинг продавца обновление магазина не загружает: ${input.label} отдаёт его только по персональному или сервисному токену.`
      : `Рейтинг продавца ${input.label} обновление магазина пока не загружает.`,
    support: !input.endpoint
      ? null
      : call
        ? [`${call.endpoint_id}: последний ответ HTTP ${call.status ?? "нет"}, числа рейтинга импорт не хранит`, call.error]
            .filter(Boolean)
            .join(" · ")
        : `${input.endpoint}: в журнале mp_api_call нет ни одного вызова, ни один вид обновления его не запрашивает.`,
  };
};
