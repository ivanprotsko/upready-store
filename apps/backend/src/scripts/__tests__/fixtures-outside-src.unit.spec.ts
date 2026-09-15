import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

/**
 * A one-off acceptance fixture or seed script must not live under
 * `apps/backend/src/`, and this is the gate that says so.
 *
 * `medusa build` type-checks and emits every file `tsconfig.json` includes,
 * not just the Medusa primitives: @medusajs/framework 2.19.0 builds its
 * program from `tsConfig.fileNames` and drops only the path segments
 * `integration-tests`, `test`, `unit-tests` and `src/admin`
 * (`dist/build-tools/compiler.js`, `#emitBuildOutput` and
 * `dist/build-tools/compiler-utils.js`, `isFileIgnored`). One type error in a
 * throwaway fixture therefore fails the build of the PRODUCTION image. That
 * is what `ba126e8` did: `src/scripts/f12-seed-test-order.ts:55` raised
 * TS2322 and the mt-backend image stopped building.
 *
 * Fixtures live in `apps/backend/scripts/fixtures/`, which `tsconfig.json`
 * excludes, so a type error there costs a fixture and not an image. Run one
 * with `npx medusa exec ./scripts/fixtures/<file>.ts` and type-check the
 * directory with `pnpm check:backend-fixtures`.
 */

/** Marker, and the word that names it in the failure message. */
const MARKERS: { name: string; pattern: RegExp }[] = [
  { name: "fixture ONLY", pattern: /fixture\s+only/i },
  { name: "seed-test", pattern: /seed-test/ },
];

const SKIP_DIRECTORIES = new Set(["node_modules", "__tests__", "integration-tests"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

type Finding = { file: string; marker: string };

/** Every source file under `root`, relative to it, with `__tests__` skipped. */
const listSourceFiles = (root: string): string[] => {
  const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return SKIP_DIRECTORIES.has(entry.name) ? [] : walk(full);
      }

      return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [path.relative(root, full)] : [];
    });

  return walk(root);
};

/** Files whose name or content carries a fixture marker. */
const findFixtures = (root: string, files: string[]): Finding[] =>
  files.flatMap((file) => {
    const content = readFileSync(path.join(root, file), "utf8");

    return MARKERS.filter(
      ({ pattern }) => pattern.test(path.basename(file)) || pattern.test(content),
    ).map(({ name }) => ({ file, marker: name }));
  });

const BACKEND_ROOT = path.resolve(__dirname, "../../..");
const SRC_ROOT = path.join(BACKEND_ROOT, "src");
const FIXTURE_HOME = "apps/backend/scripts/fixtures/";

describe("fixtures stay out of the compiled backend tree", () => {
  it("reads the whole src tree, so a clean result means something", () => {
    const files = listSourceFiles(SRC_ROOT);

    // Without this the test passes on a wrong root, an empty read or a typo in
    // SOURCE_EXTENSIONS, and reports it as "no fixtures found".
    expect(files.length).toBeGreaterThan(100);
  });

  it("finds no acceptance fixture or one-off seed script under src/", () => {
    const findings = findFixtures(SRC_ROOT, listSourceFiles(SRC_ROOT));

    expect(
      findings.map(
        ({ file, marker }) =>
          `apps/backend/src/${file} carries the marker "${marker}". ` +
          `medusa build compiles every file tsconfig.json includes, so a type ` +
          `error here fails the production image build. Move it to ` +
          `${FIXTURE_HOME} (excluded in apps/backend/tsconfig.json) and run it ` +
          `with npx medusa exec ./scripts/fixtures/<file>.ts.`,
      ),
    ).toEqual([]);
  });

  it("detects a fixture the moment one appears under src/", () => {
    const root = mkdtempSync(path.join(tmpdir(), "f18-fixture-gate-"));

    try {
      mkdirSync(path.join(root, "scripts"), { recursive: true });
      writeFileSync(
        path.join(root, "scripts", "seed-test-order.ts"),
        "export default async function seed() {}\n",
      );
      writeFileSync(
        path.join(root, "scripts", "by-content.ts"),
        "/** round-1 acceptance fixture ONLY, never against a real database. */\nexport default 1;\n",
      );
      writeFileSync(path.join(root, "scripts", "ordinary.ts"), "export default 2;\n");

      const files = listSourceFiles(root);
      const findings = findFixtures(root, files);

      expect(files.sort()).toEqual(
        ["scripts/by-content.ts", "scripts/ordinary.ts", "scripts/seed-test-order.ts"].sort(),
      );
      expect(findings.map((finding) => finding.file).sort()).toEqual([
        "scripts/by-content.ts",
        "scripts/seed-test-order.ts",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
