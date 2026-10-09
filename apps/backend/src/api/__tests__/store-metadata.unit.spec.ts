import { readFileSync } from "node:fs";
import path from "node:path";

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

import middlewares from "../middlewares";
import { STORE_METADATA_KEYS, allowStoreMetadata, allowStoreMetadataOnAnswer } from "../store-metadata";

/**
 * The allow lists of `metadata` on a Store API answer (t-2026-10-08-13, risks 14
 * and 15). The notes below are the kinds the acceptance check of 08.10.2026
 * found in the answers of the live shop, with made-up values.
 */
const OWNER_NOTES = {
  pricelist: { usd: 12.5, rate: 96.4 },
  pricelistPositions: [1, 2],
  wb: { nm_id: 1 },
  wb_url: "https://marketplace.test/catalog/1",
  wb_nm_id: 1,
  ozon_group_key: "g-1",
  needs_review: true,
  title_before_wb: "old title",
  migrated_from: "old-shop.test",
  source_url: "https://old-shop.test/p/1",
  source_id: "c-1",
};

const PRODUCT_READ = {
  digital: "true",
  course_page: { about: [{ title: "a" }] },
  cover: { src: "/c.jpg", alt: "cover" },
  seo: { ru: { title: "t", description: "d" } },
  condition: "new",
  brand: "b",
  mpn: "m-1",
  aspect_ratio: "3/4",
  regulated_as: "supplement",
};

const CATEGORY_READ = { image_url: "/cat.jpg", image_alt: "honey", seo: { ru: { title: "t" } } };

