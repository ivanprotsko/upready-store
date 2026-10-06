import type { Logger } from "@medusajs/framework/types";
import { chunk, pagesOf, type PagedList } from "../marketplace/batch";
import type OzonModuleService from "./service";
import { OZON_SYNC_KINDS, type OzonSyncKind } from "./models/ozon-sync-run";
import { resolveEndpoint } from "./endpoints";
import { fixtureFor } from "./fixtures";
import { ozonRead, type OzonApiCallRecord, type OzonCredentials } from "./transport";

/**
 * The imports (w11-ozon-readonly-client). Every request in this file goes
 * through `ozonRead`, which can only send a registered read; there is no other
 * way out of the process towards Ozon.
 *
 * Each kind writes one `ozon_sync_run` row: `running` at the start, then
 * `succeeded` or `failed` with the message. A failed run stays on file rather
 * than disappearing, so an empty mirror is never mistaken for "Ozon had
 * nothing" (rule 20a). Reviews and questions sit behind Ozon subscriptions, so
 * a failed run with Ozon's own error is the NORMAL outcome for a cabinet
 * without one, and it has to be visible rather than silently empty.
 *
 * Every mirror upsert is keyed on Ozon's own identity of the thing
 * (product_id, or sku plus scheme, or posting_number, or the review id), which
 * is what makes a re-run update rows instead of doubling them.
 *
 * FIXTURE MODE. Ozon documents no sandbox. `mode: "fixtures"` answers from
 * `fixtures.ts` instead of the network — but still through `resolveEndpoint`,
 * so an unregistered id is refused exactly as it is on the wire, and still
 * through the journal, so the run leaves the same evidence with
 * `is_fixture = true` on every row.
 */

export type OzonSyncMode = "live" | "fixtures";

export type OzonSyncDeps = {
  ozon: OzonModuleService;
  tenantId: string;
  credentials: OzonCredentials;
  mode: OzonSyncMode;
  logger: Pick<Logger, "info" | "warn" | "error">;
};

export type OzonSyncOutcome = {
  kind: OzonSyncKind;
  runId: string;
  rows: number;
  requests: number;
  status: "succeeded" | "failed";
  isFixture: boolean;
  error: string | null;
};

/** `POST /v3/product/list`: "Количество значений на странице. Минимум — 1, максимум — 1000." */
const PRODUCT_LIST_PAGE = 1000;

/** `POST /v3/product/info/list`: "не больше 1000 товаров ... в сумме". */
const PRODUCT_INFO_CHUNK = 1000;

/** `POST /v5/product/info/prices` and `/v4/product/info/stocks`: limit [1..1000]. */
const PRICES_PAGE = 1000;
const STOCKS_PAGE = 1000;

/** `POST /v4/posting/fbs/list` and `/v3/posting/fbo/list`: limit [1..100]. */
const POSTINGS_PAGE = 100;

/** `POST /v2/review/list`: "Количество отзывов в ответе" is [20..100]. */
const REVIEWS_PAGE = 100;

/** `POST /v1/question/list`: limit <= 100. */
const QUESTIONS_PAGE = 100;

/**
 * Both posting lists cap the window at one year ("он должен быть не больше
 * одного года", and FBO answers PERIOD_IS_TOO_LONG beyond it). 180 days is
 * half of what Ozon allows, which is a window a first import can actually
 * finish; a longer history is a decision with a cost, not a default.
 */
const POSTINGS_WINDOW_DAYS = 180;

/**
 * `POST /v1/product/info/description` answers for ONE card, so a catalogue of
 * N cards costs N requests. Bounded on purpose, and the cap is LOGGED when it
 * bites: a silent truncation reads as "we imported everything" when it did not.
 */
const DESCRIPTIONS_MAX = 500;

/** Guard against a cursor that stops moving: never loop forever on an answer. */
const MAX_PAGES = 200;

const asText = (value: unknown): string | null =>
  value === undefined || value === null || value === "" ? null : String(value);

const asNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asDate = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Money as Ozon sends it: a number on some methods, a decimal STRING on
 * others, and an object `{ amount, currency }` inside a posting's products.
 * All three are read here rather than assumed, because assuming one shape is
 * how a price silently becomes null.
 */
const asAmount = (value: unknown): number | null => {
  if (value && typeof value === "object" && "amount" in (value as Record<string, unknown>)) {
    return asNumber((value as { amount?: unknown }).amount);
  }
  return asNumber(value);
};

export type OzonRunCounter = { requests: number; rows: number };

