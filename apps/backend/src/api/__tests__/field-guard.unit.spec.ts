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
    // Only as the first segment: below it a tag, a type or a collection leads out of the shop.
    expect(
      guardFields(
        "/store/product-categories",
        "*products.tags.products,*products.type.products,*products.collection.products,*category_children.products",
      ).kept,
    ).toEqual([]);
  });

  it("reads a star on a named column as a column, and on an unknown name as a relation", () => {
    expect(guardFields("/store/carts/cart_1", "*items.thumbnail,*items.metadata,*customer.addresses.metadata").kept).toEqual([
      "*items.thumbnail",
      "*items.metadata",
    ]);
    expect(guardFields("/store/carts/cart_1", "*items.some_new_link").kept).toEqual([]);
  });

  it("treats a row that shops share as a leaf", () => {
    // K1: the default shipping profile carries the shipping options of every shop.
    expect(guardFields("/store/products", "id,*shipping_profile,shipping_profile.name,*shipping_profile.shipping_options")).toEqual({
      kept: ["id", "*shipping_profile", "shipping_profile.name"],
      dropped: ["*shipping_profile.shipping_options"],
    });
    // K4: a buyer is one row for every shop, and so is the address book.
    expect(guardFields("/tenants/orders/order_1", "*customer,customer.email,*customer.addresses,customer.addresses,customer.groups.name").kept).toEqual([
      "*customer",
      "customer.email",
    ]);
    expect(guardFields("/tenants/orders/order_1", "*shipping_methods.shipping_option.shipping_profile.shipping_options").kept).toEqual([]);
  });

  it("opens nothing under a route whose own rows are shared, except what is named", () => {
    // K3: /store/collections lists every shop's collections.
    expect(guardFields("/store/collections", "id,title,*products,products.id,products").kept).toEqual(["id", "title"]);
    expect(guardFields("/store/collections/pcol_1", "*products").kept).toEqual([]);
    expect(guardFields("/tenants/shipping-profiles", "id,name,*shipping_options").kept).toEqual(["id", "name"]);
    expect(guardFields("/tenants/customers/cus_1", "id,email,*addresses,addresses,*groups").kept).toEqual(["id", "email"]);
    expect(guardFields("/store/regions", "id,*countries,*payment_providers,*countries.region").dropped).toEqual([
      "*countries.region",
    ]);
    // The buyer's own address book, read by the buyer, stays open.
    expect(guardFields("/store/customers/me", "*addresses").dropped).toEqual([]);
  });

  it("keeps every field list the storefront and the panel send today", () => {
    const sent: Array<[string, string]> = [
      ["/store/products", "*variants.calculated_price,+variants.inventory_quantity,*variants.images,*variants.options,+options.values.metadata,+metadata,+tags,*categories,*categories.parent_category,*categories.parent_category.parent_category"],
      ["/store/products", "id,*options,*options.values,variants.options.id,variants.options.option_id"],
      ["/store/shipping-options", "+metadata,+data,+provider_id,+service_zone.fulfillment_set.type,+service_zone.fulfillment_set.location.*,+service_zone.fulfillment_set.location.address.*"],
      ["/store/customers/me/addresses", "*addresses"],
      ["/store/carts/cart_1", "*items, *region, *items.product, *items.variant, *items.thumbnail, *items.metadata, +items.total, *promotions, +shipping_methods.name, +shipping_methods.data"],
      ["/store/orders", "*payment_collections.payments,*items,*items.metadata,*items.variant,*items.product,+metadata,+canceled_at,+fulfillments.packed_at,+fulfillments.shipped_at,+fulfillments.delivered_at,*fulfillments.labels,+fulfillments.metadata"],
      ["/store/carts/cart_1", "*shipping_address, *billing_address"],
      ["/store/product-categories", "id,handle,name,rank,metadata,parent_category_id,*category_children"],
      ["/store/orders/order_1", "*items,+items.metadata,*items.variant,*items.product,*shipping_methods"],
      ["/store/product-categories", "*category_children, +category_children.metadata, +metadata, *products, *parent_category, *parent_category.parent_category"],
      ["/store/product-variants/variant_1", "*images"],
      ["/store/carts/cart_1", "payment_collection.payment_sessions.data"],
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
    const lost = sent.flatMap(([path, fields]) => guardFields(path, fields).dropped.map((field) => `${path} ${field}`));
    expect(lost).toEqual([]);
  });

  it("names the one list of the panel that loses a field, so the cost is on record", () => {
    // The buyer screen of the panel asks for the buyer's whole address book, which
    // holds addresses entered in other shops (K4). The block now shows its empty
    // state; the addresses of the shop's own orders stay on the orders.
    expect(guardFields("/tenants/customers/cus_1", "*addresses").dropped).toEqual(["*addresses"]);
  });

  it("tells the family on the path the router sees, not on the caller's spelling", () => {
    // K6: Express matches in any case, so `/tenants/Customers` is the customers route.
    expect(guardFields("/tenants/Customers/cus_1", "id,*addresses").kept).toEqual(["id"]);
    expect(guardFields("/tenants/Shipping-Profiles", "id,*shipping_options").kept).toEqual(["id"]);
    expect(guardFields("/STORE/Collections/", "*products").kept).toEqual([]);
    expect(guardFields("/store//collections", "*products").kept).toEqual([]);
    expect(guardFields("/store/%63ollections", "*products").kept).toEqual([]);
    expect(guardFields("/STORE/products", "id,*tenant.admins,*variants").kept).toEqual(["id", "*variants"]);
    // The spelling does not close what the family opens.
    expect(guardFields("/Store/Product-Categories/", "*products").dropped).toEqual([]);
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

    it("leaves a clean request alone", () => {
      expect(run("/store/products", { fields: "id,*variants" })).toEqual({ query: { fields: "id,*variants" }, logged: [] });
    });

    it("never stands aside on a path test, because it is mounted only where it has to act", () => {
      expect(run("/STORE/products?limit=1", { fields: "id,*tenant.admins" }).query).toEqual({ fields: "id" });
      expect(run("/Tenants/Orders/order_1", { fields: "id,*customer.orders" }).query).toEqual({ fields: "id" });
      // A path whose family cannot be told gets the strictest list: nothing opens.
      expect(run("/store/%zz/products", { fields: "id,*variants,*tenant" }).query).toEqual({ fields: "id" });
      expect(run("/store/products", { limit: "1" }).query).toEqual({ limit: "1" });
    });
  });
});
