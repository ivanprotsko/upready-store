import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { MARKETPLACE_MODULE } from "../../../modules/marketplace";
import type MarketplaceModuleService from "../../../modules/marketplace/service";
import { MARKETPLACE_IDS } from "../../../modules/marketplace/registry";
import { describeGenerator } from "../../../modules/marketplace/draft-generator";

/**
 * The body of the «Маркетплейсы → Отзывы» desk, for both tabs
 * (w18-mp-reviews-desk).
 *
 * READ-ONLY TOWARDS THE MARKETPLACE. Nothing in this file, and nothing in the
 * two routes that use it, opens a socket to Wildberries or Ozon: the rows come
 * from the normalized `mp_review` / `mp_question` tables the projector fills
 * (`modules/marketplace/project.ts`), and the only write this desk can do is
 * into `answer_draft` of our own database. Ivan's order of 2026-09-16 02:46
 * WITA stands: `POST /api/v1/feedbacks/answer` (WB) and
 * `/v1/review/comment/create`, `/v1/question/answer/create` (Ozon) are on the
 * mutation deny-lists, cannot be registered as reads, and no handler here
 * names them. `__tests__/reviews-desk-read-only.unit.spec.ts` checks that by
 * reading these files rather than by trusting this paragraph.
 *
 * WHY ONE FILE FOR TWO TABS. A review and a question differ by two columns
 * (`rating`, `text`/`pros`/`cons` against `question_text`) and by nothing
 * else: same tenant scoping, same filters, same link to the shop catalog, same
 * draft. Two copies of that would drift the day one of them gets a fix
 * (rule 20).
 */

/** The two tabs of the desk. */
export const DESK_KINDS = ["reviews", "questions"] as const;
export type DeskKind = (typeof DESK_KINDS)[number];

/** `all` is a filter too: it is what «без фильтра» means, said out loud. */
export const ANSWERED_VALUES = ["all", "no", "yes"] as const;
export type AnsweredFilter = (typeof ANSWERED_VALUES)[number];

/**
 * The periods the screen offers, in days. `all` keeps every row including the
 * ones the marketplace gave no date for: dropping an undated row from «за всё
 * время» would hide it everywhere at once.
 */
export const PERIOD_DAYS: Record<string, number | null> = {
  all: null,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "365d": 365,
};

export type DeskFilters = {
  marketplace: string | null;
  rating: number | null;
  answered: AnsweredFilter;
  period: string;
  limit: number;
  offset: number;
};

/** One filter the caller actually set, for the «ничего не найдено» line. */
export type AppliedFilter = { field: string; value: string };

type Query = Record<string, unknown>;

const asString = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    return asString(value[0]);
  }
  return typeof value === "string" && value.length > 0 ? value : null;
};

const asInt = (value: unknown, fallback: number, max: number): number => {
  const raw = asString(value);
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.min(parsed, max);
};

/**
 * The query string of the desk, narrowed to what it may say.
 *
 * An unknown marketplace, an unknown period and a rating outside 1..5 are
 * dropped rather than passed on: a filter nobody can satisfy would produce an
 * empty screen that blames the data.
 */
export const parseDeskFilters = (query: Query): DeskFilters => {
  const marketplace = asString(query.marketplace);
  const answered = asString(query.answered) as AnsweredFilter | null;
  const period = asString(query.period);
  const ratingRaw = asString(query.rating);
  const rating = ratingRaw === null ? Number.NaN : Number.parseInt(ratingRaw, 10);

  return {
    marketplace:
      marketplace && MARKETPLACE_IDS.includes(marketplace as never) ? marketplace : null,
    rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null,
    answered: answered && ANSWERED_VALUES.includes(answered) ? answered : "all",
    period: period && period in PERIOD_DAYS ? period : "all",
    limit: asInt(query.limit, 50, 200),
    offset: asInt(query.offset, 0, 1_000_000),
  };
};

/** What the caller set, in the order the screen shows the controls. */
export const appliedFilters = (filters: DeskFilters): AppliedFilter[] => {
  const applied: AppliedFilter[] = [];
  if (filters.marketplace) {
    applied.push({ field: "marketplace", value: filters.marketplace });
  }
  if (filters.rating !== null) {
    applied.push({ field: "rating", value: String(filters.rating) });
  }
  if (filters.answered !== "all") {
    applied.push({ field: "answered", value: filters.answered });
  }
  if (filters.period !== "all") {
    applied.push({ field: "period", value: filters.period });
  }
  return applied;
};

/**
 * One row of either table, as the module service returns it.
 *
 * The four review-only columns are OPTIONAL rather than nullable, because a
 * question row does not carry them at all and typing them as `number | null`
 * would let a reader think a question has a rating that happens to be empty.
 * That difference is exactly what the compiler caught when this type was
 * written the lazy way.
 */
