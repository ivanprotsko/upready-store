#!/usr/bin/env node
// Fails a deploy or a CI run the moment the RU or INTL instance of
// upready-store is configured with a service docs/instances/RULES.md
// forbids it — t-2026-10-03-23. Two independent checks, either one on its
// own, both together:
//
//   node deploy/scripts/instance-check.mjs --instance ru --env path/to.env
//   node deploy/scripts/instance-check.mjs --instance intl --env path/to.env --db postgres://...
//
// The env check reads variable NAMES and whether each is set to a non-empty
// value — it never reads, prints or logs a value, so this is safe to run
// against a real secrets file and paste into a deploy log. The --db check
// shells out to `psql` (the same tool deploy/scripts/tenant-ingress-sync.sh
// already uses against this stack's database) and reads which third-party
// providers the tenants in THAT database have actually configured; it never
// prints a secret either, because tenant_integration_secret.payload is never
// selected.
//
// Exit codes: 0 clean, 1 one or more violations (printed one per line to
// stderr, "VIOLATION: <reason>"), 2 usage or configuration error.
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const INSTANCES_DIR = path.resolve(__dirname, "..", "instances");

/** `--flag value` / `--flag=value` parser, nothing fancier than this script needs. */
export function parseArgs(argv) {
  const out = { instance: null, env: null, db: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const eq = arg.indexOf("=");
    const [flag, inlineValue] = eq === -1 ? [arg, null] : [arg.slice(0, eq), arg.slice(eq + 1)];
    const takeValue = () => (inlineValue !== null ? inlineValue : argv[++i]);
    if (flag === "--instance") out.instance = takeValue();
    else if (flag === "--env") out.env = takeValue();
    else if (flag === "--db") out.db = takeValue();
    else throw new UsageError(`unknown flag: ${arg}`);
  }
  return out;
}

export class UsageError extends Error {}

/** `KEY=value` lines -> Map<name, {set: boolean}>. Comments and blank lines are skipped, quotes around a value are stripped before deciding "set". */
export function parseEnvFile(text) {
  const result = new Map();
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const name = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result.set(name, { set: value.length > 0 });
  }
  return result;
}

export function loadProfile(instance, dir = INSTANCES_DIR) {
  const file = path.join(dir, `${instance}.json`);
  if (!existsSync(file)) {
    throw new UsageError(`no profile for instance "${instance}" at ${file}`);
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

/** Every provider name the profile forbids, across every category, deduplicated — tenant_integration_secret.provider is one table, not one per category. */
export function forbiddenProviders(profile) {
  const categories = Object.values(profile.providers ?? {});
  return [...new Set(categories.flatMap((category) => category.forbidden ?? []))];
}

/** Env-name violations: an exact forbidden name, or a forbidden prefix, set to a non-empty value. */
export function checkEnv(envMap, profile) {
  const violations = [];
  for (const { name, reason } of profile.env?.forbiddenNames ?? []) {
    if (envMap.get(name)?.set) {
      violations.push(`forbidden env ${name} is set — ${reason}`);
    }
  }
  for (const { prefix, reason } of profile.env?.forbiddenPrefixes ?? []) {
    for (const [name, state] of envMap.entries()) {
      if (state.set && name.startsWith(prefix)) {
        violations.push(`forbidden env ${name} (matches prefix ${prefix}) is set — ${reason}`);
      }
    }
  }
  return violations;
}

/** Provider-row violations: a tenant in this instance's database has a secret row for a provider the instance forbids. */
export function checkDbProviders(configuredProviders, profile) {
  const forbidden = new Set(forbiddenProviders(profile));
  return configuredProviders
    .filter((provider) => forbidden.has(provider))
    .map(
      (provider) =>
        `forbidden provider "${provider}" is configured on a tenant in this database — not allowed on instance ${profile.instance}`,
    );
}

/** Analytics violations: a tenant saved a GA4 id while the instance forbids GA4. */
export function checkDbAnalytics(ga4TenantCount, profile) {
  const forbidsGa4 = (profile.providers?.analytics?.forbidden ?? []).includes("ga4");
  if (forbidsGa4 && ga4TenantCount > 0) {
    return [
      `${ga4TenantCount} tenant(s) in this database have a GA4 measurement id saved — not allowed on instance ${profile.instance}`,
    ];
  }
  return [];
}

/** Shells out to psql, the same way deploy/scripts/tenant-ingress-sync.sh does. Throws rather than guessing on a database that cannot be read. */
function psql(databaseUrl, sql) {
  const out = execFileSync("psql", [databaseUrl, "-At", "-c", sql], { encoding: "utf8" });
  return out.split("\n").filter((line) => line.length > 0);
}

export function queryDb(databaseUrl) {
  const configuredProviders = psql(
    databaseUrl,
    "select distinct provider from tenant_integration_secret where deleted_at is null",
  );
  const ga4Rows = psql(
    databaseUrl,
    "select count(*) from tenant where deleted_at is null and coalesce(metadata->'analytics'->>'ga4_measurement_id', '') != ''",
  );
  return { configuredProviders, ga4TenantCount: Number(ga4Rows[0] ?? "0") };
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`usage error: ${error.message}`);
      console.error(
        "usage: instance-check.mjs --instance <ru|intl> --env <path> [--db <postgres-url>]",
      );
      process.exit(2);
    }
    throw error;
  }

  if (!args.instance || !args.env) {
    console.error("usage: instance-check.mjs --instance <ru|intl> --env <path> [--db <postgres-url>]");
    process.exit(2);
  }

  let profile;
  try {
    profile = loadProfile(args.instance);
  } catch (error) {
    console.error(`usage error: ${error.message}`);
    process.exit(2);
  }

  if (!existsSync(args.env)) {
    console.error(`usage error: no such env file: ${args.env}`);
    process.exit(2);
  }

  const envMap = parseEnvFile(readFileSync(args.env, "utf8"));
  const violations = [...checkEnv(envMap, profile)];

  if (args.db) {
    let db;
    try {
      db = queryDb(args.db);
    } catch (error) {
      console.error(`error reading --db: ${error.message}`);
      process.exit(2);
      return;
    }
    violations.push(
      ...checkDbProviders(db.configuredProviders, profile),
      ...checkDbAnalytics(db.ga4TenantCount, profile),
    );
  }

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`VIOLATION: ${violation}`);
    }
    process.exit(1);
  }

  console.log(`instance-check: ${args.instance} is clean (${args.env}${args.db ? ", --db checked" : ""})`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
