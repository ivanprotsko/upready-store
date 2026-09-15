import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { OZON_MODULE } from "../../../../modules/ozon";
import type OzonModuleService from "../../../../modules/ozon/service";
import {
  OZON_READ_ENDPOINTS,
  OZON_WRITE_PATHS,
} from "../../../../modules/ozon/endpoints";
import {
  OZON_SYNC_KINDS,
  type OzonSyncKind,
} from "../../../../modules/ozon/models/ozon-sync-run";
import { inspectCredentials } from "../../../../modules/ozon/credentials";
import { maskSecret } from "../../../../tenant-secrets/crypto";
import { readOzonSecret } from "../../../../tenant-secrets/ozon";
import { getTenantScope } from "../../tenant-scope";

/**
 * `GET /tenants/ozon/status` — what this shop's Ozon connection is
 * (w11-ozon-readonly-client). Same conventions as `/tenants/wb/status`.
 *
 * The API key is NEVER in the response. What comes back is what the key says
 * about itself — asked of Ozon's own `POST /v1/roles`, because Ozon's key is
 * an opaque string with nothing to decode — the registry of endpoints this
 * client is allowed to call, the deny-list it is checked against, the newest
 * run per import kind and the row counts of the mirrors.
 *
 * `read_only` is `true`, `false` or `"unknown"`, and never `true` because
 * somebody assumed it (rule 17a): the response carries `read_only_source`,
 * one sentence naming the doc URL and what was compared against what.
 *
 * Asking Ozon costs one request per call of this route. That is deliberate:
 * a cached answer would age, and the question this route exists to answer is
 * "what can this key do RIGHT NOW".
 *
 * Authentication is the namespace's own: `/tenants/*` is behind
 * `authenticate("tenant", …)` in `src/api/middlewares.ts`, so this route only
 * has to resolve the tenant behind the token and scope every read to it.
 */

type SyncRunRow = {
  id: string;
  kind: OzonSyncKind;
  status: string;
  is_fixture: boolean;
  started_at: Date | string;
  finished_at: Date | string | null;
  rows: number;
  requests: number;
  error: string | null;
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
  const ozon = req.scope.resolve<OzonModuleService>(OZON_MODULE);

  const secret = await readOzonSecret(pg, tenant.id, { includeDisabled: true });

  // Journalled: this route really does ask Ozon, so the request has to appear
  // in `ozon_api_call` like every other read. A call that leaves the process
  // without a row would make that table lie by omission (rule 20a).
  //
  // `medusa lint` warns here (`no-service-mutations-in-api-route`). Kept as a
  // warning on purpose: this is not domain state a workflow should own, it is
  // one bookkeeping row about a request this handler itself sent, and it has
  // to be written by whoever sent it or the evidence goes missing.
  const facts = await inspectCredentials(
    secret
      ? { clientId: secret.credentials.client_id, apiKey: secret.credentials.api_key }
      : null,
    {
      tenantId: tenant.id,
      journal: async (entry) => {
        await ozon.createOzonApiCalls(entry);
      },
    },
  );

  const runs = (await ozon.listOzonSyncRuns(
    { tenant_id: tenant.id },
    { order: { started_at: "DESC" }, take: 200 },
  )) as SyncRunRow[];

  /** The newest run per kind: the card shows "when did products last come in". */
  const latest = new Map<OzonSyncKind, SyncRunRow>();
  for (const run of runs) {
    if (!latest.has(run.kind)) {
      latest.set(run.kind, run);
    }
  }

  const counts = await Promise.all(
    (
      [
        ["products", "listOzonProducts"],
        ["prices", "listOzonPrices"],
        ["stocks", "listOzonStocks"],
        ["postings", "listOzonPostings"],
        ["reviews", "listOzonReviews"],
        ["questions", "listOzonQuestions"],
      ] as const
    ).map(async ([label, method]) => {
      const rows = (await (
        ozon as unknown as Record<string, (filter: unknown) => Promise<unknown[]>>
      )[method]({ tenant_id: tenant.id })) as unknown[];
      return [label, rows.length] as const;
    }),
  );

  res.json({
    connection: {
      /** Whether credentials are stored at all, and the key's last four characters. Never the value. */
      key: maskSecret(secret?.credentials.api_key),
      client_id: secret?.credentials.client_id ?? null,
      is_enabled: secret?.is_enabled ?? false,
    },
    credentials: {
      expires_at: facts.expiresAt,
      expired: facts.expired,
      roles: facts.roles.map((role) => ({ name: role.name, methods: role.methods ?? [] })),
      read_only: facts.readOnly,
      read_only_source: facts.readOnlySource,
      /** The granted methods that cover a known mutation. Empty when read_only is true. */
      write_methods: facts.writeMethods,
      error: facts.error,
    },
    endpoints: OZON_READ_ENDPOINTS.map((endpoint) => ({
      id: endpoint.id,
      method: endpoint.method,
      host: endpoint.host,
      path: endpoint.path,
      summary: endpoint.summary,
      doc_url: endpoint.docUrl,
      read_via_post: endpoint.readViaPost?.reason ?? null,
      min_interval_ms: endpoint.minIntervalMs ?? null,
    })),
    /**
     * The deny-list, shown so the owner can see WHAT this client is checked
     * against rather than being asked to trust the word "read-only".
     */
    denied: Object.entries(OZON_WRITE_PATHS).map(([path, summary]) => ({ path, summary })),
    sync: OZON_SYNC_KINDS.map((kind) => {
      const run = latest.get(kind);
      return {
        kind,
        status: run?.status ?? null,
        is_fixture: run?.is_fixture ?? null,
        started_at: asIso(run?.started_at),
        finished_at: asIso(run?.finished_at ?? null),
        rows: run ? Number(run.rows) : null,
        requests: run ? Number(run.requests) : null,
        error: run?.error ?? null,
      };
    }),
    mirrors: Object.fromEntries(counts),
  });
};