export type DeskRow = {
  id: string;
  marketplace: string;
  external_id: string;
  vendor_code: string | null;
  author: string | null;
  created_at_mp: Date | string | null;
  is_answered: boolean;
  answer_draft: string | null;
  answer_draft_at: Date | string | null;
  /** Reviews only. */
  rating?: number | null;
  text?: string | null;
  pros?: string | null;
  cons?: string | null;
  /** Questions only. */
  question_text?: string | null;
};

const asDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * The filters, as one pure function over rows.
 *
 * Pure so the suite can hold it to its promises without a database, and so the
 * screen's numbers and its rows come from ONE rule: the tab counts below are
 * computed by calling this, not by a second condition written by hand.
 *
 * A row the marketplace gave no date for is kept by «за всё время» and dropped
 * by every bounded period, because "we do not know when" is not "inside the
 * last 30 days" (rule 20a).
 */
export const filterRows = <T extends DeskRow>(
  rows: T[],
  filters: DeskFilters,
  now: Date,
): T[] => {
  const days = PERIOD_DAYS[filters.period] ?? null;
  const since = days === null ? null : new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  return rows.filter((row) => {
    if (filters.marketplace && row.marketplace !== filters.marketplace) {
      return false;
    }
    if (filters.rating !== null && (row.rating ?? null) !== filters.rating) {
      return false;
    }
    if (filters.answered === "no" && row.is_answered) {
      return false;
    }
    if (filters.answered === "yes" && !row.is_answered) {
      return false;
    }
    if (since) {
      const created = asDate(row.created_at_mp);
      if (!created || created < since) {
        return false;
      }
    }
    return true;
  });
};

const asIso = (value: Date | string | null | undefined): string | null => {
  const date = asDate(value);
  return date ? date.toISOString() : null;
};

/**
 * The shop product behind one marketplace row, or the honest absence of one.
 *
 * The chain is `vendor_code -> mp_product -> mp_link -> product`: a review
 * carries the article, the card carries the marketplace id, and `mp_link` is
 * where the matcher wrote which product of the shop that card is (spec 2.4).
 * Every step can miss, and each miss is a different sentence on the screen:
 * no article at all, an article no imported card carries, a card the matcher
 * has not linked. All three render as «нет в магазине» with the card's own
 * title next to it when there is one.
 */
export type ProductLink = {
  vendor_code: string | null;
  /** The card's title ON the marketplace, when the card is imported. */
  mp_title: string | null;
  mp_external_id: string | null;
  /** The shop's product, when the matcher linked that card. */
  product_id: string | null;
  product_title: string | null;
  linked: boolean;
};

type ProductResolver = (marketplace: string, vendorCode: string | null) => ProductLink;

export const buildProductResolver = async (
  scope: MedusaContainer,
  mp: MarketplaceModuleService,
  tenantId: string,
): Promise<ProductResolver> => {
  const [cards, links] = await Promise.all([
    mp.listMpProducts({ tenant_id: tenantId }) as Promise<Record<string, unknown>[]>,
    mp.listMpLinks({ tenant_id: tenantId }) as Promise<Record<string, unknown>[]>,
  ]);

  const cardByArticle = new Map<string, { external_id: string; title: string | null }>();
  for (const card of cards) {
    const vendorCode = card.vendor_code ? String(card.vendor_code) : null;
    if (!vendorCode) {
      continue;
    }
    const key = `${String(card.marketplace)}|${vendorCode}`;
    if (!cardByArticle.has(key)) {
      cardByArticle.set(key, {
        external_id: String(card.external_id),
        title: card.title ? String(card.title) : null,
      });
    }
  }

  const productByCard = new Map<string, string>(
    links.map((link) => [
      `${String(link.marketplace)}|${String(link.external_id)}`,
      String(link.product_id),
    ]),
  );

  const productIds = [...new Set(productByCard.values())];
  const titleById = new Map<string, string>();

  if (productIds.length) {
    const query = scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "title"],
      filters: { id: productIds },
    });
    for (const product of (data ?? []) as { id: string; title: string | null }[]) {
      titleById.set(product.id, product.title ?? "");
    }
  }

  return (marketplace, vendorCode) => {
    const card = vendorCode ? cardByArticle.get(`${marketplace}|${vendorCode}`) : undefined;
    const productId = card ? (productByCard.get(`${marketplace}|${card.external_id}`) ?? null) : null;

    return {
      vendor_code: vendorCode,
      mp_title: card?.title ?? null,
      mp_external_id: card?.external_id ?? null,
      product_id: productId,
      product_title: productId ? (titleById.get(productId) ?? null) : null,
      linked: Boolean(productId),
    };
  };
};

