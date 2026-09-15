import { model } from "@medusajs/framework/utils";

/**
 * One customer review of a marketplace listing, NORMALIZED
 * (w12-marketplace-core). The "reviews" row of the parity matrix is one screen
 * over both marketplaces, and this is the table behind it.
 *
 * READ-ONLY, like everything else here. `answer_draft` exists because the
 * owner writes her answer in our panel and copies it into the marketplace's
 * own cabinet by hand: answering through the API is a WRITE
 * (`POST /api/v1/feedbacks/answer` on WB, `/v1/review/comment/create` on
 * Ozon), both of them stand in the mutation deny-lists, and neither can be
 * registered as a read. The draft never leaves our database.
 */
const MpReview = model
  .define("mp_review", {
    id: model.id({ prefix: "mprev" }).primaryKey(),
    tenant_id: model.text(),
    marketplace: model.text(),
    external_id: model.text(),
    vendor_code: model.text().nullable(),
    rating: model.number().nullable(),
    text: model.text().nullable(),
    pros: model.text().nullable(),
    cons: model.text().nullable(),
    author: model.text().nullable(),
    created_at_mp: model.dateTime().nullable(),
    is_answered: model.boolean().default(false),
    /** The owner's own draft. Written by her, never sent anywhere. */
    answer_draft: model.text().nullable(),
    answer_draft_at: model.dateTime().nullable(),
    source_row_id: model.text(),
    synced_at: model.dateTime(),
  })
  .indexes([
    {
      on: ["tenant_id", "marketplace", "external_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default MpReview;
