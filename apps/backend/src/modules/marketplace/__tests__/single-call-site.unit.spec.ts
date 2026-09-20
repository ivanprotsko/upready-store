import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { MARKETPLACES, MARKETPLACE_HOST_SUFFIXES } from "../registry";

/**
 * THE REPO LINT, GENERALIZED (w12-marketplace-core, spec 2.5, belt 5).
 *
 * `modules/wb/transport.ts` and `modules/ozon/transport.ts` can each only send
 * a registered read, which is worth nothing if a second file quietly calls a
 * marketplace with a bare `fetch`. `wb/__tests__/transport-single-call-site.unit.spec.ts`
 * and its Ozon twin each scan for their own host, and each of them names that
 * host BY HAND — so the third marketplace would arrive uncovered, which is
 * exactly the shape of defect this task exists to remove (rule 20).
 *
 * This file takes its hosts from `MARKETPLACES`. Registering an adapter puts
 * its hosts under the lint WITHOUT this test being edited, and the PR shows
 * that by adding a host to a copy of the registry and watching the lint cover
 * it.
 *
 * Tests are skipped, and only tests: a spec is not a code path the product
 * runs, and the transports' own suites legitimately hold both a `fetch` spy
 * and marketplace hosts.
 */

const REPO_ROOT = path.resolve(__dirname, "../../../../../..");

const SCANNED_ROOTS = ["apps/backend/src", "apps/storefront/src", "apps/tenant-panel/src"];

/**
 * The files allowed to hold a marketplace call site.
 *
 * One READ transport per adapter, plus the write transport of
 * w20-wb-write-core — which can only be reached through the five gates of
 * `modules/marketplace-write/execute.ts`, the last of which is an environment
 * variable no deployment sets, and which has no production caller
 * (`modules/wb-write/__tests__/no-live-write-call-site.unit.spec.ts`).
 */
const ALLOWED_CALL_SITES = [
  path.join("apps", "backend", "src", "modules", "wb", "transport.ts"),
  path.join("apps", "backend", "src", "modules", "ozon", "transport.ts"),
  path.join("apps", "backend", "src", "modules", "wb-write", "write-transport.ts"),
];

/** Something that opens a connection. Deliberately broad. */
const CALL_SITE = /\bfetch\s*\(|\baxios\b|\brequest\s*\(|\bhttps?\.(?:get|request)\s*\(|\bgot\s*\(/;

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

/**
 * A host pattern built from one suffix of the registry. A suffix may be a
 * whole host (`api-seller.ozon.ru`) or a domain suffix (`.wildberries.ru`),
 * and both have to match the same way a URL in source would.
 */
export const hostPattern = (suffix: string): RegExp =>
  new RegExp(suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

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

const files = SCANNED_ROOTS.flatMap((root) => walk(path.join(REPO_ROOT, root)));

/** Every file that both names one of these hosts and opens a connection. */
const offendersFor = (suffixes: readonly string[]): string[] => {
  const patterns = suffixes.map(hostPattern);
  const offenders: string[] = [];

  for (const file of files) {
    const relative = path.relative(REPO_ROOT, file);
    if (
      ALLOWED_CALL_SITES.some((allowed) => relative.endsWith(allowed)) ||
      relative.includes(`${path.sep}__tests__${path.sep}`)
    ) {
      continue;
    }

    const source = readFileSync(file, "utf8");
    if (patterns.some((pattern) => pattern.test(source)) && CALL_SITE.test(source)) {
      offenders.push(relative);
    }
  }

  return offenders;
};

describe("a marketplace is reachable only from its own transport", () => {
  it("finds the sources it claims to scan", () => {
    // A scan that silently found nothing would pass every assertion below
    // while proving nothing at all (rule 20a: zero is not empty).
    expect(files.length).toBeGreaterThan(500);
    for (const allowed of ALLOWED_CALL_SITES) {
      expect(files.some((file) => file.endsWith(allowed))).toBe(true);
    }
  });

  it("takes its host list from the registry rather than from this file", () => {
    // The claim this suite is built on. If the list ever stops coming from
    // `MARKETPLACES`, a new adapter goes uncovered and nothing says so.
    expect(MARKETPLACE_HOST_SUFFIXES.length).toBe(
      new Set(MARKETPLACES.flatMap((adapter) => adapter.hostSuffixes)).size,
    );
    for (const adapter of MARKETPLACES) {
      for (const suffix of adapter.hostSuffixes) {
        expect(MARKETPLACE_HOST_SUFFIXES).toContain(suffix);
      }
    }
  });

  it.each(MARKETPLACES.map((adapter) => [adapter.id, adapter.hostSuffixes] as const))(
    "%s has no second call site",
    (_id, suffixes) => {
      expect(offendersFor(suffixes)).toEqual([]);
    },
  );

  it("would cover a host that is registered later, with no edit here", () => {
    /**
     * The generalisation, demonstrated rather than asserted.
     *
     * `api.telegram.org` belongs to no adapter and is not in the registry.
     * `apps/backend/src/tenant-notifications/telegram.ts` names it and calls
     * `fetch` — a perfectly legitimate call site for a service that is not a
     * marketplace. Handing that suffix to the SAME function the adapters' own
     * hosts go through finds that file at once, with nothing in this file
     * changed.
     *
     * So: register a third marketplace in `registry.ts`, and its hosts are
     * under this lint by registration alone. Registering nothing leaves the
     * legitimate Telegram call site alone, which is why it is still green
     * above.
     */
    const asIfRegistered = ["api.telegram.org"];
    const offenders = offendersFor(asIfRegistered);

    expect(offenders).toContain(
      path.join("apps", "backend", "src", "tenant-notifications", "telegram.ts"),
    );
    /** And it is NOT an offender for the hosts actually registered today. */
    expect(offendersFor(MARKETPLACE_HOST_SUFFIXES)).toEqual([]);
  });
});
