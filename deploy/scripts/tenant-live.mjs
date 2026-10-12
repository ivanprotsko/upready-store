#!/usr/bin/env node
// Ivan's switch for a shop's «accepts real visitors» flag, t-2026-10-12-31.
//
// AGENTS NEVER RUN THIS TO CHANGE THE FLAG. Only Ivan switches a shop live or
// back, in either direction: while a shop is not live, agents treat its orders
// and buyers as test data, so a wrong `false` is as harmful as a wrong `true`.
// An agent may run --show, which reads and writes nothing, and names the
// command for Ivan in its report. docs/instances/RULES.md §7, live flag.
//
// It writes three keys into the tenant's `metadata`, the ones
// apps/backend/src/modules/tenant/live.ts reads: `live` (true or false),
// `live_since` (the date of this switch) and `live_by` (who switched it). No
// other key is touched, and no route of the backend can write these three.
//
//   node deploy/scripts/tenant-live.mjs --instance intl --handle <handle> --live true --by ivan --yes-ivan
//   node deploy/scripts/tenant-live.mjs --instance ru --handle <handle> --show
//   node deploy/scripts/tenant-live.mjs --db postgres://localhost:5433/scratch --handle <handle> --live false --by ivan --yes-ivan
//
// --instance runs psql inside the host's mt-postgres container over ssh, the
// way deploy/scripts/deploy-instance.sh reaches the host: the address from
// CONTABO_SERVER_IP or RU_HOST_IP, else from that one line of
// ~/upready/.env.keys, and the key from INTL_HOST_SSH_KEY or RU_HOST_SSH_KEY.
// --db runs psql on a database you name, a local or a scratch one.
// --since YYYY-MM-DD records another date than today's.
//
// Exit codes: 0 done, 1 no tenant with that handle, 2 usage, refusal or a
// database that cannot be read.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export class UsageError extends Error {}

const HANDLE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AUTHOR = /^[a-z][a-z0-9-]{0,39}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** How each instance's host is reached, as deploy/scripts/deploy-instance.sh does it. */
export const HOSTS = {
  intl: { ipKey: "CONTABO_SERVER_IP", sshKeyEnv: "INTL_HOST_SSH_KEY", sshKey: "~/.ssh/id_ed25519_contabo" },
  ru: { ipKey: "RU_HOST_IP", sshKeyEnv: "RU_HOST_SSH_KEY", sshKey: "~/.ssh/id_ed25519_do" },
};

