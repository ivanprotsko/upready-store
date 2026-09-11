import { PutTenantHomeBody } from "../validators";

/**
 * The mode-image pair on the hero (`specs/store-profiles/MODE-IMAGE-PAIRS.md`). What
 * matters here is BACKWARD COMPATIBILITY: the axis was added as one optional field, and a
 * document saved before it existed has to keep validating and saving. A test on the zod
 * schema alone, so it runs under TEST_TYPE=unit with no database behind it.
 */
const body = (hero: Record<string, unknown> = {}) => ({
  theme: { preset: "sneakers" },
  settings: {
    defaultMode: "dark",
    header: "h5",
    hero: "k",
    tiles: "on",
    listing: "p1",
    footer: "f3",
  },
  content: {
    hero: {
      title: "Night wave hero",
      subtitle: "Everything the tenant typed",
      cta_label: "Shop",
      cta_href: "/store",
      image_url: "https://media.test/hero-light.webp",
      ...hero,
    },
    products: { source: "popular" },
    order: ["hero", "categories", "products"],
  },
});

describe("tenant home document: the hero's mode-image pair", () => {
  it("keeps both versions when the tenant filled the pair", () => {
    const parsed = PutTenantHomeBody.parse(
      body({ image_url_dark: "https://media.test/hero-dark.webp" }),
    );

    expect(parsed.content.hero.image_url).toBe("https://media.test/hero-light.webp");
    expect(parsed.content.hero.image_url_dark).toBe("https://media.test/hero-dark.webp");
  });

  it("accepts a document that never heard of the dark version and defaults it to null", () => {
    // This is every document the three demo tenants and every real shop already saved.
    // Rejecting it, or demanding a migration, would be the one thing this axis must not do.
    const parsed = PutTenantHomeBody.parse(body());

    expect(parsed.content.hero.image_url_dark).toBeNull();
  });

  it("accepts an explicit null, which is how the panel clears the dark slot", () => {
    const parsed = PutTenantHomeBody.parse(body({ image_url_dark: null }));

    expect(parsed.content.hero.image_url_dark).toBeNull();
  });

  it("holds the dark version to the same length limit as the base", () => {
    const tooLong = `https://media.test/${"d".repeat(1001)}.webp`;

    expect(() => PutTenantHomeBody.parse(body({ image_url_dark: tooLong }))).toThrow();
    expect(() => PutTenantHomeBody.parse(body({ image_url: tooLong }))).toThrow();
  });

  it("refuses a non-string dark version rather than storing it", () => {
    expect(() => PutTenantHomeBody.parse(body({ image_url_dark: 42 }))).toThrow();
  });
});
