import fs from "node:fs";
import path from "node:path";

/**
 * A guard, not a proof. Every handler under `/tenants` has to take the shop it
 * works for from the actor in the token (`req.auth_context`), and nothing but
 * review held that until now (architecture review 2026-09-21, finding T-3).
 *
 * The rule this spec holds: the imports of a `route.ts`, followed through
 * `src/api`, reach a file that reads `auth_context`. A route that reaches none
 * has to be named in `UNSCOPED_ON_PURPOSE` with the reason it needs no shop.
 * So a new route that forgets its scope fails here instead of in production.
 *
 * What it does not hold: that the scope read is USED in every query of the
 * handler. That stays with the integration specs of each route.
 */

const TENANTS_ROOT = path.resolve(__dirname, "..");
const API_ROOT = path.resolve(TENANTS_ROOT, "..");

const UNSCOPED_ON_PURPOSE: Record<string, string> = {
  "collections/route.ts":
    "Admin list handler re-exported. Review finding T-5: collections are not linked to a shop yet.",
  "fulfillment-providers/route.ts": "Global reference data, Admin list handler re-exported.",
  "price-preferences/route.ts": "Global reference data, Admin list handler re-exported.",
  "product-tags/route.ts": "Global reference data, Admin list handler re-exported.",
  "product-types/route.ts": "Global reference data, Admin list handler re-exported.",
  "promotions/rule-attribute-options/[rule_type]/route.ts":
    "Global reference data, Admin list handler re-exported.",
  "regions/route.ts": "Global reference data, Admin list handler re-exported.",
  "shipping-methods/regions/route.ts": "A static table of regions, no query at all.",
  "shipping-options/route.ts":
    "Admin list handler re-exported. Review finding T-5: options belong to the store's fulfillment sets, not to a shop.",
  "shipping-profiles/route.ts": "Global reference data, Admin list handler re-exported.",
};

const walk = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
    );

const relativeImports = (source: string): string[] =>
  [...source.matchAll(/from\s+"(\.[^"]+)"/g)].map((match) => match[1]);

const resolveImport = (from: string, specifier: string): string | null => {
  const base = path.resolve(path.dirname(from), specifier);

  return [`${base}.ts`, path.join(base, "index.ts")].find((file) => fs.existsSync(file)) ?? null;
};

const readsActor = (file: string, seen = new Set<string>()): boolean => {
  if (seen.has(file)) {
    return false;
  }
  seen.add(file);

  const source = fs.readFileSync(file, "utf8");
  if (source.includes("auth_context")) {
    return true;
  }

  return relativeImports(source).some((specifier) => {
    const target = resolveImport(file, specifier);

    return Boolean(target) && target!.startsWith(API_ROOT) && readsActor(target!, seen);
  });
};

const routes = walk(TENANTS_ROOT).filter((file) => path.basename(file) === "route.ts");
const unscoped = routes
  .filter((file) => !readsActor(file))
  .map((file) => path.relative(TENANTS_ROOT, file).split(path.sep).join("/"));

describe("tenant scope guard over /tenants routes", () => {
  it("finds the routes it guards", () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it("lets no route skip the actor of the token unless it is named with a reason", () => {
    expect(unscoped.filter((route) => !(route in UNSCOPED_ON_PURPOSE))).toEqual([]);
  });

  it("names no route that has since taken a scope or gone", () => {
    expect(Object.keys(UNSCOPED_ON_PURPOSE).filter((route) => !unscoped.includes(route))).toEqual(
      [],
    );
  });

  it("names only re-exports and static tables, never a handler that queries", () => {
    const querying = Object.keys(UNSCOPED_ON_PURPOSE).filter((route) =>
      /query\.graph|\.resolve\(/.test(fs.readFileSync(path.join(TENANTS_ROOT, route), "utf8")),
    );

    expect(querying).toEqual([]);
  });
});
