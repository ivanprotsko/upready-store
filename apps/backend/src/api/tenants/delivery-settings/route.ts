import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { Logger } from "@medusajs/framework/types";

import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { encryptJson, keyFromEnv } from "../../../tenant-secrets/crypto";
import {
  cdekApiCredentials,
  emptyCdekCredentials,
  readCdekSecret,
  type CdekCredentialsPayload,
} from "../../../tenant-secrets/cdek";
import { listTariffs, listWebhooks, registerWebhook } from "../../../cdek/client";
import type { CdekDeliveryKind } from "../../../cdek/method";
import provisionTenantCdekMethodsWorkflow from "../../../workflows/tenant/cdek/provision-tenant-cdek-methods";
import { getTenantScope } from "../tenant-scope";
import { getTenantWarehouse, resolveShippingProfileId } from "../shipping-methods/helpers";
import type { PutTenantDeliverySettingsBody } from "../validators";
import { cdekWebhookUrl, newWebhookToken, readOwnDeliverySettings } from "./helpers";

/**
 * `GET /tenants/delivery-settings` — the shop's CDEK account, masked, plus the
 * CDEK methods it currently offers (i02-apiship-cdek-shipping).
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const warehouse = await getTenantWarehouse(req);
  res.json(await readOwnDeliverySettings(req, warehouse.service_zone_ids));
};

/**
 * `PUT /tenants/delivery-settings` — create or replace the shop's CDEK account
 * and the delivery kinds it offers.
 *
 * The order of the three effects matters and is deliberate:
 *
 * 1. The credentials are VERIFIED against CDEK before anything is written. A
 *    saved-but-wrong password would show the owner a green form and the buyer no
 *    delivery at all, and the buyer's silence is what reaches Ivan (rule 18f).
 * 2. The row is written.
 * 3. The shipping options are provisioned and the status webhook registered.
 *    Both are idempotent, and a webhook failure is reported in the answer rather
 *    than rolled back: the shop can quote and ship without it, it only loses the
 *    automatic status updates.
 */
