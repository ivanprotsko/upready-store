import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { WB_MODULE } from "../../../../modules/wb";
import type WbModuleService from "../../../../modules/wb/service";
import { WB_READ_ENDPOINTS } from "../../../../modules/wb/endpoints";
import { WB_SYNC_KINDS, type WbSyncKind } from "../../../../modules/wb/models/wb-sync-run";
import { inspectToken } from "../../../../modules/wb/token";
import { maskSecret } from "../../../../tenant-secrets/crypto";
import { readWildberriesSecret } from "../../../../tenant-secrets/wildberries";
import { getTenantScope } from "../../tenant-scope";

/**
 * `GET /tenants/wb/status` — what this shop's Wildberries connection is
 * (w01-wb-readonly-client).
 *
 * The key itself is NEVER in the response. What comes back is what the key
 * says about itself (`src/modules/wb/token.ts`, decoded from the JWT payload
 * and read against WB's own documented bit table), the registry of endpoints
 * this client is allowed to call, the newest run per import kind and the row
 * counts of the mirrors.
 *
 * `read_only` is `true`, `false` or `"unknown"`, and never `true` because
 * somebody remembers that bit 30 means read-only (rule 17a): the response
 * carries `doc_url` so the owner and the acceptor can check the claim.
 *
 * Authentication is the namespace's own: `/tenants/*` is behind
 * `authenticate("tenant", …)` in `src/api/middlewares.ts`, so this route only
 * has to resolve the tenant behind the token and scope every read to it.
 */

type SyncRunRow = {
  id: string;
  kind: WbSyncKind;
  status: string;
  started_at: Date | string;
  finished_at: Date | string | null;
  rows: number;
  requests: number;
  error: string | null;
  retry_at: Date | string | null;
};

const asIso = (value: Date | string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const wb = req.scope.resolve<WbModuleService>(WB_MODULE);

  const secret = await readWildberriesSecret(pg, tenant.id, { includeDisabled: true });
  const token = inspectToken(secret?.credentials.api_key);

  const runs = (await wb.listWbSyncRuns(
    { tenant_id: tenant.id },
    { order: { started_at: "DESC" }, take: 200 },
  )) as SyncRunRow[];

  /** The newest run per kind: the card shows "when did cards last come in". */
  const latest = new Map<WbSyncKind, SyncRunRow>();
  for (const run of runs) {
    if (!latest.has(run.kind)) {
      latest.set(run.kind, run);
    }
  }

  const counts = await Promise.all(
    (
      [
        ["products", "listWbProducts"],
        ["prices", "listWbPrices"],
        ["stocks", "listWbStocks"],
        ["orders", "listWbOrders"],
        ["sales", "listWbSales"],
        ["feedbacks", "listWbFeedbacks"],
        ["questions", "listWbQuestions"],
        // `WbAnalyticsDaily` pluralizes to `…Dailies`, not `…Dailys`: the
        // method name is the framework's, checked by
        // `src/modules/wb/__tests__/service-methods.unit.spec.ts` (w03).
        ["analytics", "listWbAnalyticsDailies"],
      ] as const
    ).map(async ([label, method]) => {
      const rows = (await (
        wb as unknown as Record<string, (filter: unknown) => Promise<unknown[]>>
      )[method]({ tenant_id: tenant.id })) as unknown[];
      return [label, rows.length] as const;
    }),
  );

  res.json({
    connection: {
      /** Whether a key is stored at all, and its last four characters. Never the value. */
      key: maskSecret(secret?.credentials.api_key),
      is_enabled: secret?.is_enabled ?? false,
    },
    token: {
      token_id: token.tokenId,
      seller_id: token.sellerId,
      kind: token.kind,
      sandbox: token.sandbox,
      expires_at: token.expiresAt,
      expired: token.expired,
      mask: token.mask,
      bits: token.bits,
      read_only: token.readOnly,
      doc_url: token.docUrl,
      error: token.error,
    },
    endpoints: WB_READ_ENDPOINTS.map((endpoint) => ({
      id: endpoint.id,
      method: endpoint.method,
      host: endpoint.host,
      path: endpoint.path,
      summary: endpoint.summary,
      doc_url: endpoint.docUrl,
      read_via_post: endpoint.readViaPost?.reason ?? null,
    })),
    sync: WB_SYNC_KINDS.map((kind) => {
      const run = latest.get(kind);
      return {
        kind,
        status: run?.status ?? null,
        started_at: asIso(run?.started_at),
        finished_at: asIso(run?.finished_at ?? null),
        rows: run ? Number(run.rows) : null,
        requests: run ? Number(run.requests) : null,
        error: run?.error ?? null,
        retry_at: asIso(run?.retry_at ?? null),
      };
    }),
    mirrors: Object.fromEntries(counts),
  });
};
