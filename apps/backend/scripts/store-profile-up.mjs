#!/usr/bin/env node
/**
 * Brings a store profile up on its own database. Safe to re-run.
 *
 *   node scripts/store-profile-up.mjs <id> [--dir <path>] [--db <name>]
 *                                          [--media-base-url <url>]
 *
 *   1. creates the database if it does not exist (never drops one — dropping is
 *      the operator's job, and a store profile is expensive to regenerate)
 *   2. runs `medusa db:migrate`
 *   3. runs the seed with STORE_PROFILE=<id>
 *   4. copies the profile's media into static/store-profiles/<id>/
 *   5. prints the publishable API key
 *
 * The database name defaults to `upready_store_<id>` with dashes turned into
 * underscores, matching the id contract in specs/store-profiles/. Point two
 * profiles at ONE database with `--db` and the second run adds a profile beside
 * the first (shared store, regions, stock locations, fulfillment; its own sales
 * channel, key and catalog) — see `src/migration-scripts/lib/store.ts`.
 *
 * Everything this script reports is scoped to the profile's own sales channel,
 * because in a shared database the database-wide counts belong to nobody.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.join(HERE, "..");
const PROFILES_DIR = path.join(
  BACKEND_ROOT,
  "src",
  "migration-scripts",
  "data",
  "profiles",
);
const STATIC_DIR = path.join(BACKEND_ROOT, "static", "store-profiles");

const MEDIA_EXTENSIONS = new Set([".webp", ".png", ".jpg"]);

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
  const args = { id: null, dir: null, db: null, mediaBaseUrl: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dir") args.dir = argv[++index];
    else if (arg === "--db") args.db = argv[++index];
    else if (arg === "--media-base-url") args.mediaBaseUrl = argv[++index];
    else if (arg.startsWith("--")) throw new Error(`Unknown flag "${arg}".`);
    else if (!args.id) args.id = arg;
    else throw new Error(`Unexpected argument "${arg}".`);
  }
  if (!args.id) {
    throw new Error(
      "Usage: node scripts/store-profile-up.mjs <id> [--dir <path>] [--db <name>] [--media-base-url <url>]",
    );
  }
  return args;
};

/** Minimal .env reader: the real environment always wins, nothing is printed. */
const readDotEnv = () => {
  const file = path.join(BACKEND_ROOT, ".env");
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["'](.*)["']$/, "$1");
  }
  return values;
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const dotEnv = readDotEnv();

  const profileDir = args.dir
    ? path.resolve(args.dir)
    : path.join(PROFILES_DIR, args.id);

  if (!fs.existsSync(profileDir)) {
    throw new Error(`Store profile "${args.id}" not found at ${profileDir}.`);
  }

  // The seed names the sales channel and the publishable key after the brand
  // (`src/migration-scripts/data/store/index.ts`). In a shared database that
  // name is the only thing that tells this profile's rows from a neighbour's.
  const profileJson = JSON.parse(
    fs.readFileSync(path.join(profileDir, "profile.json"), "utf8"),
  );
  const brandName = profileJson?.brand?.name;
  if (!brandName) {
    throw new Error(`Store profile "${args.id}": profile.json has no brand.name.`);
  }
  const salesChannelName = `${brandName} Sales Channel`;
  const apiKeyTitle = `${brandName} Publishable API Key`;

  const databaseName = args.db ?? `upready_store_${args.id.replace(/-/g, "_")}`;

  const templateUrl = process.env.DATABASE_URL ?? dotEnv.DATABASE_URL;
  if (!templateUrl) {
    throw new Error(
      "DATABASE_URL is not set and .env does not define one. It is the template this script rewrites the database name in.",
    );
  }

  const url = new URL(templateUrl);
  url.pathname = `/${databaseName}`;
  const databaseUrl = url.toString();

  const mediaBaseUrl =
    args.mediaBaseUrl ??
    process.env.STORE_MEDIA_BASE_URL ??
    dotEnv.STORE_MEDIA_BASE_URL ??
    `http://localhost:${process.env.PORT ?? dotEnv.PORT ?? 9000}/static/store-profiles/${args.id}`;

  const psql = findBinary("psql");
  const createdb = findBinary("createdb");

  // 1. database ---------------------------------------------------------
  const adminUrl = new URL(templateUrl);
  adminUrl.pathname = "/postgres";

  const exists = execFileSync(
    psql,
    [
      adminUrl.toString(),
      "-tAc",
      `SELECT 1 FROM pg_database WHERE datname = '${databaseName}'`,
    ],
    { encoding: "utf8" },
  ).trim();

  if (exists === "1") {
    console.log(`database ${databaseName}: already exists`);
  } else {
    // createdb takes the connection as a maintenance-db conninfo string; there
    // is no -d flag on this tool.
    execFileSync(
      createdb,
      [`--maintenance-db=${adminUrl.toString()}`, databaseName],
      { stdio: "inherit" },
    );
    console.log(`database ${databaseName}: created`);
  }

  const childEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DB_NAME: databaseName,
    STORE_PROFILE: args.id,
    STORE_MEDIA_BASE_URL: mediaBaseUrl,
    ...(args.dir ? { STORE_PROFILE_DIR: profileDir } : {}),
  };

  const runMedusa = (label, medusaArgs) => {
    console.log(`\n--- ${label} ---`);
    const result = spawnSync("npx", ["medusa", ...medusaArgs], {
      cwd: BACKEND_ROOT,
      env: childEnv,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error(`${label} failed with exit code ${result.status}.`);
    }
  };

  // 2. media first, so every URL the seed writes already resolves --------
  const mediaSource = path.join(profileDir, "media");
  const mediaTarget = path.join(STATIC_DIR, args.id);
  let copied = 0;
  if (fs.existsSync(mediaSource)) {
    fs.mkdirSync(mediaTarget, { recursive: true });
    for (const file of fs.readdirSync(mediaSource)) {
      if (!MEDIA_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
      fs.copyFileSync(path.join(mediaSource, file), path.join(mediaTarget, file));
      copied += 1;
    }
  }
  console.log(`media: copied ${copied} file(s) into ${mediaTarget}`);

  // 3. migrate + seed ---------------------------------------------------
  runMedusa("medusa db:migrate", ["db:migrate"]);
  runMedusa("seed", ["exec", "./src/migration-scripts/initial-data-seed.ts"]);

  // 4. report -----------------------------------------------------------
  const query = (sql) =>
    execFileSync(psql, [databaseUrl, "-tAc", sql], { encoding: "utf8" }).trim();

  const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;

  const channelId = query(
    `SELECT id FROM sales_channel
      WHERE name = ${sqlString(salesChannelName)} AND deleted_at IS NULL`,
  );
  if (!channelId) {
    throw new Error(
      `no sales channel named "${salesChannelName}" in ${databaseName}: the seed did not create this profile's channel.`,
    );
  }

  const publishableKey = query(
    `SELECT k.token FROM api_key k
      WHERE k.type = 'publishable' AND k.revoked_at IS NULL
        AND k.title = ${sqlString(apiKeyTitle)}
      ORDER BY k.created_at ASC LIMIT 1`,
  );

  // Everything below is counted THROUGH the sales channel: in a shared database
  // `SELECT count(*) FROM product` is the sum of every profile, which is a
  // number about the database and not about this profile.
  const ownProducts = `SELECT product_id FROM product_sales_channel
      WHERE sales_channel_id = ${sqlString(channelId)} AND deleted_at IS NULL`;

  const counts = query(
    `SELECT (SELECT count(*) FROM product p
               WHERE p.deleted_at IS NULL AND p.id IN (${ownProducts}))
       || ' products, ' || (SELECT count(*) FROM product_variant v
               WHERE v.deleted_at IS NULL AND v.product_id IN (${ownProducts}))
       || ' variants, ' || (SELECT count(*) FROM product_category WHERE deleted_at IS NULL)
       || ' categories (database-wide), ' || (SELECT count(*) FROM region WHERE deleted_at IS NULL)
       || ' regions (database-wide)'`,
  );

  const keyChannels = query(
    `SELECT count(*) FROM publishable_api_key_sales_channel l
       JOIN api_key k ON k.id = l.publishable_key_id
      WHERE k.title = ${sqlString(apiKeyTitle)} AND l.deleted_at IS NULL`,
  );

  // A seed that seeded NOTHING must not report success. Measured in the pilot: this script
  // exited 0 with zero products in the database and the stand came up empty, which is the
  // most expensive kind of green. The counts are read back from the database, not from the
  // seed's own log, and a zero in products or variants is a failure of this command.
  const seededProducts = Number(
    query(
      `SELECT count(*) FROM product p WHERE p.deleted_at IS NULL AND p.id IN (${ownProducts})`,
    ),
  );
  const seededVariants = Number(
    query(
      `SELECT count(*) FROM product_variant v WHERE v.deleted_at IS NULL AND v.product_id IN (${ownProducts})`,
    ),
  );
  if (!Number.isFinite(seededProducts) || seededProducts === 0) {
    throw new Error(
      `seed produced ${seededProducts} products on sales channel "${salesChannelName}" in ${databaseName}: a seed that seeds nothing is a failure, not a success. ` +
        `Check STORE_PROFILE=${args.id} and ${profileDir}/catalog/products.json.`,
    );
  }
  if (!Number.isFinite(seededVariants) || seededVariants === 0) {
    throw new Error(
      `seed produced ${seededProducts} products but ${seededVariants} variants in ${databaseName}: a product nobody can buy is not seeded.`,
    );
  }
  if (!publishableKey) {
    throw new Error(
      `no publishable key titled "${apiKeyTitle}" in ${databaseName}: the storefront would have nothing to authenticate with.`,
    );
  }
  if (Number(keyChannels) !== 1) {
    throw new Error(
      `publishable key "${apiKeyTitle}" is linked to ${keyChannels} sales channels in ${databaseName}, expected exactly 1. A key on two channels sees two catalogs.`,
    );
  }

  console.log("\n--- store profile up ---");
  console.log(`profile:            ${args.id}`);
  console.log(`profile directory:  ${profileDir}`);
  console.log(`database:           ${databaseName}`);
  console.log(`media base URL:     ${mediaBaseUrl}`);
  console.log(`sales channel:      ${salesChannelName} (${channelId})`);
  console.log(`seeded:             ${counts}`);
  console.log(`publishable key:    ${publishableKey}`);
};

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
