import fs from "node:fs";
import path from "node:path";
import { MIGRATED_PAGE_ADDRESSES } from "../migrated-pages";

/**
 * The table in `migrated-pages.ts` is a copy of what the LIVE import wrote
 * down, and a copy that nobody checks drifts. This test reads the registry the
 * live import produced
 * (`handoff/day-2026-09-16-oksana-store/artifacts/x01-tenant-live-import/02-mapping-registry-live.json`)
 * and fails when the two disagree on a single address.
 *
 * `target_handle` is the `tenant_page` key the migration actually used when it
 * had one. Where it is null the page was never created, and the table carries
 * the source slug as the key — the shape `t05-page-keys` made legal and the one
 * `gap-recheck.md` §7 names (`/ru/pages/delivery`, `/ru/pages/faq`,
 * `/ru/pages/returns`).
 *
 * A checkout without that registry skips rather than fails: it is one day's
 * journal, not a source file.
 */
const REGISTRY = path.resolve(
  __dirname,
  "../../../../../handoff/day-2026-09-16-oksana-store/artifacts/x01-tenant-live-import/02-mapping-registry-live.json",
);

type RegistryRow = {
  kind: string;
  source_url?: string;
  source_handle?: string;
  target_handle?: string | null;
  locale?: string | null;
};

const maybe = fs.existsSync(REGISTRY) ? describe : describe.skip;

maybe("parity with the Cherkashina import registry (pages)", () => {
  const rows = (): RegistryRow[] => {
    const parsed = JSON.parse(fs.readFileSync(REGISTRY, "utf8")) as { rows: RegistryRow[] };
    return parsed.rows.filter((row) => row.kind === "page" && Boolean(row.source_url));
  };

  it("carries exactly the page addresses the registry recorded", () => {
    const registryRows = rows();
    expect(registryRows.length).toBe(15);

    const expected = registryRows
      .map(
        (row) =>
          `${new URL(row.source_url as string).pathname} -> ${row.target_handle ?? row.source_handle} (${row.locale})`,
      )
      .sort();

    const actual = MIGRATED_PAGE_ADDRESSES.chrxnasdmds.map(
      (address) => `${address.from_path} -> ${address.key} (${address.locale})`,
    ).sort();

    expect(actual).toEqual(expected);
  });

  it("leaves the 39 legacy_page rows out: their only address is a third party's", () => {
    const parsed = JSON.parse(fs.readFileSync(REGISTRY, "utf8")) as { rows: RegistryRow[] };
    const legacy = parsed.rows.filter((row) => row.kind === "legacy_page");

    // 39 outlines scraped from asd2-3.com into the old mirror's `pages.json`;
    // not one of them carries a `source_url` of the client's own shop, and the
    // old storefront had no route for their slugs (b08-seo-storefront, §3 of
    // the report). A 301 from a domain we do not own redirects nothing.
    expect(legacy).toHaveLength(39);
    expect(legacy.filter((row) => Boolean(row.source_url))).toHaveLength(0);

    const claimed = new Set(
      MIGRATED_PAGE_ADDRESSES.chrxnasdmds.map((address) => address.from_path),
    );
    for (const row of legacy) {
      expect(claimed.has(`/ru/ru/pages/${row.source_handle}`)).toBe(false);
    }
  });
});
