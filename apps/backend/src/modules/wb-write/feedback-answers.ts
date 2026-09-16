import { createHash } from "node:crypto";
import { WB_UNREGISTERED_MUTATIONS } from "./write-endpoints";

/**
 * What may be dispatched for one review or one question, decided BEFORE the
 * write core is asked anything (w22-wb-write-feedback-answers).
 *
 * The five gates of w20 answer "may this shop mutate this class at all". They
 * cannot answer "is this the text she looked at" or "has this review already
 * been answered", because they never see a mirror row. Those are this file's
 * gates, and they are pure functions over a row plus what the caller claims,
 * so the route is a translator and every refusal has a unit test:
 *
 *   (1) the mutation is REGISTERED           — answering a question is not, see below
 *   (2) there IS a draft, within WB's bounds — you cannot send what you did not write
 *   (3) the item is not already answered     — nobody answers a customer twice
 *   (4) the confirmation matches the DRAFT   — per-answer consent, by comparison
 *
 * (4) is the per-answer consent Ivan's order of 2026-09-16 04:44 WITA asks for,
 * on top of the per-CLASS consent of w20. It is a sha256 of the exact text the
 * dialog quoted, recomputed here over the stored draft: a draft edited in
 * another tab between "look at this" and "send it" is refused rather than sent,
 * and the same hash then travels into the audit row next to the actor id.
 */

export const WB_ANSWER_TARGETS = ["feedback", "question"] as const;
export type WbAnswerTarget = (typeof WB_ANSWER_TARGETS)[number];

export type WbAnswerIntent = "answer" | "view";

export type WbAnswerStatus = "draft" | "confirmed" | "sent" | "failed";

/** WB's documented bounds for `text` in `POST /api/v1/feedbacks/answer`. */
export const WB_ANSWER_MIN_CHARS = 2;
export const WB_ANSWER_MAX_CHARS = 5000;

/** The mirror row as these gates need it. Deliberately small. */
export type WbAnswerRow = {
  /** Our own row id, for the update. */
  id: string;
  /** WB's own id: `feedback_id` or `question_id`. This is what WB is told. */
  wb_id: string;
  /** What the mirror says WB already knows. */
  is_answered: boolean;
  /** Questions only. `null` for a review, which WB does not mark as viewed. */
  was_viewed: boolean | null;
  draft_answer: string | null;
  answer_status: WbAnswerStatus;
};

/** Why a dispatch was refused. The panel maps these to the owner's language. */
export const WB_ANSWER_REFUSALS = [
  "unregistered_mutation",
  "no_draft",
  "text_too_short",
  "text_too_long",
  "already_answered",
  "already_sent",
  "confirmation_missing",
  "confirmation_mismatch",
  "not_applicable",
  "already_viewed",
] as const;

export type WbAnswerRefusal = (typeof WB_ANSWER_REFUSALS)[number];

export type WbAnswerPlan =
  | {
      ok: true;
      /** An id of `WB_WRITE_ENDPOINTS`. The route names nothing else. */
      endpointId: string;
      body: Record<string, unknown>;
      /** sha256 of the answer TEXT, or `null` where there is no text. */
      textSha256: string | null;
    }
  | {
      ok: false;
      refusal: WbAnswerRefusal;
      /** Plain Russian, shown to the owner as it is. */
      message: string;
    };

/**
 * The fingerprint the panel and this file both compute over the SAME string:
 * the answer text, not the request body. `execute.ts` hashes the body and
 * stores that on the audit row; this one ties the audit row back to the draft
 * the owner actually read.
 */
export const answerTextSha256 = (text: string): string =>
  createHash("sha256").update(text, "utf8").digest("hex");

const QUESTION_ANSWER_GAP = WB_UNREGISTERED_MUTATIONS[0];

export const planWbAnswerDispatch = (input: {
  target: WbAnswerTarget;
  intent: WbAnswerIntent;
  row: WbAnswerRow;
  /** What the confirmation dialog hashed. Required for `intent: "answer"`. */
  confirmedSha256?: string | null;
}): WbAnswerPlan => {
  const { target, intent, row } = input;

  if (intent === "view") {
    if (target !== "question") {
      return {
        ok: false,
        refusal: "not_applicable",
        message:
          "«Отметить просмотренным» есть только у вопросов покупателей: для отзывов " +
          "Wildberries такой операции в документации нет.",
      };
    }
    if (row.was_viewed === true) {
      return {
        ok: false,
        refusal: "already_viewed",
        message: "Этот вопрос уже отмечен просмотренным в кабинете Wildberries.",
      };
    }
    return {
      ok: true,
      endpointId: "wb.questions.view",
      // Verbatim from the documented `ViewQuestion` sample.
      body: { id: row.wb_id, wasViewed: true },
      textSha256: null,
    };
  }

  // (1) A mutation that is not in the registry cannot be expressed at all, and
  // the reason is the documentation gap rather than a decision of ours.
  if (target === "question") {
    return {
      ok: false,
      refusal: "unregistered_mutation",
      message: QUESTION_ANSWER_GAP.reason,
    };
  }

  // (3) before (2): an item WB already answered is not a draft problem, and
  // telling the owner "напишите ответ" about a review she answered last week
  // would be the wrong sentence.
  if (row.is_answered) {
    return {
      ok: false,
      refusal: "already_answered",
      message:
        "На этот отзыв ответ уже опубликован в Wildberries. Повторный ответ платформа " +
        "не отправляет; правка опубликованного ответа — отдельная операция, её пока нет.",
    };
  }

  if (row.answer_status === "sent") {
    return {
      ok: false,
      refusal: "already_sent",
      message:
        "Ответ на этот отзыв уже был отправлен из панели. Второй раз он не уйдёт.",
    };
  }

  // (2) There has to be a draft, and it has to fit what WB documents.
  const draft = (row.draft_answer ?? "").trim();

  if (!draft) {
    return {
      ok: false,
      refusal: "no_draft",
      message: "Сначала напишите текст ответа: отправлять нечего.",
    };
  }

  if (draft.length < WB_ANSWER_MIN_CHARS) {
    return {
      ok: false,
      refusal: "text_too_short",
      message: `Ответ короче ${WB_ANSWER_MIN_CHARS} символов — Wildberries такой не принимает.`,
    };
  }

  if (draft.length > WB_ANSWER_MAX_CHARS) {
    return {
      ok: false,
      refusal: "text_too_long",
      message: `Ответ длиннее ${WB_ANSWER_MAX_CHARS} символов — Wildberries такой не принимает.`,
    };
  }

  // (4) The per-answer confirmation, as a comparison and not a flag.
  if (!input.confirmedSha256) {
    return {
      ok: false,
      refusal: "confirmation_missing",
      message: "Подтверждение ответа не передано: отправка без подтверждения не делается.",
    };
  }

  const actual = answerTextSha256(draft);

  if (actual !== input.confirmedSha256) {
    return {
      ok: false,
      refusal: "confirmation_mismatch",
      message:
        "Текст ответа изменился после того, как вы его подтвердили. Прочитайте новый " +
        "текст и подтвердите ещё раз — отправляем только то, что вы видели.",
    };
  }

  return {
    ok: true,
    endpointId: "wb.feedbacks.answer",
    // The documented body: `id` (string) and `text` (string, 2..5000).
    body: { id: row.wb_id, text: draft },
    textSha256: actual,
  };
};