describe("store metadata: the keys a Store API answer carries", () => {
  it("keeps the listed keys of a product and drops every other one", () => {
    const answer = allowStoreMetadata({
      product: { id: "prod_1", title: "Honey", metadata: { ...PRODUCT_READ, ...OWNER_NOTES } },
    });

    expect(answer.product.metadata).toEqual(PRODUCT_READ);
    expect(answer.product.title).toBe("Honey");
  });

  it("leaves no key on a variant, a picture and a collection, and three on a category", () => {
    const answer = allowStoreMetadata({
      a: { id: "variant_1", metadata: { ...OWNER_NOTES, variant_images: ["/v.jpg"] } },
      b: { id: "img_1", url: "/i.jpg", metadata: { wb_photo_key: "k", wb_source_url: "https://img.test/1.jpg" } },
      c: { id: "pcol_1", metadata: { ...OWNER_NOTES } },
      d: { id: "pcat_1", metadata: { ...CATEGORY_READ, ...OWNER_NOTES } },
    });

    expect(answer.a.metadata).toEqual({});
    expect(answer.b).toEqual({ id: "img_1", url: "/i.jpg", metadata: {} });
    expect(answer.c.metadata).toEqual({});
    expect(answer.d.metadata).toEqual(CATEGORY_READ);
  });

  it("cuts at every depth of a product list", () => {
    const answer = allowStoreMetadata({
      products: [
        {
          id: "prod_1",
          metadata: { brand: "b", ...OWNER_NOTES },
          images: [{ id: "img_1", metadata: { wb_photo_key: "k" } }],
          variants: [
            {
              id: "variant_1",
              metadata: { ...OWNER_NOTES },
              images: [{ id: "img_2", metadata: { wb_source_url: "https://img.test/2.jpg" } }],
              product: { id: "prod_1", metadata: { mpn: "m-1", ...OWNER_NOTES } },
            },
          ],
          categories: [
            {
              id: "pcat_2",
              metadata: { image_url: "/c.jpg", source_id: "c-2" },
              parent_category: {
                id: "pcat_1",
                metadata: { source_id: "c-1" },
                parent_category: { id: "pcat_0", metadata: { image_alt: "root", source_id: "c-0" } },
              },
            },
          ],
          collection: { id: "pcol_1", metadata: { ...OWNER_NOTES } },
        },
      ],
      count: 1,
    });

    const [product] = answer.products;
    expect(product.metadata).toEqual({ brand: "b" });
    expect(product.images[0].metadata).toEqual({});
    expect(product.variants[0].metadata).toEqual({});
    expect(product.variants[0].images[0].metadata).toEqual({});
    expect(product.variants[0].product.metadata).toEqual({ mpn: "m-1" });
    expect(product.categories[0].metadata).toEqual({ image_url: "/c.jpg" });
    expect(product.categories[0].parent_category.metadata).toEqual({});
    expect(product.categories[0].parent_category.parent_category.metadata).toEqual({ image_alt: "root" });
    expect(product.collection.metadata).toEqual({});
    expect(answer.count).toBe(1);
  });

  it("cuts the products of a category and of a collection, and a category's children", () => {
    const answer = allowStoreMetadata({
      product_categories: [
        {
          id: "pcat_1",
          metadata: { ...CATEGORY_READ, source_id: "c-1" },
          products: [{ id: "prod_1", metadata: { seo: { ru: { title: "t" } }, ...OWNER_NOTES } }],
          category_children: [
            {
              id: "pcat_2",
              metadata: { source_id: "c-2" },
              category_children: [{ id: "pcat_3", metadata: { image_url: "/3.jpg", source_id: "c-3" } }],
            },
          ],
        },
      ],
      collections: [
        { id: "pcol_1", metadata: { ...OWNER_NOTES }, products: [{ id: "prod_2", metadata: { ...OWNER_NOTES } }] },
      ],
    });

    const [category] = answer.product_categories;
    expect(category.metadata).toEqual(CATEGORY_READ);
    expect(category.products[0].metadata).toEqual({ seo: { ru: { title: "t" } } });
    expect(category.category_children[0].metadata).toEqual({});
    expect(category.category_children[0].category_children[0].metadata).toEqual({ image_url: "/3.jpg" });
    expect(answer.collections[0].metadata).toEqual({});
    expect(answer.collections[0].products[0].metadata).toEqual({});
  });

  it("cuts the product and the variant of a cart line and of an order line, and nothing else there", () => {
    const line = (id: string) => ({
      id,
      metadata: { gift_note: "for mum" },
      product: { id: "prod_1", metadata: { digital: "true", ...OWNER_NOTES } },
      variant: {
        id: "variant_1",
        metadata: { ...OWNER_NOTES },
        product: { id: "prod_1", metadata: { ...OWNER_NOTES } },
      },
    });
    const cart = {
      id: "cart_1",
      metadata: { pickup_point_id: "p-1", source_id: "widget" },
      customer: { id: "cus_1", metadata: { telegram_id: 1, locale: "ru" } },
      shipping_methods: [{ id: "casm_1", metadata: { carrier: "cdek" } }],
      payment_collection: { id: "pay_col_1", metadata: { kind: "manual" } },
      items: [line("cali_1")],
    };
    const order = {
      id: "order_1",
      metadata: { payment_receipt: { status: "waiting" } },
      fulfillments: [{ id: "ful_1", metadata: { carrier: "cdek" } }],
      items: [line("ordli_1")],
    };

    const answer = allowStoreMetadata({ cart, order });

    for (const [item] of [answer.cart.items, answer.order.items]) {
      expect(item.metadata).toEqual({ gift_note: "for mum" });
      expect(item.product.metadata).toEqual({ digital: "true" });
      expect(item.variant.metadata).toEqual({});
      expect(item.variant.product.metadata).toEqual({});
    }
    expect(answer.cart.metadata).toBe(cart.metadata);
    expect(answer.cart.customer).toBe(cart.customer);
    expect(answer.cart.shipping_methods).toBe(cart.shipping_methods);
    expect(answer.cart.payment_collection).toBe(cart.payment_collection);
    expect(answer.order.metadata).toBe(order.metadata);
    expect(answer.order.fulfillments).toBe(order.fulfillments);
  });

  it("knows one of the five by the key it stands under when the fields list left the id out", () => {
    const answer = allowStoreMetadata({
      products: [{ handle: "honey", metadata: { ...OWNER_NOTES }, variants: [{ sku: "h-1", metadata: { ...OWNER_NOTES } }] }],
      product_category: { handle: "bees", metadata: { image_url: "/b.jpg", source_id: "c-1" } },
      collection: { handle: "new", metadata: { ...OWNER_NOTES } },
    });

    expect(answer.products[0].metadata).toEqual({});
    expect(answer.products[0].variants[0].metadata).toEqual({});
    expect(answer.product_category.metadata).toEqual({ image_url: "/b.jpg" });
    expect(answer.collection.metadata).toEqual({});
  });

  it("does not take an option, an option value, a tag or a type for a product", () => {
    const options = [
      { id: "opt_1", metadata: { kind: "colour" }, values: [{ id: "optval_1", metadata: { hex: "#fff" } }] },
      { id: "prodopt_1", metadata: { kind: "size" }, values: [{ id: "prodoptval_1", metadata: { hex: "#000" } }] },
    ];
    const tags = [{ id: "ptag_1", metadata: { a: 1 } }];
    const type = { id: "ptyp_1", metadata: { b: 2 } };

    const answer = allowStoreMetadata({ product: { id: "prod_1", options, tags, type } });

    expect(answer.product.options).toBe(options);
    expect(answer.product.tags).toBe(tags);
    expect(answer.product.type).toBe(type);
  });

  it("does not let a metadata that is not a keyed object pass on one of the five", () => {
    const answer = allowStoreMetadata({
      products: [
        { id: "prod_1", metadata: "pricelist: 12.5 usd" },
        { id: "prod_2", metadata: ["wb_nm_id", 1] },
        { id: "prod_3", metadata: null },
        { id: "prod_4" },
      ],
    });

    expect(answer.products[0].metadata).toBeNull();
    expect(answer.products[1].metadata).toBeNull();
    expect(answer.products[2].metadata).toBeNull();
    expect("metadata" in answer.products[3]).toBe(false);
  });

  it("does not walk into metadata, so what an allowed key holds comes whole", () => {
    const coursePage = { testimonials: [{ id: "prod_9", metadata: { wb_url: "kept, it is the reader's document" } }] };
    const answer = allowStoreMetadata({ product: { id: "prod_1", metadata: { course_page: coursePage, wb_url: "x" } } });

    expect(answer.product.metadata).toEqual({ course_page: coursePage });
    expect((answer.product.metadata as { course_page: unknown }).course_page).toBe(coursePage);
  });
});

