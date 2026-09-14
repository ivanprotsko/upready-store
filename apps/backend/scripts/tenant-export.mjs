#!/usr/bin/env node
/**
 * Exports one tenant's full bundle from the command line.
 *
 *   node scripts/tenant-export.mjs <handle> [--out <dir>]
 *
 * Spawns `npx medusa exec ./src/scripts/tenant-export.ts <handle> <outDir>`
 * with cwd `apps/backend`, container access, no HTTP credentials needed
 * (`docs/multitenancy/admin-tenants-api-contract.md` §6). Default out dir is
 * `apps/backend/.medusa/exports/` (git-ignored, see `.gitignore`). Reads
 * whatever database `.env` in this working directory points `medusa exec`
 * at — read-only, writes no rows.
 */
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.join(HERE, "..");

const args = process.argv.slice(2);
const handle = args[0];

if (!handle || handle.startsWith("--")) {
  console.error("usage: node scripts/tenant-export.mjs <handle> [--out <dir>]");
  process.exit(1);
}

let outDir = path.join(BACKEND_ROOT, ".medusa", "exports");
const outIndex = args.indexOf("--out");
if (outIndex !== -1) {
  const value = args[outIndex + 1];
  if (!value) {
    console.error("--out requires a directory argument");
    process.exit(1);
  }
  outDir = path.resolve(value);
}

const result = spawnSync(
  "npx",
  ["medusa", "exec", "./src/scripts/tenant-export.ts", handle, outDir],
  { cwd: BACKEND_ROOT, stdio: "inherit" },
);

process.exit(result.status ?? 1);
