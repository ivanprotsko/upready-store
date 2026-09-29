#!/usr/bin/env node
/**
 * Switches this checkout's local stand to a fresh copy of a live database.
 * Never drops a database and never writes to one it did not create itself.
 *
 *   node scripts/stand-use-live-copy.mjs --target <db> [--source <db>]
 *        [--storefront-dir <path>] [--probe-port <port>]
 *        [--allow-undecryptable] [--restart] [--log <path>]
 *
 *   1. preflight: the Postgres server is local, the source database exists, the
 *      target does not, `.env` sets MP_SCHEDULER=off and INTEGRATION_ENCRYPTION_KEY
 *   2. copies the source into the target with `pg_dump -Fc | pg_restore --no-owner`
 *      (`createdb -T` refuses a source that has open connections)
 *   3. runs `medusa db:migrate --skip-scripts --execute-safe-links`
 *   4. gives every shop whose main address is a public domain a local one,
 *      `olavka.com` → `olavka-com.localhost`, and makes that one primary
 *   5. probes that INTEGRATION_ENCRYPTION_KEY decrypts the copy's shop secrets,
 *      printing ok or fail per row and never a value
 *   6. clears the storefront's fetch cache
 *   7. boots a probe backend on a spare port against the target and asks it for
 *      `/health` and `/storefront/by-host` of every local main address
 *   8. switches: rewrites DATABASE_URL and DB_NAME in `.env` after a backup and,
 *      with --restart, restarts this checkout's own backend on PORT
 *
 * Why `--skip-scripts` (46df audit A-25): a live database records its migration
 * scripts under their compiled names (`initial-data-seed.js`), so a checkout that
 * runs them from sources sees `initial-data-seed.ts` as new and seeds a second
 * store profile, «My Store», into the copy. The rows of `store` and
 * `sales_channel` are counted right after the copy and after every later step,
 * and any growth fails the run.
 *
 * Why MP_SCHEDULER=off: the copy carries every shop's marketplace keys, and with
 * the live INTEGRATION_ENCRYPTION_KEY the stand could read them. The five-minute
 * marketplace sync (`src/jobs/marketplace-sync.ts`) must not call Wildberries or
 * Ozon from a stand next to production.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = fs.realpathSync(path.join(HERE, ".."));
const ENV_FILE = path.join(BACKEND_ROOT, ".env");
const MIGRATION_SCRIPTS_DIR = path.join(BACKEND_ROOT, "src", "migration-scripts");

const DEFAULT_SOURCE = "upready_store_live_copy";
const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const BOOT_TIMEOUT_MS = 300_000;
const USAGE =
  "Usage: node scripts/stand-use-live-copy.mjs --target <db> [--source <db>] [--storefront-dir <path>] " +
  "[--probe-port <port>] [--allow-undecryptable] [--restart] [--log <path>]";

/** Where Homebrew keeps the Postgres client on this machine, then $PATH. */
const PSQL_DIRS = [
  process.env.PGBIN,
  "/opt/homebrew/opt/postgresql@16/bin",
  "/opt/homebrew/bin",
  "/usr/local/bin",
].filter(Boolean);

const findBinary = (name) => {
  for (const dir of PSQL_DIRS) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  const found = spawnSync("which", [name], { encoding: "utf8" });
  if (found.status === 0) return found.stdout.trim();
  throw new Error(
    `"${name}" not found. Add its directory to PGBIN, e.g. PGBIN=/opt/homebrew/opt/postgresql@16/bin.`,
  );
};

const parseArgs = (argv) => {
  const args = {
    source: DEFAULT_SOURCE,
    target: null,
    storefrontDir: path.join(BACKEND_ROOT, "..", "storefront"),
    probePort: null,
    allowUndecryptable: false,
    restart: false,
    log: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") args.source = argv[++index];
    else if (arg === "--target") args.target = argv[++index];
    else if (arg === "--storefront-dir") args.storefrontDir = path.resolve(argv[++index]);
    else if (arg === "--probe-port") args.probePort = Number(argv[++index]);
    else if (arg === "--allow-undecryptable") args.allowUndecryptable = true;
    else if (arg === "--restart") args.restart = true;
    else if (arg === "--log") args.log = path.resolve(argv[++index]);
    else throw new Error(`Unexpected argument "${arg}".\n${USAGE}`);
  }
  if (!args.target) throw new Error(USAGE);
  for (const [flag, name] of [["--source", args.source], ["--target", args.target]]) {
    if (!/^[a-z_][a-z0-9_]*$/.test(name ?? "")) {
      throw new Error(`${flag} "${name}" is not a plain lowercase database name.`);
    }
  }
  if (args.source === args.target) throw new Error("--source and --target name the same database.");
  if (args.probePort !== null && !Number.isInteger(args.probePort)) {
    throw new Error("--probe-port takes a port number.");
  }
  return args;
};

