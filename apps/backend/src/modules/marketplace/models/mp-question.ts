import { model } from "@medusajs/framework/utils";

/**
 * One customer question about a marketplace listing, NORMALIZED
 * (w12-marketplace-core). Same shape and the same read-only rule as
 * `mp_review`: answering a question is a write on both marketplaces and stands
 * in both deny-lists, so the draft lives here and is copied by hand.
 *
 * WB questions are not mirrored today — its questions method is not registered
 * in `modules/wb/endpoints.ts` — so this table holds Ozon rows only for now.
 * That is a visible zero in the panel ("не импортируется"), not an empty
 * screen pretending there are no questions (rule 20a).
 */
const MpQuestion = model
  .define("mp_question", {
    id: model.id({ prefix: "mpq" }).primaryKey(),
    tenant_id: model.text(),
    marketplace: model.text(),
    external_id: model.text(),
    vendor_code: model.text().nullable(),
    question_text: model.text().nullable(),
    author: model.text().nullable(),
    created_at_mp: model.dateTime().nullable(),
    is_answered: model.boolean().default(false),
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

export default MpQuestion;
