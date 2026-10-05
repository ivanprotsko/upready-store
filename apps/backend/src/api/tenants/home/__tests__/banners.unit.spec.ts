import {
  HOME_BANNERS_MAX,
  HOME_BANNER_TEXT_MAX,
  PutTenantHomeBody,
  isAllowedBannerHref,
} from "../validators";

/**
 * Home banners validation (t-2026-09-24-n15): the document's `content.banners`
 * — texts capped, links restricted to a product of the tenant or an
 * http(s)/site-relative URL, at most ten banners with distinct ids. The product
 * OWNERSHIP check lives in the route (it needs the request scope) and is not
 * exercised here; this covers the schema every PUT passes through first.
 */

const base = {
  theme: { preset: "supplements" },
  settings: {
    defaultMode: "light",
    header: "h2",
    hero: "k",
    tiles: "on",
    listing: "p4",
    footer: "f4",
  },
  content: {
    hero: { title: "", subtitle: "", cta_label: "", cta_href: "", image_url: null },
    products: { source: "popular" },
    order: ["hero", "categories", "products"],
  },
};

const banner = (over: Record<string, unknown> = {}) => ({
  id: "b1",
  image: { src: "http://localhost:9251/static/home-banners/x/x-1440.webp", alt: "" },
  kicker: "10 октября",
  label: "Курс",
  title: "Чистка печени",
  button: "Смотреть",
  link: { type: "product", product_id: "prod_1", handle: "course-x" },
  sort: 0,
  ...over,
});

const withBanners = (banners: unknown[]) => ({
  ...base,
  content: { ...base.content, banners },
});

describe("tenant home banners schema", () => {
  it("accepts a document without banners (older documents) and defaults to []", () => {
    const parsed = PutTenantHomeBody.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.content.banners).toEqual([]);
    }
  });

  it("accepts a product link and a url link with a srcset", () => {
    const parsed = PutTenantHomeBody.safeParse(
      withBanners([
        banner(),
        banner({
          id: "b2",
          image: {
            src: "http://localhost:9251/static/home-banners/y/y-1440.webp",
            alt: "y",
            width: 1440,
            height: 804,
            srcset: [{ w: 480, url: "http://localhost:9251/static/home-banners/y/y-480.webp" }],
          },
          link: { type: "url", href: "/ru/store" },
          sort: 1,
        }),
      ]),
    );
    expect(parsed.success).toBe(true);
  });

  it("rejects a text longer than the chip cap", () => {
    const parsed = PutTenantHomeBody.safeParse(
      withBanners([banner({ title: "x".repeat(HOME_BANNER_TEXT_MAX + 1) })]),
    );
    expect(parsed.success).toBe(false);
  });

  it("rejects hrefs that are not http(s) or a site path", () => {
    for (const href of ["javascript:alert(1)", "//evil.example", "ftp://x", "store", ""]) {
      expect(isAllowedBannerHref(href)).toBe(false);
      const parsed = PutTenantHomeBody.safeParse(withBanners([banner({ link: { type: "url", href } })]));
      expect(parsed.success).toBe(false);
    }
    for (const href of ["https://example.com/a?b=1", "http://localhost:8233/ru", "/ru/store", "/"]) {
      expect(isAllowedBannerHref(href)).toBe(true);
    }
  });

  it("rejects more than the maximum and duplicate ids", () => {
    const many = Array.from({ length: HOME_BANNERS_MAX + 1 }, (_, i) => banner({ id: `b${i}` }));
    expect(PutTenantHomeBody.safeParse(withBanners(many)).success).toBe(false);
    expect(PutTenantHomeBody.safeParse(withBanners([banner(), banner()])).success).toBe(false);
  });

  // 2026-10-05, cherkashino.com/ru: the default is English, the Russian texts sit in
  // `i18n.ru`. Zod strips an undeclared key, so without `i18n` in the schema the
  // owner's next save in the panel would silently drop every translation.
  it("keeps a banner's per-locale texts through a save, partial entries included", () => {
    const i18n = {
      ru: { kicker: "10 октября", label: "Курс", title: "Чистка\nпечени", button: "Смотреть", alt: "Печень среди трав" },
      "pt-BR": { title: "Limpeza do fígado" },
    };
    const parsed = PutTenantHomeBody.safeParse(
      withBanners([banner({ kicker: "October 10", label: "Course", title: "Liver\ncleanse", button: "View", i18n })]),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.content.banners[0].i18n).toEqual(i18n);
    }
  });

  it("rejects a per-locale text over the chip cap and a key that is not a locale code", () => {
    expect(
      PutTenantHomeBody.safeParse(
        withBanners([banner({ i18n: { ru: { title: "x".repeat(HOME_BANNER_TEXT_MAX + 1) } } })]),
      ).success,
    ).toBe(false);
    expect(
      PutTenantHomeBody.safeParse(withBanners([banner({ i18n: { "Русский": { title: "x" } } })])).success,
    ).toBe(false);
  });

  it("rejects a product link without a product id and an unknown link type", () => {
    expect(
      PutTenantHomeBody.safeParse(withBanners([banner({ link: { type: "product", product_id: "" } })])).success,
    ).toBe(false);
    expect(
      PutTenantHomeBody.safeParse(withBanners([banner({ link: { type: "page", href: "/x" } })])).success,
    ).toBe(false);
  });
});
