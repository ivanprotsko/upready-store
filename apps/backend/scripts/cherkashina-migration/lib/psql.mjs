// Runs one SELECT through psql and returns its rows as objects.
// The SQL is wrapped in json_agg so any SELECT works without column parsing.
import { execFileSync } from "node:child_process";

export const PSQL_DEFAULT = "/opt/homebrew/opt/postgresql@16/bin/psql";

export function makePsql({ command = PSQL_DEFAULT, args = [] } = {}) {
  return function query(sql) {
    const wrapped = `select coalesce(json_agg(row_to_json(t)),'[]'::json) from (${sql}) t`;
    const out = execFileSync(command, [...args, "-At", "-v", "ON_ERROR_STOP=1", "-c", wrapped], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(out.trim() || "[]");
  };
}

export function stamp() {
  const now = new Date();
  // WITA = UTC+8; the clock is an input (rule 17a) — read once, at the call.
  const wita = new Date(now.getTime() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${wita.getUTCFullYear()}-${p(wita.getUTCMonth() + 1)}-${p(wita.getUTCDate())} ${p(wita.getUTCHours())}:${p(wita.getUTCMinutes())} WITA`;
}
