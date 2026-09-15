import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

/**
 * A one-off acceptance fixture or seed script must live in
 * `apps/backend/scripts/fixtures`, and this is the gate that says so.
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
 * `include` in `tsconfig.json` is the everything glob relative to
 * `apps/backend`, so the scan below covers the whole app directory and not
 * `src/` alone. A fixture
 * parked in `apps/backend/scripts` would fail the build exactly as one under
 * `src/` does, because `exclude` names `scripts/fixtures` and nothing wider.
 *
 * Run a fixture with `npx medusa exec ./scripts/fixtures/<file>.ts` and
 * type-check the directory with `pnpm check:backend-fixtures`.
 */

/** Marker, and the word that names it in the failure message. */
const MARKERS: { name: string; pattern: RegExp }[] = [
  { name: "fixture ONLY", pattern: /fixture\s+only/i },
  { name: "seed-test", pattern: /seed-test/ },
];

/** Where a fixture belongs, relative to `apps/backend`. */
const FIXTURE_HOME = "scripts/fixtures";

/**
 * Directories the build never compiles. `node_modules` plus `.medusa` and
 * `.cache` from `exclude`; every other dot directory is generated output
 * (`.turbo`, `.git`) and is skipped for the same reason.
 */
const SKIP_DIRECTORY_NAMES = new Set(["node_modules", "static"]);

/**
 * Path prefixes, relative to `apps/backend`, that carry no obligation.
 * `scripts/fixtures` is the fixtures' own home, and `src/admin` is one of the
 * four chunks `isFileIgnored` drops.
 */
const SKIP_RELATIVE_PREFIXES = [FIXTURE_HOME, path.join("src", "admin")];

/** Single path segments `isFileIgnored` drops wherever they appear. */
const SKIP_SEGMENTS = new Set(["integration-tests", "test", "unit-tests"]);

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

/** This file names both markers in its own source. */
const SELF = path.resolve(__filename);

type Finding = { file: string; marker: string };

const isSkippedDirectory = (name: string, relative: string): boolean =>
  name.startsWith(".") ||
  SKIP_DIRECTORY_NAMES.has(name) ||
  SKIP_SEGMENTS.has(name) ||
  SKIP_RELATIVE_PREFIXES.some((prefix) => relative === prefix || relative.startsWith(`${prefix}${path.sep}`));

/** Every compiled source file under `root`, relative to it. */
const listSourceFiles = (root: string): string[] => {
  const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name);
      const relative = path.relative(root, full);

      if (entry.isDirectory()) {
        return isSkippedDirectory(entry.name, relative) ? [] : walk(full);
      }

      if (path.resolve(full) === SELF) {
        return [];
      }

      return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [relative] : [];
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

describe("fixtures stay out of the compiled backend tree", () => {
  it("reads the whole compiled tree, so a clean result means something", () => {
    const files = listSourceFiles(BACKEND_ROOT);

    // Without this the test passes on a wrong root, an empty read or a typo in
    // SOURCE_EXTENSIONS, and reports it as "no fixtures found".
    expect(files.length).toBeGreaterThan(100);
    // The scan has to reach past src/, which is the whole point of the root.
    expect(files.some((file) => file.startsWith(`scripts${path.sep}`))).toBe(true);
  });

  it("finds no acceptance fixture or one-off seed script outside scripts/fixtures", () => {
    const findings = findFixtures(BACKEND_ROOT, listSourceFiles(BACKEND_ROOT));

    expect(
      findings.map(
        ({ file, marker }) =>
          `apps/backend/${file} carries the marker "${marker}". medusa build ` +
          `compiles every file tsconfig.json includes, so a type error here fails ` +
          `the production image build. Move it to apps/backend/${FIXTURE_HOME}/ ` +
          `(the one path apps/backend/tsconfig.json excludes) and run it with ` +
          `npx medusa exec ./${FIXTURE_HOME}/<file>.ts.`,
      ),
    ).toEqual([]);
  });

  it("detects a fixture the moment one appears in the compiled tree", () => {
    const root = mkdtempSync(path.join(tmpdir(), "f18-fixture-gate-"));

    try {
      mkdirSync(path.join(root, "src", "scripts"), { recursive: true });
      mkdirSync(path.join(root, "scripts", "fixtures"), { recursive: true });
      mkdirSync(path.join(root, "integration-tests"), { recursive: true });

      writeFileSync(
        path.join(root, "src", "scripts", "seed-test-order.ts"),
        "export default async function seed() {}\n",
      );
      writeFileSync(
        path.join(root, "scripts", "by-content.ts"),
        "/** round-1 acceptance fixture ONLY, never against a real database. */\nexport default 1;\n",
      );
      writeFileSync(path.join(root, "scripts", "ordinary.ts"), "export default 2;\n");
      // The legal home and a chunk the build drops: both must stay quiet.
      writeFileSync(
        path.join(root, "scripts", "fixtures", "t99-seed-test-tenant.ts"),
        "/** acceptance fixture ONLY. */\nexport default 3;\n",
      );
      writeFileSync(
        path.join(root, "integration-tests", "seed-test-helper.ts"),
        "export default 4;\n",
      );

      const findings = findFixtures(root, listSourceFiles(root));

      expect(findings.map((finding) => finding.file).sort()).toEqual([
        path.join("scripts", "by-content.ts"),
        path.join("src", "scripts", "seed-test-order.ts"),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
