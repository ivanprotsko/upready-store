import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace";
import { MARKETPLACES, requireAdapter } from "../../src/modules/marketplace/registry";
import {
  MP_SCHEDULER_CRON,
  MP_STALE_LOCK_MS,
  intervalMsFor,
  nextDueAt,
} from "../../src/modules/marketplace/schedule";
import { newestRun, runOneSync } from "../../src/modules/marketplace/scheduler";
import type MarketplaceModuleService from "../../src/modules/marketplace/service";
import { TENANT_MODULE } from "../../src/modules/tenant";
import type TenantModuleService from "../../src/modules/tenant/service";

/**
 * The acceptance run of w16-mp-scheduler-ops, against the LOCAL stand.
 *
 *   W16_TENANT=cherkashino npx medusa exec ./scripts/fixtures/w16-scheduler-acceptance.ts
 *
 * It measures the four claims of the task on the real product path — the real
 * registry, the real `mp_sync_run`, the real adapters — and prints what it
 * measured so the PR quotes outputs and not intentions (rule 18f):
 *
 *   1. the schedule: the verdict of every (marketplace, kind) right now;
 *   2. two runs of one kind at different times, through `deps.now`, which is
 *      the same seam the scheduler itself uses;
 *   3. the single-run rule, twice over: two concurrent starts, and a raw
 *      INSERT of a second `running` row, which the database must refuse;
 *   4. a deliberately failing run, so the red row and the operator's log line
 *      exist on the screen instead of being described.
 *
 * It is a fixture: it lives outside `src`, the production image never compiles
 * it, and it may write to the stand's database (AGENTS.md, «Things That Break
 * Silently»). It sends no write to any marketplace: everything it calls is
 * `adapter.runSync`, which can only send registered reads.
 */

const line = (text: string) => console.log(text);

