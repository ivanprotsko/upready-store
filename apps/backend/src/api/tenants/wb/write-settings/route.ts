import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { MARKETPLACE_WRITE_MODULE } from "../../../../modules/marketplace-write";
import type MarketplaceWriteModuleService from "../../../../modules/marketplace-write/service";
import {
  MARKETPLACE_WRITE_OP_CLASSES,
  type MarketplaceWriteOpClass,
} from "../../../../modules/marketplace-write/types";
import { WB_MARKETPLACE, WB_WRITE_ENDPOINTS } from "../../../../modules/wb-write/write-endpoints";
import { inspectWbWriteCredential, WB_WRITE_LIVE_ENV } from "../../../../modules/wb-write/write-transport";
import { maskSecret } from "../../../../tenant-secrets/crypto";
import { readWildberriesWriteSecret } from "../../../../tenant-secrets/wildberries";
import { getTenantScope } from "../../tenant-scope";
import type { PutTenantWbWriteSettingsBodyType } from "./validators";

/**
 * `GET/PUT /tenants/wb/write-settings` — the owner's view of, and control
 * over, the two gates that are hers (w20-wb-write-core).
 *
 * The five gates live in `modules/marketplace-write/execute.ts`. This route
 * neither re-implements nor bypasses them: it reads and writes the rows gates
 * (c) and (d) consult, and it REPORTS the other three so the screen can never
 * suggest that flipping a switch here starts sending anything.
 *
 * Owner-only in this codebase's own sense: `/tenants/*` is behind
 * `authenticate("tenant", …)` (`src/api/middlewares.ts`) and every read and
 * write below is scoped to the tenant `getTenantScope` resolves from the
 * token — never to an id in the body or the query. A tenant admin IS the shop
 * owner here; `tenant_admin` carries no second role to check against.
 *
 * What is deliberately NOT here: no route can store the write credential, and
 * no route can set `WB_WRITE_LIVE`. Those stay Ivan's, off the HTTP surface.
 */

type ConsentRow = {
  op_class: string;
  confirmed_by: string;
  confirmed_at: Date | string;
  note: string | null;
};

type SettingRow = { is_enabled: boolean; updated_by: string | null };

type AuditRow = {
  id: string;
  op_class: string;
  endpoint_id: string;
  method: string;
  path: string;
  payload_sha256: string;
  dry_run: boolean;
  outcome: string;
  gate: string | null;
  actor: string;
  status: number | null;
  error: string | null;
  created_at: Date | string;
};

/** How many journal rows the screen shows. The table is the evidence, not a log viewer. */
const AUDIT_PAGE = 20;

