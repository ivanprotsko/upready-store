import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { MARKETPLACE_WRITE_MODULE } from "../../../../../modules/marketplace-write";
import { createMedusaWriteStore } from "../../../../../modules/marketplace-write/medusa-store";
import type MarketplaceWriteModuleService from "../../../../../modules/marketplace-write/service";
import { MarketplaceWriteRefused } from "../../../../../modules/marketplace-write/types";
import {
  planWbAnswerDispatch,
  type WbAnswerRow,
  type WbAnswerStatus,
} from "../../../../../modules/wb-write/feedback-answers";
import { WB_MARKETPLACE } from "../../../../../modules/wb-write/write-endpoints";
import { wbWrite } from "../../../../../modules/wb-write/write-transport";
import { getTenantScope } from "../../../tenant-scope";
import { readFeedbackAnswersState } from "../route";
import type { PostTenantWbFeedbackAnswerSendBodyType } from "../validators";

/**
 * `POST /tenants/wb/feedback-answers/send` — the one route of this task that
 * hands a payload to the write core (w22-wb-write-feedback-answers).
 *
 * It is the FIRST production caller of `wbWrite` in this repository. What that
 * changes is smaller than it sounds: the five gates of w20 are untouched, the
 * env var that turns a dry run into a request is set by no deployment, and no
 * shop has a `wildberries_write` credential — so every call this route can
 * make today ends as one audit row with `dry_run = true` and nothing on a
 * wire. `modules/wb-write/__tests__/no-live-write-call-site.unit.spec.ts` now
 * names this file explicitly and still refuses any other caller.
 *
 * Two layers of gate stand in front of that call and both are needed:
 *
 *   this file    is there a draft, is it the text she confirmed, has this
 *                review already been answered, is the mutation registered at
 *                all — questions about a MIRROR ROW, which the core never sees
 *   the core     credential, credential usable, shop switch, per-class consent,
 *                documented body, live env var
 *
 * The row's own status is written from what actually happened, never from what
 * was asked for: a dry run leaves `confirmed`, and `sent` appears only when
 * the core reports `dryRun: false` (rule 20a).
 */

type OutcomeBody = {
  ok: boolean;
  /** `dry_run`, `sent`, `refused_locally` or `refused_by_gate`. */
  outcome: "dry_run" | "sent" | "refused_locally" | "refused_by_gate";
  /** Plain Russian, shown to the owner as it is. */
  message: string;
  endpoint_id: string | null;
  /** Which of the core's five gates said no, when one did. */
  gate: string | null;
  /** sha256 of the answer TEXT the owner confirmed. Ties the row to the audit. */
  text_sha256: string | null;
  /** sha256 of the request BODY, as `marketplace_write_audit` stores it. */
  payload_sha256: string | null;
};

const TABLES = {
  feedback: { table: "wb_feedback", idColumn: "feedback_id" },
  question: { table: "wb_question", idColumn: "question_id" },
} as const;

export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantWbFeedbackAnswerSendBodyType>,
  res: MedusaResponse,
) => {
  const body = req.validatedBody;
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const writeService = req.scope.resolve<MarketplaceWriteModuleService>(MARKETPLACE_WRITE_MODULE);
  const actor = req.auth_context.actor_id;

  const { table, idColumn } = TABLES[body.target];

  const stored = (await pg(table)
    .where({ tenant_id: tenant.id, [idColumn]: body.id })
    .whereNull("deleted_at")
    .first(
      "id",
      `${idColumn} as wb_id`,
      "is_answered",
      "draft_answer",
      "answer_status",
      ...(body.target === "question" ? ["was_viewed"] : []),
    )) as (WbAnswerRow & { was_viewed?: boolean | null }) | undefined;

  // A foreign id is a missing id (`tenant-scope.ts`).
  if (!stored) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `No mirrored ${body.target} ${body.id} for this shop.`,
    );
  }

  const row: WbAnswerRow = {
    id: stored.id,
    wb_id: stored.wb_id,
    is_answered: Boolean(stored.is_answered),
    was_viewed: stored.was_viewed ?? null,
    draft_answer: stored.draft_answer,
    answer_status: stored.answer_status as WbAnswerStatus,
  };

  const plan = planWbAnswerDispatch({
    target: body.target,
    intent: body.intent,
    row,
    confirmedSha256: body.answer_sha256 ?? null,
  });

  if (!plan.ok) {
    // Refused before the core is asked anything, so there is no audit row to
    // write: nothing was attempted against Wildberries. The reason is the
    // response, and the screen prints it verbatim.
    const payload: OutcomeBody = {
      ok: false,
      outcome: "refused_locally",
      message: plan.message,
      endpoint_id: null,
      gate: plan.refusal,
      text_sha256: null,
      payload_sha256: null,
    };
    res.status(422).json({ result: payload, state: await readFeedbackAnswersState(req) });
    return;
  }

  const store = createMedusaWriteStore({
    pg,
    service: writeService,
    tenantId: tenant.id,
    marketplace: WB_MARKETPLACE,
  });

  let result: OutcomeBody;
  let nextStatus: WbAnswerStatus | null = null;
  let nextError: string | null = null;

  try {
    const written = await wbWrite(
      plan.endpointId,
      { body: plan.body },
      { tenantId: tenant.id, actor, store },
    );

    // `dryRun: true` is the only value this repository can produce today, and
    // the status below says exactly that rather than "sent".
    nextStatus = written.dryRun ? "confirmed" : "sent";
    result = {
      ok: true,
      outcome: written.dryRun ? "dry_run" : "sent",
      message: written.dryRun
        ? "Черновой прогон: ответ проверен по документации Wildberries и записан в журнал, " +
          "в Wildberries ничего не ушло — живой режим выключен."
        : "Ответ отправлен в Wildberries.",
      endpoint_id: written.endpointId,
      gate: null,
      text_sha256: plan.textSha256,
      payload_sha256: written.payloadSha256,
    };
  } catch (error) {
    if (!(error instanceof MarketplaceWriteRefused)) {
      throw error;
    }
    // The core journalled this refusal itself, with the gate on the row.
    nextStatus = "failed";
    nextError = error.message;
    result = {
      ok: false,
      outcome: "refused_by_gate",
      message: error.message,
      endpoint_id: error.endpointId,
      gate: error.gate,
      text_sha256: plan.textSha256,
      payload_sha256: null,
    };
  }

  // "Mark as viewed" is not an answer, so it never touches the answer columns.
  if (body.intent === "answer") {
    await pg(table)
      .where({ tenant_id: tenant.id, [idColumn]: body.id })
      .whereNull("deleted_at")
      .update({
        answer_status: nextStatus,
        answer_sha256: plan.textSha256,
        answer_confirmed_by: actor,
        answer_confirmed_at: new Date(),
        answer_error: nextError,
        updated_at: new Date(),
      });
  }

  res
    .status(result.ok ? 200 : 422)
    .json({ result, state: await readFeedbackAnswersState(req) });
};
