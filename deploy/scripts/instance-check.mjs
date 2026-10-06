#!/usr/bin/env node
// Fails a deploy or a CI run the moment the RU or INTL instance of
// upready-store is configured with a service docs/instances/RULES.md
// forbids it — t-2026-10-03-23. Three independent checks, the first always,
// the other two when their flag is given:
//
//   node deploy/scripts/instance-check.mjs --instance ru --env path/to.env
//   node deploy/scripts/instance-check.mjs --instance ru --env path/to.env --backup-env path/to/backup.env
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
// The --backup-env check reads where the host's backup copies go
// (deploy/backup/nightly.env.example). It reads the value of the three keys in
// BACKUP_TARGET_KEYS and of no other key, and a message names the key and the
// profile's own list, never the value. The --db check also counts the tenants
// that belong to another instance. A message carries the count and the
// domains the profiles name, never a tenant's name or address.
//
// Exit codes: 0 clean, 1 one or more violations (printed one per line to
// stderr, "VIOLATION: <reason>"), 2 usage or configuration error.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const INSTANCES_DIR = path.resolve(__dirname, "..", "instances");

/** `--flag value` / `--flag=value` parser, nothing fancier than this script needs. */
export function parseArgs(argv) {
  const out = { instance: null, env: null, backupEnv: null, db: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const eq = arg.indexOf("=");
    const [flag, inlineValue] = eq === -1 ? [arg, null] : [arg.slice(0, eq), arg.slice(eq + 1)];
    const takeValue = () => (inlineValue !== null ? inlineValue : argv[++i]);
    if (flag === "--instance") out.instance = takeValue();
    else if (flag === "--env") out.env = takeValue();
    else if (flag === "--backup-env") out.backupEnv = takeValue();
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

/** The only env keys this tool reads a value of. They say where a backup copy goes, and none of them is a secret (deploy/backup/nightly.env.example). */
export const BACKUP_TARGET_KEYS = ["S3_ENABLED", "S3_ENDPOINT_URL", "CROSS_COPY_SSH_HOST"];

/** `KEY=value` lines -> Map<name, value>, for the names you ask for and no other. The file is sourced by a shell, so an unquoted value ends at the first space. */
export function readEnvValues(text, names) {
  const wanted = new Set(names);
  const result = new Map();
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const name = line.slice(0, eq).trim();
    if (!wanted.has(name)) continue;
    const raw = line.slice(eq + 1).trim();
    const quote = raw[0] === '"' || raw[0] === "'" ? raw[0] : null;
    const end = quote ? raw.indexOf(quote, 1) : -1;
    result.set(name, end !== -1 ? raw.slice(1, end) : raw.split(/\s/)[0]);
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

/** Every profile next to this instance's own. They are the instances a tenant found here could belong to instead. */
export function loadOtherProfiles(instance, dir = INSTANCES_DIR) {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json") && file !== `${instance}.json`)
    .sort()
    .map((file) => JSON.parse(readFileSync(path.join(dir, file), "utf8")));
}

/** The fields the backup and tenant checks read. A profile without one would switch its check off without a word, so it is a configuration error. */
export function validateProfile(profile) {
  const isList = (value) => Array.isArray(value) && value.every((entry) => typeof entry === "string");
  const missing = [];
  if (!isList(profile.domains?.primary) || profile.domains.primary.length === 0) missing.push("domains.primary");
  if (typeof profile.domains?.otherShops !== "boolean") missing.push("domains.otherShops");
  if (!isList(profile.backup?.s3EndpointHosts)) missing.push("backup.s3EndpointHosts");
  if (!isList(profile.backup?.crossCopyHosts)) missing.push("backup.crossCopyHosts");
  if (missing.length > 0) {
    throw new UsageError(`profile "${profile.instance}" has no valid ${missing.join(", ")}`);
  }
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

const LOGIN_METHOD_PROVIDERS = { email: ["emailpass"], yandex: ["yandex"], both: ["emailpass", "yandex"] };

/**
 * A tenant whose buyers sign in through a provider this instance does not allow (checklist K15,
 * 04.10.2026: on RU only Yandex ID, Ivan «в рф должны быть конкретные способы авторизации и вход по
 * обычно почте в это не входит»). Checked only where the profile lists `providers.auth.allowed`.
 */
export function checkDbLoginMethods(loginMethods, profile) {
  const allowed = profile.providers?.auth?.allowed;
  if (!Array.isArray(allowed)) return [];
  const counts = new Map();
  for (const method of loginMethods ?? []) counts.set(method, (counts.get(method) ?? 0) + 1);
  const violations = [];
  for (const [method, count] of counts) {
    const missing = (LOGIN_METHOD_PROVIDERS[method] ?? []).filter((provider) => !allowed.includes(provider));
    if (missing.length > 0) {
      violations.push(
        `${count} tenant(s) let buyers sign in with "${method}", which needs ${missing.join(", ")} — not allowed on instance ${profile.instance}`,
      );
    }
  }
  return violations;
}

/** The host of an address the way an operator writes it, a URL or a bare host with or without a port. Null when there is none to read. */
export function hostOf(address) {
  const text = String(address ?? "").trim();
  if (!text) return null;
  try {
    return new URL(text.includes("://") ? text : `ssh://${text}`).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** True when the host is one of the listed names or sits below one of them. */
function onList(host, list) {
  return (list ?? []).some((entry) => host === entry.toLowerCase() || host.endsWith(`.${entry.toLowerCase()}`));
}

/**
 * Backup-target violations: this host copies its backups somewhere the instance's profile does not
 * list (docs/instances/RULES.md §1, "Second backup copy"). The profile is an allowlist, so a target
 * nobody wrote down fails the same way a known foreign one does. `targets` comes from
 * `readEnvValues`. A message names the key and the profile's own list, never the value.
 */
export function checkBackupTargets(targets, profile) {
  const allowed = (list) => (list?.length ? list.join(", ") : "none");
  const outside = `a copy outside the country of instance ${profile.instance}`;
  const violations = [];
  // deploy/backup/cross-copy.sh pushes to S3 only when S3_ENABLED is exactly "1".
  if (targets.get("S3_ENABLED") === "1") {
    const host = hostOf(targets.get("S3_ENDPOINT_URL"));
    if (!host || !onList(host, profile.backup?.s3EndpointHosts)) {
      violations.push(
        `backup target S3_ENDPOINT_URL is not an S3 endpoint this instance may copy to (allowed: ${allowed(profile.backup?.s3EndpointHosts)}) — ${outside}`,
      );
    }
  }
  // The same script copies to CROSS_COPY_SSH_HOST whenever it is set.
  if (targets.get("CROSS_COPY_SSH_HOST")) {
    const host = hostOf(targets.get("CROSS_COPY_SSH_HOST"));
    if (!host || !(profile.backup?.crossCopyHosts ?? []).some((entry) => entry.toLowerCase() === host)) {
      violations.push(
        `backup target CROSS_COPY_SSH_HOST is not a host this instance may copy to (allowed: ${allowed(profile.backup?.crossCopyHosts)}) — ${outside}`,
      );
    }
  }
  return violations;
}

/** Every host a profile names for its own shops. */
export function profileHosts(profile) {
  return [...(profile.domains?.primary ?? []), ...(profile.domains?.aliases ?? [])];
}

/**
 * Tenant violations: a shop in this database belongs to another instance (docs/instances/RULES.md
 * §1, "A tenant belongs to exactly one instance's database"). The domains in the profiles tell the
 * instance of a shop. `tenantHosts` holds one list of `tenant_domain` hosts per tenant. A message
 * carries a count and the profiles' own domains, never a tenant's name or address.
 */
export function checkDbTenants(tenantHosts, profile, otherProfiles) {
  const violations = [];
  let unclaimed = tenantHosts;
  for (const other of otherProfiles ?? []) {
    const theirs = profileHosts(other);
    const isTheirs = (hosts) => hosts.some((host) => onList(host, theirs));
    const count = unclaimed.filter(isTheirs).length;
    unclaimed = unclaimed.filter((hosts) => !isTheirs(hosts));
    if (count > 0) {
      violations.push(
        `${count} tenant(s) in this database answer on a domain of instance ${other.instance} (${theirs.join(", ")}) — a tenant of another instance, not allowed on instance ${profile.instance}`,
      );
    }
  }
  // RULES.md gives "every other shop" to INTL, so RU holds the shops its profile names and no other.
  if (profile.domains?.otherShops === false) {
    const own = profileHosts(profile);
    const count = unclaimed.filter((hosts) => !hosts.some((host) => onList(host, own))).length;
    if (count > 0) {
      violations.push(
        `${count} tenant(s) in this database have no address on the domains of instance ${profile.instance} (${own.join(", ")}) — a tenant of another instance, not allowed on instance ${profile.instance}`,
      );
    }
  }
  return violations;
}

/** Shells out to psql, the same way deploy/scripts/tenant-ingress-sync.sh does. Throws rather than guessing on a database that cannot be read. */
function psql(databaseUrl, sql) {
  let out;
  try {
    out = execFileSync("psql", [databaseUrl, "-At", "-c", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    // Node writes the whole command line into error.message, and the URL in it carries the database
    // password. Report what psql itself said, with the URL cut out.
    const said = String(error.stderr ?? "").split(databaseUrl).join("<--db>").trim();
    const how = typeof error.status === "number" ? ` with status ${error.status}` : error.code ? ` (${error.code})` : "";
    throw new Error(`psql failed${how}${said ? `: ${said}` : ""}`);
  }
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
  // The backend's own default for a tenant that never saved one is "both"
  // (`DEFAULT_BUYER_LOGIN_METHOD`, apps/backend/src/api/tenants/login-settings).
  const loginMethods = psql(
    databaseUrl,
    "select coalesce(metadata->>'buyer_login_method', 'both') from tenant where deleted_at is null",
  );
  // One line per tenant, its id and then its custom hosts. A tenant with no tenant_domain row keeps
  // its line, because a shop with no address of this instance is what checkDbTenants looks for.
  const tenantRows = psql(
    databaseUrl,
    "select t.id || '|' || coalesce(string_agg(lower(d.host), ','), '') from tenant t left join tenant_domain d on d.tenant_id = t.id and d.deleted_at is null where t.deleted_at is null group by t.id",
  );
  const tenantHosts = tenantRows.map((row) => row.slice(row.indexOf("|") + 1).split(",").filter(Boolean));
  return { configuredProviders, ga4TenantCount: Number(ga4Rows[0] ?? "0"), loginMethods, tenantHosts };
}

const USAGE = "usage: instance-check.mjs --instance <ru|intl> --env <path> [--backup-env <path>] [--db <postgres-url>]";

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`usage error: ${error.message}`);
      console.error(USAGE);
      process.exit(2);
    }
    throw error;
  }

  if (!args.instance || !args.env) {
    console.error(USAGE);
    process.exit(2);
  }

  let profile;
  let otherProfiles;
  try {
    profile = loadProfile(args.instance);
    otherProfiles = loadOtherProfiles(args.instance);
    for (const each of [profile, ...otherProfiles]) validateProfile(each);
  } catch (error) {
    console.error(`usage error: ${error.message}`);
    process.exit(2);
  }

  for (const file of [args.env, args.backupEnv]) {
    if (file && !existsSync(file)) {
      console.error(`usage error: no such env file: ${file}`);
      process.exit(2);
    }
  }

  const envMap = parseEnvFile(readFileSync(args.env, "utf8"));
  const violations = [...checkEnv(envMap, profile)];

  if (args.backupEnv) {
    const targets = readEnvValues(readFileSync(args.backupEnv, "utf8"), BACKUP_TARGET_KEYS);
    violations.push(...checkBackupTargets(targets, profile));
  }

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
      ...checkDbLoginMethods(db.loginMethods, profile),
      ...checkDbTenants(db.tenantHosts, profile, otherProfiles),
    );
  }

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`VIOLATION: ${violation}`);
    }
    process.exit(1);
  }

  const checked = [args.env, args.backupEnv ? `backup targets in ${args.backupEnv}` : null, args.db ? "--db checked" : null];
  console.log(`instance-check: ${args.instance} is clean (${checked.filter(Boolean).join(", ")})`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
