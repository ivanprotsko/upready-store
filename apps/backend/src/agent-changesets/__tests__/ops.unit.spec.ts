import { checkOp, hashValue, OP_SPECS, productIdOf, stableJson, variantIdOf, type ChangesetOp } from "../ops";

describe("agent changeset ops (t-2026-10-27-04)", () => {
  describe("checkOp", () => {
    it("takes an allowed op with allowed fields", () => {
      const check = checkOp({ method: "PUT", path: "/tenants/pages/about", body: { title: "О нас", locale: "ru" } });
      expect(check).toMatchObject({ ok: true, rule: { kind: "page", scope: "site" } });
    });

    it("refuses a denied route with its reason", () => {
      const check = checkOp({ method: "POST", path: "/tenants/orders/order_1", body: {} });
      expect(check.ok).toBe(false);
    });

    it("refuses a field the route does not open to the agent", () => {
      const check = checkOp({ method: "POST", path: "/tenants/products/prod_1", body: { title: "x", status: "draft" } });
      expect(check).toEqual({ ok: false, reason: expect.stringContaining("status") });
    });

    it("refuses a path outside /tenants or with ..", () => {
      expect(checkOp({ method: "PUT", path: "/admin/products/x", body: {} }).ok).toBe(false);
      expect(checkOp({ method: "PUT", path: "/tenants/pages/../orders", body: {} }).ok).toBe(false);
      expect(checkOp("PUT /tenants/home").ok).toBe(false);
    });

    it("wants an article op's language and a new page's slug", () => {
      expect(checkOp({ method: "PUT", path: "/tenants/articles/a", body: { title: "x" } }).ok).toBe(false);
      expect(checkOp({ method: "PUT", path: "/tenants/articles/a", body: { title: "x", locale: "ru" } }).ok).toBe(true);
      expect(checkOp({ method: "POST", path: "/tenants/pages", body: { title: "x" } }).ok).toBe(false);
    });
  });

  describe("hashing", () => {
    it("gives equal values equal hashes whatever the key order", () => {
      expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe(stableJson({ a: { c: 3, d: 2 }, b: 1 }));
      expect(hashValue({ b: 1, a: 2 })).toBe(hashValue({ a: 2, b: 1 }));
      expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
      expect(hashValue(null)).toHaveLength(64);
    });
  });

  describe("snapshots and restores", () => {
    const pageOp: ChangesetOp = { method: "PUT", path: "/tenants/pages/about", body: { title: "Новое", locale: "en" } };

    it("reads a page in the op's language and restores it there", () => {
      expect(OP_SPECS.page.read(pageOp)).toBe("/tenants/pages/about?locale=en");
      const before = OP_SPECS.page.project({ page: { title: "Old", body: "b", published: true, extra: 1 } }, pageOp);
      expect(before).toMatchObject({ title: "Old", body: "b", published: true, in_footer: null });
      expect(before).not.toHaveProperty("extra");
      expect(OP_SPECS.page.restore(pageOp, before)).toEqual({
        method: "PUT",
        path: "/tenants/pages/about",
        body: { ...before, locale: "en" },
      });
    });

    it("undoes a created page by deleting it, and has no undo for one that was there", () => {
      const op: ChangesetOp = { method: "POST", path: "/tenants/pages", body: { slug: "sale", title: "Sale" } };
      expect(OP_SPECS["page-create"].restore(op, null)).toEqual({ method: "DELETE", path: "/tenants/pages/sale" });
      expect(OP_SPECS["page-create"].restore(op, { title: "x" })).toBeNull();
    });

    it("has no undo for a home page never saved", () => {
      const op: ChangesetOp = { method: "PUT", path: "/tenants/home", body: { content: {} } };
      expect(OP_SPECS.home.project({ home: null }, op)).toBeNull();
      expect(OP_SPECS.home.restore(op, null)).toBeNull();
    });

    it("keeps only the product fields the op names, images and categories by url and id", () => {
      const op: ChangesetOp = {
        method: "POST",
        path: "/tenants/products/prod_1",
        body: { title: "x", images: [], categories: [] },
      };
      const before = OP_SPECS.product.project(
        {
          product: {
            title: "Чай",
            description: "untouched",
            images: [{ id: "img_1", url: "https://a/1.jpg", rank: 0 }],
            categories: [{ id: "pcat_b", name: "B" }, { id: "pcat_a", name: "A" }],
          },
        },
        op,
      );
      expect(before).toEqual({
        categories: [{ id: "pcat_a" }, { id: "pcat_b" }],
        images: [{ url: "https://a/1.jpg" }],
        title: "Чай",
      });
    });

    it("keeps a variant's prices as amount and currency, sorted", () => {
      const op: ChangesetOp = { method: "POST", path: "/tenants/products/prod_1/variants/variant_1", body: { prices: [] } };
      expect(
        OP_SPECS.variant.project(
          { variant: { prices: [{ id: "p2", amount: 10, currency_code: "USD" }, { id: "p1", amount: 900, currency_code: "rub" }] } },
          op,
        ),
      ).toEqual({ prices: [{ amount: 900, currency_code: "rub" }, { amount: 10, currency_code: "usd" }] });
      expect(productIdOf(op)).toBe("prod_1");
      expect(variantIdOf(op)).toBe("variant_1");
    });

    it("restores a characteristic the product did not have as empty", () => {
      const op: ChangesetOp = {
        method: "POST",
        path: "/tenants/products/prod_1/attributes",
        body: { values: [{ key: "taste", value: "sweet" }] },
      };
      const before = OP_SPECS.attributes.project({ product_attributes: [{ key: "color", value: "red" }] }, op);
      expect(before).toEqual({ taste: null });
      expect(OP_SPECS.attributes.restore(op, before)).toEqual({
        method: "POST",
        path: "/tenants/products/prod_1/attributes",
        body: { values: [{ key: "taste", value: null }] },
      });
    });
  });
});
