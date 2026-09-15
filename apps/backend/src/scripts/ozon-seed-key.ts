import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import { inspectCredentials, readOnlyWarning } from "../modules/ozon/credentials";
import { encryptJson, keyFromEnv, maskSecret } from "../tenant-secrets/crypto";
import { readOzonSecret } from "../tenant-secrets/ozon";
import { parseOzonArgs } from "./ozon-args";

/**
 * Stores the shop's Ozon Seller API credentials as a tenant secret
 * (w11-ozon-readonly-client).
 *
 * Both values are taken from the environment and never from an argument: an
 * argument stands in the shell history and in `ps`, an environment variable
 * does not have to. Nothing is printed but "stored" or "updated", the Client-Id,
 * the last four characters of the key, and what Ozon says the key may do.
 *
 *   set -a; source /Users/ivanprotsko/upready/projects/upready-store/.env.cherkashino; set +a
 *   OZON_TENANT=cherkashino pnpm --filter backend ozon:seed-key
 *
 * Idempotent: a second run with the same pair updates the row and says so.
 */
export default async function ozonSeedKey({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const { tenant: handle } = parseOzonArgs(args);

  if (!handle) {
    logger.error(
      "ozon:seed-key: name the shop: OZON_TENANT=<handle> pnpm --filter backend ozon:seed-key " +
        "(or `medusa exec ./src/scripts/ozon-seed-key.ts tenant=<handle>`)",
    );
    process.exitCode = 1;
    return;
  }

  const clientId = process.env.OZON_CLIENT_ID;
  const apiKey = process.env.OZON_API_KEY;

  if (!clientId || !apiKey) {
    logger.error(
      "ozon:seed-key: OZON_CLIENT_ID and OZON_API_KEY are not both in the environment. Load them " +
        "from the key file first: `set -a; source <file>; set +a`. Neither is ever passed as an argument.",
    );
    process.exitCode = 1;
    return;
  }

  const tenantModule = container.resolve<TenantModuleService>(TENANT_MODULE);
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const [tenant] = await tenantModule.listTenants({ handle });
  if (!tenant) {
    logger.error(`ozon:seed-key: no shop with handle ${handle} on this stand.`);
    process.exitCode = 1;
    return;
  }

  const existing = await readOzonSecret(pg, tenant.id, { includeDisabled: true });
  const payload = encryptJson({ client_id: clientId, api_key: apiKey }, keyFromEnv());

  if (existing) {
    await tenantModule.updateTenantIntegrationSecrets({
      id: existing.id,
      payload,
      is_enabled: true,
    });
    logger.info(`ozon:seed-key: updated the Ozon credentials of ${handle} (${tenant.id}).`);
  } else {
    await tenantModule.createTenantIntegrationSecrets({
      tenant_id: tenant.id,
      provider: "ozon",
      payload,
      is_test: false,
      is_enabled: true,
    });
    logger.info(`ozon:seed-key: stored the Ozon credentials of ${handle} (${tenant.id}).`);
  }

  const masked = maskSecret(apiKey);
  logger.info(`ozon:seed-key: Client-Id ${clientId}, key ends with ${masked.last4}.`);

  // Ozon has no offline answer: the only way to learn what the key may do is
  // to ask Ozon itself. A failure here is reported, never fatal — the key is
  // already stored and the transport cannot write with it either way.
  const facts = await inspectCredentials(
    { clientId, apiKey },
    { tenantId: tenant.id, logger },
  );
  logger.info(
    `ozon:seed-key: expires ${facts.expiresAt ?? "?"}, roles ` +
      `${facts.roles.map((role) => role.name).join(", ") || "?"}, read_only ${String(facts.readOnly)}.`,
  );
  logger.info(`ozon:seed-key: read_only source — ${facts.readOnlySource}`);

  const warning = readOnlyWarning(facts);
  if (warning) {
    logger.warn(warning);
  }
}
