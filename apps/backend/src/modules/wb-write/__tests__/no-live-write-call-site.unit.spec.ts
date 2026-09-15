import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * "Живой записи нет" as a test, not as a sentence in a report
 * (w20-wb-write-core).
 *
 * Two claims, both scanned rather than promised:
 *
 * 1. Only `wb-write/write-transport.ts` may hold a call site next to a
 *    Wildberries host, besides the read transport of w01. The read lint
 *    (`src/modules/wb/__tests__/transport-single-call-site.unit.spec.ts`)
 *    checks the same thing from the other side.
 * 2. Nothing outside the write modules and their tests calls `wbWrite` or
 *    `marketplaceWrite`. The task w20 builds the mechanism; w21-w23 add the
 *    callers, one operation class at a time, each with its own acceptance.
 *    Until then the repository cannot mutate Wildberries even with every gate
 *    open, because nobody asks it to.
 */

const REPO_ROOT = path.resolve(__dirname, "../../../../../..");

const SCANNED_ROOTS = ["apps/backend/src", "apps/storefront/src", "apps/tenant-panel/src"];

const WRITE_TRANSPORT = path.join("apps", "backend", "src", "modules", "wb-write", "write-transport.ts");
const READ_TRANSPORT = path.join("apps", "backend", "src", "modules", "wb", "transport.ts");

/** The two modules that own the mechanism. Their own files may name it. */
const WRITE_MODULE_DIRS = [
  path.join("apps", "backend", "src", "modules", "wb-write"),
  path.join("apps", "backend", "src", "modules", "marketplace-write"),
];

const WB_HOST = /wildberries\.ru|(^|[^a-z0-9.-])wb\.ru/i;
const CALL_SITE = /\bfetch\s*\(|\baxios\b|\brequest\s*\(|\bhttps?\.(?:get|request)\s*\(|\bgot\s*\(/;
/** A call, not a mention: the name followed by an argument list. */
const WRITE_CALL = /\b(?:wbWrite|marketplaceWrite)\s*\(/;

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

describe("the WB write path has no live caller", () => {
  const files = SCANNED_ROOTS.flatMap((root) => walk(path.join(REPO_ROOT, root)));
  const relatives = files.map((file) => path.relative(REPO_ROOT, file));

  it("finds the sources it claims to scan", () => {
    // A scan that silently found nothing would pass every assertion below
    // while proving nothing at all (rule 20a: zero is not empty).
    expect(files.length).toBeGreaterThan(500);
    expect(relatives).toContain(WRITE_TRANSPORT);
    expect(relatives).toContain(READ_TRANSPORT);
  });

  it("has exactly two files that can reach Wildberries at all", () => {
    const offenders = relatives.filter((relative) => {
      if (relative === WRITE_TRANSPORT || relative === READ_TRANSPORT) {
        return false;
      }
      if (relative.includes(`${path.sep}__tests__${path.sep}`)) {
        return false;
      }
      const source = readFileSync(path.join(REPO_ROOT, relative), "utf8");
      return WB_HOST.test(source) && CALL_SITE.test(source);
    });

    expect(offenders).toEqual([]);
  });

  it("has no production caller of wbWrite or marketplaceWrite", () => {
    const callers = relatives.filter((relative) => {
      if (WRITE_MODULE_DIRS.some((dir) => relative.startsWith(`${dir}${path.sep}`))) {
        return false;
      }
      const source = readFileSync(path.join(REPO_ROOT, relative), "utf8");
      return WRITE_CALL.test(source);
    });

    expect(callers).toEqual([]);
  });
});
