import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * The repository lint behind the read-only invariant (w11-ozon-readonly-client).
 *
 * `transport.ts` can only send registered reads, but that is worth nothing if
 * a second file quietly calls Ozon with a bare `fetch`. This scans the
 * application sources and fails when any file other than the transport holds a
 * network call site next to an Ozon host.
 *
 * It is meant to be RED the moment someone adds one: the PR for this task
 * shows the red run (a second call site added on purpose) next to the green
 * one after removing it.
 *
 * Tests are skipped, and only tests: a spec is not a code path the product
 * ever runs, and `transport.unit.spec.ts` legitimately holds both a `fetch`
 * spy and the Ozon host. Everything else under `src`, including scripts,
 * fixtures, subscribers and API routes, is scanned.
 */

const REPO_ROOT = path.resolve(__dirname, "../../../../../..");

const SCANNED_ROOTS = ["apps/backend/src", "apps/storefront/src", "apps/tenant-panel/src"];

/** The one file allowed to hold an Ozon call site. */
const ALLOWED_CALL_SITE = path.join("apps", "backend", "src", "modules", "ozon", "transport.ts");

/**
 * An Ozon host. `api-seller.ozon.ru` is the API; `ozon.ru` on its own also
 * catches `docs.ozon.ru` and the CDN, which is deliberate: a file that has a
 * reason to hold an Ozon URL and a reason to open a socket is a file worth
 * looking at, even when the URL is the documentation.
 */
const OZON_HOST = /\bozon\.ru\b/i;

/** Something that opens a connection. Deliberately broad. */
const CALL_SITE = /\bfetch\s*\(|\baxios\b|\brequest\s*\(|\bhttps?\.(?:get|request)\s*\(|\bgot\s*\(/;

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const walk = (dir: string, found: string[] = []): string[] => {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }

  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name === ".medusa") {
      continue;
    }
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, found);
    } else if (SOURCE_EXTENSIONS.has(path.extname(name))) {
      found.push(full);
    }
  }

  return found;
};

describe("Ozon is reachable from exactly one file", () => {
  const files = SCANNED_ROOTS.flatMap((root) => walk(path.join(REPO_ROOT, root)));

  it("finds the sources it claims to scan", () => {
    // A scan that silently found nothing would pass every assertion below
    // while proving nothing at all (rule 20a: zero is not empty).
    expect(files.length).toBeGreaterThan(500);
    expect(files.some((file) => file.endsWith(ALLOWED_CALL_SITE))).toBe(true);
  });

  it("has no second call site", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const relative = path.relative(REPO_ROOT, file);
      if (
        relative.endsWith(ALLOWED_CALL_SITE) ||
        relative.includes(`${path.sep}__tests__${path.sep}`)
      ) {
        continue;
      }

      const source = readFileSync(file, "utf8");
      if (OZON_HOST.test(source) && CALL_SITE.test(source)) {
        offenders.push(relative);
      }
    }

    expect(offenders).toEqual([]);
  });
});
