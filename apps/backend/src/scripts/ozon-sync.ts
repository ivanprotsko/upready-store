import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import { OZON_MODULE } from "../modules/ozon";
import type OzonModuleService from "../modules/ozon/service";
import { OZON_SYNC_KINDS, type OzonSyncKind } from "../modules/ozon/models/ozon-sync-run";
import { inspectCredentials, readOnlyWarning } from "../modules/ozon/credentials";
import { runSync, type OzonSyncOutcome } from "../modules/ozon/sync";
import { readOzonSecret } from "../tenant-secrets/ozon";
import { parseOzonArgs } from "./ozon-args";

/**
 * Imports one shop's Ozon cabinet into the local mirrors
 * (w11-ozon-readonly-client).
 *
 *   OZON_TENANT=cherkashino OZON_KIND=all pnpm --filter backend ozon:sync
 *   OZON_TENANT=cherkashino OZON_KIND=products pnpm --filter backend ozon:sync
 *   OZON_TENANT=cherkashino OZON_KIND=all OZON_FIXTURES=1 pnpm --filter backend ozon:sync
 *
 * The credentials come from the shop's tenant secrets, never from this
 * process's environment: the cabinet belongs to the shop. Every request goes
 * through `ozonRead`, so the only thing this script can do to Ozon is read.
 *
 * `OZON_FIXTURES=1` (or `--fixtures`) answers from the recorded fixtures
 * instead of the network. It needs no key, opens no socket, and stamps
 * `is_fixture = true` on the run and on every journal row, so the database
 * itself can tell a fixture run from a live one.
 */
export default async function ozonSync({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const { tenant: handle, kind: kindArg, fixtures } = parseOzonArgs(args);
  const kind = kindArg ?? "all";

  if (!handle) {
    logger.error(
      "ozon:sync: name the shop: OZON_TENANT=<handle> OZON_KIND=<all|" +
        `${OZON_SYNC_KINDS.join("|")}> pnpm --filter backend ozon:sync`,
    );
    process.exitCode = 1;
    return;
  }

  const kinds: OzonSyncKind[] =
    kind === "all" ? [...OZON_SYNC_KINDS] : (kind.split(",") as OzonSyncKind[]);

  const unknown = kinds.filter((candidate) => !OZON_SYNC_KINDS.includes(candidate));
  if (unknown.length) {
    logger.error(
      `ozon:sync: unknown kind ${unknown.join(", ")}. Known kinds: ${OZON_SYNC_KINDS.join(", ")}, or all.`,
    );
    process.exitCode = 1;
    return;
  }

  const tenantModule = container.resolve<TenantModuleService>(TENANT_MODULE);
  const ozon = container.resolve<OzonModuleService>(OZON_MODULE);
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const [tenant] = await tenantModule.listTenants({ handle });
  if (!tenant) {
    logger.error(`ozon:sync: no shop with handle ${handle} on this stand.`);
    process.exitCode = 1;
    return;
  }

  const secret = await readOzonSecret(pg, tenant.id);

  if (!secret && !fixtures) {
    logger.error(
      `ozon:sync: ${handle} has no enabled Ozon credentials. Store them first ` +
        "(`OZON_TENANT=<handle> pnpm --filter backend ozon:seed-key`), or run this import against " +
        "the recorded fixtures (`OZON_FIXTURES=1`).",
    );
    process.exitCode = 1;
    return;
  }

  const credentials = {
    clientId: secret?.credentials.client_id ?? "",
    apiKey: secret?.credentials.api_key ?? "",
  };

  if (fixtures) {
    logger.warn(
      `ozon:sync: FIXTURE RUN for ${handle} (${tenant.id}). Nothing leaves this machine; the ` +
        "answers come from src/modules/ozon/fixtures.ts, shaped from the saved Ozon reference. " +
        "Every row written by this run carries is_fixture = true.",
    );
  } else {
    const facts = await inspectCredentials(credentials, { tenantId: tenant.id, logger });
    logger.info(
      `ozon:sync: ${handle} (${tenant.id}), Client-Id ${facts.clientId ?? "?"}, expires ` +
        `${facts.expiresAt ?? "?"}, read_only ${String(facts.readOnly)}, kinds ${kinds.join(", ")}.`,
    );
    const warning = readOnlyWarning(facts);
    if (warning) {
      logger.warn(warning);
    }
  }

  const outcomes: OzonSyncOutcome[] = [];
  for (const one of kinds) {
    outcomes.push(
      await runSync(
        {
          ozon,
          tenantId: tenant.id,
          credentials,
          mode: fixtures ? "fixtures" : "live",
          logger,
        },
        one,
      ),
    );
  }

  for (const outcome of outcomes) {
    logger.info(
      `ozon:sync: ${outcome.kind} ${outcome.status}${outcome.isFixture ? " (fixtures)" : ""}, ` +
        `${outcome.rows} rows, ${outcome.requests} requests` +
        `${outcome.error ? `, error: ${outcome.error}` : ""}`,
    );
  }

  // A run that failed has to leave a non-zero exit code, or a wrapper reads
  // "the script finished" as "the import worked" (rule 20a).
  if (outcomes.some((outcome) => outcome.status === "failed")) {
    process.exitCode = 1;
  }
}
