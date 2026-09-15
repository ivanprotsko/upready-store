import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import { WB_MODULE } from "../modules/wb";
import type WbModuleService from "../modules/wb/service";
import { WB_SYNC_KINDS, type WbSyncKind } from "../modules/wb/models/wb-sync-run";
import { runSync, type WbSyncLimits, type WbSyncOutcome } from "../modules/wb/sync";
import { inspectToken, readOnlyWarning } from "../modules/wb/token";
import { readWildberriesSecret } from "../tenant-secrets/wildberries";
import { parseWbArgs } from "./wb-args";

/**
 * Imports one shop's Wildberries cabinet into the local mirrors
 * (w01-wb-readonly-client).
 *
 *   WB_TENANT=cherkashino WB_KIND=all pnpm --filter backend wb:sync
 *   WB_TENANT=cherkashino WB_KIND=cards pnpm --filter backend wb:sync
 *
 * The key comes from the shop's tenant secrets, never from the environment of
 * this process: the cabinet belongs to the shop. Every request goes through
 * `wbRead`, so the only thing this script can do to Wildberries is read.
 *
 * `all` runs the kinds in dependency order: stocks need the size ids that the
 * cards import writes.
 */
export default async function wbSync({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const { tenant: handle, kind: kindArg, cards, nmids } = parseWbArgs(args);
  const kind = kindArg ?? "all";

  if (!handle) {
    logger.error(
      "wb:sync: name the shop: WB_TENANT=<handle> WB_KIND=<all|" +
        `${WB_SYNC_KINDS.join("|")}> pnpm --filter backend wb:sync`,
    );
    process.exitCode = 1;
    return;
  }

  const kinds: WbSyncKind[] =
    kind === "all" ? [...WB_SYNC_KINDS] : (kind.split(",") as WbSyncKind[]);

  const unknown = kinds.filter((candidate) => !WB_SYNC_KINDS.includes(candidate));
  if (unknown.length) {
    logger.error(
      `wb:sync: unknown kind ${unknown.join(", ")}. Known kinds: ${WB_SYNC_KINDS.join(", ")}, or all.`,
    );
    process.exitCode = 1;
    return;
  }

  const tenantModule = container.resolve<TenantModuleService>(TENANT_MODULE);
  const wb = container.resolve<WbModuleService>(WB_MODULE);
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const [tenant] = await tenantModule.listTenants({ handle });
  if (!tenant) {
    logger.error(`wb:sync: no shop with handle ${handle} on this stand.`);
    process.exitCode = 1;
    return;
  }

  const secret = await readWildberriesSecret(pg, tenant.id);
  if (!secret) {
    logger.error(
      `wb:sync: ${handle} has no enabled Wildberries key. Store one first: ` +
        "`WB_TENANT=<handle> pnpm --filter backend wb:seed-key`.",
    );
    process.exitCode = 1;
    return;
  }

  const facts = inspectToken(secret.credentials.api_key);
  logger.info(
    `wb:sync: ${handle} (${tenant.id}), seller ${facts.sellerId ?? "?"}, ` +
      `read_only ${String(facts.readOnly)}, kinds ${kinds.join(", ")}.`,
  );
  const warning = readOnlyWarning(facts);
  if (warning) {
    logger.warn(warning);
  }

  // What the operator narrowed for this run. Only the analytics import reads
  // it: WB takes at most 20 listing numbers per request there (w03).
  const limits: WbSyncLimits = {
    analyticsCards: cards ? Number(cards) : undefined,
    nmIds: nmids
      ? nmids
          .split(",")
          .map((one) => one.trim())
          .filter(Boolean)
      : undefined,
  };

  if (limits.analyticsCards !== undefined && !Number.isFinite(limits.analyticsCards)) {
    logger.error(`wb:sync: WB_ANALYTICS_CARDS must be a number, got ${cards}.`);
    process.exitCode = 1;
    return;
  }

  const outcomes: WbSyncOutcome[] = [];
  for (const one of kinds) {
    outcomes.push(
      await runSync(
        { wb, tenantId: tenant.id, token: secret.credentials.api_key, logger, limits },
        one,
      ),
    );
  }

  for (const outcome of outcomes) {
    logger.info(
      `wb:sync: ${outcome.kind} ${outcome.status}, ${outcome.rows} rows, ` +
        `${outcome.requests} WB requests${outcome.error ? `, error: ${outcome.error}` : ""}`,
    );
  }

  // A run that failed has to leave a non-zero exit code, or a wrapper reads
  // "the script finished" as "the import worked" (rule 20a).
  if (outcomes.some((outcome) => outcome.status === "failed")) {
    process.exitCode = 1;
  }
}
