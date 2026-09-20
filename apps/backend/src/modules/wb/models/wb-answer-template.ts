import { model } from "@medusajs/framework/utils";

/**
 * One ready-made answer the owner can drop into a draft
 * (w22-wb-write-feedback-answers).
 *
 * Per TENANT, not per platform: two shops answer their customers differently,
 * and the three Russian defaults this repository ships are a starting point a
 * shop is expected to edit, not a house style. `ensureDefaultAnswerTemplates`
 * in `answer-templates.ts` creates them once per tenant and never overwrites a
 * row afterwards, so an edited default stays edited.
 *
 * A template is TEXT and nothing else. It is copied into `draft_answer` in the
 * panel, the owner reads what she is about to send, and the confirmation
 * hashes the final text — so a template can never become an answer the owner
 * did not look at.
 */
const WbAnswerTemplate = model
  .define("wb_answer_template", {
    id: model.id({ prefix: "wbtpl" }).primaryKey(),
    tenant_id: model.text(),
    /** Stable per tenant, so a default can be recognised after it is edited. */
    slug: model.text(),
    title: model.text(),
    body: model.text(),
    /**
     * What the template is for: a review, a question, or both. The picker
     * shows only the templates that match what is being answered.
     */
    target: model.enum(["feedback", "question", "both"]).default("both"),
    /** Ascending. The three defaults take 10, 20, 30 so a custom one fits between. */
    sort_order: model.number().default(100),
    /** `true` for a row this repository seeded. Never re-seeded, only created once. */
    is_builtin: model.boolean().default(false),
  })
  .indexes([
    {
      on: ["tenant_id", "slug"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default WbAnswerTemplate;
