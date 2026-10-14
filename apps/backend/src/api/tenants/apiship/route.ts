import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { Logger } from "@medusajs/framework/types";

import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { ApishipError, listConnections, listProviders, type ApishipConnection } from "../../../apiship/client";
import { listWebhooks, subscribeWebhook, type ApishipWebhookType } from "../../../apiship/orders";
import { APISHIP_DEFAULT_CARRIERS, carrierLabel } from "../../../apiship/carriers";
import type { ApishipDeliveryKind } from "../../../apiship/method";
import {
  apishipApiCredentials,
  emptyApishipCredentials,
  normalizeApishipCredentials,
  readApishipSecret,
  type ApishipCredentials,
} from "../../../tenant-secrets/apiship";
import { encryptJson, keyFromEnv } from "../../../tenant-secrets/crypto";
import { writeTenantSecretSlot } from "../../../tenant-secrets/slot";
import provisionTenantApishipMethodsWorkflow, {
  type ApishipCarrierSetting,
} from "../../../workflows/tenant/apiship/provision-tenant-apiship-methods";
import { getTenantScope } from "../tenant-scope";
import { getTenantWarehouse, resolveShippingProfileId } from "../shipping-methods/helpers";
import type { PutTenantApishipBody } from "../validators";
import {
  apishipWebhookUrl,
  carriersOf,
  listWarehouseOptions,
  newApishipWebhookToken,
  pricingOf,
  readOwnApishipSecret,
  readOwnApishipSettings,
} from "./helpers";

/**
 * `GET|PUT|DELETE /tenants/apiship` — the shop's ApiShip connection, its sender,
 * its parcel defaults and the carriers it ships through (t-2026-10-14-58).
 *
 * WHAT NEVER LEAVES THIS FILE: the token. Every response is the masked
 * read-back (`{ set, last4 }`), errors name the field and never its content,
 * and nothing here logs a value.
 *
 * The order of the effects of a save, and why:
 *
 * 1. The token is VERIFIED against ApiShip (`GET /connections`) before anything
 *    is written, the way the СДЭК and Почта forms prove their accounts. The
 *    same call tells which carriers the cabinet has connected, so a carrier
 *    the owner switched on but never connected in ApiShip is refused HERE,
 *    with the sentence that says what to do in the cabinet, rather than
 *    discovered as an empty checkout.
 * 2. The row is written.
 * 3. The shipping options are provisioned (one per carrier and kind) and the
 *    status webhooks registered. Both are idempotent, and a webhook failure is
 *    reported in the answer rather than rolled back: the shop can quote and
 *    ship without it, the ten-minute poll brings the statuses instead.
 *
 * The sender may be incomplete on a save: the panel has the token and the
 * sender in two drawers. `missing` in the answer names what a shipment still
 * needs, and `createFulfillment` refuses with the same names.
 */

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const warehouse = await getTenantWarehouse(req);
  res.json(await readOwnApishipSettings(req, warehouse.service_zone_ids));
};

const webhookTypes: ApishipWebhookType[] = ["ORDER_STATUS", "ORDER_NUMBER_UPDATE"];