describe("store metadata: an answer with nothing to cut", () => {
  it("returns an answer without metadata as it came, by identity", () => {
    const body = {
      products: [
        {
          id: "prod_1",
          title: "Honey",
          created_at: new Date("2026-10-08T00:00:00Z"),
          variants: [{ id: "variant_1", calculated_price: { calculated_amount: 100 }, images: [{ id: "img_1", url: "/i.jpg" }] }],
          categories: [{ id: "pcat_1", name: "Bees", category_children: [] }],
          collection: null,
        },
      ],
      count: 1,
      offset: 0,
      limit: 50,
    };
    const snapshot = JSON.stringify(body);

    expect(allowStoreMetadata(body)).toBe(body);
    expect(JSON.stringify(body)).toBe(snapshot);
  });

  it("returns an answer whose metadata holds listed keys only as it came, by identity", () => {
    const body = {
      product: { id: "prod_1", metadata: { ...PRODUCT_READ }, variants: [{ id: "variant_1", metadata: null }] },
      product_category: { id: "pcat_1", metadata: { ...CATEGORY_READ } },
    };

    expect(allowStoreMetadata(body)).toBe(body);
  });

  it("passes what is not an object, and an error answer, untouched", () => {
    const error = { type: "not_found", message: "Product with id: prod_1 was not found" };

    expect(allowStoreMetadata(error)).toBe(error);
    expect(allowStoreMetadata(null)).toBeNull();
    expect(allowStoreMetadata(undefined)).toBeUndefined();
    expect(allowStoreMetadata("ok")).toBe("ok");
    expect(allowStoreMetadata([])).toEqual([]);
  });

  it("never changes the object a route handed over", () => {
    const body = { product: { id: "prod_1", metadata: { brand: "b", ...OWNER_NOTES }, variants: [{ id: "variant_1", metadata: { ...OWNER_NOTES } }] } };
    const snapshot = JSON.stringify(body);

    const answer = allowStoreMetadata(body);

    expect(answer).not.toBe(body);
    expect(JSON.stringify(body)).toBe(snapshot);
  });

  it("leaves a date and a price amount to the serialiser, and reads an object through its toJSON", () => {
    class Amount {
      constructor(private readonly value: number) {}
      toJSON() {
        return this.value;
      }
    }
    class Row {
      constructor(private readonly row: Record<string, unknown>) {}
      toJSON() {
        return this.row;
      }
    }
    const created = new Date("2026-10-08T00:00:00Z");
    const total = new Amount(100);
    const plain = { cart: { id: "cart_1", created_at: created, total } };

    expect(allowStoreMetadata(plain)).toBe(plain);

    const answer = allowStoreMetadata({
      total,
      product: new Row({ id: "prod_1", created_at: created, metadata: { brand: "b", ...OWNER_NOTES } }),
    });

    expect(JSON.parse(JSON.stringify(answer))).toEqual({
      total: 100,
      product: { id: "prod_1", created_at: "2026-10-08T00:00:00.000Z", metadata: { brand: "b" } },
    });
  });

  it("hands a cycle back to the serialiser instead of looping", () => {
    const product: Record<string, unknown> = { id: "prod_1", metadata: { ...OWNER_NOTES } };
    product.variants = [{ id: "variant_1", product }];

    const answer = allowStoreMetadata({ product });

    expect(answer.product.metadata).toEqual({});
    expect(() => JSON.stringify(answer)).toThrow(TypeError);
  });
});

