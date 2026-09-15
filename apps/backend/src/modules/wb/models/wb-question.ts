import { model } from "@medusajs/framework/utils";

/**
 * One customer question about a WB listing, mirrored from
 * `GET /api/v1/questions` (w03-wb-sales-questions-mirror).
 *
 * Read-only, and here the distinction is sharp: answering a question is
 * `PATCH /api/v1/questions`, the SAME path with a write verb, and the registry
 * cannot hold a PATCH at all (`endpoints.ts`). So this mirror can show the
 * owner what customers are asking and can never answer on their behalf.
 *
 * `isAnswered` is a required query parameter, so the import makes two passes
 * and records which pass a row came from in `is_answered`.
 */
const WbQuestion = model
  .define("wb_question", {
    id: model.id({ prefix: "wbq" }).primaryKey(),
    tenant_id: model.text(),
    /** WB's own question id (a string, e.g. `2ncBtX4B9I0UHoornoqG`). */
    question_id: model.text(),
    nm_id: model.text().nullable(),
    imt_id: model.text().nullable(),
    product_name: model.text().nullable(),
    supplier_article: model.text().nullable(),
    brand_name: model.text().nullable(),
    /** What the customer asked. */
    text: model.text().nullable(),
    /** The seller's answer text, when there is one. WB sends `answer: null` otherwise. */
    answer_text: model.text().nullable(),
    /** WB's `state`, e.g. `suppliersPortalSynch`. Kept as WB spells it. */
    state: model.text().nullable(),
    /** Which `isAnswered` pass this row came from. */
    is_answered: model.boolean().default(false),
    /** WB's `wasViewed`: whether the seller has opened it in the cabinet. */
    was_viewed: model.boolean().nullable(),
    /** WB's `isWarned`. */
    is_warned: model.boolean().nullable(),
    /** WB's `createdDate`: when the customer asked. */
    created_date: model.dateTime().nullable(),
    source: model.text().default("wb"),
    fetched_at: model.dateTime(),
    raw: model.json(),
  })
  .indexes([
    {
      on: ["tenant_id", "question_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["tenant_id", "is_answered", "created_date"],
      where: "deleted_at IS NULL",
    },
  ]);

export default WbQuestion;
