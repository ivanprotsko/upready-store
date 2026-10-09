#!/usr/bin/env node
// deploy/scripts/host-disk.mjs — two disk decisions deploy-instance.sh makes on a host (t-2026-10-09-58).
//
// On 09.10.2026 at 09:42 the RU release of ab7b72b0 stopped before its migrations: pg_dump wrote
// «write /dev/stdout: no space left on device», `/` (77 GB) was 100 % full, and the Docker build cache held
// 39.3 GB in 355 records, none in use. The images are built on the host (step 2) and nothing pruned the
// cache. Hence:
//
//   1. After step 2, on a host whose profile switches it on (`host.buildCache.prune: true`, RU), the build
//      cache is cut down to `host.buildCache.maxUsedGb` (8 by default): `docker buildx prune --force --all
//      --max-used-space <N>gb` drops the least recently used records until the cache fits. The INTL host is a
//      shared Coolify host other projects build on, so its profile leaves this off and nothing is pruned there.
//   2. Before step 4 (pg_dump), the host must have room for the dump: max(database size ×
//      `host.backupRoom.dbSizeFactor`, `host.backupRoom.minFreeGb`), 2 and 5 by default. Why those numbers:
//      a custom-format dump (`pg_dump -Fc`, deploy/backup/pg-backup.sh) is compressed and carries no index, so
//      it is at most the size of the database even when nothing compresses; the second share is for what the
//      release writes right after it, the migrations (a table rewrite holds the old and the new copy until it
//      commits) and their WAL. The floor covers a small database, whose size says little about the room the
//      images, the logs and Postgres itself need while the stack restarts.
//
// Pure functions for the tests, and a CLI deploy-instance.sh calls on the machine it runs on:
//
//   node deploy/scripts/host-disk.mjs prune-command --instance <ru|intl>
//       prints the prune command for that host, or nothing when its profile does not switch pruning on. Exit 0.
//   node deploy/scripts/host-disk.mjs backup-room --instance <ru|intl> --free <bytes> --db <bytes>
//       prints one line; exit 0 when the dump fits, 3 when it does not, 2 on bad arguments.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const INSTANCES_DIR = path.resolve(__dirname, "..", "instances");

export const DEFAULTS = Object.freeze({ maxUsedGb: 8, minFreeGb: 5, dbSizeFactor: 2 });
const GB = 1024 ** 3;

const positive = (value, fallback) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback);

/** The disk settings of a host profile, defaults filled in. Pruning is on only when the profile says `true`. */
export function hostSettings(profile) {
  const host = profile?.host ?? {};
  return {
    prune: host.buildCache?.prune === true,
    maxUsedGb: positive(host.buildCache?.maxUsedGb, DEFAULTS.maxUsedGb),
    minFreeGb: positive(host.backupRoom?.minFreeGb, DEFAULTS.minFreeGb),
    dbSizeFactor: positive(host.backupRoom?.dbSizeFactor, DEFAULTS.dbSizeFactor),
  };
}

/** The command that cuts the build cache down on this host, or `null` where pruning is off. */
export function pruneCommand(settings) {
  if (!settings.prune) return null;
  return `docker buildx prune --force --all --max-used-space ${settings.maxUsedGb}gb`;
}

/** «12.3 GB» for a byte count. */
export const gb = (bytes) => `${(bytes / GB).toFixed(1)} GB`;

/**
 * Whether the host has room for the pre-migration dump. `dbBytes` is `pg_database_size`, or 0 when it could
 * not be read (then the floor alone decides).
 */
export function backupRoom({ freeBytes, dbBytes, settings }) {
  const fromDb = Math.max(0, dbBytes) * settings.dbSizeFactor;
  const floor = settings.minFreeGb * GB;
  const neededBytes = Math.max(fromDb, floor);
  const ok = freeBytes >= neededBytes;
  const basis =
    fromDb >= floor
      ? `database ${gb(dbBytes)} × ${settings.dbSizeFactor}`
      : `the ${settings.minFreeGb} GB floor; database ${gb(dbBytes)} × ${settings.dbSizeFactor} is less`;
  const line = ok
    ? `disk: ${gb(freeBytes)} free, the dump needs ${gb(neededBytes)} (${basis}) — ok`
    : `disk: only ${gb(freeBytes)} free, the dump needs ${gb(neededBytes)} (${basis}) — not starting pg_dump or the migrations`;
  return { ok, neededBytes, line };
}

export function loadInstanceProfile(instance, dir = INSTANCES_DIR) {
  if (!/^[a-z]+$/.test(instance ?? "")) throw new Error(`instance must be ru or intl, got: ${instance}`);
  return JSON.parse(readFileSync(path.join(dir, `${instance}.json`), "utf8"));
}

function flags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`unexpected argument: ${key}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${key} needs a value`);
    out[key.slice(2)] = value;
    i += 1;
  }
  return out;
}

const bytesFlag = (f, name) => {
  if (!/^\d+$/.test(f[name] ?? "")) throw new Error(`--${name} needs a byte count, got: ${f[name]}`);
  return Number(f[name]);
};

export function main(argv, { out = (s) => process.stdout.write(`${s}\n`), dir = INSTANCES_DIR } = {}) {
  const [command, ...rest] = argv;
  try {
    const f = flags(rest);
    const settings = hostSettings(loadInstanceProfile(f.instance, dir));
    if (command === "prune-command") {
      const cmd = pruneCommand(settings);
      if (cmd) out(cmd);
      return 0;
    }
    if (command === "backup-room") {
      const { ok, line } = backupRoom({ freeBytes: bytesFlag(f, "free"), dbBytes: bytesFlag(f, "db"), settings });
      out(line);
      return ok ? 0 : 3;
    }
    throw new Error(`unknown command: ${command ?? "(none)"} — prune-command or backup-room`);
  } catch (error) {
    out(`host-disk: ${error.message}`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