export const PUT = async (req: AuthenticatedMedusaRequest<PutTenantApishipBody>, res: MedusaResponse) => {
  const body = req.validatedBody;
  const tenant = await getTenantScope(req);
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);
  const warehouse = await getTenantWarehouse(req);

  // A row that does not decrypt is overwritten in place, keeping its switch but
  // none of its fields: the owner enters the token again (46df D1).
  const { secret: existing, unreadable } = await readOwnApishipSecret(req, tenant.id);
  const previous: ApishipCredentials = existing?.credentials ?? emptyApishipCredentials();

  const credentials = normalizeApishipCredentials({
    ...previous,
    token: body.token !== undefined ? body.token : previous.token,
    sender_name: body.sender_name !== undefined ? body.sender_name : previous.sender_name,
    sender_company: body.sender_company !== undefined ? body.sender_company : previous.sender_company,
    sender_phone: body.sender_phone !== undefined ? body.sender_phone : previous.sender_phone,
    sender_email: body.sender_email !== undefined ? body.sender_email : previous.sender_email,
    sender_country_code: body.sender_country_code ?? previous.sender_country_code,
    sender_region: body.sender_region !== undefined ? body.sender_region : previous.sender_region,
    sender_city: body.sender_city !== undefined ? body.sender_city : previous.sender_city,
    sender_address: body.sender_address !== undefined ? body.sender_address : previous.sender_address,
    sender_index: body.sender_index !== undefined ? body.sender_index : previous.sender_index,
    sender_mode: body.sender_mode ?? previous.sender_mode,
    sender_point_id: body.sender_point_id !== undefined ? body.sender_point_id : previous.sender_point_id,
    default_weight_g: body.default_weight_g ?? previous.default_weight_g,
    default_length_cm: body.default_length_cm ?? previous.default_length_cm,
    default_width_cm: body.default_width_cm ?? previous.default_width_cm,
    default_height_cm: body.default_height_cm ?? previous.default_height_cm,
    webhook_token: previous.webhook_token ?? newApishipWebhookToken(),
    webhook_uuids: previous.webhook_uuids,
  });
  const isEnabled = body.is_enabled ?? existing?.is_enabled ?? unreadable?.is_enabled ?? true;

  if (isEnabled && !credentials.token) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Введите токен ApiShip: без него ничего не считается и не отправляется.");
  }

  // Step 1 — prove the token works and learn what the cabinet has connected.
  let connections: ApishipConnection[] = [];
  let verified: { connections: number; carriers_connected: string[]; carriers_skipped: string[] } | null = null;
  const api = apishipApiCredentials({ id: existing?.id ?? "new", tenant_id: tenant.id, provider: "apiship", is_enabled: true, credentials });
  if (isEnabled && api) {
    try {
      connections = await listConnections(api);
    } catch (error) {
      if (error instanceof ApishipError && (error.status === 401 || error.status === 403)) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "ApiShip не принял токен: проверьте его в личном кабинете ApiShip.");
      }
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Не удалось проверить токен в ApiShip: ${(error as Error).message}`,
      );
    }
  }
  const connected = new Set(connections.map((connection) => connection.providerKey));

  // The carriers: what the body says, else what the owner chose before, else
  // the two named ones. The choice is read from the options' `data.offered`,
  // not from their store rule: a token saved before the sender leaves the
  // rule off, and the sender's own save must not take that for «none chosen».
  const options = await listWarehouseOptions(req, warehouse.service_zone_ids);
  const current = carriersOf(options);
  const requested: ApishipCarrierSetting[] = body.carriers
    ? body.carriers.map((carrier) => ({
        provider_key: carrier.provider_key,
        kinds: carrier.kinds as ApishipDeliveryKind[],
        tariff_id: carrier.tariff_id ?? null,
        connection_id: carrier.connection_id ?? null,
      }))
    : current.length
      ? current.map((carrier) => ({
          provider_key: carrier.provider_key,
          kinds: carrier.kinds,
          tariff_id: carrier.tariff_id,
          connection_id: carrier.connection_id,
        }))
      : APISHIP_DEFAULT_CARRIERS.map((key) => ({ provider_key: key, kinds: ["courier", "pickup"] as ApishipDeliveryKind[] }));

  const skipped: string[] = [];
  let carriers = requested;
  if (isEnabled && api) {
    if (body.carriers) {
      const missing = body.carriers.filter((carrier) => carrier.kinds.length && !connected.has(carrier.provider_key));
      if (missing.length) {
        const names = missing.map((carrier) => carrierLabel(carrier.provider_key)).join(", ");
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `${names}: перевозчик не подключён в кабинете ApiShip. Подключите его в a.apiship.ru → «Службы доставки» и сохраните ещё раз.`,
        );
      }
    } else {
      carriers = requested.map((carrier) =>
        connected.has(carrier.provider_key) ? carrier : (skipped.push(carrier.provider_key), { ...carrier, kinds: [] }),
      );
    }
    // The connection id, when the cabinet has exactly one for a carrier and the owner named none.
    carriers = carriers.map((carrier) => {
      if (carrier.connection_id) return carrier;
      const mine = connections.filter((connection) => connection.providerKey === carrier.provider_key);
      return mine.length === 1 ? { ...carrier, connection_id: mine[0].id } : carrier;
    });
    // ApiShip's own names for carriers this product has no label for.
    try {
      const providers = await listProviders(api);
      carriers = carriers.map((carrier) => ({
        ...carrier,
        provider_name: providers.find((provider) => provider.key === carrier.provider_key)?.name ?? null,
      }));
    } catch (error) {
      logger?.warn(`[apiship] providers list failed for ${tenant.id}: ${(error as Error).message}`);
    }
    verified = {
      connections: connections.length,
      carriers_connected: [...connected],
      carriers_skipped: skipped,
    };
  }

  // Step 2 — write the row.
  await writeTenantSecretSlot(pg, tenantModule, {
    tenantId: tenant.id,
    provider: "apiship",
    credentials: credentials as unknown as Record<string, unknown>,
    isEnabled,
  });

  // Step 3a — the shipping options. Quoting needs a sender city, index or address.
  const canQuote = Boolean(credentials.sender_city || credentials.sender_index || credentials.sender_address);
  const pricing = pricingOf(options);
  await provisionTenantApishipMethodsWorkflow(req.scope).run({
    input: {
      tenant_id: tenant.id,
      carriers,
      enabled: isEnabled && canQuote,
      shipping_profile_id: await resolveShippingProfileId(req),
      base_service_zone_id: warehouse.base_service_zone_id,
      service_zone_ids: warehouse.service_zone_ids,
      stock_location_id: warehouse.stock_location_id,
      default_weight_g: credentials.default_weight_g,
      markup_amount: body.markup_amount ?? pricing.markup_amount,
      markup_percent: body.markup_percent ?? pricing.markup_percent,
      free_above_total: body.free_above_total !== undefined ? body.free_above_total : pricing.free_above_total,
    },
  });

  // Step 3b — the status webhooks, best effort.
  let webhook: { registered: boolean; error: string | null } = { registered: false, error: null };
  if (isEnabled && api) {
    const url = apishipWebhookUrl(req, tenant.id, credentials.webhook_token as string);
    try {
      const already = await listWebhooks(api);
      for (const type of webhookTypes) {
        const mine = already.find((entry) => entry.url === url && entry.type === type);
        if (mine) {
          credentials.webhook_uuids[type] = mine.uuid;
          continue;
        }
        const ack = await subscribeWebhook(api, { url, type });
        credentials.webhook_uuids[type] = ack.uuid;
      }
      webhook = { registered: true, error: null };
      // The uuids are part of the payload, so the row is rewritten once they are known.
      const row = await readApishipSecret(pg, tenant.id, { includeDisabled: true });
      if (row) {
        await tenantModule.updateTenantIntegrationSecrets({ id: row.id, payload: encryptJson(credentials, keyFromEnv()) });
      }
    } catch (error) {
      webhook = { registered: false, error: (error as Error).message };
      logger?.warn(`[apiship] webhook registration failed for ${tenant.id}: ${webhook.error}`);
    }
  }

  const settings = await readOwnApishipSettings(req, warehouse.service_zone_ids);
  res.json({ ...settings, verified, webhook });
};

/**
 * `DELETE /tenants/apiship` — forget the token and switch the ApiShip methods
 * off. The options stay, switched off: a cart that already chose one keeps
 * working. The owner's carrier choice stays with them too (`data.offered`),
 * so a new token brings the same cards back without the owner ticking them
 * again. An unreadable row is removed by id like any other (46df D1).
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);
  const warehouse = await getTenantWarehouse(req);
  const { secret: existing, unreadable } = await readOwnApishipSecret(req, tenant.id);
  const rowId = existing?.id ?? unreadable?.id ?? null;

  if (rowId) {
    await tenantModule.softDeleteTenantIntegrationSecrets([rowId]);
    const options = await listWarehouseOptions(req, warehouse.service_zone_ids);
    const pricing = pricingOf(options);
    await provisionTenantApishipMethodsWorkflow(req.scope).run({
      input: {
        tenant_id: tenant.id,
        carriers: carriersOf(options).map((carrier) => ({
          provider_key: carrier.provider_key,
          kinds: carrier.kinds,
          tariff_id: carrier.tariff_id,
          connection_id: carrier.connection_id,
        })),
        enabled: false,
        shipping_profile_id: await resolveShippingProfileId(req),
        base_service_zone_id: warehouse.base_service_zone_id,
        service_zone_ids: warehouse.service_zone_ids,
        stock_location_id: warehouse.stock_location_id,
        default_weight_g: existing?.credentials.default_weight_g ?? emptyApishipCredentials().default_weight_g,
        markup_amount: pricing.markup_amount,
        markup_percent: pricing.markup_percent,
        free_above_total: pricing.free_above_total,
      },
    });
  }

  res.json({ ...(await readOwnApishipSettings(req, warehouse.service_zone_ids)), id: rowId, deleted: Boolean(rowId) });
};