export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantDeliverySettingsBody>,
  res: MedusaResponse,
) => {
  const body = req.validatedBody;
  const tenant = await getTenantScope(req);
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);
  const warehouse = await getTenantWarehouse(req);

  const existing = await readCdekSecret(pg, tenant.id, { includeDisabled: true });
  const previous: CdekCredentialsPayload = existing?.credentials ?? emptyCdekCredentials();

  const credentials: CdekCredentialsPayload = {
    account: body.account ?? previous.account,
    password: body.password ?? previous.password,
    test_account: body.test_account ?? previous.test_account,
    test_password: body.test_password ?? previous.test_password,
    sender_mode: body.sender_mode ?? previous.sender_mode,
    sender_city_code:
      body.sender_city_code !== undefined ? body.sender_city_code : previous.sender_city_code,
    sender_city_name: body.sender_city_name ?? previous.sender_city_name,
    sender_address: body.sender_address ?? previous.sender_address,
    sender_name: body.sender_name ?? previous.sender_name,
    sender_phone: body.sender_phone ?? previous.sender_phone,
    shipment_point: body.shipment_point ?? previous.shipment_point,
    webhook_token: previous.webhook_token ?? newWebhookToken(),
    webhook_uuid: previous.webhook_uuid,
  };

  const isTest = body.is_test ?? existing?.is_test ?? true;
  const isEnabled = body.is_enabled ?? existing?.is_enabled ?? true;

  const account = isTest ? credentials.test_account : credentials.account;
  const password = isTest ? credentials.test_password : credentials.password;
  if (isEnabled && (!account || !password)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      isTest
        ? "Тестовый режим нужно заполнить: логин и пароль тестового аккаунта СДЭК."
        : "Боевой режим нужно заполнить: логин и пароль боевого аккаунта СДЭК.",
    );
  }
  if (isEnabled && !credentials.sender_city_code && !credentials.sender_city_name) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Укажите город отправления: без него СДЭК не считает ни одного тарифа.",
    );
  }

  // Step 1 — prove the credentials work before they are stored.
  let verified: { tariffs: number } | null = null;
  if (isEnabled) {
    const api = cdekApiCredentials({
      id: existing?.id ?? "new",
      tenant_id: tenant.id,
      is_test: isTest,
      is_enabled: true,
      credentials,
    });
    if (!api) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Не хватает данных аккаунта СДЭК.");
    }
    try {
      const from = credentials.sender_city_code
        ? { code: credentials.sender_city_code }
        : { city: credentials.sender_city_name ?? undefined };
      const tariffs = await listTariffs(api, {
        from_location: from,
        to_location: from,
        packages: [{ weight: 1000 }],
      });
      verified = { tariffs: tariffs.length };
    } catch (error) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `СДЭК не принял эти реквизиты: ${(error as Error).message}`,
      );
    }
  }

  // Step 2 — write the row.
  const payload = encryptJson(credentials, keyFromEnv());
  if (existing) {
    await tenantModule.updateTenantIntegrationSecrets({
      id: existing.id,
      payload,
      is_test: isTest,
      is_enabled: isEnabled,
    });
  } else {
    await tenantModule.createTenantIntegrationSecrets({
      tenant_id: tenant.id,
      provider: "cdek",
      payload,
      is_test: isTest,
      is_enabled: isEnabled,
    });
  }

  // Step 3a — the shipping options.
  const kinds: CdekDeliveryKind[] = body.kinds ?? ["courier", "pickup"];
  await provisionTenantCdekMethodsWorkflow(req.scope).run({
    input: {
      tenant_id: tenant.id,
      kinds,
      enabled: isEnabled && kinds.length > 0,
      shipping_profile_id: await resolveShippingProfileId(req),
      base_service_zone_id: warehouse.base_service_zone_id,
      service_zone_ids: warehouse.service_zone_ids,
      stock_location_id: warehouse.stock_location_id,
      default_weight_g: warehouse.default_weight_g,
      markup_amount: body.markup_amount ?? 0,
      markup_percent: body.markup_percent ?? 0,
      free_above_total: body.free_above_total ?? null,
      sender_mode: credentials.sender_mode,
    },
  });

  // Step 3b — the status webhook, best effort.
  let webhook: { registered: boolean; error: string | null } = { registered: false, error: null };
  if (isEnabled) {
    const api = cdekApiCredentials({
      id: existing?.id ?? "new",
      tenant_id: tenant.id,
      is_test: isTest,
      is_enabled: true,
      credentials,
    });
    const url = cdekWebhookUrl(req, tenant.id, credentials.webhook_token!);
    try {
      const already = await listWebhooks(api!);
      const mine = already.find((entry) => entry.url === url && entry.type === "ORDER_STATUS");
      if (mine) {
        webhook = { registered: true, error: null };
        credentials.webhook_uuid = mine.uuid;
      } else {
        const ack = await registerWebhook(api!, { url, type: "ORDER_STATUS" });
        credentials.webhook_uuid = ack.entity?.uuid ?? credentials.webhook_uuid;
        webhook = { registered: true, error: null };
      }
      // The uuid is part of the payload, so the row is rewritten once it is known.
      const row = await readCdekSecret(pg, tenant.id, { includeDisabled: true });
      if (row) {
        await tenantModule.updateTenantIntegrationSecrets({
          id: row.id,
          payload: encryptJson(credentials, keyFromEnv()),
        });
      }
    } catch (error) {
      webhook = { registered: false, error: (error as Error).message };
      logger?.warn(`[cdek] webhook registration failed for ${tenant.id}: ${webhook.error}`);
    }
  }

  const settings = await readOwnDeliverySettings(req, warehouse.service_zone_ids);
  res.json({ ...settings, verified, webhook });
};

/** `DELETE /tenants/delivery-settings` — forget the account and switch the CDEK methods off. */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);
  const warehouse = await getTenantWarehouse(req);
  const existing = await readCdekSecret(pg, tenant.id, { includeDisabled: true });

  if (existing) {
    await tenantModule.softDeleteTenantIntegrationSecrets([existing.id]);
    // The options stay, switched off: a cart that already chose one keeps working.
    await provisionTenantCdekMethodsWorkflow(req.scope).run({
      input: {
        tenant_id: tenant.id,
        kinds: [],
        enabled: false,
        shipping_profile_id: await resolveShippingProfileId(req),
        base_service_zone_id: warehouse.base_service_zone_id,
        service_zone_ids: warehouse.service_zone_ids,
        stock_location_id: warehouse.stock_location_id,
        default_weight_g: warehouse.default_weight_g,
        markup_amount: 0,
        markup_percent: 0,
        free_above_total: null,
        sender_mode: existing.credentials.sender_mode,
      },
    });
  }

  res.json({ id: existing?.id ?? null, object: "delivery_settings", deleted: Boolean(existing) });
};
