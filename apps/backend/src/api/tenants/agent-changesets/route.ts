import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { createDraft, type ChangesetRow } from "../../../agent-changesets/lifecycle";
import { answerRefusal, callerOf, opViewsOf, siteLinksOf, summaryOf } from "./changeset-http";
import type { PostAgentChangesetBody } from "./validators";

/**
 * `GET`/`POST /tenants/agent-changesets` (t-2026-10-27-04): the owner's
 * agent's changes to the site, newest first, and a new draft.
 *
 * A draft is only stored. `…/:id/stage` writes it to the stage site,
 * `…/:id/publish` to the live one, `…/:id/rollback` undoes it there,
 * `…/:id/discard` drops it. Each runs the ops as the caller, through the same
 * routes the panel calls (`agent-changesets/loopback.ts`).
 */

const LIMIT_MAX = 100;

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const caller = callerOf(req);
  const service: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), LIMIT_MAX);
  const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);
  const status = typeof req.query.status === "string" && req.query.status ? req.query.status : undefined;

  const [rows, count] = await service.listAndCountAgentChangesets(
    { tenant_id: caller.tenant_id, ...(status ? { status: status as ChangesetRow["status"] } : {}) },
    { order: { created_at: "DESC" }, take: limit, skip: offset },
  );

  res.json({
    agent_changesets: (rows as unknown as ChangesetRow[]).map(summaryOf),
    count,
    offset,
    limit,
    sites: await siteLinksOf(req, caller.tenant_id),
  });
};

export const POST = async (req: AuthenticatedMedusaRequest<PostAgentChangesetBody>, res: MedusaResponse) => {
  const caller = callerOf(req);
  try {
    const row = await createDraft(req.scope, caller, req.validatedBody);
    res.status(201).json({
      agent_changeset: { ...summaryOf(row), ops: await opViewsOf(req, caller, row) },
      sites: await siteLinksOf(req, caller.tenant_id),
    });
  } catch (error) {
    if (!answerRefusal(res, error)) throw error;
  }
};
