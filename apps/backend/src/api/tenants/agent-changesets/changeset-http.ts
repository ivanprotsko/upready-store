import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { getTenantAdminAccess } from "../tenant-admin-gate";
import { classifyOp } from "../../../agent-changesets/allow-list";
import { afterOf, changedFields, type FieldChange } from "../../../agent-changesets/diff";
import { ChangesetRefusal, type ChangesetRow } from "../../../agent-changesets/lifecycle";
import { readAs, type Caller } from "../../../agent-changesets/loopback";
import { OP_SPECS, productIdOf, type ChangesetOp, type OpValue } from "../../../agent-changesets/ops";
import { STAGE_HOST_KEY, stageTenantIdOf } from "../../../agent-changesets/stage";

/**
 * What the `/tenants/agent-changesets/*` routes share (t-2026-10-27-04): who
 * the caller is, which changeset the path names, how a refusal answers, and
 * the panel's view of one changeset.
 */

export const callerOf = (req: AuthenticatedMedusaRequest): Caller => {
  const access = getTenantAdminAccess(req);
  return {
    admin_id: access.id,
    email: access.email,
    role: access.role,
    tenant_id: access.tenant_id,
    auth_identity_id: req.auth_context.auth_identity_id ?? "",
  };
};

const service = (req: AuthenticatedMedusaRequest): TenantModuleService => req.scope.resolve(TENANT_MODULE);

/**
 * The changeset `:id` names on the caller's own site. `latest` is the last one
 * published and not yet rolled back: «откатить последнее» needs no id.
 * Another site's changeset answers 404, the same as one that does not exist.
 */
export const loadChangeset = async (req: AuthenticatedMedusaRequest, id: string): Promise<ChangesetRow> => {
  const caller = callerOf(req);
  const [row] =
    id === "latest"
      ? await service(req).listAgentChangesets(
          { tenant_id: caller.tenant_id, status: "published" },
          { order: { published_at: "DESC" }, take: 1 },
        )
      : await service(req).listAgentChangesets({ id, tenant_id: caller.tenant_id }, { take: 1 });

  if (!row) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Agent changeset ${id} was not found.`);
  }
  return row as unknown as ChangesetRow;
};

/** A refusal answers its own status and code; anything else goes to Medusa's error handler. */
export const answerRefusal = (res: MedusaResponse, error: unknown): boolean => {
  if (!(error instanceof ChangesetRefusal)) return false;
  res.status(error.status).json({ type: error.code, message: error.message, ...error.details });
  return true;
};

// ---- the sites a changeset is seen on

export type SiteLinks = { main_url: string | null; stage_url: string | null };

const urlOf = (host: string | null | undefined) => (host ? `https://${host}` : null);

/** The live site's address and its stage copy's, for the panel's «посмотреть» links. */
export const siteLinksOf = async (req: AuthenticatedMedusaRequest, tenantId: string): Promise<SiteLinks> => {
  const main = await service(req).retrieveTenant(tenantId, { relations: ["domains"] });
  const primary = (main.domains ?? []).find((domain) => domain?.is_primary)?.host ?? null;

  const stageId = stageTenantIdOf(main.metadata);
  let stageHost: string | null = null;
  if (stageId) {
    const stage = await service(req).retrieveTenant(stageId);
    const fromMetadata = (stage.metadata as Record<string, unknown> | null)?.[STAGE_HOST_KEY];
    stageHost = typeof fromMetadata === "string" ? fromMetadata : null;
  }

  return { main_url: urlOf(primary), stage_url: urlOf(stageHost) };
};

const segments = (path: string) => path.split("?")[0].split("/").filter(Boolean);

/**
 * Where the storefront shows an op's target: `/` for the home page,
 * `/pages/<key>`, `/journal/<slug>`, `/products/<handle>`. Branding shows on
 * every page, so it links to `/`. A product needs its handle, which only a
 * read gives; without one it has no path.
 */
export const previewPathOf = (op: ChangesetOp, productHandle?: string | null): string | null => {
  const rule = classifyOp(op.method, op.path);
  if (rule.verdict !== "allow") return null;
  const parts = segments(op.path);
  switch (rule.kind) {
    case "home":
    case "branding":
      return "/";
    case "page":
      return `/pages/${parts[2]}`;
    case "page-create":
      return `/pages/${String(op.body?.slug ?? "")}`;
    case "article":
      return `/journal/${parts[2]}`;
    case "article-create":
      return `/journal/${String(op.body?.slug ?? "")}`;
    default:
      return productHandle ? `/products/${productHandle}` : null;
  }
};

// ---- the panel's view

export type OpView = {
  index: number;
  method: string;
  path: string;
  kind: string | null;
  scope: string | null;
  preview_path: string | null;
  before: OpValue;
  after: OpValue;
  changes: FieldChange[];
};

/** A row as the list shows it: no ops' bodies, no snapshot. */
export const summaryOf = (row: ChangesetRow) => ({
  id: row.id,
  status: row.status,
  source: row.source,
  summary: row.summary,
  author_email: row.author_email,
  op_count: Array.isArray(row.ops) ? row.ops.length : 0,
  op_kinds: [
    ...new Set(
      (row.ops ?? []).map((op) => {
        const rule = classifyOp(op.method, op.path);
        return rule.verdict === "allow" ? rule.kind : "denied";
      }),
    ),
  ],
  created_at: row.created_at ?? null,
  staged_at: row.staged_at,
  published_at: row.published_at,
  rolled_back_at: row.rolled_back_at,
  discarded_at: row.discarded_at,
});

/**
 * Each op with what it changes. A published or rolled-back changeset shows the
 * snapshot it took; a draft or staged one shows the live site as it is now,
 * which is what publishing would change.
 */
export const opViewsOf = async (
  req: AuthenticatedMedusaRequest,
  caller: Caller,
  row: ChangesetRow,
): Promise<OpView[]> => {
  const views: OpView[] = [];
  const handles = new Map<string, string | null>();

  for (const [index, op] of (row.ops ?? []).entries()) {
    const rule = classifyOp(op.method, op.path);
    if (rule.verdict !== "allow") {
      views.push({
        index,
        method: op.method,
        path: op.path,
        kind: null,
        scope: null,
        preview_path: null,
        before: null,
        after: null,
        changes: [],
      });
      continue;
    }

    const spec = OP_SPECS[rule.kind];
    let before: OpValue = null;
    if (row.snapshot && (row.status === "published" || row.status === "rolled_back")) {
      before = row.snapshot[index] ?? null;
    } else {
      const answer = await readAs(req.scope, caller, row.tenant_id, spec.read(op)).catch(() => null);
      before = answer ? spec.project(answer, op) : null;
    }

    const productId = productIdOf(op);
    if (productId && !handles.has(productId)) {
      const answer = await readAs(req.scope, caller, row.tenant_id, `/tenants/products/${productId}`).catch(
        () => null,
      );
      const product = answer?.product as { handle?: string } | undefined;
      handles.set(productId, product?.handle ?? null);
    }

    const after = afterOf(rule.kind, op, before);
    views.push({
      index,
      method: op.method,
      path: op.path,
      kind: rule.kind,
      scope: rule.scope,
      preview_path: previewPathOf(op, productId ? handles.get(productId) : null),
      before,
      after,
      changes: changedFields(before, after),
    });
  }

  return views;
};
