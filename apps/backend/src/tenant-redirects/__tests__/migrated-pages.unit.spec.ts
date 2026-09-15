import {
  deriveMigratedPageRedirects,
  pageTargetLocale,
  readPageSeededMarker,
  PAGE_SEEDED_METADATA_KEY,
  MIGRATED_PAGE_ADDRESSES,
  type TenantPageRow,
} from "../migrated-pages";

const MIGRATED_AT = "2026-09-12T02:34:00.000Z";

const CHERKASHINO_PAGES: TenantPageRow[] = [
  { key: "contacts", locale: "ru", published: true, created_at: MIGRATED_AT },
  { key: "offer", locale: "ru", published: true, created_at: MIGRATED_AT },
  { key: "privacy", locale: "ru", published: true, created_at: MIGRATED_AT },
  { key: "about", locale: "ru", published: true, created_at: MIGRATED_AT },
  { key: "about", locale: "en", published: true, created_at: MIGRATED_AT },
];

describe("deriveMigratedPageRedirects", () => {
  it("writes a 301 for every old address whose page the shop has", () => {
    const { rows, sources, unmapped } = deriveMigratedPageRedirects(
      ["chrxnasdmds"],
      CHERKASHINO_PAGES,
      { enabledLocales: ["ru", "en"], defaultLocale: "ru" },
    );

    expect(rows.map((row) => `${row.from_path} -> ${row.to_path}`)).toEqual([
      "/ru/ru/contact -> /ru/pages/contacts",
      "/ru/ru/terms -> /ru/pages/offer",
      "/ru/ru/privacy -> /ru/pages/privacy",
      "/ru/ru/about -> /ru/pages/about",
      "/ru/en/about -> /en/pages/about",
    ]);
    expect(rows.every((row) => row.status_code === 301)).toBe(true);
    expect(sources).toEqual(["chrxnasdmds"]);
    expect(unmapped).toHaveLength(10);
  });

  it("names every address it could not map, with the page it is waiting for", () => {
    const { unmapped } = deriveMigratedPageRedirects(["chrxnasdmds"], CHERKASHINO_PAGES, {
      enabledLocales: ["ru", "en"],
      defaultLocale: "ru",
    });

    expect(unmapped).toContain(
      'page /ru/ru/delivery: the shop has no published page "delivery" in "ru" — no redirect written (it appears by itself once the page exists)',
    );
  });

  it("picks the address up by itself once the page exists", () => {
    const { rows } = deriveMigratedPageRedirects(
      ["chrxnasdmds"],
      [...CHERKASHINO_PAGES, { key: "delivery", locale: "ru", published: true }],
      { enabledLocales: ["ru", "en"], defaultLocale: "ru" },
    );

    expect(rows.map((row) => row.to_path)).toContain("/ru/pages/delivery");
  });

  it("picks up a page created AFTER the first run, marker or no marker", () => {
    // The ten addresses waiting on `b14-pages-legal-content` are created long
    // after this source is stamped. Reading the stamp as "this source is done"
    // would freeze them out for good.
    const { rows } = deriveMigratedPageRedirects(
      ["chrxnasdmds"],
      [
        ...CHERKASHINO_PAGES,
        { key: "delivery", locale: "ru", published: true, created_at: "2026-09-20T10:00:00.000Z" },
      ],
      {
        enabledLocales: ["ru", "en"],
        defaultLocale: "ru",
        seededAt: { chrxnasdmds: "2026-09-16T00:00:00.000Z" },
      },
    );

    expect(rows.map((row) => `${row.from_path} -> ${row.to_path}`)).toEqual([
      "/ru/ru/delivery -> /ru/pages/delivery",
    ]);
  });

  it("treats a page with no timestamp as already offered", () => {
    const { rows } = deriveMigratedPageRedirects(
      ["chrxnasdmds"],
      [{ key: "contacts", locale: "ru", published: true }],
      {
        enabledLocales: ["ru"],
        defaultLocale: "ru",
        seededAt: { chrxnasdmds: "2026-09-16T00:00:00.000Z" },
      },
    );

    expect(rows).toEqual([]);
  });

  it("ignores a draft page: a 301 into a 404 is worse than the 404", () => {
    const { rows } = deriveMigratedPageRedirects(
      ["chrxnasdmds"],
      [{ key: "contacts", locale: "ru", published: false }],
      { enabledLocales: ["ru"], defaultLocale: "ru" },
    );

    expect(rows).toEqual([]);
  });

  it("writes nothing for a shop imported from somewhere else", () => {
    const { rows, sources } = deriveMigratedPageRedirects(["some-other-shop"], CHERKASHINO_PAGES, {
      enabledLocales: ["ru"],
      defaultLocale: "ru",
    });

    expect(rows).toEqual([]);
    expect(sources).toEqual([]);
  });

  it("does not resurrect a row the owner deleted after the first run", () => {
    const { rows } = deriveMigratedPageRedirects(["chrxnasdmds"], CHERKASHINO_PAGES, {
      enabledLocales: ["ru", "en"],
      defaultLocale: "ru",
      seededAt: { chrxnasdmds: "2026-09-16T00:00:00.000Z" },
    });

    expect(rows).toEqual([]);
  });

  it("sends an address to a language the shop does offer", () => {
    // `en` switched off: the English `about` address lands on the shop's
    // Russian page rather than on `/en/...`, a language it no longer publishes.
    // Two old addresses then point at one page, which is what a shop dropping a
    // language means.
    const { rows } = deriveMigratedPageRedirects(["chrxnasdmds"], CHERKASHINO_PAGES, {
      enabledLocales: ["ru"],
      defaultLocale: "ru",
    });

    const byFrom = Object.fromEntries(rows.map((row) => [row.from_path, row.to_path]));
    expect(byFrom["/ru/en/about"]).toBe("/ru/pages/about");
    expect(byFrom["/ru/ru/about"]).toBe("/ru/pages/about");
    expect(rows.some((row) => row.to_path.startsWith("/en/"))).toBe(false);
  });
});

