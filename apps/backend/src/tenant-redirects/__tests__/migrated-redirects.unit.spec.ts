import {
  deriveMigratedRedirects,
  readSeededMarker,
  sourcePathOf,
  targetLocale,
  type MigratedResource,
} from "../migrated-redirects";

/**
 * Unit facts of the migrated-catalogue redirects (b02-legal-and-redirects,
 * piece 2): the old address comes from the row's own metadata, a category
 * imported before this task is rebuilt from its siblings' prefix and never
 * from a pattern, a row the owner deleted after the tenant was stamped is not
 * resurrected, and a self-redirect is never written.
 */

const product = (handle: string, sourceHandle = handle, created = "2026-09-15T04:00:00.000Z"): MigratedResource => ({
  kind: "products",
  handle: `${handle}-cherkashino`,
  created_at: created,
  metadata: {
    migrated_from: "chrxnasdmds",
    source_handle: sourceHandle,
    source_url: `https://olavka.ru/ru/ru/products/${sourceHandle}`,
  },
});

const category = (handle: string, created = "2026-09-15T04:00:00.000Z"): MigratedResource => ({
  kind: "categories",
  handle: `${handle}-cherkashino`,
  created_at: created,
  // As the importer wrote them BEFORE this task: a source handle, no source_url.
  metadata: { migrated_from: "chrxnasdmds", source_handle: handle },
});

const options = { enabledLocales: ["ru", "en"], defaultLocale: "ru" };

describe("sourcePathOf", () => {
  it("takes the path of an absolute URL and of a bare path, and drops the query", () => {
    expect(sourcePathOf("https://olavka.ru/ru/ru/products/x")).toBe("/ru/ru/products/x");
    expect(sourcePathOf("/ru/ru/products/x?utm=1")).toBe("/ru/ru/products/x");
  });

  it("answers null for anything that is not an address", () => {
    expect(sourcePathOf(undefined)).toBeNull();
    expect(sourcePathOf("")).toBeNull();
    expect(sourcePathOf("olavka.ru/products/x")).toBeNull();
  });
});

describe("targetLocale", () => {
  it("keeps the locale the old address carried when the shop answers in it", () => {
    expect(targetLocale("/ru/ru/products/x", ["ru", "en"], "en")).toBe("ru");
  });

  it("falls back to the shop's default when it does not", () => {
    expect(targetLocale("/de/de/products/x", ["ru", "en"], "ru")).toBe("ru");
  });

  it("falls back to an enabled locale when even the default is not one", () => {
    expect(targetLocale("/de/products/x", ["en"], "ru")).toBe("en");
  });

  it("keeps the address's own locale when the shop saved no settings at all", () => {
    // The live Cherkashina tenant: `locale_settings: null`, `/ru` answers 200.
    expect(targetLocale("/ru/ru/products/x", null, "en")).toBe("ru");
    expect(targetLocale("/ru/ru/products/x", [], "en")).toBe("ru");
  });

  it("uses the deployment default when an unset shop's address carries no locale", () => {
    expect(targetLocale("/products/x", null, "ru")).toBe("ru");
    expect(targetLocale("/shop/products/x", null, "ru")).toBe("ru");
  });
});

describe("deriveMigratedRedirects", () => {
  it("sends a Russian old address to the Russian new one on a shop with no saved locales", () => {
    const { rows } = deriveMigratedRedirects([product("zubnaya-pasta")], {
      enabledLocales: null,
      defaultLocale: "en",
    });
    expect(rows[0].to_path).toBe("/ru/products/zubnaya-pasta-cherkashino");
  });

  it("turns a product's own metadata into a 301 to its current handle", () => {
    const { rows, sources, unmapped } = deriveMigratedRedirects([product("zubnaya-pasta")], options);
    expect(unmapped).toEqual([]);
    expect(sources).toEqual(["chrxnasdmds"]);
    expect(rows).toEqual([
      {
        from_path: "/ru/ru/products/zubnaya-pasta",
        to_path: "/ru/products/zubnaya-pasta-cherkashino",
        status_code: 301,
        source: "chrxnasdmds",
      },
    ]);
  });

  it("rebuilds a pre-b02 category's address from the prefix its siblings carry", () => {
    const { rows } = deriveMigratedRedirects([product("zubnaya-pasta"), category("dobavki")], options);
    expect(rows).toContainEqual({
      from_path: "/ru/ru/categories/dobavki",
      to_path: "/ru/categories/dobavki-cherkashino",
      status_code: 301,
      source: "chrxnasdmds",
    });
  });

  it("reports a category as unmapped rather than guessing when the siblings disagree", () => {
    const odd: MigratedResource = {
      ...product("ingalyator"),
      metadata: {
        migrated_from: "chrxnasdmds",
        source_handle: "ingalyator",
        source_url: "https://olavka.ru/shop/products/ingalyator",
      },
    };
    const { rows, unmapped } = deriveMigratedRedirects([product("zubnaya-pasta"), odd, category("dobavki")], options);
    expect(rows.map((row) => row.from_path)).not.toContain("/ru/ru/categories/dobavki");
    expect(unmapped.join(" ")).toContain("dobavki-cherkashino");
  });

  it("ignores a row with no migration stamp at all", () => {
    const own: MigratedResource = { kind: "products", handle: "sobstvennyy", metadata: { seo: {} } };
    expect(deriveMigratedRedirects([own], options).rows).toEqual([]);
  });

  it("never writes a self-redirect when the old address is the new one", () => {
    const same: MigratedResource = {
      kind: "products",
      handle: "kub",
      metadata: { migrated_from: "old", source_url: "https://old.example/ru/products/kub" },
    };
    expect(deriveMigratedRedirects([same], options).rows).toEqual([]);
  });

  it("leaves a row alone once its tenant is stamped — a redirect the owner deleted stays deleted", () => {
    const seededAt = { chrxnasdmds: "2026-09-15T12:00:00.000Z" };
    const { rows } = deriveMigratedRedirects([product("zubnaya-pasta")], { ...options, seededAt });
    expect(rows).toEqual([]);
  });

  it("still derives a catalogue imported AFTER the stamp", () => {
    const seededAt = { chrxnasdmds: "2026-09-15T12:00:00.000Z" };
    const later = product("novyy", "novyy", "2026-09-16T08:00:00.000Z");
    const { rows } = deriveMigratedRedirects([product("staryy"), later], { ...options, seededAt });
    expect(rows.map((row) => row.from_path)).toEqual(["/ru/ru/products/novyy"]);
  });

  it("keeps the first claim on a from_path and reports the second", () => {
    const twin: MigratedResource = { ...product("zubnaya-pasta"), handle: "dubl-cherkashino" };
    const { rows, unmapped } = deriveMigratedRedirects([product("zubnaya-pasta"), twin], options);
    expect(rows).toHaveLength(1);
    expect(unmapped.join(" ")).toContain("claimed by another row");
  });
});

describe("readSeededMarker", () => {
  it("reads the stamp and tolerates every shape a metadata column can hold", () => {
    expect(readSeededMarker({ redirects_seeded_from: { a: "2026-09-15T00:00:00.000Z" } })).toEqual({
      a: "2026-09-15T00:00:00.000Z",
    });
    expect(readSeededMarker(null)).toEqual({});
    expect(readSeededMarker({ redirects_seeded_from: ["a"] })).toEqual({});
    expect(readSeededMarker({ redirects_seeded_from: { a: 1 } })).toEqual({});
  });
});