/** Minimal .env reader: nothing is printed, quotes around a value are dropped. */
const readDotEnv = () => {
  if (!fs.existsSync(ENV_FILE)) return {};
  const values = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["'](.*)["']$/, "$1");
  }
  return values;
};

const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const stamp = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
};

/** A Medusa-shaped id, `<prefix>_<ULID>`: 48 bits of time, 80 of randomness, Crockford base32. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const entityId = (prefix) => {
  let time = Date.now();
  let timePart = "";
  for (let index = 0; index < 10; index += 1) {
    timePart = CROCKFORD[time % 32] + timePart;
    time = Math.floor(time / 32);
  }
  const random = crypto.randomBytes(16);
  let randomPart = "";
  for (let index = 0; index < 16; index += 1) randomPart += CROCKFORD[random[index] % 32];
  return `${prefix}_${timePart}${randomPart}`;
};

/** Mirrors `decryptJson` in `src/tenant-secrets/crypto.ts`: AES-256-GCM, `iv ‖ authTag ‖ ciphertext`. */
const decrypts = (blob, passphrase) => {
  try {
    const key = crypto.createHash("sha256").update(passphrase, "utf8").digest();
    const raw = Buffer.from(blob, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
    return true;
  } catch {
    return false;
  }
};

const isLocalHost = (host) => host === "localhost" || host.endsWith(".localhost");

const localHostFor = (host) => `${host.replace(/\./g, "-")}.localhost`;

const portIsFree = (port) =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });

const spareProbePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

const listenerPids = (port) => {
  const found = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" });
  return found.stdout.split("\n").map((line) => line.trim()).filter(Boolean).map(Number);
};

const cwdOf = (pid) => {
  const found = spawnSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { encoding: "utf8" });
  const line = found.stdout.split("\n").find((entry) => entry.startsWith("n"));
  return line ? line.slice(1) : null;
};

/** Every `medusa develop` process (the npm wrapper and its server child) started in THIS backend. */
const ownDevelopPids = () => {
  const found = spawnSync("pgrep", ["-f", "medusa develop"], { encoding: "utf8" });
  return found.stdout
    .split("\n")
    .map((line) => Number(line.trim()))
    .filter((pid) => pid && pid !== process.pid && cwdOf(pid) === BACKEND_ROOT);
};

const waitFor = async (label, check, timeoutMs, isDead = () => false) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    if (isDead()) throw new Error(`${label}: the process exited before it was ready.`);
    await sleep(2_000);
  }
  throw new Error(`${label}: not ready after ${Math.round(timeoutMs / 1000)} s.`);
};