/**
 * One reader bound to this run: the tenant, the credentials, the run id and
 * the journal writer are the same for every request, and the caller only ever
 * names an endpoint.
 *
 * In fixture mode nothing opens a socket, but the id still goes through
 * `resolveEndpoint` and the call still lands in `ozon_api_call`, marked.
 */
const readerFor = (deps: OzonSyncDeps, runId: string, counter: OzonRunCounter) => {
  const journal = async (entry: OzonApiCallRecord) => {
    await deps.ozon.createOzonApiCalls(entry);
  };

  return async <T>(
    endpointId: string,
    options: {
      params?: Record<string, string | number>;
      query?: Record<string, unknown>;
      body?: unknown;
    } = {},
  ): Promise<T> => {
    counter.requests += 1;

    if (deps.mode === "fixtures") {
      const entry = resolveEndpoint(endpointId);
      const startedAt = Date.now();
      let data: T;
      let failure: string | null = null;
      try {
        data = fixtureFor<T>(endpointId, options.body);
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
        await journal({
          tenant_id: deps.tenantId,
          sync_run_id: runId,
          endpoint_id: entry.id,
          host: entry.host,
          method: entry.method,
          path: entry.path,
          status: null,
          ms: Date.now() - startedAt,
          error: failure,
          is_fixture: true,
          fetched_at: new Date(),
        });
        throw error;
      }
      await journal({
        tenant_id: deps.tenantId,
        sync_run_id: runId,
        endpoint_id: entry.id,
        host: entry.host,
        method: entry.method,
        path: entry.path,
        status: 200,
        ms: Date.now() - startedAt,
        error: null,
        is_fixture: true,
        fetched_at: new Date(),
      });
      deps.logger.info(`[ozon] fixture ${entry.id} (${entry.method} ${entry.path})`);
      return data;
    }

    const result = await ozonRead<T>(endpointId, {
      credentials: deps.credentials,
      tenantId: deps.tenantId,
      syncRunId: runId,
      params: options.params,
      query: options.query as
        | Record<string, string | number | boolean | undefined | null>
        | undefined,
      body: options.body,
      journal,
      logger: deps.logger,
    });
    return result.data;
  };
};

type OzonReader = ReturnType<typeof readerFor>;

type Upsert = { keys: Record<string, unknown>; values: Record<string, unknown> };

type MirrorEntity =
  | "OzonProduct"
  | "OzonPrice"
  | "OzonStock"
  | "OzonPosting"
  | "OzonReview"
  | "OzonQuestion";

/**
 * Writes one batch of mirror rows through the module service. Existing rows
 * are matched on the model's own unique key inside this tenant, so a second
 * run of the same import updates and never duplicates.
 *
 * Same shape as the Wildberries import's `upsertRows`; w12 folds the two into
 * the shared marketplace core.
 *
 * No call carries more than `MP_BATCH_SIZE` rows or keys, for the reason
 * written at the Wildberries twin (t-2026-10-06-21). The ids are resolved for
 * the whole answer before the first write, as the single lookup did.
 */
export const upsertRows = async (
  ozon: OzonModuleService,
  entity: MirrorEntity,
  tenantId: string,
  rows: Upsert[],
): Promise<number> => {
  if (!rows.length) {
    return 0;
  }

  const service = ozon as unknown as Record<string, (input: unknown) => Promise<unknown>>;
  const list = service[`list${entity}s`].bind(ozon) as unknown as PagedList<
    Record<string, unknown> & { id: string }
  >;
  const create = service[`create${entity}s`].bind(ozon);
  const update = service[`update${entity}s`].bind(ozon);

  const keyNames = Object.keys(rows[0].keys);
  const keyOf = (source: Record<string, unknown>) =>
    keyNames.map((name) => String(source[name])).join(" ");

  const byKey = new Map<string, string>();
  for (const batch of chunk(rows)) {
    const filter = {
      tenant_id: tenantId,
      ...Object.fromEntries(
        keyNames.map((name) => [name, [...new Set(batch.map((row) => row.keys[name]))]]),
      ),
    };
    for await (const page of pagesOf(list, filter, ["id", ...keyNames])) {
      for (const row of page) {
        byKey.set(keyOf(row), row.id);
      }
    }
  }

  const toCreate: Record<string, unknown>[] = [];
  const toUpdate: Record<string, unknown>[] = [];

  for (const row of rows) {
    const id = byKey.get(keyOf(row.keys));
    if (id) {
      toUpdate.push({ id, ...row.values });
    } else {
      toCreate.push({ tenant_id: tenantId, ...row.keys, ...row.values });
    }
  }

  for (const batch of chunk(toCreate)) {
    await create(batch);
  }
  for (const batch of chunk(toUpdate)) {
    await update(batch);
  }

  return rows.length;
};

