import { guardFields, guardRequestedFields } from "../field-guard";

/**
 * The allow list of `?fields=` (architecture review 2026-09-21, finding T-6).
 * The three requests of the finding come first: each answered with data on the
 * two-shop stand before the guard existed.
 */
describe("field guard: what a caller may expand through ?fields=", () => {
  it("drops the tenant row, its admins and its settings on a store product", () => {
    expect(guardFields("/store/products", "id,*tenant,*tenant.admins,*tenant.requisites")).toEqual({
      kept: ["id"],
      dropped: ["*tenant", "*tenant.admins", "*tenant.requisites"],
    });
    expect(guardFields("/store/products", "id,*tenant.notification_settings").kept).toEqual(["id"]);
    expect(guardFields("/store/products", "id,tenant.admins.email,tenant,tenant.*").kept).toEqual(["id"]);
  });

  it("drops the buyer's other orders on a panel order, and keeps the buyer", () => {
    expect(guardFields("/tenants/orders/order_1", "id,*customer,*customer.orders,customer.orders.id")).toEqual({
      kept: ["id", "*customer"],
      dropped: ["*customer.orders", "customer.orders.id"],
    });
  });

  it("drops a tenant reached through an allowed relation", () => {
    expect(guardFields("/tenants/products/prod_1", "id,*sales_channels.tenant.admins,*variants")).toEqual({
      kept: ["id", "*variants"],
      dropped: ["*sales_channels.tenant.admins"],
    });
  });

  it("drops a relation nobody listed, and a link name in the place of a column", () => {
    expect(guardFields("/store/products", "id,*some_new_link.rows,product_tenant_link,orders").dropped).toEqual([
      "*some_new_link.rows",
      "product_tenant_link",
      "orders",
    ]);
  });

  it("opens products only under a parent that belongs to one shop", () => {
    expect(guardFields("/store/product-categories", "*products,products.id").dropped).toEqual([]);
    expect(guardFields("/tenants/product-categories/pcat_1", "products.id").dropped).toEqual([]);
    expect(guardFields("/store/products", "*tags.products,*collection.products,type.products.id").kept).toEqual([]);
    expect(guardFields("/tenants/collections", "*products").kept).toEqual([]);
    // A family is a path prefix, not a string prefix.
    expect(guardFields("/store/product-categories-other", "*products").kept).toEqual([]);
  });

  it("keeps every field list the storefront and the panel send today", () => {
    const sent: Array<[string, string]> = [
      ["/store/products", "*variants.calculated_price,+variants.inventory_quantity,*variants.images,*variants.options,+options.values.metadata,+metadata,+tags,*categories,*categories.parent_category,*categories.parent_category.parent_category"],
      ["/store/products", "id,*options,*options.values,variants.options.id,variants.options.option_id"],
      ["/store/shipping-options", "+metadata,+data,+provider_id,+service_zone.fulfillment_set.type,+service_zone.fulfillment_set.location.*,+service_zone.fulfillment_set.location.address.*"],
      ["/store/customers/me/addresses", "*addresses"],
      ["/store/collections", "*products"],
      ["/store/orders/order_1", "*items,+items.metadata,*items.variant,*items.product,*shipping_methods"],
      ["/store/product-categories", "*category_children, +category_children.metadata, +metadata, *products, *parent_category, *parent_category.parent_category"],
      ["/store/product-variants/variant_1", "*images"],
      ["/store/carts/cart_1", "payment_collection.payment_sessions.data"],
      ["/tenants/customers/cus_1", "*addresses"],
      ["/tenants/products/prod_1", "images.id,images.url,images.variants.id,-type,-collection,-options,-tags,-variants,-sales_channels"],
      ["/tenants/products/prod_1", "*shipping_profile,-type,-collection,-options,-tags,-images,-variants,-sales_channels"],
      ["/tenants/products/prod_1/variants", "title,sku,thumbnail,*options,created_at,*inventory_items.inventory.location_levels,inventory_quantity,manage_inventory"],
      ["/tenants/products/prod_1/variants", "id,title,sku,inventory_items,inventory_items.*,inventory_items.inventory,inventory_items.inventory.id,*inventory_items.inventory.location_levels"],
      ["/tenants/products/prod_1/variants/variant_1", "*product,*product.images,*images,+images.variants.id"],
      ["/tenants/orders/order_1", "*fulfillments,*fulfillments.items,*fulfillments.labels,no_notification"],
      ["/tenants/orders/order_1", "currency_code,*items,*items.variant,+items.variant.product.shipping_profile.id,*shipping_address,+shipping_methods.shipping_option_id,no_notification"],
      ["/tenants/inventory-items", "*inventory,*inventory.location_levels,*inventory_items"],
      ["/tenants/shipping-options", "+service_zone.fulfillment_set.location.id"],
      ["/tenants/returns", "+received_at,*items"],
      ["/tenants/claims", "*additional_items"],
      ["/tenants/returns", "*items,*items.reason"],
      ["/tenants/product-categories", "id,name,category_children,handle,is_internal,is_active,metadata,category_children.metadata"],
      ["/tenants/product-categories/pcat_1", "products.id"],
      ["/tenants/marketplaces/catalog", "id,sku,title,product.title"],
    ];
    for (const [path, fields] of sent) {
      expect([path, guardFields(path, fields).dropped]).toEqual([path, []]);
    }
  });

  describe("as a middleware", () => {
    const run = (originalUrl: string, query: Record<string, unknown>) => {
      const req = { originalUrl, method: "GET", query } as any;
      const next = jest.fn();
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      guardRequestedFields(req, {} as any, next);
      const logged = warn.mock.calls.map((call) => String(call[0]));
      warn.mockRestore();
      expect(next).toHaveBeenCalledTimes(1);
      return { query: req.query, logged };
    };

    it("rewrites the query before a validator reads it, and says what it dropped", () => {
      const { query, logged } = run("/store/products?limit=1", { limit: "1", fields: "id,*tenant.admins" });
      expect(query).toEqual({ limit: "1", fields: "id" });
      expect(logged).toEqual(["[field-guard] GET /store/products dropped fields=*tenant.admins"]);
    });

    it("falls back to the route's defaults when nothing the caller asked for passes", () => {
      expect(run("/store/products", { fields: "*tenant" }).query).toEqual({});
    });

    it("reads a repeated fields parameter as one list", () => {
      expect(run("/tenants/orders/order_1", { fields: ["id", "*customer.orders"] }).query).toEqual({ fields: "id" });
    });

    it("leaves a clean request and every other namespace alone", () => {
      expect(run("/store/products", { fields: "id,*variants" })).toEqual({ query: { fields: "id,*variants" }, logged: [] });
      expect(run("/admin/products", { fields: "*tenant" }).query).toEqual({ fields: "*tenant" });
      expect(run("/store/products", { limit: "1" }).query).toEqual({ limit: "1" });
    });
  });
});
