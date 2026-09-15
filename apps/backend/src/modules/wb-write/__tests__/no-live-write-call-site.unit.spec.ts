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
 * 2. The only callers of `wbWrite` or `marketplaceWrite` outside the write
 *    modules are the ones listed in `ALLOWED_CALLERS`. w20 built the mechanism
 *    with no caller at all; w21 added the first one (the store -> WB push for
 *    `stocks` and `prices`), and every later class arrives the same way, by
 *    being written down here with its own acceptance.
 * 3. `WB_WRITE_LIVE` is set nowhere in this repository. Now that a caller
 *    exists, THIS is the claim "живой записи нет" rests on: gate (e) of the
 *    write core reads that variable, no deployment sets it, and a `.env`, a
 *    compose file or a workflow that did would be caught here.
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

/**
 * The callers the repository has, one line each. A new class of mutation means
 * a new line here, which is what makes "who can ask for a write" a thing you
 * read rather than a thing you grep for.
 */
const ALLOWED_CALLERS = [path.join("apps", "backend", "src", "wb-write-diff", "push.ts")];

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

/** The env-carrying files a live gate could realistically be switched on in. */
const CONFIG_EXTENSIONS = new Set([".yml", ".yaml", ".env", ".template", ".example", ".sh"]);

const walkConfigs = (dir: string, found: string[] = []): string[] => {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }

  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name === ".medusa" || name === ".next") {
      continue;
    }
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      walkConfigs(full, found);
    } else if (CONFIG_EXTENSIONS.has(path.extname(name)) || name.startsWith(".env")) {
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

  it("has no production caller of wbWrite or marketplaceWrite beyond the listed ones", () => {
    const callers = relatives.filter((relative) => {
      if (WRITE_MODULE_DIRS.some((dir) => relative.startsWith(`${dir}${path.sep}`))) {
        return false;
      }
      if (relative.includes(`${path.sep}__tests__${path.sep}`)) {
        return false;
      }
      const source = readFileSync(path.join(REPO_ROOT, relative), "utf8");
      return WRITE_CALL.test(source);
    });

    expect(callers.sort()).toEqual([...ALLOWED_CALLERS].sort());
  });

  it("finds every listed caller on disk", () => {
    // A path that has been renamed would otherwise make the assertion above
    // pass while guarding nothing (rule 20a: zero is not empty).
    expect(relatives).toEqual(expect.arrayContaining(ALLOWED_CALLERS));
  });

  it("sets WB_WRITE_LIVE nowhere in the repository", () => {
    // The env-carrying files are not sources: `.env*`, compose YAML and the
    // workflow files are where a live gate would realistically be turned on.
    const configs = [
      ...walkConfigs(path.join(REPO_ROOT, "apps")),
      ...walkConfigs(path.join(REPO_ROOT, "deploy")),
      ...walkConfigs(path.join(REPO_ROOT, ".github")),
    ];

    expect(configs.length).toBeGreaterThan(10);

    // In a config file the variable is set by being written down at the start
    // of a line: `WB_WRITE_LIVE=1`, `WB_WRITE_LIVE: "1"`. The `(?!_)` keeps
    // `WB_WRITE_LIVE_ENV` out of it and `=(?!=)` keeps a comparison out.
    const inConfig = /^[\s-]*(?:export\s+)?WB_WRITE_LIVE(?!_)\s*(?:=(?!=)|:)\s*["']?1/m;

    const setInConfig = configs
      .map((file) => path.relative(REPO_ROOT, file))
      .filter((relative) => inConfig.test(readFileSync(path.join(REPO_ROOT, relative), "utf8")));

    expect(setInConfig).toEqual([]);

    // In a source file the only way to turn the gate on is to assign to the
    // process environment. A mention in a comment is not that, which is why
    // the variable's NAME is not what is searched for here (rule 8b: a
    // quoted mention is not a call).
    const inSource = /process\.env(?:\.WB_WRITE_LIVE\b|\[[^\]]*WB_WRITE_LIVE[^\]]*\])\s*=(?!=)/;

    const setInSource = relatives.filter((relative) => {
      if (relative.includes(`${path.sep}__tests__${path.sep}`)) {
        return false;
      }
      return inSource.test(readFileSync(path.join(REPO_ROOT, relative), "utf8"));
    });

    expect(setInSource).toEqual([]);
  });
});