const healthy = async (port) => {
  try {
    const response = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(5_000) });
    return response.status === 200;
  } catch {
    return false;
  }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const dotEnv = readDotEnv();

  // 1. preflight ---------------------------------------------------------
  console.log("--- preflight ---");
  if (!fs.existsSync(ENV_FILE) || !dotEnv.DATABASE_URL) {
    throw new Error(`${ENV_FILE} must define DATABASE_URL: it is the template for the copy and the file the switch rewrites.`);
  }
  if (process.env.DATABASE_URL && process.env.DATABASE_URL !== dotEnv.DATABASE_URL) {
    console.log("warning: DATABASE_URL in your shell overrides .env for every backend started from it");
  }

  const templateUrl = new URL(dotEnv.DATABASE_URL);
  if (!LOCAL_DB_HOSTS.has(templateUrl.hostname)) {
    throw new Error(`DATABASE_URL points at ${templateUrl.hostname}, not at a local Postgres. This script copies onto a local server only.`);
  }
  const urlFor = (database) => {
    const url = new URL(templateUrl);
    url.pathname = `/${database}`;
    return url.toString();
  };

  // Connection details ride in the environment, so no password shows up in `ps`.
  const pgEnv = {
    ...process.env,
    PGHOST: templateUrl.hostname.replace(/^\[(.*)\]$/, "$1"),
    PGPORT: templateUrl.port || "5432",
    ...(templateUrl.username ? { PGUSER: decodeURIComponent(templateUrl.username) } : {}),
    ...(templateUrl.password ? { PGPASSWORD: decodeURIComponent(templateUrl.password) } : {}),
    ...(templateUrl.searchParams.get("sslmode") ? { PGSSLMODE: templateUrl.searchParams.get("sslmode") } : {}),
  };

  const psql = findBinary("psql");
  const createdb = findBinary("createdb");
  const pgDump = findBinary("pg_dump");
  const pgRestore = findBinary("pg_restore");

  const sql = (database, text) =>
    execFileSync(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-tA", "-F", "\t", "-d", database, "-c", text], {
      env: pgEnv,
      encoding: "utf8",
    }).trim();
  const rows = (database, text) => {
    const out = sql(database, text);
    return out ? out.split("\n").map((line) => line.split("\t")) : [];
  };
  const databaseExists = (name) =>
    sql("postgres", `SELECT 1 FROM pg_database WHERE datname = ${sqlString(name)}`) === "1";

  const serverMajor = Math.floor(Number(sql("postgres", "SHOW server_version_num")) / 10_000);
  const dumpMajor = Number(/(\d+)\./.exec(execFileSync(pgDump, ["--version"], { encoding: "utf8" }))?.[1]);
  if (!(dumpMajor >= serverMajor)) {
    throw new Error(`pg_dump ${dumpMajor} is older than the server (${serverMajor}). Point PGBIN at a newer client.`);
  }
  console.log(`postgres:           local, server ${serverMajor}, client ${dumpMajor}`);

  if (!databaseExists(args.source)) throw new Error(`source database ${args.source} does not exist.`);
  console.log(`source:             ${args.source} exists`);
  if (databaseExists(args.target)) {
    throw new Error(`target database ${args.target} already exists. Pick a free name; dropping one is the operator's job.`);
  }
  console.log(`target:             ${args.target} is free`);

  const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY ?? dotEnv.INTEGRATION_ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("INTEGRATION_ENCRYPTION_KEY is not set in .env: the copy's shop secrets cannot be read without it.");
  console.log("encryption key:     set (value not shown)");

  if (dotEnv.MP_SCHEDULER !== "off") {
    throw new Error(
      "MP_SCHEDULER=off is missing from .env. A stand on a copy of live data must not run the marketplace sync next to production (src/jobs/marketplace-sync.ts).",
    );
  }
  console.log("marketplace sync:   MP_SCHEDULER=off");

  const standPort = Number(dotEnv.PORT ?? 9000);
  const foreignListeners = listenerPids(standPort).filter((pid) => cwdOf(pid) !== BACKEND_ROOT);
  if (args.restart && foreignListeners.length) {
    throw new Error(`--restart: port ${standPort} is held by pid ${foreignListeners.join(", ")} from another directory. Not touching it.`);
  }
  console.log(`stand backend:      port ${standPort}${listenerPids(standPort).length ? ", running" : ", not running"}`);

  const probePort = args.probePort ?? (await spareProbePort());
  if (!(await portIsFree(probePort))) throw new Error(`probe port ${probePort} is taken.`);
  console.log(`probe backend:      port ${probePort}`);

  const distDir = process.env.NEXT_DIST_DIR || ".next";
  const fetchCacheDir = path.join(args.storefrontDir, distDir, "cache", "fetch-cache");
  const storefrontFound = fs.existsSync(path.join(args.storefrontDir, "package.json"));
  console.log(`storefront:         ${storefrontFound ? args.storefrontDir : `not found at ${args.storefrontDir}, cache step skipped`}`);

  const counts = [];
  const countRows = (step) => {
    const [store, storeLive, channel, channelLive] = rows(
      args.target,
      `SELECT (SELECT count(*) FROM store), (SELECT count(*) FROM store WHERE deleted_at IS NULL),
              (SELECT count(*) FROM sales_channel), (SELECT count(*) FROM sales_channel WHERE deleted_at IS NULL)`,
    )[0].map(Number);
    const current = { step, store, storeLive, channel, channelLive };
    console.log(`rows:               store ${store} (${storeLive} not deleted), sales_channel ${channel} (${channelLive} not deleted), ${step}`);
    const first = counts[0];
    counts.push(current);
    if (first && (store > first.store || channel > first.channel)) {
      throw new Error(
        `${step}: store ${first.store} → ${store}, sales_channel ${first.channel} → ${channel}. Something seeded into the copy (46df A-25).`,
      );
    }
  };

  // 2. copy --------------------------------------------------------------
  console.log(`\n--- copy ${args.source} → ${args.target} ---`);
  execFileSync(createdb, ["--maintenance-db=postgres", args.target], { env: pgEnv, stdio: "inherit" });
  const copyStarted = Date.now();
  await new Promise((resolve, reject) => {
    const dump = spawn(pgDump, ["-Fc", "-d", args.source], { env: pgEnv, stdio: ["ignore", "pipe", "pipe"] });
    const restore = spawn(pgRestore, ["--no-owner", "--no-acl", "-d", args.target], {
      env: pgEnv,
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    dump.stderr.on("data", (chunk) => (stderr += chunk));
    restore.stderr.on("data", (chunk) => (stderr += chunk));
    dump.stdout.pipe(restore.stdin);
    const exits = [dump, restore].map((child) => new Promise((done) => child.on("close", done)));
    Promise.all(exits).then(([dumpCode, restoreCode]) => {
      if (dumpCode === 0 && restoreCode === 0) resolve();
      else reject(new Error(`copy failed (pg_dump ${dumpCode}, pg_restore ${restoreCode}):\n${stderr.trim().split("\n").slice(-15).join("\n")}`));
    });
  });
  console.log(`copied in ${Math.round((Date.now() - copyStarted) / 1000)} s`);
  countRows("after the copy");

  // 3. migrate -----------------------------------------------------------
  const scriptFiles = fs
    .readdirSync(MIGRATION_SCRIPTS_DIR)
    .filter((file) => /\.(ts|js)$/.test(file) && !file.endsWith(".d.ts"));
  const recorded = new Set(rows(args.target, "SELECT script_name FROM script_migrations").map(([name]) => name));
  const unrecorded = scriptFiles.filter((file) => !recorded.has(file));
  console.log("\n--- medusa db:migrate --skip-scripts --execute-safe-links ---");
  for (const file of unrecorded) {
    const compiled = file.replace(/\.ts$/, ".js");
    console.log(`migration script ${file}: ${recorded.has(compiled) ? `recorded as ${compiled} in the copy` : "never ran on the copy"}, skipped`);
  }

  const targetEnv = {
    ...process.env,
    DATABASE_URL: urlFor(args.target),
    DB_NAME: args.target,
    MP_SCHEDULER: "off",
  };
  const migrate = spawnSync("npx", ["medusa", "db:migrate", "--skip-scripts", "--execute-safe-links"], {
    cwd: BACKEND_ROOT,
    env: targetEnv,
    stdio: "inherit",
  });
  if (migrate.status !== 0) throw new Error(`medusa db:migrate failed with exit code ${migrate.status}.`);
  countRows("after db:migrate");

  // 4. local main addresses ----------------------------------------------
  console.log("\n--- local main addresses ---");
  const localHosts = [];
  const primaries = rows(
    args.target,
    `SELECT d.id, d.host, t.id, t.handle FROM tenant_domain d JOIN tenant t ON t.id = d.tenant_id
      WHERE d.is_primary AND d.deleted_at IS NULL AND t.deleted_at IS NULL ORDER BY t.handle`,
  );
  for (const [domainId, host, tenantId, handle] of primaries) {
    if (isLocalHost(host)) {
      console.log(`${tenantId} (${handle}): ${host} is already local`);
      localHosts.push(host);
      continue;
    }
    const localHost = localHostFor(host);
    const taken = rows(
      args.target,
      `SELECT id, tenant_id FROM tenant_domain WHERE host = ${sqlString(localHost)} AND deleted_at IS NULL`,
    )[0];
    if (taken && taken[1] !== tenantId) {
      throw new Error(`${localHost} already belongs to ${taken[1]}, not to ${tenantId} (${handle}).`);
    }
    const localId = taken?.[0] ?? entityId("tdom");
    sql(
      args.target,
      `BEGIN;
       ${taken ? "" : `INSERT INTO tenant_domain (id, host, tenant_id, is_primary) VALUES (${sqlString(localId)}, ${sqlString(localHost)}, ${sqlString(tenantId)}, false);`}
       UPDATE tenant_domain SET is_primary = false, updated_at = now() WHERE id = ${sqlString(domainId)};
       UPDATE tenant_domain SET is_primary = true, updated_at = now() WHERE id = ${sqlString(localId)};
       COMMIT;`,
    );
    console.log(`${tenantId} (${handle}): ${host} → ${localHost} (${taken ? "existing" : "new"} row ${localId})`);
    localHosts.push(localHost);
  }
  if (!primaries.length) console.log("no shop has a custom main address");
  countRows("after the main addresses");

  // 5. encryption key ----------------------------------------------------
  console.log("\n--- INTEGRATION_ENCRYPTION_KEY probe ---");
  const secrets = rows(
    args.target,
    "SELECT id, provider, payload FROM tenant_integration_secret WHERE deleted_at IS NULL ORDER BY created_at",
  );
  let unreadable = 0;
  for (const [id, provider, payload] of secrets) {
    const ok = decrypts(payload, encryptionKey);
    if (!ok) unreadable += 1;
    console.log(`${id} ${provider}: ${ok ? "ok" : "fail"}`);
  }
  console.log(`${secrets.length - unreadable} of ${secrets.length} shop secrets decrypt`);
  if (unreadable && !args.allowUndecryptable) {
    throw new Error(
      `${unreadable} shop secret(s) do not decrypt: the copy was encrypted under another INTEGRATION_ENCRYPTION_KEY. ` +
        `Put that key into .env, or rerun on a new --target with --allow-undecryptable (those integrations then show as unreadable). ` +
        `${args.target} is left in place.`,
    );
  }

  // 6. storefront cache --------------------------------------------------
  console.log("\n--- storefront cache ---");
  if (storefrontFound && fs.existsSync(fetchCacheDir)) {
    const entries = fs.readdirSync(fetchCacheDir).length;
    fs.rmSync(fetchCacheDir, { recursive: true, force: true });
    console.log(`removed ${fetchCacheDir} (${entries} entries)`);
  } else {
    console.log(`nothing cached at ${fetchCacheDir}`);
  }

  // 7. probe backend -----------------------------------------------------
  const probeLog = path.join(os.tmpdir(), `stand-probe-${probePort}.log`);
  console.log(`\n--- probe backend on :${probePort} (log ${probeLog}) ---`);
  const probeByHost = async (port) => {
    const hosts = localHosts.length
      ? localHosts
      : rows(args.target, "SELECT handle FROM tenant WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1").map(
          ([handle]) => `${handle}.localhost`,
        );
    for (const host of hosts) {
      const response = await fetch(`http://localhost:${port}/storefront/by-host?host=${encodeURIComponent(host)}`, {
        signal: AbortSignal.timeout(30_000),
      });
      const body = response.ok ? await response.json() : null;
      const primary = body?.primary_host ?? "none";
      console.log(`by-host ${host}: HTTP ${response.status}, primary_host ${primary}`);
      if (!response.ok || primary !== host) {
        throw new Error(`/storefront/by-host?host=${host} on :${port} did not resolve the shop to its local main address.`);
      }
    }
  };

  const logFd = fs.openSync(probeLog, "w");
  const probe = spawn("npx", ["medusa", "develop"], {
    cwd: BACKEND_ROOT,
    env: { ...targetEnv, PORT: String(probePort) },
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  let probeExited = false;
  probe.on("exit", () => (probeExited = true));
  const stopProbe = async () => {
    for (const signal of ["SIGTERM", "SIGKILL"]) {
      try {
        process.kill(-probe.pid, signal);
      } catch {
        // the group is already gone
      }
      for (let tries = 0; tries < 10 && listenerPids(probePort).length; tries += 1) await sleep(1_000);
      if (!listenerPids(probePort).length) break;
    }
    fs.closeSync(logFd);
    const left = listenerPids(probePort);
    console.log(left.length ? `probe: pid ${left.join(", ")} still listens on :${probePort}` : `probe stopped, :${probePort} is free`);
  };
  try {
    const probeStarted = Date.now();
    await waitFor(`probe backend on :${probePort}`, () => healthy(probePort), BOOT_TIMEOUT_MS, () => probeExited);
    console.log(`health: 200 after ${Math.round((Date.now() - probeStarted) / 1000)} s`);
    await probeByHost(probePort);
    countRows("after the probe backend booted");
  } finally {
    await stopProbe();
  }

  // 8. switch ------------------------------------------------------------
  console.log("\n--- switch ---");
  const backup = `${ENV_FILE}.bak-${stamp()}`;
  fs.copyFileSync(ENV_FILE, backup);
  const previousDb = dotEnv.DB_NAME ?? new URL(dotEnv.DATABASE_URL).pathname.slice(1);
  const lines = fs.readFileSync(ENV_FILE, "utf8").split("\n");
  const setLine = (name, value) => {
    const index = lines.findIndex((line) => new RegExp(`^\\s*${name}\\s*=`).test(line));
    if (index === -1) lines.splice(lines.at(-1) === "" ? lines.length - 1 : lines.length, 0, `${name}=${value}`);
    else lines[index] = `${name}=${value}`;
  };
  setLine("DATABASE_URL", urlFor(args.target));
  setLine("DB_NAME", args.target);
  fs.writeFileSync(ENV_FILE, lines.join("\n"));
  console.log(`.env: ${previousDb} → ${args.target} (DATABASE_URL and DB_NAME, backup ${backup})`);

  if (args.restart) {
    const standLog = args.log ?? path.join(os.tmpdir(), `stand-backend-${standPort}.log`);
    const stale = [...new Set([...ownDevelopPids(), ...listenerPids(standPort)])];
    for (const pid of stale) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
    if (stale.length) console.log(`stopped this checkout's backend: pid ${stale.join(", ")}`);
    await waitFor(`port ${standPort}`, () => portIsFree(standPort), 30_000);

    // DATABASE_URL, DB_NAME and PORT come from the switched .env and nothing else.
    const standEnv = { ...process.env };
    delete standEnv.DATABASE_URL;
    delete standEnv.DB_NAME;
    delete standEnv.PORT;
    const standFd = fs.openSync(standLog, "a");
    const stand = spawn("nice", ["-n", "10", "npx", "medusa", "develop"], {
      cwd: BACKEND_ROOT,
      env: standEnv,
      detached: true,
      stdio: ["ignore", standFd, standFd],
    });
    stand.unref();
    fs.closeSync(standFd);
    let standExited = false;
    stand.on("exit", () => (standExited = true));
    const standStarted = Date.now();
    await waitFor(`stand backend on :${standPort}`, () => healthy(standPort), BOOT_TIMEOUT_MS, () => standExited);
    console.log(`stand backend on :${standPort}: health 200 after ${Math.round((Date.now() - standStarted) / 1000)} s (pid ${stand.pid}, log ${standLog})`);
    await probeByHost(standPort);
    countRows("after the switch");
  } else if (listenerPids(standPort).length) {
    console.log(
      `the backend on :${standPort} still runs on ${previousDb}: stop the medusa develop wrapper AND its child, then start it again, or rerun with --restart next time`,
    );
  } else {
    console.log(`start the backend: cd ${BACKEND_ROOT} && npx medusa develop`);
  }

  console.log("\n--- done ---");
  console.log(`stand database:     ${args.target} (was ${previousDb})`);
  for (const host of localHosts) console.log(`shop:               http://${host}:<storefront port>/`);
  console.log(
    `store / sales_channel rows: ${counts.map((entry) => `${entry.store}/${entry.channel} ${entry.step}`).join("; ")}`,
  );
  console.log("restart the storefront too: its middleware keeps each host's shop in memory for a minute");
};

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