export default async function w16SchedulerAcceptance({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const mp = container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);
  const tenantModule = container.resolve<TenantModuleService>(TENANT_MODULE);

  const handle = process.env.W16_TENANT ?? "cherkashino";
  const [tenant] = (await tenantModule.listTenants({ handle })) as unknown as {
    id: string;
    handle: string;
  }[];

  if (!tenant) {
    logger.error(`w16: no shop with handle ${handle} on this stand.`);
    process.exitCode = 1;
    return;
  }

  const deps = () => ({ container, tenantId: tenant.id, logger });

  /**
   * Pushes every run of one triple BACK in time, so an interval that really
   * has to elapse can be measured in one pass.
   *
   * The clock is left alone on purpose. Moving `deps.now` FORWARD was the
   * first attempt and it wrote rows stamped in the future, which then made
   * every later phase read «interval not elapsed» against a row that had not
   * happened yet. Ageing the history is what an elapsed interval actually
   * looks like; a future timestamp is not.
   */
  const age = async (kind: string, minutes: number) => {
    const moved = await pg("mp_sync_run")
      .where({ tenant_id: tenant.id, marketplace: "wb", kind })
      .whereNull("deleted_at")
      .update({
        // `interval ?` is not bindable — Postgres wants a literal there, and
        // the first run of this fixture died on «syntax error at or near $1».
        started_at: pg.raw("started_at - make_interval(mins => ?)", [minutes]),
        finished_at: pg.raw("finished_at - make_interval(mins => ?)", [minutes]),
      });
    return moved;
  };

  line(`\n=== 1. SCHEDULE (cron ${MP_SCHEDULER_CRON}, stale lock ${MP_STALE_LOCK_MS / 60_000} min)`);
  const now = new Date();
  for (const adapter of MARKETPLACES) {
    const slot = await adapter.readCredentials(pg, tenant.id);
    line(
      `  ${adapter.id}: key ${slot ? `set (…${slot.last4})` : "NOT set"}, ` +
        `enabled ${slot?.isEnabled ?? false}`,
    );
    for (const kind of [...adapter.syncKinds, "projection"]) {
      const last = await newestRun(mp, tenant.id, adapter.id, kind);
      const verdict = nextDueAt(
        last
          ? {
              status: last.status,
              started_at: new Date(last.started_at),
              finished_at: last.finished_at ? new Date(last.finished_at) : null,
              retry_at: last.retry_at ? new Date(last.retry_at) : null,
            }
          : null,
        kind,
        now,
      );
      line(
        `    ${adapter.id}.${kind.padEnd(11)} every ${String(
          (intervalMsFor(kind) ?? 0) / 60_000,
        ).padStart(5)} min | last ${(last?.status ?? "NEVER RAN").padEnd(12)} | ` +
          `due ${String(verdict.due).padEnd(5)} (${verdict.reason})` +
          `${verdict.nextAt ? ` next ${verdict.nextAt.toISOString()}` : ""}`,
      );
    }
  }

  line("\n=== 2. A STALE LOCK IS TAKEN OVER, AND THE DEAD ROW STAYS VISIBLE");
  const wb = requireAdapter("wb");
  const stuck = (await mp.listMpSyncRuns(
    { tenant_id: tenant.id, marketplace: "wb", kind: "projection", status: "running" },
    { take: 1 },
  )) as { id: string }[];

  if (!stuck.length) {
    await pg("mp_sync_run").insert({
      id: "mprun_w16_stale",
      tenant_id: tenant.id,
      marketplace: "wb",
      kind: "projection",
      status: "running",
      started_at: new Date(Date.now() - MP_STALE_LOCK_MS - 60_000),
      rows: 0,
      requests: 0,
      attempts: 0,
      created_at: new Date(),
      updated_at: new Date(),
    });
    line("  planted a `running` row older than the lock timeout");
  } else {
    // A real one, left by a process that died mid-run. Aged so the takeover
    // can be measured now instead of half an hour from now.
    await pg("mp_sync_run")
      .where({ id: stuck[0].id })
      .update({ started_at: new Date(Date.now() - MP_STALE_LOCK_MS - 60_000) });
    line(`  found a real orphaned lock ${stuck[0].id}, aged it past the timeout`);
  }

  const takeover = await runOneSync(deps(), wb, "projection", null);
  line(`  takeover run: ${takeover.outcome} (${takeover.reason}), rows ${takeover.rows}`);
  const dead = (await mp.listMpSyncRuns(
    { tenant_id: tenant.id, marketplace: "wb", kind: "projection", status: "failed" },
    { order: { started_at: "DESC" }, take: 1 },
  )) as { id: string; error: string | null }[];
  line(`  the dead row: ${dead[0]?.id} — ${dead[0]?.error}`);

  line("\n=== 3. TWO RUNS OF ONE KIND AT DIFFERENT TIMES (wb.projection, 0 marketplace requests)");
  await age("projection", 11);
  const first = await runOneSync(deps(), wb, "projection", null);
  line(`  run 1: ${first.outcome}, rows ${first.rows}, requests ${first.requests}, run ${first.runId}`);

  await age("projection", 11);
  const second = await runOneSync(deps(), wb, "projection", null);
  line(`  run 2: ${second.outcome}, rows ${second.rows}, requests ${second.requests}, run ${second.runId}`);

  // The interval is real: a third run right after the second must be refused.
  const third = await runOneSync(deps(), wb, "projection", null);
  line(`  run 3 (no ageing, interval not elapsed): ${third.outcome} (${third.reason})`);

  line("\n=== 3b. ONE RUN PER TRIPLE");
  await age("projection", 11);
  const raced = await Promise.all([
    runOneSync(deps(), wb, "projection", null),
    runOneSync(deps(), wb, "projection", null),
  ]);
  line(
    `  two concurrent starts -> ${raced
      .map((entry) => `${entry.outcome}/${entry.reason}`)
      .join(" + ")}`,
  );

  const running = await pg("mp_sync_run")
    .where({ tenant_id: tenant.id, marketplace: "wb", kind: "projection", status: "running" })
    .whereNull("deleted_at")
    .count<{ count: string }[]>("id as count");
  line(`  rows left in status=running: ${running[0].count}`);

  // The lock is the DATABASE's, not an `if`: a raw second `running` row must
  // be refused by the partial unique index even with no code in the way.
  await pg("mp_sync_run").insert({
    id: "mprun_w16_probe_a",
    tenant_id: tenant.id,
    marketplace: "wb",
    kind: "probe",
    status: "running",
    started_at: new Date(),
    rows: 0,
    requests: 0,
    attempts: 1,
    created_at: new Date(),
    updated_at: new Date(),
  });
  try {
    await pg("mp_sync_run").insert({
      id: "mprun_w16_probe_b",
      tenant_id: tenant.id,
      marketplace: "wb",
      kind: "probe",
      status: "running",
      started_at: new Date(),
      rows: 0,
      requests: 0,
      attempts: 1,
      created_at: new Date(),
      updated_at: new Date(),
    });
    line("  raw second running row: ACCEPTED — the unique index is NOT in place");
    process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    line(`  raw second running row: refused by Postgres — ${message.split("\n")[0].slice(-120)}`);
  }
  await pg("mp_sync_run").whereIn("id", ["mprun_w16_probe_a", "mprun_w16_probe_b"]).del();

  line("\n=== 4. A RUN THAT FAILS ON PURPOSE (wb.cards with a key WB will refuse)");
  await age("cards", 61);
  const failing = await runOneSync(
    deps(),
    wb,
    "cards",
    "w16-deliberately-invalid-token",
  );
  line(
    `  ${failing.marketplace}.${failing.kind}: ${failing.outcome}, attempts ${failing.attempts}, ` +
      `error: ${failing.error}`,
  );

  line("\n=== 5. THE TABLE THE ACCEPTOR READS");
  const rows = (await mp.listMpSyncRuns(
    { tenant_id: tenant.id },
    { order: { started_at: "DESC" }, take: 12 },
  )) as Record<string, unknown>[];
  for (const row of rows) {
    line(
      `  ${String(row.marketplace).padEnd(5)} ${String(row.kind).padEnd(11)} ` +
        `${String(row.status).padEnd(12)} started ${new Date(String(row.started_at)).toISOString()} ` +
        `rows ${String(row.rows).padStart(6)} req ${String(row.requests).padStart(3)} ` +
        `att ${row.attempts} ${row.error ? `err: ${String(row.error).slice(0, 90)}` : ""}`,
    );
  }
  line("");
}
