import path from "node:path";
import type { SeedProduct } from "../data/products";

const FIXTURE_DIR = path.join(__dirname, "fixtures", "profiles", "fixture-shop");
const BASE_URL = "http://localhost:9023/static/store-profiles/fixture-shop";

type ProductsModule = typeof import("../data/products");
type I18nModule = typeof import("../data/i18n");
type StoreModule = typeof import("../data/store");

/**
 * The data modules read STORE_PROFILE once, at import time. Loading them inside
 * an isolated module registry is what lets one test run cover both directions
 * of the switch in the same process.
 */
const loadWith = <T>(env: Record<string, string | undefined>, load: () => T): T => {
  const previous = { ...process.env };
  Object.assign(process.env, env);
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
  }

  let loaded!: T;
  try {
    jest.isolateModules(() => {
      loaded = load();
    });
  } finally {
    process.env = previous;
  }
  return loaded;
};

const DEFAULT_ENV = {
  STORE_PROFILE: undefined,
  STORE_PROFILE_DIR: undefined,
  STORE_MEDIA_BASE_URL: undefined,
};

const PROFILE_ENV = {
  STORE_PROFILE: "fixture-shop",
  STORE_PROFILE_DIR: FIXTURE_DIR,
  STORE_MEDIA_BASE_URL: BASE_URL,
};

describe("catalog loader: STORE_PROFILE unset", () => {
  const data = () =>
    loadWith(DEFAULT_ENV, () => require("../data/products") as ProductsModule);

  it("reads the shipped demo catalog", () => {
    const { SEED_PRODUCTS, SEED_CATEGORIES, SEED_COLLECTIONS } = data();
    expect(SEED_PRODUCTS.length).toBe(11);
    expect(SEED_PRODUCTS.map((product) => product.handle)).toContain("t-shirt");
    expect(
      SEED_PRODUCTS.reduce((total, product) => total + product.variants.length, 0),
    ).toBe(36);
    expect(
      SEED_PRODUCTS.reduce((total, product) => total + product.images.length, 0),
    ).toBe(30);
    expect(SEED_CATEGORIES.length).toBe(3);
    expect(SEED_COLLECTIONS.length).toBe(1);
  });

  it("leaves the demo images and prices exactly as they are on disk", () => {
    const { SEED_PRODUCTS } = data();
    const tShirt = SEED_PRODUCTS.find((product) => product.handle === "t-shirt")!;
    expect(tShirt.images[0]).toMatch(/^https:\/\/medusa-public-images\.s3\./);
    expect(tShirt.subtitle).toBeUndefined();
    expect(tShirt.variants.every((variant) => variant.price_usd === undefined)).toBe(
      true,
    );
  });

  it("keeps the shipped store identity", () => {
    const { SEED_STORE } = loadWith(
      DEFAULT_ENV,
      () => require("../data/store") as StoreModule,
    );
    expect(SEED_STORE.name).toBe("My Store");
    expect(SEED_STORE.sales_channel.name).toBe("Default Sales Channel");
  });

  it("keeps all 36 shipped locales untouched", () => {
    const { SEED_LOCALES, SEED_TRANSLATIONS } = loadWith(
      DEFAULT_ENV,
      () => require("../data/i18n") as I18nModule,
    );
    expect(SEED_LOCALES.length).toBe(36);
    expect(SEED_TRANSLATIONS.de.categories.shirts).toBeDefined();
    expect(SEED_TRANSLATIONS.de.products.tShirt).toBeDefined();
  });
});

