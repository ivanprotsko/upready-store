import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import { WB_WRITE_LIVE_ENV } from "../modules/wb-write/write-transport";
import { buildWbDiff } from "../wb-write-diff/build";
import { pushWbDiff } from "../wb-write-diff/push";
import { WB_DIFF_KINDS, type WbDiffKind } from "../wb-write-diff/types";
import { parseWbArgs } from "./wb-args";

/**
 * The store -> Wildberries push for the classes `stocks` and `prices`
 * (w21-wb-write-stocks-prices).
 *
 *   WB_TENANT=cherkashino WB_KIND=stocks pnpm --filter backend wb:push
 *   WB_TENANT=cherkashino WB_KIND=prices pnpm --filter backend wb:push
 *   pnpm --filter backend wb:push -- --tenant cherkashino --kind prices --dry-run
 *
 * The environment form is the one the acceptance uses, for the reason
 * `wb-args.ts` writes down: `medusa exec` and `pnpm --filter` are two more
 * argument parsers in front of this script and both eat a leading `--`.
 *
 * `--dry-run` is accepted and is a NO-OP, deliberately. Whether anything
 * leaves this process is decided by gate (e) of the write core, reading
 * `WB_WRITE_LIVE` from the environment; a flag here that could change it would
 * be a sixth gate owned by a script. The flag is accepted so the documented
 * command line works, and the run says out loud which gate actually decided.
 */
export default async function wbPush({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const { tenant: handle, kind: kindArg, flags } = parseWbArgs(args);
  const kind = (kindArg ?? "") as WbDiffKind;

  if (!handle || !WB_DIFF_KINDS.includes(kind)) {
    logger.error(
      `wb:push: name the shop and the class: WB_TENANT=<handle> WB_KIND=<${WB_DIFF_KINDS.join(
        "|",
      )}> pnpm --filter backend wb:push`,
    );
    process.exitCode = 1;
    return;
  }

  const tenantModule = container.resolve<TenantModuleService>(TENANT_MODULE);
  const [tenant] = await tenantModule.listTenants({ handle });

  if (!tenant) {
    logger.error(`wb:push: no shop with handle ${handle} on this stand.`);
    process.exitCode = 1;
    return;
  }

  const live = process.env[WB_WRITE_LIVE_ENV] === "1";
  if (flags.has("dry-run") && live) {
    // Saying "I asked for a dry run" out loud rather than pretending the flag
    // did something: the run is about to go through a gate that is OPEN.
    logger.warn(
      `wb:push: --dry-run changes nothing — ${WB_WRITE_LIVE_ENV}=1 is set in this process, ` +
        "so gate (e) of the write core is open and a request CAN leave.",
    );
  }

  const diff = await buildWbDiff(container, { tenantId: tenant.id, kind });

  logger.info(
    `wb:push ${handle} ${kind}: ${diff.counts.total} rows — ` +
      `${diff.counts.equal} equal, ${diff.counts.update} differ, ${diff.counts.skipped} skipped` +
      (diff.mirror_fetched_at ? `; mirror read ${diff.mirror_fetched_at}` : "") +
      (diff.unmapped_locations.length
        ? `; ${diff.unmapped_locations.length} stock location(s) with no WB warehouse mapped: ` +
          diff.unmapped_locations.map((row) => row.stock_location_name).join(", ")
        : ""),
  );

  for (const row of diff.rows.filter((entry) => entry.action === "skipped")) {
    logger.info(`wb:push skipped ${row.nm_id} (${row.variant_sku ?? row.variant_id}): ${row.reason}`);
  }

  const outcome = await pushWbDiff(container, {
    tenantId: tenant.id,
    actor: "script:wb:push",
    diff,
  });

  for (const result of outcome.results) {
    logger.info(
      `wb:push ${result.endpoint_id} ${JSON.stringify(result.params)} ` +
        `(${result.rows} rows) -> ${result.outcome}` +
        (result.gate ? ` at gate ${result.gate}: ${result.message}` : "") +
        (result.payload_sha256 ? ` sha256 ${result.payload_sha256.slice(0, 12)}…` : ""),
    );
  }

  logger.info(
    `wb:push ${handle} ${kind}: ${outcome.batches} batch(es), ${outcome.rows} rows — ` +
      `${outcome.dry_run} dry_run, ${outcome.refused} refused, ${outcome.sent} sent. ` +
      `${WB_WRITE_LIVE_ENV}=${live ? "1" : "(unset)"}.`,
  );

  if (outcome.sent > 0) {
    // This repository has never produced this line. If it ever does, it is the
    // loudest thing in the log rather than a number in a summary.
    logger.warn(`wb:push: ${outcome.sent} batch(es) WERE SENT to Wildberries.`);
  }
}
