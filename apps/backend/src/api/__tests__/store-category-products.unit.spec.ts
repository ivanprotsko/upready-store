import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

import { guardFields } from "../field-guard";
import middlewares from "../middlewares";
import { allowStoreMetadataOnAnswer } from "../store-metadata";
import {
  keepPublishedCategoryProducts,
  keepPublishedCategoryProductsOnAnswer,
  withProductStatusField,
} from "../store-category-products";

/**
 * A category answers on the Store API with its published products only
 * (t-2026-10-12-32, defect D3). The titles stand in for the drafts the audit
 * found in «Мёд» on cherkashino.ru.
 */
const published = { id: "prod_pub", title: "Мёд липовый", handle: "med-lipovyy", status: "published" };
const draft = { id: "prod_draft", title: "Шампунь мумиё", handle: "shampun-mumie", status: "draft" };
const proposed = { id: "prod_prop", title: "Прополис", handle: "propolis", status: "proposed" };
const rejected = { id: "prod_rej", title: "Мёд маточный", handle: "med-matochnyy", status: "rejected" };

describe("store category products: what a guest reads", () => {
  it("drops a draft from a category list and keeps the published product", () => {
    const answer = keepPublishedCategoryProducts({
      product_categories: [{ id: "pcat_honey", name: "Мёд", products: [draft, published, proposed, rejected] }],
      count: 1,
    });

    expect(answer.product_categories[0].products).toEqual([published]);
    expect(answer.count).toBe(1);
  });

  it("drops a draft from one category read by id", () => {
    const answer = keepPublishedCategoryProducts({
      product_category: { id: "pcat_honey", products: [published, draft] },
    });

    expect(answer.product_category.products).toEqual([published]);
  });

  it("cuts the products of a child and of a parent the same way", () => {
    const answer = keepPublishedCategoryProducts({
      product_categories: [
        {
          id: "pcat_food",
          category_children: [{ id: "pcat_honey", products: [draft, published] }],
          parent_category: { id: "pcat_root", products: [draft] },
          products: [],
        },
      ],
    });

    const [food] = answer.product_categories;
    expect(food.category_children[0].products).toEqual([published]);
    expect(food.parent_category.products).toEqual([]);
  });

  it("drops a product whose status the answer does not carry", () => {
    const answer = keepPublishedCategoryProducts({
      product_categories: [{ id: "pcat_honey", products: [{ id: "prod_unknown", title: "?" }, published] }],
    });

    expect(answer.product_categories[0].products).toEqual([published]);
  });

  it("returns a category answer with nothing to cut, and any other answer, as it came", () => {
    const clean = { product_categories: [{ id: "pcat_honey", products: [published] }] };
    expect(keepPublishedCategoryProducts(clean)).toBe(clean);

    const noProducts = { product_categories: [{ id: "pcat_honey", name: "Мёд" }] };
    expect(keepPublishedCategoryProducts(noProducts)).toBe(noProducts);

    // `/store/products` scopes its own list to published products; this file
    // does not read it, so a narrow `fields` list there loses nothing.
    const productList = { products: [{ id: "prod_pub" }], count: 1 };
    expect(keepPublishedCategoryProducts(productList)).toBe(productList);
  });
});

describe("store category products: the status column", () => {
  it("adds products.status when the caller expands products in any spelling", () => {
    expect(withProductStatusField("id,name,handle,*products")).toBe("id,name,handle,*products,+products.status");
    expect(withProductStatusField("id,products.id")).toBe("id,products.id,+products.status");
    expect(withProductStatusField("+products.title")).toBe("+products.title,+products.status");
    // A `+` in a URL arrives as a space.
    expect(withProductStatusField(" products.handle")).toBe(" products.handle,+products.status");
    expect(withProductStatusField("id,products.variants.id")).toBe("id,products.variants.id,+products.status");
  });

  it("leaves a request that does not expand products alone", () => {
    expect(withProductStatusField("id,handle,*category_children")).toBe("id,handle,*category_children");
    expect(withProductStatusField("-products")).toBe("-products");
    expect(withProductStatusField("id,product_count")).toBe("id,product_count");
  });

  it("reaches only the routes where the field guard lets products through", () => {
    const afterGuard = (path: string, fields: string) =>
      withProductStatusField(guardFields(path, fields).kept.join(","));

    expect(afterGuard("/store/product-categories", "id,*products")).toContain("+products.status");
    expect(afterGuard("/store/tenant/product-categories", "id,products.id")).toContain("+products.status");
    expect(afterGuard("/store/collections", "id,*products")).toBe("id");
    expect(afterGuard("/store/product-tags", "id,*products")).toBe("id");
    expect(afterGuard("/store/products", "id,categories.products.id")).toBe("id");
  });
});

describe("store category products: the middleware", () => {
  const run = (fields: string | undefined, body: unknown) => {
    const req = { query: fields === undefined ? {} : { fields } } as unknown as MedusaRequest;
    const sent: unknown[] = [];
    const res = { json: (payload: unknown) => sent.push(payload) } as unknown as MedusaResponse;
    const next = jest.fn();

    keepPublishedCategoryProductsOnAnswer(req, res, next);
    res.json(body as never);

    return { query: req.query as Record<string, unknown>, sent, next };
  };

  it("asks for the status and answers with published products only", () => {
    const { query, sent, next } = run("id,name,handle,*products", {
      product_categories: [{ id: "pcat_honey", products: [draft, published] }],
    });

    expect(next).toHaveBeenCalledTimes(1);
    expect(query.fields).toBe("id,name,handle,*products,+products.status");
    expect(sent).toEqual([{ product_categories: [{ id: "pcat_honey", products: [published] }] }]);
  });

  it("leaves a request without fields as it came", () => {
    const { query } = run(undefined, { product_categories: [] });
    expect(query).toEqual({});
  });

  it("stands on /store/* after the field guard and the metadata cut", () => {
    const store = middlewares.routes?.find((route) => route.matcher === "/store/*");
    const chain = store?.middlewares ?? [];

    expect(chain.indexOf(keepPublishedCategoryProductsOnAnswer)).toBeGreaterThan(
      chain.indexOf(allowStoreMetadataOnAnswer),
    );
    expect(chain[0]?.name).toBe("guardRequestedFields");
  });
});
