import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { Logger } from "@medusajs/framework/types";

import {
  cryptoPaymentsAvailable,
  CRYPTO_PAYMENTS_UNAVAILABLE_REASON,
} from "../../../../btcpay/availability";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { writeTenantSecretSlot } from "../../../../tenant-secrets/slot";
import { forgetTenantSecretSlot, tryReadTenantSecret } from "../../../../tenant-secrets/unreadable";
import {
  emptyBtcpayCredentials,
  maskBtcpaySettings,
  missingBtcpayFields,
  readBtcpaySecret,
  type BtcpayCredentials,
} from "../../../../tenant-secrets/btcpay";
import { getTenantScope } from "../../tenant-scope";
import type { PutTenantBtcpayBody } from "../../validators";
import { backendPublicOrigin } from "../helpers";

/**
 * `GET|PUT|DELETE /tenants/payment-settings/btcpay` — the shop's own BTCPay
 * Server store (ask-20261005-070255-438f), next to the manual methods and the
 * Robokassa account under the same namespace.
 *
 * WHAT NEVER LEAVES THIS FILE: the API key and the webhook secret. Every
 * response carries them as `{ set, last4 }` only, and no line here logs them.
 *
 * Only the «own server» mode: the owner creates the store, the API key and the
 * webhook on a BTCPay Server of their choosing. The response names the exact
 * webhook URL to paste into that store's webhook settings, built on the same
 * public origin as Robokassa's Result URL.
 *
 * A new row is saved switched OFF. The owner turns it on explicitly, and only
 * once all four values are known; a stored value absent from the body is kept.
 * The key is not tried against the server on save: the first invoice proves it.
 *
 * `available` says whether this instance takes cryptocurrency at all
 * (`btcpay/availability.ts`). Where it does not, the panel hides the card and
 * `PUT` answers 403 without writing anything, so a RU shop can never hold a
 * BTCPay row that `instance-check.mjs --db` would then fail the deploy on.
 * `DELETE` still works, so a row saved before the switch can be removed.
 */

const PROVIDER = "btcpay" as const;

const webhookUrlFor = (req: AuthenticatedMedusaRequest, tenantId: string): string =>
  `${backendPublicOrigin(req)}/btcpay/webhook/${tenantId}`;

const readOwn = (req: AuthenticatedMedusaRequest, tenantId: string) => {
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  return tryReadTenantSecret(
    pg,
    tenantId,
    PROVIDER,
    () => readBtcpaySecret(pg, tenantId, { includeDisabled: true }),
    logger,
  );
};

const view = async (req: AuthenticatedMedusaRequest, tenantId: string) => {
  const { secret, unreadable } = await readOwn(req, tenantId);
  return {
    provider: PROVIDER,
    label: "BTCPay Server",
    available: cryptoPaymentsAvailable(),
    settings: secret ? maskBtcpaySettings(secret) : null,
    unreadable,
    webhook_url: webhookUrlFor(req, tenantId),
  };
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  res.json(await view(req, tenant.id));
};

export const PUT = async (req: AuthenticatedMedusaRequest<PutTenantBtcpayBody>, res: MedusaResponse) => {
  if (!cryptoPaymentsAvailable()) {
    throw new MedusaError(MedusaError.Types.FORBIDDEN, CRYPTO_PAYMENTS_UNAVAILABLE_REASON);
  }
  const body = req.validatedBody;
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);

  // A row that does not decrypt keeps its switch, never its values: the owner
  // types them again, and the check below names the ones still missing.
  const { secret: existing, unreadable } = await readOwn(req, tenant.id);
  const previous = existing?.credentials ?? emptyBtcpayCredentials();
  const credentials: BtcpayCredentials = {
    server_url: body.server_url ?? previous.server_url,
    store_id: body.store_id ?? previous.store_id,
    api_key: body.api_key ?? previous.api_key,
    webhook_secret: body.webhook_secret ?? previous.webhook_secret,
  };
  const isEnabled = body.is_enabled ?? existing?.is_enabled ?? unreadable?.is_enabled ?? false;

  const missing = missingBtcpayFields(credentials);
  if (isEnabled && missing.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `BTCPay needs ${missing.join(", ")} before it can be switched on.`,
    );
  }

  // `isEnabled` is always passed: the writer's own default for a new row is
  // "on", and a BTCPay row starts off.
  await writeTenantSecretSlot(pg, tenantModule, {
    tenantId: tenant.id,
    provider: PROVIDER,
    credentials,
    isEnabled,
  });

  res.json(await view(req, tenant.id));
};

/**
 * Forget the store and stop offering BTCPay. By row id without decrypting it,
 * so an unreadable row can be removed too. An invoice already issued settles
 * only if the owner saves the store again, because the webhook needs its secret.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);
  const removed = await forgetTenantSecretSlot(pg, tenantModule, tenant.id, PROVIDER);
  res.json({ ...(await view(req, tenant.id)), id: removed.id, deleted: removed.deleted });
};