const asIso = (value: Date | string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/**
 * The whole state, assembled once: `PUT` answers with it too, so the panel
 * never has to guess what its own write produced (rule 20a — a report is a
 * read-back, not a restatement of the request).
 */
const readState = async (req: AuthenticatedMedusaRequest) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const service = req.scope.resolve<MarketplaceWriteModuleService>(MARKETPLACE_WRITE_MODULE);

  const [setting] = (await service.listMarketplaceWriteSettings({
    tenant_id: tenant.id,
    marketplace: WB_MARKETPLACE,
  })) as SettingRow[];

  const consents = (await service.listMarketplaceWriteConsents({
    tenant_id: tenant.id,
    marketplace: WB_MARKETPLACE,
  })) as ConsentRow[];

  const audit = (await service.listMarketplaceWriteAudits(
    { tenant_id: tenant.id, marketplace: WB_MARKETPLACE },
    { order: { created_at: "DESC" }, take: AUDIT_PAGE },
  )) as AuditRow[];

  const secret = await readWildberriesWriteSecret(pg, tenant.id, { includeDisabled: true });
  const facts = secret ? inspectWbWriteCredential(secret.credentials) : null;

  const byClass = new Map(consents.map((row) => [row.op_class, row]));

  return {
    marketplace: WB_MARKETPLACE,
    /**
     * Gates (a), (b) and (e) — reported, never settable from here. While any
     * of them is shut, nothing this route changes can put a request on a wire.
     */
    gates: {
      credential: {
        /** The WRITE slot. The read key is a different secret and is never shown here. */
        slot: "wildberries_write",
        key: maskSecret(secret?.credentials.api_key),
        is_enabled: secret?.is_enabled ?? false,
        usable: facts?.usable ?? false,
        reason: facts?.usable === false ? (facts.reason ?? null) : null,
      },
      live: {
        env_var: WB_WRITE_LIVE_ENV,
        /** `false` everywhere: no deployment of this repository sets it. */
        enabled: process.env[WB_WRITE_LIVE_ENV] === "1",
      },
    },
    /** Gate (c). A shop with no row cannot write, so a missing row reads `false`. */
    is_enabled: setting?.is_enabled ?? false,
    updated_by: setting?.updated_by ?? null,
    /** Gate (d), one entry per class, with the mutations that class covers. */
    classes: MARKETPLACE_WRITE_OP_CLASSES.map((opClass) => {
      const consent = byClass.get(opClass);
      return {
        op_class: opClass,
        consent: consent
          ? {
              confirmed_by: consent.confirmed_by,
              confirmed_at: asIso(consent.confirmed_at),
              note: consent.note,
            }
          : null,
        endpoints: WB_WRITE_ENDPOINTS.filter((entry) => entry.opClass === opClass).map((entry) => ({
          id: entry.id,
          method: entry.method,
          host: entry.host,
          path: entry.path,
          summary: entry.summary,
          doc_url: entry.docUrl,
          irreversible: entry.irreversible ?? false,
        })),
      };
    }),
    audit: audit.map((row) => ({
      id: row.id,
      op_class: row.op_class,
      endpoint_id: row.endpoint_id,
      method: row.method,
      path: row.path,
      payload_sha256: row.payload_sha256,
      dry_run: row.dry_run,
      outcome: row.outcome,
      gate: row.gate,
      actor: row.actor,
      status: row.status,
      error: row.error,
      created_at: asIso(row.created_at),
    })),
  };
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json(await readState(req));
};

export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantWbWriteSettingsBodyType>,
  res: MedusaResponse,
) => {
  const body = req.validatedBody;
  const tenant = await getTenantScope(req);
  const service = req.scope.resolve<MarketplaceWriteModuleService>(MARKETPLACE_WRITE_MODULE);
  const actor = req.auth_context.actor_id;

  if (body.is_enabled !== undefined) {
    const [existing] = (await service.listMarketplaceWriteSettings({
      tenant_id: tenant.id,
      marketplace: WB_MARKETPLACE,
    })) as Array<{ id: string }>;

    if (existing) {
      await service.updateMarketplaceWriteSettings({
        id: existing.id,
        is_enabled: body.is_enabled,
        updated_by: actor,
      });
    } else {
      await service.createMarketplaceWriteSettings({
        tenant_id: tenant.id,
        marketplace: WB_MARKETPLACE,
        is_enabled: body.is_enabled,
        updated_by: actor,
      });
    }
  }

  for (const change of body.consents ?? []) {
    const [existing] = (await service.listMarketplaceWriteConsents({
      tenant_id: tenant.id,
      marketplace: WB_MARKETPLACE,
      op_class: change.op_class as MarketplaceWriteOpClass,
    })) as Array<{ id: string }>;

    if (!change.granted) {
      // Revoking is DELETING: the row is the consent, so there is no
      // "revoked" flag for a later reader to get backwards.
      if (existing) {
        await service.deleteMarketplaceWriteConsents(existing.id);
      }
      continue;
    }

    // Re-confirming rewrites who and when, so the ledger says when this
    // consent was last given, not when it was first given.
    if (existing) {
      await service.updateMarketplaceWriteConsents({
        id: existing.id,
        confirmed_by: actor,
        confirmed_at: new Date(),
        note: change.note ?? null,
      });
    } else {
      await service.createMarketplaceWriteConsents({
        tenant_id: tenant.id,
        marketplace: WB_MARKETPLACE,
        op_class: change.op_class,
        confirmed_by: actor,
        confirmed_at: new Date(),
        note: change.note ?? null,
      });
    }
  }

  res.json(await readState(req));
};
