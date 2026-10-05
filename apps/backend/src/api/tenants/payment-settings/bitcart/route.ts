import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { Logger } from "@medusajs/framework/types";

import { bitcartNotificationUrl } from "../../../../bitcart/notification-url";
import {
  cryptoPaymentsAvailable,
  CRYPTO_PAYMENTS_UNAVAILABLE_REASON,
} from "../../../../btcpay/availability";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { writeTenantSecretSlot } from "../../../../tenant-secrets/slot";
import { forgetTenantSecretSlot, tryReadTenantSecret } from "../../../../tenant-secrets/unreadable";
import {
  emptyBitcartCredentials,
  maskBitcartSettings,
  missingBitcartFields,
  readBitcartSecret,
  type BitcartCredentials,
} from "../../../../tenant-secrets/bitcart";
import { getTenantScope } from "../../tenant-scope";
import type { PutTenantBitcartBody } from "../../validators";

/**
 * `GET|PUT|DELETE /tenants/payment-settings/bitcart` — the shop's own Bitcart
 * store (ask-20261005-070255-438f, stage 2), next to BTCPay's under the same
 * namespace.
 *
 * WHAT NEVER LEAVES THIS FILE: the API token. Every response carries it as
 * `{ set, last4 }` only, and no line here logs it.
 *
 * Only the «own server» mode: the owner creates the store, its wallets and an
 * API token on a Bitcart of their choosing and pastes four values here. There
 * is no webhook for the owner to set up: every invoice names its own
 * notification address. `notification_url` shows that address for reference,
 * and is `null` when the deployment has no `BACKEND_PUBLIC_URL`, in which case
 * invoices carry none and the sweep job alone settles them.
 *
 * A new row is saved switched OFF. The owner turns it on explicitly, and only
 * once all four values are known; a stored value absent from the body is kept.
 * The token is not tried against the server on save: the first invoice proves it.
 *
 * `available` says whether this instance takes cryptocurrency at all, the same
 * switch as BTCPay's (`btcpay/availability.ts`). Where it does not, the panel
 * hides the card and `PUT` answers 403 without writing anything, so a RU shop
 * can never hold a Bitcart row that `instance-check.mjs --db` would then fail
 * the deploy on. `DELETE` still works, so a row saved before can be removed.
 */

const PROVIDER = "bitcart" as const;

const readOwn = (req: AuthenticatedMedusaRequest, tenantId: string) => {
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  return tryReadTenantSecret(
    pg,
    tenantId,
    PROVIDER,
    () => readBitcartSecret(pg, tenantId, { includeDisabled: true }),
    logger,
  );
};

const view = async (req: AuthenticatedMedusaRequest, tenantId: string) => {
  const { secret, unreadable } = await readOwn(req, tenantId);
  return {
    provider: PROVIDER,
    label: "Bitcart",
    available: cryptoPaymentsAvailable(),
    settings: secret ? maskBitcartSettings(secret) : null,
    unreadable,
    notification_url: bitcartNotificationUrl(tenantId),
  };
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  res.json(await view(req, tenant.id));
};

export const PUT = async (req: AuthenticatedMedusaRequest<PutTenantBitcartBody>, res: MedusaResponse) => {
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
  const previous = existing?.credentials ?? emptyBitcartCredentials();
  const credentials: BitcartCredentials = {
    server_url: body.server_url ?? previous.server_url,
    admin_url: body.admin_url ?? previous.admin_url,
    store_id: body.store_id ?? previous.store_id,
    api_key: body.api_key ?? previous.api_key,
  };
  const isEnabled = body.is_enabled ?? existing?.is_enabled ?? unreadable?.is_enabled ?? false;

  const missing = missingBitcartFields(credentials);
  if (isEnabled && missing.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Bitcart needs ${missing.join(", ")} before it can be switched on.`,
    );
  }

  // `isEnabled` is always passed: the writer's own default for a new row is
  // "on", and a Bitcart row starts off.
  await writeTenantSecretSlot(pg, tenantModule, {
    tenantId: tenant.id,
    provider: PROVIDER,
    credentials,
    isEnabled,
  });

  res.json(await view(req, tenant.id));
};

/**
 * Forget the store and stop offering Bitcart. By row id without decrypting
 * it, so an unreadable row can be removed too. An invoice already issued then
 * settles only if the owner saves the store again, because reading it needs
 * the token.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);
  const removed = await forgetTenantSecretSlot(pg, tenantModule, tenant.id, PROVIDER);
  res.json({ ...(await view(req, tenant.id)), id: removed.id, deleted: removed.deleted });
};
