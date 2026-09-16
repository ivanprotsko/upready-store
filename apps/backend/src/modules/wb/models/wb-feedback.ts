import { model } from "@medusajs/framework/utils";

/**
 * One customer review of a WB listing, mirrored from
 * `GET /api/v1/feedbacks` (w01-wb-readonly-client).
 *
 * Read-only: answering a review is `POST /api/v1/feedbacks/answer`, which is a
 * write and therefore absent from `endpoints.ts`. The mirror exists so the
 * shop's own review corpus (`product_review`, t09) can later be fed from WB by
 * a task that Ivan approves, not so anything here talks back to customers.
 */
const WbFeedback = model
  .define("wb_feedback", {
    id: model.id({ prefix: "wbfb" }).primaryKey(),
    tenant_id: model.text(),
    /** WB's own feedback id (a string). */
    feedback_id: model.text(),
    nm_id: model.text().nullable(),
    /** WB's `productValuation`: the star rating, 1..5. */
    product_valuation: model.number().nullable(),
    text: model.text().nullable(),
    pros: model.text().nullable(),
    cons: model.text().nullable(),
    user_name: model.text().nullable(),
    is_answered: model.boolean().default(false),
    /** WB's `createdDate`: when the customer wrote it. */
    created_date: model.dateTime().nullable(),
    /**
     * The answer the owner is drafting, before anything is sent
     * (w22-wb-write-feedback-answers). Nullable: most rows never get one.
     */
    draft_answer: model.text().nullable(),
    /**
     * Where that draft stands. `sent` is reachable ONLY when a real request
     * left the process, so a dry run through the write core leaves the row at
     * `confirmed` — the status may never say more than happened (rule 20a).
     */
    answer_status: model
      .enum(["draft", "confirmed", "sent", "failed"])
      .default("draft"),
    /** sha256 of the draft TEXT the owner confirmed, not of the request body. */
    answer_sha256: model.text().nullable(),
    /** The tenant admin who pressed the confirmation. Same id the audit row carries. */
    answer_confirmed_by: model.text().nullable(),
    answer_confirmed_at: model.dateTime().nullable(),
    /** Why the last attempt failed, in the owner's terms. */
    answer_error: model.text().nullable(),
    source: model.text().default("wb"),
    fetched_at: model.dateTime(),
    raw: model.json(),
  })
  .indexes([
    {
      on: ["tenant_id", "feedback_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default WbFeedback;
