import type { TenantOnlyOptions } from "./options";
import { failedChecks, type CheckRow, type TenantOnlyResult } from "./runner";

/**
 * Turns a run into the text the operator reads. Counts and check names only:
 * no row of data ever reaches it, so nothing personal can be printed.
 */

const pad = (value: string, width: number): string => value.padEnd(width);
const num = (value: number | null, width: number): string => String(value ?? "-").padStart(width);

export const formatTableCounts = (result: TenantOnlyResult, dryRun: boolean): string[] => {
  const tables = result.rows.filter((row) => row.section === "table");
  const changed = tables.filter((row) => row.before !== row.after);
  const removedHeader = dryRun ? "will go" : "removed";
  const width = Math.max(5, ...changed.map((row) => row.name.length));
  const lines = [`${pad("table", width)}  ${"before".padStart(9)}  ${removedHeader.padStart(9)}  ${"left".padStart(9)}`];
  let before = 0;
  let after = 0;
  for (const row of tables) {
    before += row.before ?? 0;
    after += row.after ?? 0;
  }
  for (const row of changed) {
    lines.push(
      `${pad(row.name, width)}  ${num(row.before, 9)}  ${num((row.before ?? 0) - (row.after ?? 0), 9)}  ${num(row.after, 9)}`,
    );
  }
  lines.push(
    `${pad(`all ${tables.length} tables with rows`, width)}  ${num(before, 9)}  ${num(before - after, 9)}  ${num(after, 9)}`,
  );
  return lines;
};

export const formatSteps = (result: TenantOnlyResult): string[] =>
  result.rows
    .filter((row) => row.section === "step" && row.after !== 0)
    .map((row) => `  ${num(row.after, 8)}  ${row.name}`);

export const formatChecks = (checks: CheckRow[]): string[] => {
  const shown = checks.filter((check) => check.findings > 0 || check.severity === "info");
  const lines = shown.map((check) => `  ${check.severity.toUpperCase().padEnd(4)}  ${num(check.findings, 8)}  ${check.name}`);
  const failed = failedChecks(checks);
  const passed = checks.filter((check) => check.severity === "fail" && check.findings === 0).length;
  lines.push(
    failed.length > 0
      ? `  ${failed.length} check(s) FAILED, ${passed} passed`
      : `  all ${passed} checks passed`,
  );
  return lines;
};

export const formatResult = (result: TenantOnlyResult, options: TenantOnlyOptions): string => {
  const lines: string[] = [];
  if (result.error) {
    lines.push(`tenant-only: ${result.error}`);
    return lines.join("\n");
  }
  if (options.mode === "mark" || options.mode === "unmark") {
    lines.push(`tenant-only: marker ${options.mode === "mark" ? `set: ${result.marker}` : result.marker}`);
    return lines.join("\n");
  }
  if (options.mode === "media-refs") {
    lines.push("own  rows  /static/ prefix");
    for (const ref of result.media) {
      lines.push(`${ref.own ? "yes" : "NO "}  ${num(ref.rows, 5)}  ${ref.prefix}`);
    }
    return lines.join("\n");
  }
  if (options.mode === "run") {
    lines.push(`Tables (${options.dryRun ? "dry run, rolled back" : result.committed ? "committed" : "rolled back"}):`);
    lines.push(...formatTableCounts(result, options.dryRun));
    lines.push("", "Steps:");
    lines.push(...formatSteps(result));
    lines.push("");
  }
  lines.push("Checks:");
  lines.push(...formatChecks(result.checks));
  return lines.join("\n");
};
