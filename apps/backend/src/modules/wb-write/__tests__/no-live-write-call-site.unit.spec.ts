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
 * 2. The callers of `wbWrite` / `marketplaceWrite` outside the write modules
 *    are exactly the ones listed in `REGISTERED_CALLERS` below. w20 built the
 *    mechanism; w21-w23 add the callers, one operation class at a time, each
 *    with its own acceptance, and each arriving as ONE line here — so a caller
 *    that slipped in unreviewed turns this suite red.
 * 3. No source in this repository sets the live gate. `WB_WRITE_LIVE` is
 *    READ in one place and written in none, which is why every answer the
 *    callers of claim 2 can produce today is a dry run.
 */

const REPO_ROOT = path.resolve(__dirname, "../../../../../..");

const SCANNED_ROOTS = ["apps/backend/src", "apps/storefront/src", "apps/tenant-panel/src"];

const WRITE_TRANSPORT = path.join("apps", "backend", "src", "modules", "wb-write", "write-transport.ts");
const READ_TRANSPORT = path.join("apps", "backend", "src", "modules", "wb", "transport.ts");

/**
 * The reviewed callers, one line per operation class.
 *
 * Adding a file here is the reviewable act: it says "this class of mutation
 * now has a caller", and it is what an acceptor greps for when asking what a
 * branch made reachable.
 */
const REGISTERED_CALLERS = [
  // w22-wb-write-feedback-answers: answering a review and marking a customer
  // question viewed, class `feedback_answers`.
  path.join("apps", "backend", "src", "api", "tenants", "wb", "feedback-answers", "send", "route.ts"),
  // w23-wb-write-fbs-orders: the FBS desk, class `fbs_orders`.
  path.join("apps", "backend", "src", "api", "tenants", "wb", "fbs-orders", "actions", "route.ts"),
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

  it("has no caller of wbWrite or marketplaceWrite besides the registered ones", () => {
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
    // A path that has been renamed would otherwise make the assertion above
    // pass by BOTH sides shrinking to nothing (rule 20a: zero is not empty).
    for (const caller of REGISTERED_CALLERS) {
      expect(relatives).toContain(caller);
    }
  });

  it("has no source that turns the live gate on", () => {
    // An ASSIGNMENT into this process's environment, which is the only way a
    // Node source can open gate (e) at runtime. Deliberately not a bare
    // `WB_WRITE_LIVE=1`: that string stands in the head comments of the write
    // transport, of the desk route and of this very file, and a lint that
    // flags the prose describing an invariant is a lint nobody keeps.
    const ASSIGNS_LIVE_ENV =
      /process\.env\s*(?:\.WB_WRITE_LIVE\b|\[\s*["']WB_WRITE_LIVE["']\s*\])\s*=(?!=)/;

    // This file holds the assignment as a STRING, in the case below that
    // proves the regex can fail. Scanning it would flag the lint's own
    // evidence (guard class 8b, self-inflicted-trigger).
    const self = path.relative(REPO_ROOT, __filename).replace(/\.js$/, ".ts");
    expect(relatives).toContain(self);

    const setters = relatives
      .filter((relative) => relative !== self)
      .filter((relative) =>
        ASSIGNS_LIVE_ENV.test(readFileSync(path.join(REPO_ROOT, relative), "utf8")),
      );

    expect(setters).toEqual([]);
  });

  it("would catch such an assignment if one appeared", () => {
    // The scan above proves nothing unless it can fail (rule 20a): a regex
    // that matches nothing would pass on an empty repository too.
    const ASSIGNS_LIVE_ENV =
      /process\.env\s*(?:\.WB_WRITE_LIVE\b|\[\s*["']WB_WRITE_LIVE["']\s*\])\s*=(?!=)/;

    expect(ASSIGNS_LIVE_ENV.test('process.env.WB_WRITE_LIVE = "1";')).toBe(true);
    expect(ASSIGNS_LIVE_ENV.test('process.env["WB_WRITE_LIVE"] = "1";')).toBe(true);
    expect(ASSIGNS_LIVE_ENV.test('if (process.env.WB_WRITE_LIVE === "1") {')).toBe(false);
    expect(ASSIGNS_LIVE_ENV.test("// set WB_WRITE_LIVE=1 to send for real")).toBe(false);
  });

  it("names the live env var in no env template, workflow or entrypoint", () => {
    // The regex above scans SOURCES; a deployment opens gate (e) from a file
    // no Node source ever parses (w22-wb-write-feedback-answers). These are
    // the ones this repository ships.
    const shipped = [
      "apps/backend/.env.template",
      "apps/storefront/.env.template",
      "apps/tenant-panel/.env.template",
      "apps/backend/docker-entrypoint.sh",
      ".github/workflows/update.yaml",
      ".github/workflows/notify-deploy.yml",
    ];

    const found = shipped.filter((relative) =>
      // A file that vanished throws here rather than quietly passing
      // (rule 20a: zero is not empty).
      readFileSync(path.join(REPO_ROOT, relative), "utf8").includes("WB_WRITE_LIVE"),
    );

    expect(found).toEqual([]);
  });
});
