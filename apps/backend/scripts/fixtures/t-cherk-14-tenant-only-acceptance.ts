import { readFileSync, writeFileSync } from "fs";
import { TENANT_ONLY_SQL } from "../../src/scripts/tenant-only/cli";
import type { TenantOnlyOptions } from "../../src/scripts/tenant-only/options";
import { failedChecks, runTenantOnly, type TenantOnlyResult } from "../../src/scripts/tenant-only/runner";

/**
 * t-cherk-14 acceptance on a real copy: proves the tenant-only tool against a
 * template database you already have (a copy of a stand), never the template
 * itself. Every database it works on is created from the template here and
 * dropped at the end.
 *
 *   npx ts-node scripts/fixtures/t-cherk-14-tenant-only-acceptance.ts \
 *     --server postgres://user@127.0.0.1:5433 --template <copy-of-a-stand> \
 *     --keep olavka [--out summary.json]
 *
 * Rounds:
 *   1. a fresh copy without the marker: the run must be refused (exit 2)
 *   2. marked: --dry-run, then the trim, then a separate --verify
 *   3. --anonymize on the trimmed copy, then --verify --keep --anonymize
 *   4. a second fresh copy: --anonymize alone (every tenant kept), then verify
 *
 * The summary holds counts and check names only.
 */

class AcceptanceError extends Error {}

type Args = { server: string; template: string; keep: string; out: string | null };

const parseArgs = (argv: string[]): Args => {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] ?? null : null;
  };
  const server = get("--server");
  const template = get("--template");
  const keep = get("--keep");
  if (!server || !template || !keep) {
    throw new AcceptanceError("usage: --server <postgres-url-without-db> --template <db> --keep <handle> [--out <file>]");
  }
  return { server: server.replace(/\/$/, ""), template, keep, out: get("--out") };
};

const summarize = (label: string, result: TenantOnlyResult, seconds: number) => {
  const tables = result.rows.filter((row) => row.section === "table");
  return {
    label,
    exitCode: result.exitCode,
    committed: result.committed,
    error: result.error,
    seconds,
    rowsBefore: tables.reduce((sum, row) => sum + (row.before ?? 0), 0),
    rowsAfter: tables.reduce((sum, row) => sum + (row.after ?? 0), 0),
    changedTables: tables
      .filter((row) => row.before !== row.after)
      .map((row) => ({ table: row.name, before: row.before, after: row.after })),
    failed: failedChecks(result.checks).map((check) => `${check.name}: ${check.findings}`),
    checksPassed: result.checks.filter((check) => check.severity === "fail" && check.findings === 0).length,
    info: result.checks
      .filter((check) => check.severity !== "fail" && check.findings > 0)
      .map((check) => `${check.severity} ${check.name}: ${check.findings}`),
  };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const { Client } = require("pg") as typeof import("pg");
  const sql = readFileSync(TENANT_ONLY_SQL, "utf8");
  const admin = new Client({ connectionString: `${args.server}/postgres` });
  await admin.connect();

  const copies: string[] = [];
  const makeCopy = async (suffix: string) => {
    const name = `${args.template}_acc_${suffix}`.slice(0, 60);
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE "${args.template}"`);
    copies.push(name);
    return name;
  };

  const run = async (db: string, label: string, over: Partial<TenantOnlyOptions>) => {
    const client = new Client({ connectionString: `${args.server}/${db}` });
    await client.connect();
    const started = Date.now();
    try {
      const options: TenantOnlyOptions = {
        mode: "run",
        db: `${args.server}/${db}`,
        keep: null,
        anonymize: false,
        dryRun: false,
        protect: [args.template],
        source: null,
        ...over,
      };
      const result = await runTenantOnly(client, options, sql);
      const summary = summarize(label, result, Math.round((Date.now() - started) / 1000));
      console.log(`${label}: exit ${summary.exitCode}, ${summary.seconds} s`);
      return summary;
    } finally {
      await client.end();
    }
  };

  const rounds: ReturnType<typeof summarize>[] = [];
  const expect = (summary: ReturnType<typeof summarize>, exitCode: number) => {
    rounds.push(summary);
    if (summary.exitCode !== exitCode) {
      throw new AcceptanceError(`${summary.label}: expected exit ${exitCode}, got ${summary.exitCode} ${summary.error ?? summary.failed.join("; ")}`);
    }
  };

  try {
    const trimmed = await makeCopy("trim");
    expect(await run(trimmed, "1. unmarked copy is refused", { keep: args.keep }), 2);
    expect(await run(trimmed, "2a. mark", { mode: "mark", source: args.template }), 0);
    expect(await run(trimmed, "2b. dry run", { keep: args.keep, dryRun: true }), 0);
    expect(await run(trimmed, "2c. trim", { keep: args.keep }), 0);
    expect(await run(trimmed, "2d. verify --keep", { mode: "verify", keep: args.keep }), 0);
    expect(await run(trimmed, "2e. verify --anonymize fails before anonymizing", { mode: "verify", anonymize: true }), 3);
    expect(await run(trimmed, "3a. anonymize", { anonymize: true }), 0);
    expect(await run(trimmed, "3b. verify --keep --anonymize", { mode: "verify", keep: args.keep, anonymize: true }), 0);

    const whole = await makeCopy("anon");
    expect(await run(whole, "4a. mark", { mode: "mark", source: args.template }), 0);
    expect(await run(whole, "4b. anonymize every tenant", { anonymize: true }), 0);
    expect(await run(whole, "4c. verify --anonymize", { mode: "verify", anonymize: true }), 0);
    console.log("acceptance passed");
  } finally {
    for (const name of copies) {
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    }
    await admin.end();
    if (args.out) {
      writeFileSync(args.out, JSON.stringify(rounds, null, 2));
    }
  }
};

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