describe("pageTargetLocale", () => {
  it("keeps the address's own locale when the shop saved no list", () => {
    expect(pageTargetLocale("en", null, "ru")).toBe("en");
    expect(pageTargetLocale("en", [], "ru")).toBe("en");
  });

  it("keeps it when the shop offers it", () => {
    expect(pageTargetLocale("en", ["ru", "en"], "ru")).toBe("en");
  });

  it("falls back to the shop's default, then to its first language", () => {
    expect(pageTargetLocale("en", ["ru"], "ru")).toBe("ru");
    expect(pageTargetLocale("en", ["de"], "ru")).toBe("de");
  });
});

describe("readPageSeededMarker", () => {
  it("is a different key from the catalogue's", () => {
    expect(PAGE_SEEDED_METADATA_KEY).toBe("page_redirects_seeded_from");
    expect(
      readPageSeededMarker({ redirects_seeded_from: { chrxnasdmds: "2026-09-15T00:00:00.000Z" } }),
    ).toEqual({});
  });

  it("reads its own key and tolerates junk", () => {
    expect(readPageSeededMarker({ page_redirects_seeded_from: { a: "2026-09-16T00:00:00.000Z" } })).toEqual({
      a: "2026-09-16T00:00:00.000Z",
    });
    expect(readPageSeededMarker(null)).toEqual({});
    expect(readPageSeededMarker({ page_redirects_seeded_from: [] })).toEqual({});
  });
});

describe("MIGRATED_PAGE_ADDRESSES", () => {
  it("claims no address twice", () => {
    for (const [source, addresses] of Object.entries(MIGRATED_PAGE_ADDRESSES)) {
      const paths = addresses.map((address) => address.from_path);
      expect({ source, unique: new Set(paths).size }).toEqual({ source, unique: paths.length });
    }
  });
});
