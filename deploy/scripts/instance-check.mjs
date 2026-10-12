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
// The mail check is part of the env check. It reads the value of the four
// keys in MAIL_KEYS and of no other key: the relay's name, the sender address,
// the name the relay introduces itself by and the domains it signs for. None
// is a secret, and a message names the key, never the value.
//
// The school check is part of the env check too. It reads the value of the two
// keys in SCHOOL_KEYS, the school's host and the shop it reads, and of no other
// key; a message names the key, never the value.
//
// The --backup-env check reads where the host's backup copies go
// (deploy/backup/nightly.env.example). It reads the value of the three keys in
// BACKUP_TARGET_KEYS and of no other key, and a message names the key and the
// profile's own list, never the value. Without the flag, or when the file is
// not there, the tool says in one line that backup targets were not checked.
// The --db check also finds the tenants that belong to another instance. A
// message names a tenant's handle and its hosts, never an admin, a buyer or
// an e-mail. A tenant the profile records as a known exception is printed as
// "KNOWN VIOLATION (recorded)" and does not change the exit code.
//
// The --db check also sets each tenant's live flag against the secondary signs of test data
// (t-2026-10-12-31, docs/instances/RULES.md §7): one "live-check:" line per tenant with the flag, a
// verdict and counts, and a "SIGNAL:" line where the flag and the data disagree. E-mails are classified
// inside Postgres, so only counts leave the database. It never changes the exit code.
//
// Exit codes: 0 clean, 1 one or more violations (printed one per line to
// stderr, "VIOLATION: <reason>"), 2 usage or configuration error.
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
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

/**
 * `KEY=value` lines -> Map<name, value>, for the names you ask for and no other. The file is sourced by a
 * shell, so an unquoted value ends at the first space. With `wholeLine` it runs to the end of the line
 * instead, less a trailing ` # comment`: that is how docker compose reads its --env-file.
 */
export function readEnvValues(text, names, { wholeLine = false } = {}) {
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
    const unquoted = wholeLine ? raw.replace(/\s+#.*$/, "") : raw.split(/\s/)[0];
    result.set(name, end !== -1 ? raw.slice(1, end) : unquoted);
  }
  return result;
}

/** The only env keys the mail check reads a value of. None of them is a secret (deploy/mt/MAIL.md). */
export const MAIL_KEYS = ["SMTP_HOST", "SMTP_FROM", "MAIL_HOSTNAME", "MAIL_SENDER_DOMAINS"];

/** The stack's own relay, by the name the backend reaches it under (deploy/compose.mt.yml, service `mail`). */
const OWN_RELAY = "mail";

/** What deploy/compose.mt.yml gives the relay when MAIL_SENDER_DOMAINS is absent. Keep the two in step. */
export const DEFAULT_SENDER_DOMAINS = ["shipshift.dev"];

/** The domain of a sender written as `a@b` or as `Name <a@b>`, in lower case. Null when there is no address in it. */
export function senderDomain(from) {
  const text = String(from ?? "");
  const address = /<([^>]*)>/.exec(text)?.[1] ?? text;
  const at = address.lastIndexOf("@");
  return (at === -1 ? "" : address.slice(at + 1).trim().toLowerCase()) || null;
}

/**
 * Mail violations of a backend that sends through the stack's own relay (SMTP_HOST=mail). `mail` comes from
 * `readEnvValues`. A message names the key, never the value.
 *
 * Each of these mistakes fails without a word to anyone. The relay refuses a sender outside the domains it
 * signs for, so no letter leaves and only the relay's own log says so. And compose.mt.yml's defaults are the
 * INTL host's name and domain: on another host the relay would introduce itself as a machine it is not, and
 * sign with a key no DNS record answers for.
 */
