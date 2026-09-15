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
