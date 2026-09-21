import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

/**
 * What a caller may expand through `?fields=` on `/store` and `/tenants`
 * (architecture review 2026-09-21, finding T-6).
 *
 * Medusa hands the requested fields to the query engine, and the engine follows
 * every module link. This repository links a tenant to products, sales channels,
 * orders and categories, so before this file an anonymous visitor with the
 * publishable key read `*tenant.admins` and `*tenant.notification_settings`
 * from any product, and a shop owner read `*customer.orders`, the orders the
 * same buyer placed in every other shop.
 *
 * Why the framework's own lists do not close it: in Medusa 2.19 the `allowed`
 * and `restricted` lists of a query config only act behind the
 * `rbac_filter_fields` feature flag (`prepareListQuery` in
 * `@medusajs/framework/dist/http/utils/get-query-config.js`), and `disallowed`
 * is a deny list that Medusa's own Store routes fill and that knows nothing of
 * this repository's links.
 *
 * So this is an allow list, and it works on the caller's text before any
 * validator reads it. A relation can be expanded when every segment of its path
 * is on the list of the route family. A relation nobody listed stays closed,
 * which is the point: a new link is closed until somebody opens it here.
 * The defaults of a route are not the caller's text and are not filtered.
 */

/**
 * Relations that stay inside the thing the route already scoped: the parts of a
 * product, of an order, of a cart, of a stock item.
 */
const INSIDE_THE_SHOP = [
  // product
  "variants", "variant", "options", "option", "values", "images", "tags", "type", "collection",
  "categories", "category_children", "parent_category", "product", "shipping_profile",
  "translations",
  // prices
  "prices", "price_set", "price_rules", "calculated_price", "rules",
  // stock
  "inventory", "inventory_items", "location_levels", "reservation_items", "stock_locations",
  "location", "address",
  // order and cart
  "items", "item", "detail", "tax_lines", "adjustments", "shipping_methods", "shipping_address",
  "billing_address", "summary", "region", "countries", "sales_channel", "sales_channels",
  "promotions", "promotion", "application_method", "target_rules", "buy_rules", "campaign",
  "budget", "credit_lines", "order", "order_change", "actions",
  // payment
  "payment_collection", "payment_collections", "payment_sessions", "payments", "captures",
  "refunds", "refund_reason", "payment_providers",
  // delivery
  "fulfillments", "labels", "fulfillment_set", "fulfillment_sets", "service_zone", "service_zones",
  "geo_zones", "shipping_option", "shipping_options", "shipping_option_type", "provider",
  "fulfillment_provider",
  // returns, claims, exchanges
  "returns", "return", "return_reason", "reason", "claims", "exchanges", "additional_items",
  "claim_items", "return_items",
  // buyer, as far as the route itself already shows one
  "customer", "addresses", "groups",
];

/**
 * `products` is a way out of a shop from anything that shops share (a tag, a
 * type, a collection), so it opens only where the parent belongs to one shop.
 */
const FAMILY_EXTRAS: Array<[prefix: string, segments: string[]]> = [
  ["/store/product-categories", ["products"]],
  ["/store/tenant/product-categories", ["products"]],
  ["/store/collections", ["products"]],
  ["/tenants/product-categories", ["products"]],
];

/**
 * Names that are relations and never columns. The last segment of a plain field
 * (`fields=id,tenant`) cannot be told from a column, so it passes unless it is
 * one of these and the family did not open it.
 */
const NEVER_A_COLUMN = [
  "tenant", "tenants", "admins", "notification_settings", "requisites", "integration_secrets",
  "domains", "home_config", "locale_settings", "orders", "carts", "customers", "products",
  "account_holder", "account_holders", "users", "api_keys", "publishable_api_keys",
];

const GUARDED = ["/store", "/tenants"];

const allowedFor = (path: string): Set<string> => {
  const allowed = new Set(INSIDE_THE_SHOP);
  for (const [prefix, segments] of FAMILY_EXTRAS) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      segments.forEach((segment) => allowed.add(segment));
    }
  }
  return allowed;
};

const isLinkName = (segment: string) => segment.includes("tenant") || segment.endsWith("_link");

/** Splits one requested field into the fields that pass and the ones that do not. */
export function guardFields(path: string, fields: string): { kept: string[]; dropped: string[] } {
  const allowed = allowedFor(path);
  const kept: string[] = [];
  const dropped: string[] = [];

  for (const raw of fields.split(",")) {
    const item = raw.trim();
    if (!item) continue;

    const name = item.replace(/^[+-]/, "");
    const isStar = name.startsWith("*") || name.endsWith(".*");
    const segments = name.replace(/^\*/, "").replace(/\.\*$/, "").split(".");
    const last = segments[segments.length - 1];
    const relations = isStar ? segments : segments.slice(0, -1);

    const passes =
      relations.every((segment) => allowed.has(segment)) &&
      (isStar || allowed.has(last) || !(NEVER_A_COLUMN.includes(last) || isLinkName(last)));

    // `-tenant` only takes a field away, so it can stay whatever it names.
    (passes || item.startsWith("-") ? kept : dropped).push(item);
  }

  return { kept, dropped };
}

/**
 * Registered on `/store*` and `/tenants*`. A wildcard matcher sorts before every
 * static and parametric route, Medusa's own included, so this runs before any
 * `validateAndTransformQuery` reads `req.query.fields`.
 *
 * A field that does not pass is taken out and the request goes on, the way
 * Medusa treats its own `disallowed` list. The log line names it, so a screen
 * that lost a field it needs is found in the log and not by guessing.
 */
export function guardRequestedFields(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  const query = req.query as Record<string, unknown>;
  const requested = query?.fields;
  // `req.path` is relative to the matcher the middleware is mounted on.
  const path = (req.originalUrl || req.url || "").split("?")[0];
  if (requested === undefined || !GUARDED.some((root) => path === root || path.startsWith(`${root}/`))) {
    return next();
  }

  const text = (Array.isArray(requested) ? requested : [requested])
    .filter((part): part is string => typeof part === "string")
    .join(",");
  const { kept, dropped } = guardFields(path, text);

  if (dropped.length) {
    if (kept.length) {
      query.fields = kept.join(",");
    } else {
      delete query.fields;
    }
    console.warn(`[field-guard] ${req.method} ${path} dropped fields=${dropped.join(",")}`);
  } else if (Array.isArray(requested)) {
    query.fields = text;
  }

  return next();
}