describe("catalog loader: STORE_PROFILE set", () => {
  const data = () =>
    loadWith(PROFILE_ENV, () => require("../data/products") as ProductsModule);

  it("reads the profile catalog instead of the demo one", () => {
    const { SEED_PRODUCTS, SEED_CATEGORIES, SEED_COLLECTIONS, SEED_PRODUCT_OPTIONS } =
      data();
    expect(SEED_PRODUCTS.map((product) => product.handle)).toEqual([
      "fixture-runner",
    ]);
    expect(SEED_CATEGORIES.map((category) => category.handle)).toEqual([
      "footwear",
    ]);
    expect(SEED_COLLECTIONS.map((collection) => collection.handle)).toEqual([
      "fixture-drop",
    ]);
    expect(SEED_PRODUCT_OPTIONS.map((option) => option.title)).toEqual(["Size"]);
  });

  it("prefixes relative image refs with STORE_MEDIA_BASE_URL", () => {
    const { SEED_PRODUCTS } = data();
    expect(SEED_PRODUCTS[0].images).toEqual([
      `${BASE_URL}/fixture-runner-hero.webp`,
    ]);
  });

  it("keeps subtitle, specs and price_usd, drops the authoring-only fields", () => {
    const { SEED_PRODUCTS } = data();
    const product = SEED_PRODUCTS[0] as SeedProduct & Record<string, unknown>;
    expect(product.subtitle).toBe("The only shoe in the fixture");
    expect((product.metadata as { specs: Record<string, string> }).specs).toEqual({
      "Upper material": "Fixture mesh",
      Sole: "Fixture foam",
    });
    expect(product.variants[0].price_usd).toBe(129);
    expect(product.collections).toBeUndefined();
    expect(product.imageBrief).toBeUndefined();
  });

  it("rejects an absolute image URL instead of seeding it", () => {
    expect(() =>
      loadWith(
        {
          ...PROFILE_ENV,
          STORE_PROFILE: "absolute-image-shop",
          STORE_PROFILE_DIR: path.join(
            __dirname,
            "fixtures",
            "profiles",
            "absolute-image-shop",
          ),
        },
        () => require("../data/products") as ProductsModule,
      ),
    ).toThrow(/is an absolute URL/);
  });

  it("takes the store name and sales channel from the profile brand", () => {
    const { SEED_STORE } = loadWith(
      PROFILE_ENV,
      () => require("../data/store") as StoreModule,
    );
    expect(SEED_STORE.name).toBe("Fixture Shop");
    expect(SEED_STORE.sales_channel.name).toBe("Fixture Shop Sales Channel");
    expect(SEED_STORE.sales_channel.description).toBe("A fixture, not a shop");
    expect(SEED_STORE.default_currency_code).toBe("usd");
  });
});

describe("i18n merge", () => {
  const i18n = () =>
    loadWith(PROFILE_ENV, () => require("../data/i18n") as I18nModule);

  it("keeps every base locale so the storefront stays complete", () => {
    const { SEED_LOCALES } = i18n();
    expect(SEED_LOCALES.length).toBe(36);
    expect(SEED_LOCALES).toContain("fr");
  });

  it("lets a profile key win over a base key that already exists", () => {
    const { SEED_TRANSLATIONS } = i18n();
    const base = loadWith(
      DEFAULT_ENV,
      () => require("../data/i18n") as I18nModule,
    ).SEED_TRANSLATIONS;

    // The base ships these two German keys; the profile overrides both.
    expect(base.de.terms.black).toBe("Schwarz");
    expect(base.de.categories.clothing).toBe("Bekleidung");
    expect(SEED_TRANSLATIONS.de.terms.black).toBe("Tiefschwarz");
    expect(SEED_TRANSLATIONS.de.categories.clothing).toBe("Sneaker-Bekleidung");
  });

  it("adds the profile's own keys", () => {
    const { SEED_TRANSLATIONS } = i18n();
    expect(SEED_TRANSLATIONS.de.categories.runners).toBe("Laufschuhe");
    expect(SEED_TRANSLATIONS.en.categories.runners).toBe("Runners");
    expect(SEED_TRANSLATIONS.de.products.fixtureRunner.title).toBe(
      "Fixture Runner",
    );
  });

  it("keeps base keys the profile omits inside a group it does override", () => {
    const { SEED_TRANSLATIONS } = i18n();
    expect(SEED_TRANSLATIONS.de.terms.color).toBe("Farbe");
    expect(SEED_TRANSLATIONS.de.categories.shirts).toBe("T-Shirts");
  });

  it("keeps base keys the profile does not carry", () => {
    const { SEED_TRANSLATIONS } = i18n();
    expect(Object.keys(SEED_TRANSLATIONS.de.refundReasons).length).toBeGreaterThan(
      0,
    );
    expect(Object.keys(SEED_TRANSLATIONS.de.shippingOptions).length).toBeGreaterThan(
      0,
    );
    expect(Object.keys(SEED_TRANSLATIONS.de.terms).length).toBeGreaterThan(0);
    // The profile never wrote a `collections` group for German.
    expect(SEED_TRANSLATIONS.de.collections).toEqual(
      loadWith(DEFAULT_ENV, () => require("../data/i18n") as I18nModule)
        .SEED_TRANSLATIONS.de.collections,
    );
  });

  it("leaves a locale the profile never translated identical to the base", () => {
    const profileFr = i18n().SEED_TRANSLATIONS.fr;
    const baseFr = loadWith(
      DEFAULT_ENV,
      () => require("../data/i18n") as I18nModule,
    ).SEED_TRANSLATIONS.fr;
    expect(profileFr).toEqual(baseFr);
  });
});
