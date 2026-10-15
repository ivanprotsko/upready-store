import {
  type OzonSyncDeps,
  MAX_PAGES,
  asText,
  asNumber,
  asDate,
  type OzonRunCounter,
  type OzonReader,
  upsertRows,
} from "./core";

/**
 * What buyers write: reviews and questions.
 *
 * `../sync.ts` runs the imports and re-exports what callers use from here
 * (t-2026-10-14-55).
 */

/** `POST /v2/review/list`: "Количество отзывов в ответе" is [20..100]. */
const REVIEWS_PAGE = 100;

/** `POST /v1/question/list`: limit <= 100. */
const QUESTIONS_PAGE = 100;

/**
 * `POST /v2/review/list`, paginated by `last_id`, plus `POST /v2/review/count`
 * so the panel can show Ozon's own counters next to what we mirrored.
 *
 * Both need the "Управление отзывами" or Premium Pro subscription. A cabinet
 * without one fails the run with Ozon's own message, which is the honest
 * outcome; an empty mirror with a green run would say "no reviews".
 */
export const syncReviews = async (
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
export const syncQuestions = async (
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
