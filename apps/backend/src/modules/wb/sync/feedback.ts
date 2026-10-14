import {
  type WbSyncDeps,
  MAX_PAGES,
  asText,
  asNumber,
  asDate,
  type WbRunCounter,
  type WbReader,
  upsertRows,
} from "./core";

/**
 * What buyers write: feedbacks and questions.
 *
 * `../sync.ts` runs the imports and re-exports what callers use from here
 * (t-2026-10-14-55).
 */

/** `GET /api/v1/feedbacks`: `take` is capped at 5000 by the docs. */
const FEEDBACKS_PAGE = 1000;

/**
 * `GET /api/v1/questions`: "the maximum possible value for the parameter is
 * 10,000, and the total amount of take and skip parameters must not exceed
 * 10,000".
 */
const QUESTIONS_PAGE = 1000;
const QUESTIONS_WINDOW = 10_000;

/** `GET /api/v1/feedbacks`, both halves, since `isAnswered` is a required parameter. */
export const syncFeedbacks = async (deps: WbSyncDeps, read: WbReader, counter: WbRunCounter): Promise<void> => {
  type Feedback = Record<string, unknown> & { id?: string };
  type Answer = { data?: { feedbacks?: Feedback[] } };

  for (const isAnswered of [false, true]) {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const answer = await read<Answer>("feedbacks.list", {
        query: { isAnswered, take: FEEDBACKS_PAGE, skip: page * FEEDBACKS_PAGE, order: "dateDesc" },
      });

      const feedbacks = answer.data?.feedbacks ?? [];
      if (!feedbacks.length) {
        break;
      }

      const fetchedAt = new Date();
      counter.rows += await upsertRows(
        deps.wb,
        "WbFeedback",
        deps.tenantId,
        feedbacks
          .filter((feedback) => Boolean(feedback.id))
          .map((feedback) => {
            const details = (feedback.productDetails ?? {}) as Record<string, unknown>;
            return {
              keys: { feedback_id: String(feedback.id) },
              values: {
                nm_id: asText(details.nmId),
                product_valuation: asNumber(feedback.productValuation),
                text: asText(feedback.text),
                pros: asText(feedback.pros),
                cons: asText(feedback.cons),
                user_name: asText(feedback.userName),
                is_answered: isAnswered,
                created_date: asDate(feedback.createdDate),
                source: "wb",
                fetched_at: fetchedAt,
                raw: feedback,
              },
            };
          }),
      );

      deps.logger.info(
        `[wb] feedbacks (isAnswered=${isAnswered}) page ${page + 1}: ${feedbacks.length} reviews`,
      );

      if (feedbacks.length < FEEDBACKS_PAGE) {
        break;
      }
    }
  }

};

/**
 * `GET /api/v1/questions`, both halves, since `isAnswered` is required here
 * too. The answering method is a PATCH on the same path and is not, and
 * cannot be, in the registry.
 */
export const syncQuestions = async (
  deps: WbSyncDeps,
  read: WbReader,
  counter: WbRunCounter,
): Promise<void> => {
  type Question = Record<string, unknown> & { id?: string };
  type Answer = {
    data?: { countUnanswered?: number; countArchive?: number; questions?: Question[] };
  };

  const passes =
    deps.limits?.questionsAnswered === undefined ? [false, true] : [deps.limits.questionsAnswered];

  if (passes.length === 1) {
    deps.logger.info(
      `[wb] questions: only the isAnswered=${passes[0]} half this run, by WB_QUESTIONS_ANSWERED`,
    );
  }

  for (const isAnswered of passes) {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const skip = page * QUESTIONS_PAGE;
      if (skip + QUESTIONS_PAGE > QUESTIONS_WINDOW) {
        deps.logger.warn(
          `[wb] questions (isAnswered=${isAnswered}) stopped at skip ${skip}: WB caps ` +
            `take + skip at ${QUESTIONS_WINDOW}.`,
        );
        break;
      }

      const answer = await read<Answer>("feedbacks.questions", {
        query: { isAnswered, take: QUESTIONS_PAGE, skip, order: "dateDesc" },
      });

      const questions = answer.data?.questions ?? [];
      if (!questions.length) {
        break;
      }

      const fetchedAt = new Date();
      counter.rows += await upsertRows(
        deps.wb,
        "WbQuestion",
        deps.tenantId,
        questions
          .filter((question) => Boolean(question.id))
          .map((question) => {
            const details = (question.productDetails ?? {}) as Record<string, unknown>;
            const answerBody = (question.answer ?? null) as Record<string, unknown> | null;
            return {
              keys: { question_id: String(question.id) },
              values: {
                nm_id: asText(details.nmId),
                imt_id: asText(details.imtId),
                product_name: asText(details.productName),
                supplier_article: asText(details.supplierArticle),
                brand_name: asText(details.brandName),
                text: asText(question.text),
                answer_text: asText(answerBody?.text),
                state: asText(question.state),
                is_answered: isAnswered,
                was_viewed: typeof question.wasViewed === "boolean" ? question.wasViewed : null,
                is_warned: typeof question.isWarned === "boolean" ? question.isWarned : null,
                created_date: asDate(question.createdDate),
                source: "wb",
                fetched_at: fetchedAt,
                raw: question,
              },
            };
          }),
      );

      deps.logger.info(
        `[wb] questions (isAnswered=${isAnswered}) page ${page + 1}: ${questions.length} questions ` +
          `(WB counts ${answer.data?.countUnanswered ?? "?"} unanswered, ` +
          `${answer.data?.countArchive ?? "?"} archived)`,
      );

      if (questions.length < QUESTIONS_PAGE) {
        break;
      }
    }
  }
};
