#!/usr/bin/env node
/**
 * Build-time guard: every module the backend loads at BOOT must resolve from
 * the image it is about to ship in.
 *
 * Why this exists (measured, not assumed — f17-backend-image-sharp,
 * 2026-09-15): `medusa build` copies apps/backend/package.json VERBATIM into
 * .medusa/server/package.json (@medusajs/framework 2.19.0,
 * dist/build-tools/compiler.js:360 — a plain file copy, no dependency
 * filtering), and the Dockerfile's runtime stage installs from that copy with
 * `npm install --omit=dev`. A package declared under devDependencies but
 * imported at module scope by a file Medusa loads at boot therefore compiles
 * fine, builds fine, pushes fine, and kills the container on its first start:
 *
 *   Error starting server: An error occurred while registering API Routes.
 *   Error: Cannot find module 'sharp'
 *   Require stack: /app/src/api/tenants/branding/upload/route.js
 *
 * `restart: unless-stopped` turns that into a crash loop on the live host,
 * which is the most expensive place to find out. This script moves the
 * discovery into `docker build`.
 *
 * How it decides, and why it cannot fail on something harmless:
 *
 * - It REQUIRES each compiled module, the same way Medusa's own loaders do,
 *   so what it exercises is the real import graph rather than a regex guess
 *   at it. A lazy `require()` inside a function body (this repo has one:
 *   src/scripts/import-cherkashina-reviews.ts:93 requires `pg`, a
 *   devDependency, inside a helper that only an operator ever runs) is NOT
 *   executed by a plain require of the module, and is correctly ignored.
 * - Only MODULE_NOT_FOUND fails the build. Anything else a module throws at
 *   import time (a missing DATABASE_URL, a config assertion) is a fact about
 *   the empty build environment, not about the image's contents, so it is
 *   reported and tolerated.
 *
 * Usage:  node verify-runtime-modules.mjs [root]      (root defaults to cwd)
 *
 * The script ships inside the runtime image as well, so the same check can be
 * re-run against a live container: `docker exec mt-backend node
 * /usr/local/bin/verify-runtime-modules.mjs /app`.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(process.argv[2] ?? process.cwd());
const require_ = createRequire(path.join(root, "package.json"));

/**
 * The directories whose every file is loaded before the server answers its
 * first request. The first seven are Medusa's own convention directories
 * (AGENTS.md "Directory Structure"); `admin` is deliberately absent because
 * it is the Admin front end, bundled by vite rather than required by node.
 * `scripts` and `migration-scripts` are here because docker-entrypoint.sh
 * runs three of their files through `medusa exec` before `medusa start`.
 */
const BOOT_DIRS = [
  "src/api",
  "src/subscribers",
  "src/jobs",
  "src/links",
  "src/modules",
  "src/workflows",
  "src/scripts",
  "src/migration-scripts",
];

const BOOT_FILES = ["medusa-config.js"];

/** Seed payloads, not code. `medusa build` copies them in as-is. */
const SKIP_DIRS = new Set(["data", "node_modules"]);

function collect(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(full, out);
    } else if (entry.name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

const files = [];
for (const dir of BOOT_DIRS) collect(path.join(root, dir), files);
for (const file of BOOT_FILES) {
  const full = path.join(root, file);
  if (fs.existsSync(full)) files.push(full);
}
files.sort();

if (files.length === 0) {
  console.error(
    `verify-runtime-modules: 0 compiled modules found under ${root}. ` +
      `Expected the output of \`medusa build\` (a src/ tree of .js files). ` +
      `Checked: ${BOOT_DIRS.join(", ")}.`
  );
  process.exit(1);
}

const missing = [];
const tolerated = [];

for (const file of files) {
  try {
    require_(file);
  } catch (error) {
    const relative = path.relative(root, file);
    if (error?.code === "MODULE_NOT_FOUND") {
      const specifier = /Cannot find module '([^']+)'/.exec(error.message)?.[1] ?? "?";
      missing.push({ file: relative, specifier });
    } else {
      tolerated.push({ file: relative, error: `${error?.name ?? "Error"}: ${error?.message ?? error}` });
    }
  }
}

for (const entry of tolerated) {
  console.log(`verify-runtime-modules: tolerated (not a resolution failure) ${entry.file} — ${entry.error.split("\n")[0]}`);
}

if (missing.length > 0) {
  console.error(
    `\nverify-runtime-modules: ${missing.length} of ${files.length} boot modules cannot resolve an import inside this image:\n`
  );
  for (const entry of missing) {
    console.error(`  ${entry.file}  ->  cannot find module '${entry.specifier}'`);
  }
  console.error(
    `\nEach of these kills the container on start. The usual cause is a package declared\n` +
      `under devDependencies in apps/backend/package.json while a boot-loaded file imports it\n` +
      `at module scope: the runtime stage installs with \`npm install --omit=dev\`, so the\n` +
      `package never reaches the image. Move it to dependencies (and refresh pnpm-lock.yaml\n` +
      `with \`pnpm install --lockfile-only\`, or the build stage's --frozen-lockfile fails).\n`
  );
  process.exit(1);
}

console.log(
  `verify-runtime-modules: ${files.length} boot modules required, all imports resolve` +
    (tolerated.length ? ` (${tolerated.length} threw a non-resolution error, tolerated)` : "")
);
