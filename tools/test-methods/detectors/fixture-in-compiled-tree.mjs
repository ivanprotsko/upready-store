/**
 * tm-003 — a throwaway acceptance fixture parked in the tree the product image
 * is compiled from.
 *
 * The bug this method was extracted from (f12-owner-raw-keys, PR #50, and the
 * deploy it broke, d04-deploy-mt-4 report section 10): the acceptance session
 * needed one order on a scratch database, wrote
 * `apps/backend/src/scripts/f12-seed-test-order.ts` for it, and committed it.
 * Its own header says what it is: "acceptance fixture ONLY … Never run against
 * a real database". `medusa build` compiles the whole of `src/`, so the next
 * deploy died on the fixture's types:
 *
 *   src/scripts/f12-seed-test-order.ts:55:16 - error TS2322:
 *     Type '{ id: string[]; }' is not assignable to type 'undefined'.
 *   ERROR: process "/bin/sh -c npx medusa build --lint false …" exit code: 1
 *
 * The live host stayed on the previous commit and the whole wave of fixes
 * behind it did not ship. Nothing in the PR that carried the fixture was
 * wrong: it was measured, reviewed and merged. The cost landed on the deploy,
 * which is the most expensive place to find a type error in a file the product
 * never runs.
 *
 * The class: a file that exists to be run once, by a person, against a scratch
 * database belongs outside the directory the production build compiles. Two
 * checks, because a fixture announces itself in two ways.
 *
 *  A. `fixture-marker-in-compiled-tree` — the file says so in its own words
 *     ("fixture ONLY", "throwaway", "never against a real database").
 *  B. `fixture-named-file-in-compiled-tree` — the file name says so
 *     (`seed-test`, `test-seed`, a task-id prefix on a seed script).
 *
 * Unit tests are NOT this class and are excluded: `*.test.ts`, `*.spec.ts` and
 * `__tests__` are part of the repository's own quality gates and live beside
 * the code they cover on purpose.
 */
import fs from "node:fs";
import path from "node:path";
import { walkFiles, readIfPresent } from "../lib/walk.mjs";

/**
 * Phrases that can only describe THE FILE, never something the file talks
 * about. The bare word "throwaway" is deliberately absent: measured over this
 * repository it matches `src/workflows/tenant/provision-tenant-warehouse/
 * steps/resolve-default-shipping-profile.ts`, whose doc comment says "a
 * throwaway integration-test database has no profile" — the adjective belongs
 * to a database, the file is production code, and counting the word alone
 * turns a correct comment into a finding. Every marker below names a fixture,
 * a one-off run or a script nobody wired into the product.
 */
const DEFAULT_CONTENT_MARKERS = [
  "fixture ONLY",
  "fixtures ONLY",
  "acceptance fixture",
  "throwaway fixture",
  "throwaway data",
  "one-off fixture",
  "never run against a real",
  "not wired into any pnpm script",
  "run once with",
];

const DEFAULT_NAME_MARKERS = ["seed-test", "test-seed", "-fixture", "fixture-"];

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/** The apps whose `src` a production build compiles. */
function compiledTrees(root, config) {
  if (config.trees?.length) return config.trees;
  const appsDir = config.appsDir ?? "apps";
  const exclude = new Set(config.excludeApps ?? []);
  let entries = [];
  try {
    entries = fs.readdirSync(path.join(root, appsDir), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && !exclude.has(entry.name))
    .map((entry) => path.join(appsDir, entry.name, config.srcSubdir ?? "src"))
    .filter((tree) => fs.existsSync(path.join(root, tree)));
}

export const id = "tm-003";

export function run(root, config) {
  const trees = compiledTrees(root, config);
  const contentMarkers = config.contentMarkers ?? DEFAULT_CONTENT_MARKERS;
  const nameMarkers = config.nameMarkers ?? DEFAULT_NAME_MARKERS;
  const findings = [];
  let scanned = 0;

  if (!trees.length) {
    return { status: "skipped", reason: "no compiled app tree in this root", findings, checked: { trees, files: 0 } };
  }

  for (const tree of trees) {
    const files = walkFiles(root, tree, { skip: ["__tests__", "integration-tests"] }).filter(
      (file) => !TEST_FILE.test(file)
    );
    for (const file of files) {
      scanned += 1;
      const base = path.basename(file);
      const nameHit = nameMarkers.find((marker) => base.includes(marker));
      const src = readIfPresent(root, file);
      if (src === null) continue;

      // The markers a fixture writes about itself live in its doc comment, so
      // this check reads the raw file rather than a comment-blanked view. The
      // comment IS the evidence here.
      const contentHits = contentMarkers.filter((marker) =>
        src.toLowerCase().includes(marker.toLowerCase())
      );

      if (contentHits.length) {
        const offset = src.toLowerCase().indexOf(contentHits[0].toLowerCase());
        findings.push({
          check: "fixture-marker-in-compiled-tree",
          severity: "red",
          file,
          line: src.slice(0, offset).split("\n").length,
          evidence: contentHits.join(", "),
          message: `${file} calls itself a throwaway fixture and sits in ${tree}, which the production build compiles. A type error in it fails the image build, and the product never runs the file. Move it out of the compiled tree (${config.suggestedHome ?? "apps/<app>/scripts/fixtures/"}).`,
        });
        continue;
      }

      if (nameHit) {
        findings.push({
          check: "fixture-named-file-in-compiled-tree",
          severity: "red",
          file,
          line: 1,
          evidence: `file name contains "${nameHit}"`,
          message: `${file} is named as a test fixture and sits in ${tree}, which the production build compiles. Move it out of the compiled tree (${config.suggestedHome ?? "apps/<app>/scripts/fixtures/"}).`,
        });
      }
    }
  }

  return {
    status: findings.length ? "red" : "green",
    findings,
    checked: { trees, files: scanned },
  };
}
