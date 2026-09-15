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
 * 2. Only a NAMED file may call `wbWrite` or `marketplaceWrite`. w20 built
 *    the mechanism with that list empty; w21-w23 add the callers, one
 *    operation class at a time, each with its own acceptance, and each one is
 *    written into `REGISTERED_CALLERS` below by the task that adds it. A
 *    caller that is not on the list fails this test, so "who can mutate
 *    Wildberries" stays a question with a written answer rather than a grep.
 *
 * Neither claim is "живой записи нет" on its own. That one holds because the
 * live gate `WB_WRITE_LIVE` is set by no deployment and no shop has a
 * `wildberries_write` credential, which is claim 3 below.
 */

const REPO_ROOT = path.resolve(__dirname, "../../../../../..");

const SCANNED_ROOTS = ["apps/backend/src", "apps/storefront/src", "apps/tenant-panel/src"];

const WRITE_TRANSPORT = path.join("apps", "backend", "src", "modules", "wb-write", "write-transport.ts");
const READ_TRANSPORT = path.join("apps", "backend", "src", "modules", "wb", "transport.ts");

/**
 * The production callers, each added by the task that built it. Adding a line
 * here is the moment somebody decides a new part of the product may mutate a
 * marketplace, which is why it is a list in a test and not a convention.
 */
const REGISTERED_CALLERS = [
  // w22-wb-write-feedback-answers: answering a review, and marking a customer
  // question viewed. Class `feedback_answers`, dry run today.
  path.join("apps", "backend", "src", "api", "tenants", "wb", "feedback-answers", "send", "route.ts"),
];

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

  it("has no caller of wbWrite or marketplaceWrite outside the registered list", () => {
    const callers = relatives.filter((relative) => {
      if (WRITE_MODULE_DIRS.some((dir) => relative.startsWith(`${dir}${path.sep}`))) {
        return false;
      }
      const source = readFileSync(path.join(REPO_ROOT, relative), "utf8");
      return WRITE_CALL.test(source);
    });

    expect(callers.sort()).toEqual([...REGISTERED_CALLERS].sort());
  });

  it("finds every registered caller on disk", () => {
    // A path that stopped existing would make the assertion above pass by
    // being absent from both sides (rule 20a: zero is not empty).
    for (const caller of REGISTERED_CALLERS) {
      expect(relatives).toContain(caller);
    }
  });

  it("ships nothing that would SET the live env var", () => {
    // Claim 3, and the one "живой записи нет" now rests on: a production
    // caller exists from w22 onwards, so the sentence is no longer true
    // because nobody asks — it is true because the last gate stays shut.
    //
    // What is checkable here is what this repository SHIPS. An operator can
    // still export the variable by hand on a host, which is the point of it
    // being a deliberate act; the environment of the live stands is checked
    // where it lives, not from a unit test (rule 18f).
    const assignments = relatives.filter((relative) => {
      if (relative.includes(`${path.sep}__tests__${path.sep}`)) {
        return false;
      }
      const source = readFileSync(path.join(REPO_ROOT, relative), "utf8");
      // An assignment, not a mention: `write-transport.ts` names the variable
      // in prose and the panel shows it to the owner, and neither sets it.
      return /process\.env\s*(?:\.WB_WRITE_LIVE|\[\s*["\u0027`]WB_WRITE_LIVE)[^=!<>]*=[^=]/.test(source);
    });

    expect(assignments).toEqual([]);
  });

  it("names the live env var in no env template, workflow or entrypoint", () => {
    const shipped = [
      "apps/backend/.env.template",
      "apps/storefront/.env.template",
      "apps/tenant-panel/.env.template",
      "apps/backend/docker-entrypoint.sh",
      ".github/workflows/update.yaml",
      ".github/workflows/notify-deploy.yml",
    ];

    const found = shipped.filter((relative) => {
      // A file that vanished must fail loudly rather than quietly pass
      // (rule 20a: zero is not empty).
      const source = readFileSync(path.join(REPO_ROOT, relative), "utf8");
      return source.includes("WB_WRITE_LIVE");
    });

    expect(found).toEqual([]);
  });
});
