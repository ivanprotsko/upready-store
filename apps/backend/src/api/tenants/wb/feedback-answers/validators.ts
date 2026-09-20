import { z } from "@medusajs/framework/zod";

/**
 * `PUT /tenants/wb/feedback-answers` and
 * `POST /tenants/wb/feedback-answers/send` (w22-wb-write-feedback-answers).
 *
 * Two bodies, and the difference between them is the whole point of the task.
 * The PUT only ever writes OUR OWN draft column; it cannot reach Wildberries
 * even in principle. The POST is the one that hands a payload to the write
 * core, and it carries a second confirmation — the sha256 of the exact text
 * the owner was shown in the dialog — so a draft that changed between "look
 * at this" and "send it" is refused instead of sent.
 */

/** A review or a customer question. The two mirrors, no third target. */
export const WB_ANSWER_TARGETS = ["feedback", "question"] as const;

const targetSchema = z.enum(WB_ANSWER_TARGETS);

/**
 * WB's own bound for an answer text, from the documented body of
 * `POST /api/v1/feedbacks/answer`: `text`, string, [ 2 .. 5000 ]. Repeated
 * here so the owner is told at the keyboard rather than by a refusal at the
 * registry's `bodySchema` three steps later.
 */
export const WB_ANSWER_MIN_CHARS = 2;
export const WB_ANSWER_MAX_CHARS = 5000;

export const PutTenantWbFeedbackAnswerBody = z
  .object({
    target: targetSchema,
    /** WB's own id of the review or question (`feedback_id` / `question_id`). */
    id: z.string().min(1).max(200),
    /**
     * The draft. An empty string CLEARS it, which is how the owner abandons an
     * answer: a "delete" verb on a column nobody sends anywhere would be a
     * second way to say the same thing.
     */
    draft_answer: z.string().max(WB_ANSWER_MAX_CHARS),
  })
  .strict();

export type PutTenantWbFeedbackAnswerBodyType = z.infer<typeof PutTenantWbFeedbackAnswerBody>;

export const PostTenantWbFeedbackAnswerSendBody = z
  .object({
    target: targetSchema,
    id: z.string().min(1).max(200),
    /**
     * sha256, lowercase hex, of the draft text the confirmation dialog quoted.
     * The route recomputes it over the STORED draft and refuses on a mismatch:
     * this is the per-answer consent of the task, and it is a comparison rather
     * than a checkbox, so "she confirmed it" means "she confirmed THIS text".
     */
    answer_sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/, {
        message: "answer_sha256 must be a lowercase hex sha256 of the confirmed text.",
      })
      .optional(),
    /**
     * Which registered mutation to ask for. Absent means "answer it", which
     * resolves to `wb.feedbacks.answer`. `view` is the one documented question
     * mutation, "mark as viewed" (`wb.questions.view`).
     */
    intent: z.enum(["answer", "view"]).default("answer"),
  })
  .strict()
  .refine((body) => body.intent !== "answer" || Boolean(body.answer_sha256), {
    message: "answer_sha256 is required when intent is \"answer\".",
    path: ["answer_sha256"],
  });

export type PostTenantWbFeedbackAnswerSendBodyType = z.infer<
  typeof PostTenantWbFeedbackAnswerSendBody
>;
