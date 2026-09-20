import { model } from "@medusajs/framework/utils";

/**
 * One customer question about an Ozon card, mirrored from
 * `POST /v1/question/list` (w11-ozon-readonly-client).
 *
 * Read-only: answering a question is `POST /v1/question/answer/create`, which
 * stands in `OZON_WRITE_PATHS`.
 *
 * Ozon gates this behind a subscription too: "Доступно для продавцов с
 * подпиской Premium Plus." A cabinet without one gets a failed run with the
 * message, never a silently empty mirror.
 */
const OzonQuestion = model
  .define("ozon_question", {
    id: model.id({ prefix: "ozq" }).primaryKey(),
    tenant_id: model.text(),
    /** Ozon's own question id, a UUID string. */
    question_id: model.text(),
    sku: model.text().nullable(),
    text: model.text().nullable(),
    author_name: model.text().nullable(),
    answers_count: model.number().default(0),
    /** Ozon's own status, e.g. NEW or PROCESSED. */
    status: model.text().nullable(),
    product_url: model.text().nullable(),
    question_link: model.text().nullable(),
    published_at: model.dateTime().nullable(),
    source: model.text().default("ozon"),
    fetched_at: model.dateTime(),
    raw: model.json(),
  })
  .indexes([
    {
      on: ["tenant_id", "question_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default OzonQuestion;
