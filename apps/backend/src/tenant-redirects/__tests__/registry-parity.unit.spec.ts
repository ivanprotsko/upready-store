import fs from "node:fs";
import path from "node:path";
import { deriveMigratedRedirects, type MigratedResource } from "../migrated-redirects";

/**
 * The derivation must reproduce, path for path, what the ONE hand-run of
 * `import-cherkashino-redirects.ts` wrote on the acceptance stand — otherwise
 * «the deploy now does it by itself» would be a different table wearing the
 * same name.
 *
 * The fixture is the live import's own registry
 * (`handoff/day-2026-09-16-oksana-store/artifacts/x01-tenant-live-import/02-mapping-registry-live.json`,
 * 47 rows: 38 products + 9 categories), fed in the shape the DATABASE holds
 * today — products with `source_url`, categories with `source_handle` only,
 * which is what the importer wrote before this task. A checkout without that
 * registry skips rather than fails: it is one day's journal, not a source file.
 */
const REGISTRY = path.resolve(
  __dirname,
  "../../../../../handoff/day-2026-09-16-oksana-store/artifacts/x01-tenant-live-import/02-mapping-registry-live.json",
);

type RegistryRow = {
  kind: string;
  source_url: string;
  target_url: string;
  source_handle: string;
  target_handle: string;
};

const registryRows = (): RegistryRow[] => {
  const parsed = JSON.parse(fs.readFileSync(REGISTRY, "utf8")) as { rows: RegistryRow[] };
  return parsed.rows.filter(
    (row) => (row.kind === "product" || row.kind === "category") && Boolean(row.source_url) && Boolean(row.target_url),
  );
};

const maybe = fs.existsSync(REGISTRY) ? describe : describe.skip;

maybe("parity with the Cherkashina import registry", () => {
  it("derives exactly the rows the registry maps, categories included", () => {
    const rows = registryRows();
    expect(rows.length).toBe(47);

    const resources: MigratedResource[] = rows.map((row) => ({
      kind: row.kind === "product" ? "products" : "categories",
      handle: row.target_handle,
      created_at: "2026-09-15T04:00:00.000Z",
      metadata:
        row.kind === "product"
          ? { migrated_from: "chrxnasdmds", source_handle: row.source_handle, source_url: row.source_url }
          : { migrated_from: "chrxnasdmds", source_handle: row.source_handle },
    }));

    const { rows: derived, unmapped } = deriveMigratedRedirects(resources, {
      enabledLocales: ["ru", "en"],
      defaultLocale: "ru",
    });

    expect(unmapped).toEqual([]);
    expect(derived.map((row) => `${row.from_path} -> ${row.to_path}`).sort()).toEqual(
      rows.map((row) => `${new URL(row.source_url).pathname} -> ${new URL(row.target_url).pathname}`).sort(),
    );
  });
});
