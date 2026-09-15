import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import { inspectToken, readOnlyWarning } from "../modules/wb/token";
import { encryptJson, keyFromEnv, maskSecret } from "../tenant-secrets/crypto";
import { readWildberriesSecret } from "../tenant-secrets/wildberries";
import { parseWbArgs } from "./wb-args";

/**
 * Stores the shop's Wildberries Seller API key as a tenant secret
 * (w01-wb-readonly-client).
 *
 * The key is taken from the environment and never from an argument: an
 * argument stands in the shell history and in `ps`, an environment variable
 * does not have to. Nothing is printed but "stored" or "updated", the last
 * four characters, and what the key says about itself.
 *
 *   set -a; source /path/to/.env.cherkashino; set +a
 *   WB_TENANT=cherkashino pnpm --filter backend wb:seed-key
 *
 * Idempotent: a second run with the same key updates the row and says so.
 */
export default async function wbSeedKey({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const { tenant: handle } = parseWbArgs(args);

  if (!handle) {
    logger.error(
      "wb:seed-key: name the shop: WB_TENANT=<handle> pnpm --filter backend wb:seed-key " +
        "(or `medusa exec ./src/scripts/wb-seed-key.ts tenant=<handle>`)",
    );
    process.exitCode = 1;
    return;
  }

  const apiKey = process.env.WB_API_KEY;
  if (!apiKey) {
    logger.error(
      "wb:seed-key: WB_API_KEY is not in the environment. Load it from the key file first: " +
        "`set -a; source <file>; set +a`. The key is never passed as an argument.",
    );
    process.exitCode = 1;
    return;
  }

  const tenantModule = container.resolve<TenantModuleService>(TENANT_MODULE);
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const [tenant] = await tenantModule.listTenants({ handle });
  if (!tenant) {
    logger.error(`wb:seed-key: no shop with handle ${handle} on this stand.`);
    process.exitCode = 1;
    return;
  }

  const facts = inspectToken(apiKey);
  const existing = await readWildberriesSecret(pg, tenant.id, { includeDisabled: true });
  const payload = encryptJson({ api_key: apiKey }, keyFromEnv());

  if (existing) {
    await tenantModule.updateTenantIntegrationSecrets({
      id: existing.id,
      payload,
      is_enabled: true,
    });
    logger.info(`wb:seed-key: updated the Wildberries key of ${handle} (${tenant.id}).`);
  } else {
    await tenantModule.createTenantIntegrationSecrets({
      tenant_id: tenant.id,
      provider: "wildberries",
      payload,
      is_test: false,
      is_enabled: true,
    });
    logger.info(`wb:seed-key: stored the Wildberries key of ${handle} (${tenant.id}).`);
  }

  const masked = maskSecret(apiKey);
  logger.info(
    `wb:seed-key: key ends with ${masked.last4}, seller ${facts.sellerId ?? "?"}, ` +
      `kind ${facts.kind ?? "?"}, sandbox ${String(facts.sandbox)}, ` +
      `expires ${facts.expiresAt ?? "?"}, read_only ${String(facts.readOnly)}.`,
  );

  const warning = readOnlyWarning(facts);
  if (warning) {
    logger.warn(warning);
  }
}