/**
 * `POST /v3/product/list` for the ids, then `POST /v3/product/info/list` for
 * the cards, `POST /v4/product/info/attributes` for the characteristics and
 * `POST /v1/product/info/description` for the text.
 *
 * The list method answers only ids and flags ("Метод для получения списка всех
 * товаров"), so the card itself always costs a second request — that is Ozon's
 * shape, not a design choice here.
 */
const syncProducts = async (
  deps: OzonSyncDeps,
  read: OzonReader,
  counter: OzonRunCounter,
): Promise<void> => {
  type ListItem = { product_id?: number | string; offer_id?: string; sku?: number | string; archived?: boolean };
  type ListAnswer = { result?: { items?: ListItem[]; total?: number; last_id?: string } };

  const ids: string[] = [];
  let lastId = "";

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const answer = await read<ListAnswer>("product.list", {
      body: {
        filter: { visibility: "ALL" },
        last_id: lastId,
        limit: PRODUCT_LIST_PAGE,
      },
    });

    const items = answer.result?.items ?? [];
    for (const item of items) {
      const id = asText(item.product_id);
      if (id) {
        ids.push(id);
      }
    }

    deps.logger.info(`[ozon] product.list page ${page + 1}: ${items.length} ids`);

    const nextId = answer.result?.last_id ?? "";
    if (items.length < PRODUCT_LIST_PAGE || !nextId || nextId === lastId) {
      break;
    }
    lastId = nextId;
  }

  if (!ids.length) {
    deps.logger.warn("[ozon] the cabinet answered no product ids, so there are no cards to import");
    return;
  }

  type Card = Record<string, unknown> & { id?: number | string; offer_id?: string };
  type InfoAnswer = { items?: Card[] };
  type AttributesAnswer = { result?: Array<Record<string, unknown> & { id?: number | string }> };

  const fetchedAt = new Date();
  /**
   * How many cards answered, and the ids of the ones whose description is read
   * below. The cards themselves are written page by page and not kept: the
   * whole catalogue in one array is the answer held at once (t-2026-10-06-21).
   */
  let answered = 0;
  const described: string[] = [];

  for (let offset = 0; offset < ids.length; offset += PRODUCT_INFO_CHUNK) {
    const idChunk = ids.slice(offset, offset + PRODUCT_INFO_CHUNK);
    const answer = await read<InfoAnswer>("product.info.list", { body: { product_id: idChunk } });
    for (const card of answer.items ?? []) {
      answered += 1;
      if (described.length < DESCRIPTIONS_MAX) {
        described.push(String(card.id));
      }
    }

    const attributes = await read<AttributesAnswer>("product.info.attributes", {
      body: {
        filter: { product_id: idChunk, visibility: "ALL" },
        limit: idChunk.length,
        last_id: "",
      },
    });
    const byId = new Map(
      (attributes.result ?? []).map((row) => [String(row.id), row as Record<string, unknown>]),
    );

    counter.rows += await upsertRows(
      deps.ozon,
      "OzonProduct",
      deps.tenantId,
      (answer.items ?? []).map((card) => {
        const statuses = (card.statuses ?? null) as Record<string, unknown> | null;
        return {
          keys: { product_id: String(card.id) },
          values: {
            offer_id: asText(card.offer_id),
            sku: asText(card.sku),
            name: asText(card.name),
            barcodes: card.barcodes ?? null,
            category_id: asText(card.description_category_id),
            type_id: asText(card.type_id),
            images: card.images ?? null,
            primary_image: Array.isArray(card.primary_image)
              ? asText((card.primary_image as unknown[])[0])
              : asText(card.primary_image),
            statuses: statuses ?? null,
            attributes: byId.get(String(card.id)) ?? null,
            archived: card.is_archived === true,
            source: "ozon",
            fetched_at: fetchedAt,
            ozon_updated_at: asDate(card.updated_at),
            raw: card,
          },
        };
      }),
    );
  }

  deps.logger.info(`[ozon] cards: ${answered} of ${ids.length} ids answered`);

  // The description is one request per card. Bounded, and the bound is said
  // out loud when it bites (no silent caps).
  if (answered > DESCRIPTIONS_MAX) {
    deps.logger.warn(
      `[ozon] descriptions: only the first ${DESCRIPTIONS_MAX} of ${answered} cards were asked ` +
        "for (/v1/product/info/description answers for one card per request). The rest keep the " +
        "description they already had; raise DESCRIPTIONS_MAX or run this kind again to continue.",
    );
  }

  const descriptions: Upsert[] = [];
  for (const productId of described) {
    try {
      const answer = await read<{ result?: { description?: string } }>("product.info.description", {
        body: { product_id: Number(productId) },
      });
      const text = asText(answer.result?.description);
      if (text) {
        descriptions.push({
          keys: { product_id: productId },
          values: { description: text, fetched_at: new Date() },
        });
      }
    } catch (error) {
      // One card without a description must not fail the whole import, but it
      // must not be silent either (rule 20a).
      deps.logger.warn(
        `[ozon] description of ${productId} could not be read: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (descriptions.length) {
    await upsertRows(deps.ozon, "OzonProduct", deps.tenantId, descriptions);
    deps.logger.info(`[ozon] descriptions: ${descriptions.length} cards`);
  }
};

/** `POST /v5/product/info/prices`, cursor-paginated. */
const syncPrices = async (
  deps: OzonSyncDeps,
  read: OzonReader,
  counter: OzonRunCounter,
): Promise<void> => {
  type Item = Record<string, unknown> & { product_id?: number | string; offer_id?: string };
  type Answer = { items?: Item[]; cursor?: string; total?: number };

  let cursor = "";

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const answer = await read<Answer>("product.prices", {
      body: { cursor, filter: { visibility: "ALL" }, limit: PRICES_PAGE },
    });

    const items = answer.items ?? [];
    if (!items.length) {
      break;
    }

    const fetchedAt = new Date();
    counter.rows += await upsertRows(
      deps.ozon,
      "OzonPrice",
      deps.tenantId,
      items.map((item) => {
        const price = (item.price ?? {}) as Record<string, unknown>;
        return {
          keys: { product_id: String(item.product_id) },
          values: {
            offer_id: asText(item.offer_id),
            price: asAmount(price.price),
            old_price: asAmount(price.old_price),
            min_price: asAmount(price.min_price),
            currency_code: asText(price.currency_code),
            vat: asText(price.vat),
            commissions: item.commissions ?? null,
            price_indexes: item.price_indexes ?? null,
            marketing_actions: item.marketing_actions ?? null,
            source: "ozon",
            fetched_at: fetchedAt,
            raw: item,
          },
        };
      }),
    );

    deps.logger.info(`[ozon] prices page ${page + 1}: ${items.length} cards`);

    const next = answer.cursor ?? "";
    if (items.length < PRICES_PAGE || !next || next === cursor) {
      break;
    }
    cursor = next;
  }
};

/** `POST /v4/product/info/stocks`, cursor-paginated; one row per (sku, scheme). */
const syncStocks = async (
  deps: OzonSyncDeps,
  read: OzonReader,
  counter: OzonRunCounter,
): Promise<void> => {
  type Line = { sku?: number | string; type?: string; present?: number; reserved?: number; shipment_type?: string };
  type Item = { offer_id?: string; product_id?: number | string; stocks?: Line[] };
  type Answer = { items?: Item[]; cursor?: string; total?: number };

  let cursor = "";

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const answer = await read<Answer>("product.stocks", {
      body: { cursor, filter: { visibility: "ALL" }, limit: STOCKS_PAGE },
    });

    const items = answer.items ?? [];
    if (!items.length) {
      break;
    }

    const fetchedAt = new Date();
    const rows: Upsert[] = [];

    for (const item of items) {
      for (const line of item.stocks ?? []) {
        const sku = asText(line.sku);
        const type = asText(line.type);
        if (!sku || !type) {
          continue;
        }
        rows.push({
          keys: {
            sku,
            stock_type: type,
            shipment_type: asText(line.shipment_type) ?? "",
          },
          values: {
            product_id: String(item.product_id),
            offer_id: asText(item.offer_id),
            present: asNumber(line.present) ?? 0,
            reserved: asNumber(line.reserved) ?? 0,
            source: "ozon",
            fetched_at: fetchedAt,
            raw: line,
          },
        });
      }
    }

    counter.rows += await upsertRows(deps.ozon, "OzonStock", deps.tenantId, rows);
    deps.logger.info(
      `[ozon] stocks page ${page + 1}: ${rows.length} lines over ${items.length} cards`,
    );

    const next = answer.cursor ?? "";
    if (items.length < STOCKS_PAGE || !next || next === cursor) {
      break;
    }
    cursor = next;
  }
};

/** One posting, from either list, as a mirror row. */
const postingRow = (
  posting: Record<string, unknown>,
  scheme: "fbs" | "fbo",
  fetchedAt: Date,
): Upsert => ({
  keys: { posting_number: String(posting.posting_number) },
  values: {
    order_number: asText(posting.order_number),
    order_id: asText(posting.order_id),
    scheme,
    status: asText(posting.status),
    substatus: asText(posting.substatus),
    products: posting.products ?? null,
    analytics_data: posting.analytics_data ?? null,
    financial_data: posting.financial_data ?? null,
    // v3 FBO sends `created_at`; v4 FBS does not, and its own earliest stamp
    // is `in_process_at`. Read both, invent neither.
    posting_created_at: asDate(posting.created_at),
    in_process_at: asDate(posting.in_process_at),
    cancel_reason_id: asText(posting.cancel_reason_id),
    source: "ozon",
    fetched_at: fetchedAt,
    raw: posting,
  },
});

/**
 * `POST /v4/posting/fbs/list` and `POST /v3/posting/fbo/list`, both
 * cursor-paginated over a bounded window.
 */
const syncPostings = async (
  deps: OzonSyncDeps,
  read: OzonReader,
  counter: OzonRunCounter,
): Promise<void> => {
  type Answer = { postings?: Array<Record<string, unknown>>; cursor?: string; has_next?: boolean };

  const since = new Date(Date.now() - POSTINGS_WINDOW_DAYS * 86_400_000).toISOString();
  const to = new Date().toISOString();

  for (const [endpointId, scheme] of [
    ["posting.fbs.list", "fbs"],
    ["posting.fbo.list", "fbo"],
  ] as const) {
    let cursor = "";

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const answer = await read<Answer>(endpointId, {
        body: {
          cursor,
          filter: { since, to },
          limit: POSTINGS_PAGE,
          sort_dir: "ASC",
          with: { analytics_data: true, financial_data: true },
        },
      });

      const postings = answer.postings ?? [];
      if (!postings.length) {
        break;
      }

      const fetchedAt = new Date();
      counter.rows += await upsertRows(
        deps.ozon,
        "OzonPosting",
        deps.tenantId,
        postings
          .filter((posting) => Boolean(posting.posting_number))
          .map((posting) => postingRow(posting, scheme, fetchedAt)),
      );

      deps.logger.info(
        `[ozon] postings ${scheme} page ${page + 1}: ${postings.length} shipments since ${since}`,
      );

      const next = answer.cursor ?? "";
      if (answer.has_next !== true || !next || next === cursor) {
        break;
      }
      cursor = next;
    }
  }
};

/**
 * `POST /v2/review/list`, paginated by `last_id`, plus `POST /v2/review/count`
 * so the panel can show Ozon's own counters next to what we mirrored.
 *
 * Both need the "Управление отзывами" or Premium Pro subscription. A cabinet
 * without one fails the run with Ozon's own message, which is the honest
 * outcome; an empty mirror with a green run would say "no reviews".
 */
const syncReviews = async (
  deps: OzonSyncDeps,
  read: OzonReader,
  counter: OzonRunCounter,
): Promise<void> => {
  type Review = Record<string, unknown> & { id?: string };
  type Answer = { reviews?: Review[]; has_next?: boolean; last_id?: string };

  const counts = await read<Record<string, unknown>>("review.count", { body: {} });
  deps.logger.info(`[ozon] review counters: ${JSON.stringify(counts)}`);

  let lastId = "";

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const answer = await read<Answer>("review.list", {
      body: { limit: REVIEWS_PAGE, last_id: lastId, sort_dir: "DESC" },
    });

    const reviews = answer.reviews ?? [];
    if (!reviews.length) {
      break;
    }

    const fetchedAt = new Date();
    counter.rows += await upsertRows(
      deps.ozon,
      "OzonReview",
      deps.tenantId,
      reviews
        .filter((review) => Boolean(review.id))
        .map((review) => ({
          keys: { review_id: String(review.id) },
          values: {
            sku: asText(review.sku),
            text: asText(review.text),
            rating: asNumber(review.rating),
            status: asText(review.status),
            order_status: asText(review.order_status),
            comments_amount: asNumber(review.comments_amount) ?? 0,
            photos_amount: asNumber(review.photos_amount) ?? 0,
            videos_amount: asNumber(review.videos_amount) ?? 0,
            is_rating_participant:
              typeof review.is_rating_participant === "boolean"
                ? review.is_rating_participant
                : null,
            published_at: asDate(review.published_at),
            source: "ozon",
            fetched_at: fetchedAt,
            raw: review,
          },
        })),
    );

    deps.logger.info(`[ozon] reviews page ${page + 1}: ${reviews.length}`);

    const next = answer.last_id ?? "";
    if (answer.has_next !== true || !next || next === lastId) {
      break;
    }
    lastId = next;
  }
};

/** `POST /v1/question/list`, paginated by `last_id`. Premium Plus only. */
const syncQuestions = async (
  deps: OzonSyncDeps,
  read: OzonReader,
  counter: OzonRunCounter,
): Promise<void> => {
  type Question = Record<string, unknown> & { id?: string };
  type Answer = { questions?: Question[]; has_next?: boolean; last_id?: string };

  let lastId = "";

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const answer = await read<Answer>("question.list", {
      body: { filter: { status: "ALL" }, limit: QUESTIONS_PAGE, last_id: lastId, sort_dir: "DESC" },
    });

    const questions = answer.questions ?? [];
    if (!questions.length) {
      break;
    }

    const fetchedAt = new Date();
    counter.rows += await upsertRows(
      deps.ozon,
      "OzonQuestion",
      deps.tenantId,
      questions
        .filter((question) => Boolean(question.id))
        .map((question) => ({
          keys: { question_id: String(question.id) },
          values: {
            sku: asText(question.sku),
            text: asText(question.text),
            author_name: asText(question.author_name),
            answers_count: asNumber(question.answers_count) ?? 0,
            status: asText(question.status),
            product_url: asText(question.product_url),
            question_link: asText(question.question_link),
            published_at: asDate(question.published_at),
            source: "ozon",
            fetched_at: fetchedAt,
            raw: question,
          },
        })),
    );

    deps.logger.info(`[ozon] questions page ${page + 1}: ${questions.length}`);

    const next = answer.last_id ?? "";
    if (answer.has_next !== true || !next || next === lastId) {
      break;
    }
    lastId = next;
  }
};

const IMPORTS: Record<
  OzonSyncKind,
  (deps: OzonSyncDeps, read: OzonReader, counter: OzonRunCounter) => Promise<void>
> = {
  products: syncProducts,
  prices: syncPrices,
  stocks: syncStocks,
  postings: syncPostings,
  reviews: syncReviews,
  questions: syncQuestions,
};

/**
 * Runs one import and records it. The run row exists before the first request,
 * so a process killed mid-import leaves a `running` row rather than no trace.
 */
export const runSync = async (
  deps: OzonSyncDeps,
  kind: OzonSyncKind,
): Promise<OzonSyncOutcome> => {
  const isFixture = deps.mode === "fixtures";

  const run = (await deps.ozon.createOzonSyncRuns({
    tenant_id: deps.tenantId,
    kind,
    status: "running",
    is_fixture: isFixture,
    started_at: new Date(),
    rows: 0,
    requests: 0,
  })) as { id: string };

  const counter: OzonRunCounter = { requests: 0, rows: 0 };
  const read = readerFor(deps, run.id, counter);

  try {
    await IMPORTS[kind](deps, read, counter);
    await deps.ozon.updateOzonSyncRuns({
      id: run.id,
      status: "succeeded",
      finished_at: new Date(),
      rows: counter.rows,
      requests: counter.requests,
    });
    deps.logger.info(
      `[ozon] ${kind}: ${counter.rows} rows in ${counter.requests} ` +
        `${isFixture ? "fixture reads" : "Ozon requests"}`,
    );
    return {
      kind,
      runId: run.id,
      rows: counter.rows,
      requests: counter.requests,
      status: "succeeded",
      isFixture,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.ozon.updateOzonSyncRuns({
      id: run.id,
      status: "failed",
      finished_at: new Date(),
      rows: counter.rows,
      requests: counter.requests,
      error: message,
    });
    deps.logger.error(
      `[ozon] ${kind} failed after ${counter.requests} requests and ${counter.rows} rows ` +
        `written: ${message}`,
    );
    return {
      kind,
      runId: run.id,
      rows: counter.rows,
      requests: counter.requests,
      status: "failed",
      isFixture,
      error: message,
    };
  }
};

/**
 * `--kind all` in the order the data depends on itself: prices and stocks read
 * better once the cards they belong to are mirrored.
 */
export const ALL_SYNC_KINDS: readonly OzonSyncKind[] = OZON_SYNC_KINDS;
