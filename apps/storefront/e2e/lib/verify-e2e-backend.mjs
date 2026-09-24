import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { Client } from "pg"

/**
 * Global setup for every `e2e/*` suite (t-2026-09-24-n1, after the night's own
 * incident): refuses to run a single test unless the storefront build under
 * test is DEMONSTRABLY talking to the isolated e2e database, not the shared
 * stand.
 *
 * What actually happened without this guard: two branches' worth of `next
 * build` ran before `apps/storefront/.env.local` was written for the e2e
 * stand. `NEXT_PUBLIC_MEDUSA_BACKEND_URL` is inlined into the build at COMPILE
 * time, so the build kept whatever a LEFTOVER `.env.local` from earlier work
 * on that worktree had baked in already (`http://localhost:9121`, another
 * session's backend, itself pointed at `upready_store_t2026092101` — the
 * shared stand). `next start` afterwards never re-reads the new `.env.local`,
 * so the mistake was silent: every fetch the storefront made went to a live,
 * shared database, and it looked exactly like cherkashino because it WAS the
 * same tenant, just the wrong copy of it. Twelve real checkouts landed there
 * before anyone noticed. Cleaned up in the incident report; this file is the
 * fix for the INPUT, not a patch on the symptom.
 *
 * Two independent checks, either one failing stops the run before it can
 * write anything:
 *   1. `E2E_DATABASE_URL` must resolve to a database whose name contains
 *      "e2e" (the convention every legitimate clone in this repo follows,
 *      e.g. `upready_store_e2e`). A database named after a night order
 *      (`upready_store_t2026092101`) or anything else fails this outright.
 *   2. The expected backend origin (`E2E_EXPECTED_BACKEND_URL`, e.g.
 *      `http://localhost:9131`) must appear literally inside the storefront's
 *      OWN compiled output (`.next/standalone/**\/server` if present, else
 *      `.next/server`) — this is exactly the grep that found the bug by hand;
 *      codified here so it runs before every suite instead of only when
 *      someone happens to go looking.
 */

const FORBIDDEN_DB_HINT =
  /^upready_store_t\d+$/ // the "night stand" naming convention (rule s8) — a database named after an order/task, not a clone

async function verifyDatabase() {
  const databaseUrl = process.env.E2E_DATABASE_URL
  if (!databaseUrl) {
    throw new Error(
      "E2E_DATABASE_URL is not set. Every e2e/* suite needs it, even the ones " +
        "that do not write to Postgres directly, because this guard uses it to " +
        "confirm the storefront under test is not secretly talking to the " +
        "shared stand. Point it at your own disposable clone " +
        "(postgres://…/upready_store_e2e), never at upready_store_t<order-id>."
    )
  }

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  let dbName
  try {
    const result = await client.query("SELECT current_database() AS name")
    dbName = result.rows[0]?.name
  } finally {
    await client.end()
  }

  if (!dbName || !/e2e/i.test(dbName) || FORBIDDEN_DB_HINT.test(dbName)) {
    throw new Error(
      `E2E_DATABASE_URL resolves to database "${dbName}", which does not look ` +
        `like an isolated e2e clone (expected a name containing "e2e", e.g. ` +
        `"upready_store_e2e"). Refusing to run: this is exactly the class of ` +
        `mistake that put 12 real checkouts in the shared stand database on ` +
        `2026-09-24. Clone the stand into a database named *_e2e and point ` +
        `E2E_DATABASE_URL at that instead.`
    )
  }
}

/** Every `.js` file under a directory, recursively — `.next/server` is a few thousand small chunk files, no single manifest to trust. */
function listJsFiles(dir) {
  const out = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      out.push(...listJsFiles(full))
    } else if (entry.endsWith(".js")) {
      out.push(full)
    }
  }
  return out
}

function verifyBuiltBackendUrl() {
  const expected = process.env.E2E_EXPECTED_BACKEND_URL
  if (!expected) {
    throw new Error(
      "E2E_EXPECTED_BACKEND_URL is not set — the origin the storefront build " +
        'under test should have inlined for NEXT_PUBLIC_MEDUSA_BACKEND_URL ' +
        '(e.g. "http://localhost:9131"). Without it there is nothing to check ' +
        "the compiled build against."
    )
  }

  const storefrontRoot = process.cwd()
  const candidateServerDirs = [
    join(storefrontRoot, ".next", "standalone", "apps", "storefront", ".next", "server"),
    join(storefrontRoot, ".next", "server"),
  ]

  const searched = []
  for (const dir of candidateServerDirs) {
    const files = listJsFiles(dir)
    if (files.length === 0) continue
    searched.push(dir)
    for (const file of files) {
      if (readFileSync(file, "utf8").includes(expected)) {
        return
      }
    }
  }

  if (searched.length === 0) {
    throw new Error(
      `No compiled server output found under either of:\n  ${candidateServerDirs.join("\n  ")}\n` +
        "Run `npx next build` from apps/storefront before the e2e suite."
    )
  }

  throw new Error(
    `The compiled storefront build does not contain "${expected}" anywhere ` +
      `under:\n  ${searched.join("\n  ")}\n` +
      "NEXT_PUBLIC_MEDUSA_BACKEND_URL is inlined at build time: if apps/storefront/.env.local " +
      "was written or changed AFTER the last `next build`, the build still has " +
      "whatever URL was there before (a leftover from earlier work on this " +
      "worktree, in the incident that prompted this check). Write .env.local " +
      "FIRST, then `npx next build`, then run this suite."
  )
}

export default async function globalSetup() {
  await verifyDatabase()
  verifyBuiltBackendUrl()
}