describe("store metadata: where the cut is mounted", () => {
  const routes = middlewares.routes ?? [];
  const matchersWithTheCut = routes
    .filter((route) => (route.middlewares ?? []).includes(allowStoreMetadataOnAnswer))
    .map((route) => String(route.matcher));

  type Answer = { json: (payload: unknown) => Answer; status: (code: number) => Answer };

  /** One answer sent the way a route sends it, behind the cut when the matcher carries it. */
  const answerThrough = (matcher: string, body: unknown): unknown => {
    let sent: unknown;
    const res: Answer = {
      json: (payload) => {
        sent = payload;
        return res;
      },
      status: () => res,
    };
    const carried = routes
      .filter((route) => route.matcher === matcher)
      .flatMap((route) => route.middlewares ?? [])
      .filter((middleware) => middleware === allowStoreMetadataOnAnswer);

    for (const middleware of carried) {
      middleware({} as MedusaRequest, res as unknown as MedusaResponse, () => undefined);
    }
    res.status(200).json(body);
    return sent;
  };

  const adminShaped = () => ({
    product: {
      id: "prod_1",
      metadata: { brand: "b", ...OWNER_NOTES },
      variants: [{ id: "variant_1", metadata: { ...OWNER_NOTES } }],
      images: [{ id: "img_1", metadata: { wb_photo_key: "k" } }],
      categories: [{ id: "pcat_1", metadata: { source_id: "c-1" } }],
      collection: { id: "pcol_1", metadata: { ...OWNER_NOTES } },
    },
  });

  it("is on the Store API wildcard and on no other matcher", () => {
    expect(matchersWithTheCut).toEqual(["/store/*"]);
  });

  it("cuts an answer of a Store route", () => {
    const sent = answerThrough("/store/*", adminShaped()) as ReturnType<typeof adminShaped>;

    expect(sent.product.metadata).toEqual({ brand: "b" });
    expect(sent.product.variants[0].metadata).toEqual({});
    expect(sent.product.images[0].metadata).toEqual({});
    expect(sent.product.categories[0].metadata).toEqual({});
    expect(sent.product.collection.metadata).toEqual({});
  });

  it("leaves the whole metadata in an answer of the shop panel and of the Admin API", () => {
    const matchers = routes.map((route) => String(route.matcher));
    const panelAndAdmin = [...new Set(matchers.filter((matcher) => /^\/(tenants|admin)(\/|$)/.test(matcher)))];

    expect(panelAndAdmin).toEqual(expect.arrayContaining(["/tenants/*", "/tenants/products", "/admin/tenants"]));
    for (const matcher of panelAndAdmin) {
      const body = adminShaped();
      expect(answerThrough(matcher, body)).toBe(body);
    }
  });
});

describe("store metadata: the storefront's own lists", () => {
  /**
   * `pnpm-workspace.yaml` shares no package between the two apps, so the lists
   * are written out twice. A key the storefront reads and this file does not
   * list arrives empty with no error anywhere, and this is the check that says so.
   */
  const storefrontFile = path.resolve(__dirname, "../../../../storefront/src/lib/util/product-metadata.ts");
  const source = readFileSync(storefrontFile, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  const storefrontList = (name: string): string[] => {
    const match = source.match(new RegExp(`export const ${name}\\b[^=]*=\\s*\\[([\\s\\S]*?)\\]`));
    if (!match) {
      throw new Error(`${name} is not in ${storefrontFile}`);
    }
    return [...match[1].matchAll(/"([^"]+)"/g)].map(([, key]) => key);
  };

  it.each([
    ["PRODUCT_METADATA_KEYS", "product"],
    ["VARIANT_METADATA_KEYS", "variant"],
    ["IMAGE_METADATA_KEYS", "image"],
  ] as const)("every key of %s is on the %s list here", (name, carrier) => {
    const missing = storefrontList(name).filter((key) => !STORE_METADATA_KEYS[carrier].includes(key));

    expect(missing).toEqual([]);
  });

  it("reads the product list of the storefront file, so an empty parse cannot pass for a match", () => {
    expect(storefrontList("PRODUCT_METADATA_KEYS")).toEqual(expect.arrayContaining(["digital", "seo"]));
  });
});