export type DeskItem = {
  id: string;
  kind: DeskKind;
  marketplace: string;
  external_id: string;
  rating: number | null;
  text: string | null;
  pros: string | null;
  cons: string | null;
  author: string | null;
  created_at: string | null;
  is_answered: boolean;
  answer_draft: string | null;
  answer_draft_at: string | null;
  product: ProductLink;
};

export type DeskCounts = {
  total: number;
  unanswered: number;
  filtered: number;
};

export type DeskPayload = {
  kind: DeskKind;
  items: DeskItem[];
  count: number;
  limit: number;
  offset: number;
  filters: {
    marketplace: string | null;
    rating: number | null;
    answered: AnsweredFilter;
    period: string;
    applied: AppliedFilter[];
  };
  counts: Record<DeskKind, DeskCounts>;
  marketplaces: readonly string[];
  generator: ReturnType<typeof describeGenerator>;
  /**
   * Phase 4 of the spec, and not this screen. It is in the payload rather than
   * only in the UI copy so that anyone reading the API sees the same statement
   * the owner does.
   */
  sending: { enabled: false; reason: string };
};

export const SENDING_REASON =
  "Отправка ответов на площадку не включена: платформа работает с Wildberries и Ozon " +
  "только на чтение. Черновик хранится у нас — скопируйте его в личный кабинет площадки.";

const toItem = (row: DeskRow, kind: DeskKind, product: ProductLink): DeskItem => ({
  id: row.id,
  kind,
  marketplace: row.marketplace,
  external_id: row.external_id,
  rating: kind === "reviews" ? (row.rating ?? null) : null,
  text: kind === "reviews" ? (row.text ?? null) : (row.question_text ?? null),
  pros: kind === "reviews" ? (row.pros ?? null) : null,
  cons: kind === "reviews" ? (row.cons ?? null) : null,
  author: row.author ?? null,
  created_at: asIso(row.created_at_mp),
  is_answered: Boolean(row.is_answered),
  answer_draft: row.answer_draft ?? null,
  answer_draft_at: asIso(row.answer_draft_at),
  product,
});

/**
 * Both tables, once, for whichever tab asked.
 *
 * The OTHER tab's counts are in the answer too: the tab label carries a number
 * and a label that only updates when you click it would be a stale number
 * pretending to be current.
 */
export const buildDesk = async (
  scope: MedusaContainer,
  tenantId: string,
  kind: DeskKind,
  filters: DeskFilters,
  now: Date = new Date(),
): Promise<DeskPayload> => {
  const mp = scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);

  const [reviews, questions] = await Promise.all([
    mp.listMpReviews({ tenant_id: tenantId }) as Promise<DeskRow[]>,
    mp.listMpQuestions({ tenant_id: tenantId }) as Promise<DeskRow[]>,
  ]);

  /**
   * A question carries no rating, so the rating filter does not apply to that
   * tab at all. Passing it through would empty the tab whenever the owner
   * picked a rating on the reviews tab and then clicked «Вопросы» — an empty
   * screen produced by a control that is not even shown there.
   */
  const filtersFor = (which: DeskKind): DeskFilters =>
    which === "questions" ? { ...filters, rating: null } : filters;

  const countsFor = (rows: DeskRow[], which: DeskKind): DeskCounts => ({
    total: rows.length,
    unanswered: rows.filter((row) => !row.is_answered).length,
    filtered: filterRows(rows, filtersFor(which), now).length,
  });

  const rows = kind === "reviews" ? reviews : questions;
  const own = filtersFor(kind);
  const matching = filterRows(rows, own, now).sort((left, right) => {
    const leftAt = asDate(left.created_at_mp)?.getTime() ?? 0;
    const rightAt = asDate(right.created_at_mp)?.getTime() ?? 0;
    return rightAt - leftAt;
  });

  const page = matching.slice(filters.offset, filters.offset + filters.limit);
  const resolve = await buildProductResolver(scope, mp, tenantId);

  return {
    kind,
    items: page.map((row) =>
      toItem(row, kind, resolve(row.marketplace, row.vendor_code ?? null)),
    ),
    count: matching.length,
    limit: filters.limit,
    offset: filters.offset,
    filters: {
      marketplace: own.marketplace,
      rating: own.rating,
      answered: own.answered,
      period: own.period,
      applied: appliedFilters(own),
    },
    counts: {
      reviews: countsFor(reviews, "reviews"),
      questions: countsFor(questions, "questions"),
    },
    marketplaces: MARKETPLACE_IDS,
    generator: describeGenerator(),
    sending: { enabled: false, reason: SENDING_REASON },
  };
};
