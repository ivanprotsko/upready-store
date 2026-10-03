import type { TenantOnlyOptions } from "./options";

/**
 * Drives tenant-only.sql through any client with `query`: loads the functions
 * (they live in pg_temp, so they die with the session), opens a transaction,
 * calls one entry point, and commits only a clean, non-dry run. The same
 * sequence is what deploy/scripts/tenant-only-dump.sh feeds psql on the host.
 */

export type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type RunRow = {
  section: "table" | "step" | "check";
  name: string;
  detail: string | null;
  before: number | null;
  after: number | null;
};

export type CheckRow = { name: string; severity: "fail" | "warn" | "info"; findings: number };

export type TenantOnlyResult = {
  exitCode: number;
  committed: boolean;
  rows: RunRow[];
  checks: CheckRow[];
  marker: string | null;
  media: { prefix: string; own: boolean; rows: number }[];
  error: string | null;
};

/** SQLSTATE codes tenant-only.sql raises on purpose, and the exit code each maps to. */
export const SQLSTATE_EXIT: Record<string, number> = {
  UT001: 2,
  UT002: 3,
  UT003: 1,
};

const toNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const emptyResult = (): TenantOnlyResult => ({
  exitCode: 0,
  committed: false,
  rows: [],
  checks: [],
  marker: null,
  media: [],
  error: null,
});

export const failedChecks = (checks: CheckRow[]): CheckRow[] =>
  checks.filter((check) => check.severity === "fail" && check.findings > 0);

export const runTenantOnly = async (
  client: Queryable,
  options: TenantOnlyOptions,
  sql: string,
): Promise<TenantOnlyResult> => {
  const result = emptyResult();
  let inTransaction = false;

  try {
    await client.query(sql);

    if (options.mode === "mark") {
      const { rows } = await client.query("SELECT pg_temp.tenant_only_mark($1, $2) AS marker", [
        options.source,
        options.protect,
      ]);
      result.marker = String(rows[0]?.marker ?? "");
      return result;
    }

    if (options.mode === "unmark") {
      const { rows } = await client.query("SELECT pg_temp.tenant_only_unmark() AS removed");
      result.marker = rows[0]?.removed ? "removed" : "absent";
      return result;
    }

    await client.query("BEGIN");
    inTransaction = true;

    if (options.mode === "media-refs") {
      const { rows } = await client.query(
        "SELECT prefix, own, rows_n FROM pg_temp.tenant_only_media_refs($1)",
        [options.keep],
      );
      result.media = rows.map((row) => ({
        prefix: String(row.prefix),
        own: Boolean(row.own),
        rows: Number(row.rows_n),
      }));
      await client.query("ROLLBACK");
      inTransaction = false;
      return result;
    }

    if (options.mode === "verify") {
      const { rows } = await client.query(
        "SELECT check_name, severity, findings FROM pg_temp.tenant_only_check($1, $2, $3)",
        [options.keep, options.anonymize, options.forbidHosts],
      );
      result.checks = rows.map((row) => ({
        name: String(row.check_name),
        severity: row.severity as CheckRow["severity"],
        findings: Number(row.findings),
      }));
      await client.query("ROLLBACK");
      inTransaction = false;
      result.exitCode = failedChecks(result.checks).length > 0 ? 3 : 0;
      return result;
    }

    const { rows } = await client.query(
      "SELECT section, name, detail, before_n, after_n FROM pg_temp.tenant_only_run($1, $2, $3, $4, $5, $6)",
      [options.keep, options.anonymize, options.protect, options.mediaHostFrom, options.mediaHostTo, options.forbidHosts],
    );
    result.rows = rows.map((row) => ({
      section: row.section as RunRow["section"],
      name: String(row.name),
      detail: (row.detail as string | null) ?? null,
      before: toNumber(row.before_n),
      after: toNumber(row.after_n),
    }));
    result.checks = result.rows
      .filter((row) => row.section === "check")
      .map((row) => ({
        name: row.name,
        severity: row.detail as CheckRow["severity"],
        findings: row.after ?? 0,
      }));

    if (failedChecks(result.checks).length > 0) {
      await client.query("ROLLBACK");
      inTransaction = false;
      result.exitCode = 3;
      return result;
    }

    if (options.dryRun) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return result;
    }

    await client.query("SELECT pg_temp.tenant_only_assert_clean()");
    await client.query("COMMIT");
    inTransaction = false;
    result.committed = true;
    return result;
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    const code = (error as { code?: string }).code ?? "";
    result.exitCode = SQLSTATE_EXIT[code] ?? 4;
    result.error = (error as Error).message;
    result.committed = false;
    return result;
  }
};