/** Today in this machine's own time zone, the day Ivan sees on his calendar. */
export function today(now = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function parseArgs(argv, now = new Date()) {
  const out = { instance: null, db: null, handle: null, live: null, by: null, since: null, yesIvan: false, show: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const eq = arg.indexOf("=");
    const [flag, inlineValue] = eq === -1 ? [arg, null] : [arg.slice(0, eq), arg.slice(eq + 1)];
    const takeValue = () => (inlineValue !== null ? inlineValue : argv[++i]);
    if (flag === "--instance") out.instance = takeValue();
    else if (flag === "--db") out.db = takeValue();
    else if (flag === "--handle") out.handle = takeValue();
    else if (flag === "--live") out.live = takeValue();
    else if (flag === "--by") out.by = takeValue();
    else if (flag === "--since") out.since = takeValue();
    else if (flag === "--yes-ivan") out.yesIvan = true;
    else if (flag === "--show") out.show = true;
    else throw new UsageError(`unknown flag: ${arg}`);
  }

  if (Boolean(out.instance) === Boolean(out.db)) throw new UsageError("give exactly one of --instance <intl|ru> and --db <postgres-url>");
  if (out.instance && !HOSTS[out.instance]) throw new UsageError(`--instance is intl or ru, got: ${out.instance}`);
  if (!out.handle || !HANDLE.test(out.handle)) throw new UsageError("--handle is the shop's handle: lowercase letters, digits and single hyphens");
  if (out.show) {
    if (out.live !== null || out.by !== null || out.since !== null || out.yesIvan) {
      throw new UsageError("--show reads the flag and takes none of --live, --by, --since, --yes-ivan");
    }
    return out;
  }

  if (out.live !== "true" && out.live !== "false") throw new UsageError("--live is true or false");
  out.live = out.live === "true";
  if (!out.by || !AUTHOR.test(out.by)) throw new UsageError("--by names who switches the flag, e.g. --by ivan");
  out.since = out.since ?? today(now);
  if (!DATE.test(out.since) || Number.isNaN(Date.parse(`${out.since}T00:00:00Z`))) throw new UsageError("--since is a date, YYYY-MM-DD");
  if (!out.yesIvan) {
    throw new UsageError(
      "refused without --yes-ivan: only Ivan switches a shop's live flag, agents never do (docs/instances/RULES.md §7, live flag)",
    );
  }
  return out;
}

/**
 * The flag of a tenant row as one line, `handle|live|live_since|live_by`, the date and the author cut to
 * the characters they need so neither can break that line. Every value this script writes into SQL is
 * checked by parseArgs first.
 */
const state = (row) =>
  [
    `${row}.handle`,
    `coalesce(${row}.metadata->'live' = 'true'::jsonb, false)`,
    `left(regexp_replace(coalesce(${row}.metadata->>'live_since', ''), '[^0-9-]', '', 'g'), 10)`,
    `left(regexp_replace(coalesce(${row}.metadata->>'live_by', ''), '[^a-zA-Z0-9._-]', '', 'g'), 40)`,
  ].join(" || '|' || ");

export function showSql(handle) {
  return `SELECT ${state("t")} FROM tenant t WHERE t.handle = '${handle}' AND t.deleted_at IS NULL`;
}

/** One statement: the flag before, then after. The row is locked between the two, so the "was" is the value this switch replaced. */
export function switchSql({ handle, live, since, by }) {
  return [
    `WITH before AS (SELECT t.id, ${state("t")} AS state FROM tenant t WHERE t.handle = '${handle}' AND t.deleted_at IS NULL FOR UPDATE),`,
    "after AS (",
    `  UPDATE tenant t SET metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object('live', ${live}, 'live_since', '${since}', 'live_by', '${by}'), updated_at = now()`,
    `  FROM before b WHERE t.id = b.id RETURNING ${state("t")} AS state`,
    ")",
    "SELECT before.state || '>' || after.state FROM before, after",
  ].join("\n");
}

export function parseState(line) {
  const [handle, live, since, by] = line.split("|");
  return { handle, live: live === "true", since: since || null, by: by || null };
}

export function describe(state) {
  return `live=${state.live}${state.since ? ` since ${state.since}` : ""}${state.by ? ` by ${state.by}` : ""}`;
}

/** The one line of `~/upready/.env.keys` that holds the host address, and no other. */
function hostAddress(instance, env = process.env) {
  const { ipKey } = HOSTS[instance];
  if (env[ipKey]) return env[ipKey];
  const file = path.join(os.homedir(), "upready", ".env.keys");
  if (!existsSync(file)) return null;
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((each) => each.startsWith(`${ipKey}=`));
  return line ? line.slice(ipKey.length + 1).trim() : null;
}

function run(command, args, input) {
  try {
    return execFileSync(command, args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });
  } catch (error) {
    const how = typeof error.status === "number" ? ` with status ${error.status}` : error.code ? ` (${error.code})` : "";
    const said = String(error.stderr ?? "").trim();
    const failure = new Error(`${command} failed${how}${said ? `: ${said}` : ""}`);
    failure.said = said;
    throw failure;
  }
}

/** Runs one statement and gives its lines. The SQL goes in on stdin, so no shell on either side ever parses it. */
export function query(target, sql, env = process.env) {
  const psqlArgs = ["-At", "-v", "ON_ERROR_STOP=1", "-f", "-"];
  if (target.db) {
    try {
      return run("psql", [target.db, ...psqlArgs], sql).split("\n").filter(Boolean);
    } catch (error) {
      // The URL may carry a password, and psql repeats it in its own error.
      throw new Error(error.message.split(target.db).join("<--db>"));
    }
  }
  const host = HOSTS[target.instance];
  const address = hostAddress(target.instance, env);
  if (!address) throw new Error(`no address for the ${target.instance} host: set ${host.ipKey} or write it into ~/upready/.env.keys`);
  const key = (env[host.sshKeyEnv] || host.sshKey).replace(/^~(?=\/)/, os.homedir());
  // mt-postgres knows its own user and database (deploy/compose.mt.yml), so no password is needed.
  const remote = `docker exec -i mt-postgres sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" ${psqlArgs.join(" ")}'`;
  return run("ssh", ["-i", key, "-o", "BatchMode=yes", `root@${address}`, remote], sql).split("\n").filter(Boolean);
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`tenant-live: ${error.message}`);
    process.exit(2);
  }
  const where = args.instance ? `instance ${args.instance}` : "--db";

  let lines;
  try {
    lines = query(args, args.show ? showSql(args.handle) : switchSql(args));
  } catch (error) {
    console.error(`tenant-live: ${error.message}`);
    process.exit(2);
  }
  if (lines.length === 0) {
    console.error(`tenant-live: no tenant "${args.handle}" on ${where}; nothing changed`);
    process.exit(1);
  }

  if (args.show) {
    console.log(`tenant-live: ${where} tenant "${args.handle}" ${describe(parseState(lines[0]))}`);
    return;
  }
  const [before, after] = lines[0].split(">").map(parseState);
  console.log(`tenant-live: ${where} tenant "${args.handle}" was ${describe(before)}, now ${describe(after)}`);
}

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
