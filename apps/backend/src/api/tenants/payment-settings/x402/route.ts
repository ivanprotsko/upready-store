import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { Logger } from "@medusajs/framework/types";

import { cryptoPaymentsAvailable, CRYPTO_PAYMENTS_UNAVAILABLE_REASON } from "../../../../btcpay/availability";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { writeTenantSecretSlot } from "../../../../tenant-secrets/slot";
import { forgetTenantSecretSlot, tryReadTenantSecret } from "../../../../tenant-secrets/unreadable";
import {
  DEFAULT_X402_FACILITATOR_URL,
  emptyX402Credentials,
  missingX402Fields,
  normalizeX402Networks,
  readX402Secret,
  x402IsTest,
  x402SettingsView,
  type X402Credentials,
} from "../../../../tenant-secrets/x402";
import { offeredX402Networks } from "../../../../x402/networks";
import { getTenantScope } from "../../tenant-scope";
import type { PutTenantX402Body } from "../../validators";
import { backendPublicOrigin } from "../helpers";

/**
 * `GET|PUT|DELETE /tenants/payment-settings/x402` — the shop's x402 settings
 * (t-2026-10-03-33), next to BTCPay under the same namespace: the address
 * that receives the USDC, the networks, the facilitator and the switch.
 *
 * Nothing here is secret, so the settings come back as saved. The response
 * also lists the networks this instance offers (Base Sepolia always, Base
 * only where `X402_MAINNET_AVAILABLE` is `true`) and the address AI agents buy
 * at (`/store/x402/purchase`).
 *
 * A new row is saved switched OFF, and the switch goes on only once the
 * address and at least one offered network are known. The row's `is_test`
 * follows the networks: on while any of them is a test network.
 *
 * `available` says whether this instance takes cryptocurrency at all
 * (`btcpay/availability.ts`). Where it does not, the panel hides the card and
 * `PUT` answers 403 without writing anything, so a RU shop never holds an x402
 * row that `instance-check.mjs --db` would then fail the deploy on. `DELETE`
 * still works.
 */

const PROVIDER = "x402" as const;

const readOwn = (req: AuthenticatedMedusaRequest, tenantId: string) => {
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  return tryReadTenantSecret(pg, tenantId, PROVIDER, () => readX402Secret(pg, tenantId, { includeDisabled: true }), logger);
};

const view = async (req: AuthenticatedMedusaRequest, tenantId: string) => {
  const { secret, unreadable } = await readOwn(req, tenantId);
  return {
    provider: PROVIDER,
    label: "x402 (USDC)",
    available: cryptoPaymentsAvailable(),
    networks_offered: offeredX402Networks().map((network) => ({
      id: network.id,
      label: network.label,
      testnet: network.testnet,
    })),
    default_facilitator_url: DEFAULT_X402_FACILITATOR_URL,
    agent_purchase_url: `${backendPublicOrigin(req)}/store/x402/purchase`,
    settings: secret ? x402SettingsView(secret) : null,
    unreadable,
  };
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  res.json(await view(req, tenant.id));
};

export const PUT = async (req: AuthenticatedMedusaRequest<PutTenantX402Body>, res: MedusaResponse) => {
  if (!cryptoPaymentsAvailable()) {
    throw new MedusaError(MedusaError.Types.FORBIDDEN, CRYPTO_PAYMENTS_UNAVAILABLE_REASON);
  }
  const body = req.validatedBody;
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);

  if (body.networks) {
    const offered = new Set<string>(offeredX402Networks().map((network) => network.id));
    const refused = body.networks.filter((id) => !offered.has(id));
    if (refused.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `x402 network ${refused.join(", ")} is not offered on this instance (real-money networks need X402_MAINNET_AVAILABLE).`,
      );
    }
  }

  const { secret: existing, unreadable } = await readOwn(req, tenant.id);
  const previous = existing?.credentials ?? emptyX402Credentials();
  const credentials: X402Credentials = {
    pay_to: body.pay_to ?? previous.pay_to,
    networks: body.networks ? normalizeX402Networks(body.networks) : previous.networks,
    facilitator_url: body.facilitator_url ?? (previous.facilitator_url || DEFAULT_X402_FACILITATOR_URL),
  };
  const isEnabled = body.is_enabled ?? existing?.is_enabled ?? unreadable?.is_enabled ?? false;

  const missing = missingX402Fields(credentials);
  if (isEnabled && missing.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `x402 needs ${missing.join(", ")} before it can be switched on.`);
  }

  // `isEnabled` is always passed: the writer's own default for a new row is
  // "on", and an x402 row starts off.
  await writeTenantSecretSlot(pg, tenantModule, {
    tenantId: tenant.id,
    provider: PROVIDER,
    credentials,
    isEnabled,
    isTest: x402IsTest(credentials.networks),
  });

  res.json(await view(req, tenant.id));
};

/** Forget the settings and stop offering x402. By row id without decrypting it, so an unreadable row can be removed too. */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);
  const removed = await forgetTenantSecretSlot(pg, tenantModule, tenant.id, PROVIDER);
  res.json({ ...(await view(req, tenant.id)), id: removed.id, deleted: removed.deleted });
};
