import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { MARKETPLACES } from "../registry";

/**
 * THE READ-ONLY PROOF OF «WILDBERRIES → ТОВАРЫ» (task-02 of mp-section-design).
 *
 * Criterion 7 of the task: opening the screen sends no request to Wildberries,
 * only our database is read. And Ivan's standing order of 2026-09-16 02:46
 * WITA: nothing is ever written to a marketplace. The belts are the ones
 * `price-stock-read-only.unit.spec.ts` set, over the files THIS screen's
 * requests run through:
 *
 *   1. the handlers export GET and nothing else;
 *   2. no handler or decision file can reach a marketplace: no `.read(`, no
 *      `runSync`, no `inspectCredentials` (asking an Ozon key what it may do
 *      IS a request), no `fetch`, no registered endpoint id, no mutation path.
 *
 * The endpoint ids and the mutation paths come from `MARKETPLACES`, so a third
 * adapter is covered by being registered (rule 20). The stand check of the
 * same criterion (`mp_api_call` before and after opening the screen) is in the
 * task report.
 */

const BACKEND_SRC = path.resolve(__dirname, "../../..");

const HANDLER_DIR = path.join(BACKEND_SRC, "api", "tenants", "marketplaces", "[marketplace]", "products");
const DECISION_MODULE = path.join(BACKEND_SRC, "modules", "marketplace", "products-list.ts");

const walk = (dir: string, found: string[] = []): string[] => {
  if (!existsSync(dir)) {
    return found;
  }
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, found);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
};

/** Comments are cut first: the explanations name the forbidden constructs on purpose (guard class 8b). */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const read = (file: string) => withoutComments(readFileSync(file, "utf8"));

const ROUTES = walk(HANDLER_DIR).filter((file) => file.endsWith("route.ts"));
const FILES = [...walk(HANDLER_DIR), DECISION_MODULE];

describe("«Товары» площадки: только наша база", () => {
  it("files are where the suite looks — otherwise it is green about nothing (rule 20a)", () => {
    expect(ROUTES).toHaveLength(2);
    expect(existsSync(DECISION_MODULE)).toBe(true);
  });

  it.each(ROUTES)("%s exports GET only", (file) => {
    const source = read(file);
    expect(source).toMatch(/export const GET\b/);
    for (const verb of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(source).not.toMatch(new RegExp(`export\\s+(?:const|async function)\\s+${verb}\\b`));
    }
  });

  it.each(FILES)("%s cannot call a marketplace", (file) => {
    const source = read(file);
    expect(source).not.toMatch(/\.read\s*\(/);
    expect(source).not.toMatch(/\brunSync\b/);
    expect(source).not.toMatch(/\binspectCredentials\b/);
    expect(source).not.toMatch(/\bfetch\s*\(|\baxios\b|\bgot\s*\(|\brequest\s*\(/);
  });

  it.each(FILES)("%s names no registered endpoint and no mutation path", (file) => {
    const source = read(file);
    for (const adapter of MARKETPLACES) {
      for (const endpoint of adapter.endpoints) {
        expect(source).not.toContain(`"${endpoint.id}"`);
      }
      for (const mutation of adapter.mutationDenyList) {
        expect(source).not.toContain(mutation.path);
      }
    }
  });
});