export function checkMailRelay(mail, profile) {
  if ((mail.get("SMTP_HOST") ?? "") !== OWN_RELAY) return [];
  const violations = [];
  if (profile.mailRelay?.defaultsAreThisHost === false) {
    for (const key of ["MAIL_HOSTNAME", "MAIL_SENDER_DOMAINS"]) {
      if (!mail.get(key)) {
        violations.push(
          `${key} is not set while SMTP_HOST is the stack's own relay — the relay would take the INTL host's value, which is wrong on the host of instance ${profile.instance} (deploy/mt/MAIL.md)`,
        );
      }
    }
  }
  // The relay reads its list split on spaces, and so does this.
  const listed = (mail.get("MAIL_SENDER_DOMAINS") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const domains = listed.length > 0 ? listed : DEFAULT_SENDER_DOMAINS;
  const domain = senderDomain(mail.get("SMTP_FROM"));
  if (!domain || !domains.includes(domain)) {
    violations.push(
      `SMTP_FROM is not an address in a domain the relay signs for (MAIL_SENDER_DOMAINS, or ${DEFAULT_SENDER_DOMAINS.join(" ")} when that key is absent) — the relay refuses every letter the backend hands it`,
    );
  }
  return violations;
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
  const envFile = profile.backup?.envFileOnHost;
  if (envFile !== null && typeof envFile !== "string") missing.push("backup.envFileOnHost");
  if (typeof profile.mailRelay?.defaultsAreThisHost !== "boolean") missing.push("mailRelay.defaultsAreThisHost");
  const exceptions = profile.tenants?.recordedExceptions ?? [];
  if (!Array.isArray(exceptions)) missing.push("tenants.recordedExceptions");
  if (missing.length > 0) {
    throw new UsageError(`profile "${profile.instance}" has no valid ${missing.join(", ")}`);
  }
  // A recorded exception lets a known violation through, so it has to say why and what closes it.
  for (const entry of exceptions) {
    const isText = (value) => typeof value === "string" && value.trim().length > 0;
    const absent = ["handle", "reason", "recorded", "closes"].filter((key) => !isText(entry?.[key]));
    if (!isList(entry?.hosts) || entry.hosts.length === 0) absent.push("hosts");
    if (absent.length > 0) {
      throw new UsageError(
        `profile "${profile.instance}" has a recorded exception${isText(entry?.handle) ? ` for "${entry.handle}"` : ""} without ${absent.join(", ")}`,
      );
    }
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

/** The only env keys the school check reads a value of: the school's host and the shop it reads. Neither is a secret. */
export const SCHOOL_KEYS = ["SCHOOL_DOMAIN", "SCHOOL_SHOP_ORIGIN"];

/**
 * School violations (apps/school, t-2026-10-08-37). The school reads the buyers of the shop
 * SCHOOL_SHOP_ORIGIN names, so it runs on that shop's instance and on a host the profile lists in
 * `school.domains`. `school` comes from `readEnvValues`. A message names the key and the profile's own
 * list, never the value.
 */
export function checkSchool(school, profile, otherProfiles) {
  const violations = [];
  const allowed = profile.school?.domains ?? [];
  const domain = hostOf(school.get("SCHOOL_DOMAIN"));
  if (school.get("SCHOOL_DOMAIN") && !(domain && allowed.some((entry) => entry.toLowerCase() === domain))) {
    violations.push(
      `SCHOOL_DOMAIN is not a school domain of instance ${profile.instance} (allowed: ${allowed.length ? allowed.join(", ") : "none"})`,
    );
  }
  const shop = hostOf(school.get("SCHOOL_SHOP_ORIGIN"));
  if (school.get("SCHOOL_SHOP_ORIGIN")) {
    const owner = (otherProfiles ?? []).find((other) => shop && onList(shop, profileHosts(other)));
    const notOurs = profile.domains?.otherShops === false && !(shop && onList(shop, profileHosts(profile)));
    if (!shop || owner || notOurs) {
      violations.push(
        `SCHOOL_SHOP_ORIGIN is not a shop of instance ${profile.instance}${owner ? ` but of instance ${owner.instance}` : ""} — the school would carry that shop's buyers across instances`,
      );
    }
  }
  return violations;
}

/**
 * Tenant violations: a shop in this database belongs to another instance (docs/instances/RULES.md
 * §1, "A tenant belongs to exactly one instance's database"). The domains in the profiles tell the
 * instance of a shop. `tenants` holds one `{ handle, hosts }` per tenant, the hosts from
 * `tenant_domain`. A message names the handle and the hosts, never an admin, a buyer or an e-mail.
 *
 * A tenant on another instance's domain that the profile lists in `tenants.recordedExceptions` goes
 * to `known` and does not fail the check. The entry has to match exactly, the handle and every
 * offending host. One more foreign host on the same tenant is a violation again.
 */
export function checkDbTenants(tenants, profile, otherProfiles) {
  const violations = [];
  const known = [];
  const exceptions = profile.tenants?.recordedExceptions ?? [];
  let unclaimed = tenants;
  for (const other of otherProfiles ?? []) {
    const theirs = profileHosts(other);
    const offending = (tenant) => tenant.hosts.filter((host) => onList(host, theirs));
    for (const tenant of unclaimed) {
      const hosts = offending(tenant);
      if (hosts.length === 0) continue;
      const what = `tenant "${tenant.handle}" answers on a domain of instance ${other.instance} (${hosts.join(", ")})`;
      const entry = exceptions.find(
        (each) => each.handle === tenant.handle && hosts.every((host) => each.hosts.some((recorded) => recorded.toLowerCase() === host)),
      );
      if (entry) {
        known.push(`${what} — recorded ${entry.recorded}: ${entry.reason}. Closes with: ${entry.closes}`);
      } else {
        violations.push(`${what} — a tenant of another instance, not allowed on instance ${profile.instance}`);
      }
    }
    unclaimed = unclaimed.filter((tenant) => offending(tenant).length === 0);
  }
  // RULES.md gives "every other shop" to INTL, so RU holds the shops its profile names and no other.
  if (profile.domains?.otherShops === false) {
    const own = profileHosts(profile);
    for (const tenant of unclaimed) {
      if (tenant.hosts.some((host) => onList(host, own))) continue;
      violations.push(
        `tenant "${tenant.handle}" has no address on the domains of instance ${profile.instance} (${own.join(", ")}) — a tenant of another instance, not allowed on instance ${profile.instance}`,
      );
    }
  }
  return { violations, known };
}

/**
 * E-mail domains no real buyer writes from (t-2026-10-12-31). An entry matches the domain itself and
 * every domain below it, so "test" matches acme.test. Besides these, an address counts as test when its
 * domain starts with "test." or its local part carries a "+test" tag.
 *
 * The .local zone is not here on purpose: tg_<id>@telegram.local is the address the backend gives a
 * real buyer who signs in with Telegram (apps/backend/src/modules/auth-telegram/lib/identity.ts).
 */
export const TEST_EMAIL_DOMAINS = [
  // RFC 2606: reserved for examples and tests, no mailbox exists there.
  "example.com",
  "example.org",
  "example.net",
  "example",
  "test",
  "invalid",
  "localhost",
  // Throwaway mailboxes.
  "mailinator.com",
  "yopmail.com",
  "guerrillamail.com",
  "sharklasers.com",
  "10minutemail.com",
  "temp-mail.org",
  "maildrop.cc",
  "dispostable.com",
  "trashmail.com",
  // The platform's own domains: the team's accounts, not buyers.
  "shipshift.dev",
  "upready.dev",
  "upready.store",
];

/**
 * The providers whose `is_test` means a test contour, and only these. Keep both lists in step with
 * PAYMENT_PROVIDERS and DELIVERY_PROVIDERS of apps/backend/src/tenant-secrets/test-mode.ts, the
 * storefront's red dot; the unit test reads that file. Bitcart, BTCPay and Tribute rows carry an
 * `is_test` nothing reads.
 */
export const TEST_MODE_PAYMENT_PROVIDERS = ["robokassa", "x402"];
export const TEST_MODE_DELIVERY_PROVIDERS = ["cdek", "apiship", "pochta"];

/** A plain host name, the only text this tool writes into its own SQL. */
const SQL_SAFE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

function sqlTextArray(values) {
  for (const value of values) {
    if (!SQL_SAFE_DOMAIN.test(value)) throw new UsageError(`not a plain name for the SQL of the live check: ${value}`);
  }
  return `ARRAY[${values.map((value) => `'${value}'`).join(", ")}]::text[]`;
}

/** SQL that is true when the address in `column` is a test one. It runs inside Postgres, so no address ever reaches this tool. */
function testEmailSql(column, domains) {
  const address = `lower(trim(coalesce(${column}, '')))`;
  const domain = `split_part(${address}, '@', 2)`;
  return `(strpos(${address}, '@') > 0 AND (split_part(${address}, '@', 1) ~ '\\+test' OR ${domain} LIKE 'test.%' OR EXISTS (SELECT 1 FROM unnest(${sqlTextArray(domains)}) d WHERE ${domain} = d OR ${domain} LIKE '%.' || d)))`;
}

/**
 * One line per tenant, counts and provider modes only:
 *   handle|live|live_since|live_by|orders|orders with a test e-mail|orders paid in a test contour|test orders|
 *   customers|customers with a test e-mail|test customers|provider=test,provider=live
 *
 * An order is a test one when its e-mail is, or when a payment session of it ran in a test contour
 * (Robokassa `is_test`, an x402 test network). A customer of a shop is one whose account the shop
 * registered (`metadata.tenant_id`) or who placed an order there; a test one has a test e-mail, or
 * placed orders there and every one of them is a test order. `live` is the JSON boolean
 * `metadata.live` of apps/backend/src/modules/tenant/live.ts, `live_since` and `live_by` its date and
 * author.
 */
export function liveSignsSql(domains = TEST_EMAIL_DOMAINS) {
  const providers = sqlTextArray([...TEST_MODE_PAYMENT_PROVIDERS, ...TEST_MODE_DELIVERY_PROVIDERS]);
  return [
    "/* live_signs */ WITH t AS (",
    "  SELECT id, handle, coalesce(metadata->'live' = 'true'::jsonb, false) AS live,",
    // Cut to the characters a date and a name need, so neither can break the line format below.
    "    left(regexp_replace(coalesce(metadata->>'live_since', ''), '[^0-9-]', '', 'g'), 10) AS live_since,",
    "    left(regexp_replace(coalesce(metadata->>'live_by', ''), '[^a-zA-Z0-9._-]', '', 'g'), 40) AS live_by",
    "  FROM tenant WHERE deleted_at IS NULL",
    "), o AS (",
    `  SELECT l.tenant_id, o.id, o.customer_id, ${testEmailSql("o.email", domains)} AS test_email,`,
    "    EXISTS (SELECT 1 FROM order_payment_collection opc JOIN payment_session ps ON ps.payment_collection_id = opc.payment_collection_id",
    "      WHERE opc.order_id = o.id AND opc.deleted_at IS NULL AND ps.deleted_at IS NULL",
    "        AND (ps.data->>'is_test' = 'true' OR ps.data->>'testnet' = 'true')) AS test_paid",
    `  FROM tenant_tenant_order_order l JOIN "order" o ON o.id = l.order_id WHERE l.deleted_at IS NULL AND o.deleted_at IS NULL`,
    "), c AS (",
    `  SELECT t.id AS tenant_id, cu.id, ${testEmailSql("cu.email", domains)} AS test_email,`,
    "    EXISTS (SELECT 1 FROM o WHERE o.tenant_id = t.id AND o.customer_id = cu.id) AS ordered,",
    "    NOT EXISTS (SELECT 1 FROM o WHERE o.tenant_id = t.id AND o.customer_id = cu.id AND NOT (o.test_email OR o.test_paid)) AS only_test_orders",
    "  FROM t JOIN customer cu ON cu.deleted_at IS NULL",
    "    AND (cu.metadata->>'tenant_id' = t.id OR EXISTS (SELECT 1 FROM o WHERE o.tenant_id = t.id AND o.customer_id = cu.id))",
    "), a AS (",
    "  SELECT tenant_id, string_agg(provider || '=' || CASE WHEN is_test THEN 'test' ELSE 'live' END, ',' ORDER BY provider) AS accounts",
    `  FROM tenant_integration_secret WHERE deleted_at IS NULL AND is_enabled AND provider = ANY(${providers}) GROUP BY tenant_id`,
    ")",
    "SELECT t.handle || '|' || t.live || '|' || t.live_since || '|' || t.live_by",
    "  || '|' || (SELECT count(*) FROM o WHERE o.tenant_id = t.id)",
    "  || '|' || (SELECT count(*) FROM o WHERE o.tenant_id = t.id AND o.test_email)",
    "  || '|' || (SELECT count(*) FROM o WHERE o.tenant_id = t.id AND o.test_paid)",
    "  || '|' || (SELECT count(*) FROM o WHERE o.tenant_id = t.id AND (o.test_email OR o.test_paid))",
    "  || '|' || (SELECT count(*) FROM c WHERE c.tenant_id = t.id)",
    "  || '|' || (SELECT count(*) FROM c WHERE c.tenant_id = t.id AND c.test_email)",
    "  || '|' || (SELECT count(*) FROM c WHERE c.tenant_id = t.id AND (c.test_email OR (c.ordered AND c.only_test_orders)))",
    "  || '|' || coalesce(a.accounts, '')",
    "FROM t LEFT JOIN a ON a.tenant_id = t.id ORDER BY t.handle",
  ].join("\n");
}

/** The lines of `liveSignsSql` -> one object per tenant. */
export function parseLiveRows(rows) {
  return rows.map((row) => {
    const [handle, live, since, by, ...rest] = row.split("|");
    const accounts = rest.pop();
    const [orders, ordersTestEmail, ordersTestPaid, ordersTest, customers, customersTestEmail, customersTest] = rest.map(Number);
    return {
      handle,
      live: live === "true",
      since: since || null,
      by: by || null,
      orders: { total: orders, testEmail: ordersTestEmail, testPaid: ordersTestPaid, test: ordersTest },
      customers: { total: customers, testEmail: customersTestEmail, test: customersTest },
      accounts: accounts
        .split(",")
        .filter(Boolean)
        .map((entry) => {
          const [provider, mode] = entry.split("=");
          return { provider, mode };
        }),
    };
  });
}

/**
 * `test-only`: no real sign at all, which includes a shop with nothing in it yet. `real-signs`: real
 * signs and no test one. `mixed`: both. A real sign is an order or a customer that is not a test one,
 * or an enabled payment account in live mode; a test sign is a test order, a test customer or an
 * enabled payment or delivery account in a test contour.
 *
 * A delivery account in live mode is no sign either way: Ivan put olavka's CDEK on the live pair for
 * real quotes while the shop was not in production (01.10.2026). It is printed all the same.
 */
export function liveVerdict(tenant) {
  const accounts = (mode, providers) =>
    tenant.accounts.filter((account) => account.mode === mode && (!providers || providers.includes(account.provider))).length;
  const real = tenant.orders.total - tenant.orders.test + (tenant.customers.total - tenant.customers.test) + accounts("live", TEST_MODE_PAYMENT_PROVIDERS);
  const test = tenant.orders.test + tenant.customers.test + accounts("test");
  if (real === 0) return "test-only";
  return test === 0 ? "real-signs" : "mixed";
}

/** What the tool prints for one tenant: handle, flag, verdict and counts, never an address. */
export function liveLine(tenant, verdict = liveVerdict(tenant)) {
  const { orders, customers } = tenant;
  const accounts = tenant.accounts.map((account) => `${account.provider}=${account.mode}`).join(" ") || "none";
  return (
    `tenant "${tenant.handle}" live=${tenant.live}${tenant.since ? ` since ${tenant.since}` : ""}${tenant.by ? ` by ${tenant.by}` : ""} verdict=${verdict}: ` +
    `orders ${orders.total} (test ${orders.test}: test e-mail ${orders.testEmail}, test payment ${orders.testPaid}), ` +
    `customers ${customers.total} (test ${customers.test}: test e-mail ${customers.testEmail}), accounts ${accounts}`
  );
}

/**
 * A flag that disagrees with the data, or null. Not live with any real sign: an agent would take real
 * buyers for test data. Live with test signs only: the flag may have been switched by mistake. Live
 * and mixed is the usual state of a working shop and says nothing.
 */
export function liveSignal(tenant, verdict = liveVerdict(tenant)) {
  if (!tenant.live && verdict !== "test-only") {
    return `tenant "${tenant.handle}" is not live (metadata.live is not true) but shows real signs (${verdict}): either it takes real visitors and Ivan switches it on, or the real signs are test data a list here does not know (docs/instances/RULES.md §7, live flag)`;
  }
  if (tenant.live && verdict === "test-only") {
    return `tenant "${tenant.handle}" is live since ${tenant.since ?? "an unknown date"} but shows test signs only: Ivan confirms the flag (docs/instances/RULES.md §7, live flag)`;
  }
  return null;
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
  // One line per tenant, its handle and then its custom hosts. A tenant with no tenant_domain row
  // keeps its line, because a shop with no address of this instance is what checkDbTenants looks for.
  const tenantRows = psql(
    databaseUrl,
    "select t.handle || '|' || coalesce(string_agg(lower(d.host), ',' order by d.host), '') from tenant t left join tenant_domain d on d.tenant_id = t.id and d.deleted_at is null where t.deleted_at is null group by t.id, t.handle order by t.handle",
  );
  const tenants = tenantRows.map((row) => {
    const bar = row.indexOf("|");
    return { handle: row.slice(0, bar), hosts: row.slice(bar + 1).split(",").filter(Boolean) };
  });
  return { configuredProviders, ga4TenantCount: Number(ga4Rows[0] ?? "0"), loginMethods, tenants };
}

/** The secondary signs of `liveSignsSql`, one object per tenant. */
export function queryLiveSigns(databaseUrl) {
  return parseLiveRows(psql(databaseUrl, liveSignsSql()));
}

/**
 * The live check (t-2026-10-12-31): one line per tenant on stdout, a SIGNAL line on stderr where the
 * flag disagrees with the data. It never changes the exit code. A mismatch is a question for Ivan, not
 * a broken instance, and a deploy goes on. When its query fails it says so and the run goes on too.
 */
function checkLive(databaseUrl) {
  let tenants;
  try {
    tenants = queryLiveSigns(databaseUrl);
  } catch (error) {
    console.log(`live-check: NOT checked (${error.message})`);
    return;
  }
  let signals = 0;
  for (const tenant of tenants) {
    const verdict = liveVerdict(tenant);
    console.log(`live-check: ${liveLine(tenant, verdict)}`);
    const signal = liveSignal(tenant, verdict);
    if (signal) {
      signals += 1;
      console.error(`SIGNAL: ${signal}`);
    }
  }
  console.log(`live-check: ${tenants.length} tenant(s), ${signals} SIGNAL line(s)`);
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

  if (!existsSync(args.env)) {
    console.error(`usage error: no such env file: ${args.env}`);
    process.exit(2);
  }

  const envText = readFileSync(args.env, "utf8");
  const envMap = parseEnvFile(envText);
  const violations = [
    ...checkEnv(envMap, profile),
    ...checkMailRelay(readEnvValues(envText, MAIL_KEYS, { wholeLine: true }), profile),
    ...checkSchool(readEnvValues(envText, SCHOOL_KEYS), profile, otherProfiles),
  ];
  let knownCount = 0;

  // A host with no backup env file copies nowhere, so its absence is not a violation. Say that the
  // check did not run, so a deploy log never reads as if the targets were looked at.
  const backupChecked = Boolean(args.backupEnv) && existsSync(args.backupEnv);
  if (backupChecked) {
    const targets = readEnvValues(readFileSync(args.backupEnv, "utf8"), BACKUP_TARGET_KEYS);
    violations.push(...checkBackupTargets(targets, profile));
  } else {
    const why = args.backupEnv ? `no such file: ${args.backupEnv}` : "no --backup-env given";
    console.log(`instance-check: backup targets NOT checked (${why})`);
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
    );
    const tenants = checkDbTenants(db.tenants, profile, otherProfiles);
    violations.push(...tenants.violations);
    knownCount = tenants.known.length;
    for (const line of tenants.known) {
      console.error(`KNOWN VIOLATION (recorded): ${line}`);
    }
    checkLive(args.db);
  }

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`VIOLATION: ${violation}`);
    }
    process.exit(1);
  }

  const checked = [args.env, backupChecked ? `backup targets in ${args.backupEnv}` : null, args.db ? "--db checked" : null];
  // A recorded violation lets the run pass. It does not make the instance clean, so the last line says which it is.
  const verdict = knownCount > 0 ? `has no new violation, ${knownCount} recorded one(s) above` : "is clean";
  console.log(`instance-check: ${args.instance} ${verdict} (${checked.filter(Boolean).join(", ")})`);
  process.exit(0);
}

/** True when this file is the script node was started with. Node resolves a symlink in that path before it loads the file, so compare real paths: a plain string compare skipped main() and exited 0 without checking anything. */
function startedDirectly() {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (startedDirectly()) {
  main(process.argv.slice(2));
}
