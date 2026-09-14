import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { encryptJson, keyFromEnv } from "../../../tenant-secrets/crypto";
import {
  readRobokassaSecret,
  ROBOKASSA_SECRET_FIELDS,
  type RobokassaCredentials,
} from "../../../tenant-secrets/robokassa";
import { getTenantScope } from "../tenant-scope";
import type { PutTenantPaymentSettingsBody } from "../validators";
import { readOwnPaymentSettings } from "./helpers";

/**
 * `GET /tenants/payment-settings` — the shop's payment account, masked
 * (t03-tenant-secrets-robokassa). Every secret comes back as
 * `{ set, last4 }`; the value itself is never in a response of this namespace,
 * and `integration-tests/http/tenants-payment-settings.spec.ts` asserts it.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json(await readOwnPaymentSettings(req));
};

/**
 * `PUT /tenants/payment-settings` — create or replace the shop's Robokassa
 * account. Passwords absent from the body keep their stored value; a mode
 * (test or live) can only be switched on when both passwords of that pair are
 * known, otherwise the checkout would build a URL Robokassa rejects and the
 * owner would learn it from a customer.
 */
export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantPaymentSettingsBody>,
  res: MedusaResponse,
) => {
  const body = req.validatedBody;
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);

  const existing = await readRobokassaSecret(pg, tenant.id, { includeDisabled: true });
  const previous: Partial<RobokassaCredentials> = existing?.credentials ?? {};

  const credentials: RobokassaCredentials = {
    merchant_login: body.merchant_login,
    hash_algorithm: body.hash_algorithm ?? previous.hash_algorithm ?? "sha256",
    password1: body.password1 ?? previous.password1 ?? "",
    password2: body.password2 ?? previous.password2 ?? "",
    test_password1: body.test_password1 ?? previous.test_password1 ?? "",
    test_password2: body.test_password2 ?? previous.test_password2 ?? "",
  };
  const isTest = body.is_test ?? existing?.is_test ?? true;
  const isEnabled = body.is_enabled ?? existing?.is_enabled ?? true;

  const pair: Array<(typeof ROBOKASSA_SECRET_FIELDS)[number]> = isTest
    ? ["test_password1", "test_password2"]
    : ["password1", "password2"];
  const missing = pair.filter((field) => !credentials[field]);
  if (isEnabled && missing.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${isTest ? "Test mode" : "Live mode"} needs ${missing.join(" and ")} before it can be enabled.`,
    );
  }

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
      provider: "robokassa",
      payload,
      is_test: isTest,
      is_enabled: isEnabled,
    });
  }

  res.json(await readOwnPaymentSettings(req));
};

/** `DELETE /tenants/payment-settings` — forget the account; the checkout stops offering Robokassa. */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);
  const existing = await readRobokassaSecret(pg, tenant.id, { includeDisabled: true });
  if (existing) {
    await tenantModule.softDeleteTenantIntegrationSecrets([existing.id]);
  }
  res.json({ id: existing?.id ?? null, object: "payment_settings", deleted: Boolean(existing) });
};
