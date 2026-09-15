import { model } from "@medusajs/framework/utils";

/**
 * One customer review of an Ozon card, mirrored from `POST /v2/review/list`
 * (w11-ozon-readonly-client).
 *
 * Read-only, and here that is not a formality: commenting on a review is
 * `POST /v1/review/comment/create` ("Оставить комментарий на отзыв"), which
 * publishes text under a customer's review in the shop's name. It stands in
 * `OZON_WRITE_PATHS` and no code path can reach it.
 *
 * Ozon gates this data behind a subscription: "Доступно для продавцов с
 * подпиской Управление отзывами или Premium Pro." A cabinet without one
 * answers with an error, and the run row records that rather than an empty
 * mirror pretending there are no reviews (rule 20a).
 */
const OzonReview = model
  .define("ozon_review", {
    id: model.id({ prefix: "ozrev" }).primaryKey(),
    tenant_id: model.text(),
    /** Ozon's own review id, a UUID string. */
    review_id: model.text(),
    /** The card the review is about (`sku`). */
    sku: model.text().nullable(),
    text: model.text().nullable(),
    /** 1..5. */
    rating: model.number().nullable(),
    /** Ozon's own status: NEW, PROCESSED, UNPROCESSED. */
    status: model.text().nullable(),
    order_status: model.text().nullable(),
    comments_amount: model.number().default(0),
    photos_amount: model.number().default(0),
    videos_amount: model.number().default(0),
    is_rating_participant: model.boolean().nullable(),
    /** Ozon's `published_at`: when the customer wrote it. */
    published_at: model.dateTime().nullable(),
    source: model.text().default("ozon"),
    fetched_at: model.dateTime(),
    raw: model.json(),
  })
  .indexes([
    {
      on: ["tenant_id", "review_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default OzonReview;
