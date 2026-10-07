import { TENANT_ADMIN_ROLES, type TenantAdminRole } from "../../modules/tenant/models/tenant-admin";

/**
 * Who may call what in the shop panel (t-2026-10-07-11).
 *
 * Two tables, both here and nowhere else:
 *
 *   - `ROLE_PERMISSIONS`: role → permissions;
 *   - `ROUTE_PERMISSIONS`: route and method → the one permission it needs.
 *
 * The panel holds neither. `GET /tenants/me` hands it the caller's
 * `permissions`, and it shows what they open. So a change of what a role may
 * do, or of which roles exist, is an edit of this file (and, for a new role,
 * of `TENANT_ADMIN_ROLES` with its migration).
 *
 * The check itself is `tenant-admin-gate.ts`, mounted once on `/tenants/*`.
 */

export { TENANT_ADMIN_ROLES };
export type { TenantAdminRole };

export const TENANT_PERMISSIONS = [
  "orders",
  "customers",
  "reviews",
  "catalog",
  "storefront",
  "marketing",
  "marketplaces",
  "settings",
  "staff",
] as const;

export type TenantPermission = (typeof TENANT_PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<TenantAdminRole, readonly TenantPermission[]> = {
  owner: TENANT_PERMISSIONS,
  manager: ["orders", "customers", "reviews", "catalog", "storefront", "marketing", "marketplaces"],
  operator: ["orders", "customers"],
};

export const permissionsOf = (role: TenantAdminRole): TenantPermission[] => [...ROLE_PERMISSIONS[role]];

/**
 * `any` is every role with a live login: the caller's own profile, and the
 * reference reads another permission's screens cannot work without (an order
 * shows a product, a region, a warehouse). A reference read is always a `GET`
 * and never carries a secret; the write next to it keeps its own permission.
 */
export type RouteAccess = TenantPermission | "any";

export type RouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RouteRule = Partial<Record<RouteMethod, RouteAccess>>;

/**
 * Keyed by the route's folder under `src/api`, parameters in the brackets the
 * folder carries, so a row is found by looking at the file tree.
 * `__tests__/permissions.unit.spec.ts` walks that tree and fails on a route
 * file or a method with no row here, and on a row with no route behind it.
 *
 * A route that is NOT here is open to the owner only (`accessFor` answers
 * `null`): a route nobody decided about must not become visible to a role by
 * accident.
 */
export const ROUTE_PERMISSIONS: Record<string, RouteRule> = {
  // Registration of a new shop. It sits outside `/tenants/*`, so the gate is
  // not mounted on it: the caller has an identity and no login row yet.
  "/tenants": { POST: "any" },

  // ---- the caller's own profile, shops and the overview: every role
  "/tenants/me": { GET: "any", POST: "any" },
  "/tenants/me/password": { POST: "any" },
  "/tenants/me/shops": { GET: "any" },
  "/tenants/me/switch": { POST: "any" },

  // ---- reference reads: open to every role, written under their own permission
  "/tenants/store": { GET: "any" },
  "/tenants/regions": { GET: "any" },
  "/tenants/sales-channels": { GET: "any" },
  "/tenants/sales-channels/[id]": { GET: "any" },
  "/tenants/stock-locations": { GET: "any" },
  "/tenants/stock-locations/[id]": { GET: "any" },
  "/tenants/shipping-options": { GET: "any" },
  "/tenants/fulfillment-providers": { GET: "any" },
  "/tenants/locale-settings": { GET: "any", PUT: "settings" },
  // The shop's addresses and its look: what any visitor of the storefront
  // sees, and what the panel's shell reads on every screen (§12.1).
  "/tenants/domains": { GET: "any", POST: "settings" },
  "/tenants/branding": { GET: "any", PUT: "storefront" },
  "/tenants/products": { GET: "any", POST: "catalog" },
  "/tenants/products/[id]": { GET: "any", POST: "catalog", DELETE: "catalog" },
  "/tenants/products/[id]/variants": { GET: "any", POST: "catalog" },
  "/tenants/products/[id]/variants/[variant_id]": { GET: "any", POST: "catalog", DELETE: "catalog" },
  "/tenants/product-variants": { GET: "any" },

  // ---- orders
  "/tenants/orders": { GET: "orders" },
  "/tenants/orders/export": { POST: "orders" },
  "/tenants/orders/[id]": { GET: "orders" },
  "/tenants/orders/[id]/cancel": { POST: "orders" },
  "/tenants/orders/[id]/changes": { GET: "orders" },
  "/tenants/orders/[id]/line-items": { GET: "orders" },
  "/tenants/orders/[id]/preview": { GET: "orders" },
  "/tenants/orders/[id]/payment-receipt/reject": { POST: "orders" },
  "/tenants/orders/[id]/fulfillments": { POST: "orders" },
  "/tenants/orders/[id]/fulfillments/[fulfillment_id]/cancel": { POST: "orders" },
  "/tenants/orders/[id]/fulfillments/[fulfillment_id]/mark-as-delivered": { POST: "orders" },
  "/tenants/orders/[id]/fulfillments/[fulfillment_id]/shipments": { POST: "orders" },
  "/tenants/order-edits": { GET: "orders" },
  "/tenants/returns": { GET: "orders" },
  "/tenants/claims": { GET: "orders" },
  "/tenants/exchanges": { GET: "orders" },
  "/tenants/reservations": { GET: "orders" },
  "/tenants/payments/[id]/capture": { POST: "orders" },
  // Revenue and order counts of the overview: the shop's orders, summed.
  "/tenants/analytics/summary": { GET: "orders" },

  // ---- customers
  "/tenants/customers": { GET: "customers" },
  "/tenants/customers/export": { POST: "customers" },
  "/tenants/customers/[id]": { GET: "customers" },

  // ---- reviews
  "/tenants/reviews": { GET: "reviews" },
  "/tenants/reviews/[id]": { POST: "reviews", DELETE: "reviews" },

  // ---- catalog
  "/tenants/products/export": { GET: "catalog" },
  "/tenants/products/import": { GET: "catalog", POST: "catalog" },
  "/tenants/products/import/[import_id]": { GET: "catalog", DELETE: "catalog" },
  "/tenants/products/import/[import_id]/confirm": { POST: "catalog" },
  "/tenants/products/[id]/attributes": { GET: "catalog", POST: "catalog" },
  "/tenants/products/[id]/translations": { GET: "catalog", PUT: "catalog" },
  "/tenants/products/[id]/options": { GET: "catalog" },
  "/tenants/products/[id]/options/batch": { POST: "catalog" },
  "/tenants/products/[id]/images/[image_id]/variants/batch": { POST: "catalog" },
  "/tenants/products/[id]/variants/batch": { POST: "catalog" },
  "/tenants/products/[id]/variants/inventory-items/batch": { POST: "catalog" },
  "/tenants/products/[id]/variants/[variant_id]/images/batch": { POST: "catalog" },
  "/tenants/products/[id]/variants/[variant_id]/inventory-items": { POST: "catalog" },
  "/tenants/products/[id]/variants/[variant_id]/inventory-items/[inventory_item_id]": {
    POST: "catalog",
    DELETE: "catalog",
  },
  "/tenants/product-categories": { GET: "catalog", POST: "catalog" },
  "/tenants/product-categories/[id]": { GET: "catalog", POST: "catalog", DELETE: "catalog" },
  "/tenants/product-categories/[id]/products": { POST: "catalog" },
  "/tenants/product-attributes": { GET: "catalog", POST: "catalog" },
  "/tenants/product-attributes/[id]": { GET: "catalog", POST: "catalog", DELETE: "catalog" },
  "/tenants/product-attribute-presets": { GET: "catalog", POST: "catalog" },
  "/tenants/product-attribute-coverage": { GET: "catalog" },
  "/tenants/product-options": { GET: "catalog" },
  "/tenants/product-tags": { GET: "catalog" },
  "/tenants/product-types": { GET: "catalog" },
  "/tenants/collections": { GET: "catalog" },
  "/tenants/price-preferences": { GET: "catalog" },
  "/tenants/shipping-profiles": { GET: "catalog" },
  "/tenants/inventory-items": { GET: "catalog" },
  "/tenants/inventory-items/location-levels/batch": { POST: "catalog" },
  "/tenants/courses": { GET: "catalog", POST: "catalog" },
  "/tenants/courses/[id]": { GET: "catalog", POST: "catalog", DELETE: "catalog" },
  "/tenants/courses/[id]/lessons": { GET: "catalog", POST: "catalog" },
  "/tenants/courses/[id]/lessons/reorder": { POST: "catalog" },
  "/tenants/courses/[id]/lessons/[lessonId]": { GET: "catalog", POST: "catalog", DELETE: "catalog" },
  "/tenants/uploads": { POST: "catalog" },

  // ---- storefront: home, pages, journal, look
  "/tenants/home": { GET: "storefront", PUT: "storefront" },
  "/tenants/pages": { GET: "storefront", POST: "storefront" },
  "/tenants/pages/[key]": { GET: "storefront", PUT: "storefront", DELETE: "storefront" },
  "/tenants/articles": { GET: "storefront", POST: "storefront" },
  "/tenants/articles/[slug]": { GET: "storefront", PUT: "storefront", DELETE: "storefront" },
  "/tenants/article-categories": { GET: "storefront" },
  "/tenants/branding/upload": { POST: "storefront" },

  // ---- marketing
  "/tenants/promotions": { GET: "marketing", POST: "marketing" },
  "/tenants/promotions/[id]": { GET: "marketing", POST: "marketing", DELETE: "marketing" },
  "/tenants/promotions/[id]/[rule_type]": { GET: "marketing" },
  "/tenants/promotions/[id]/rules/batch": { POST: "marketing" },
  "/tenants/promotions/[id]/buy-rules/batch": { POST: "marketing" },
  "/tenants/promotions/[id]/target-rules/batch": { POST: "marketing" },
  "/tenants/promotions/rule-attribute-options/[rule_type]": { GET: "marketing" },
  "/tenants/promotions/rule-value-options/[rule_type]/[rule_attribute_id]": { GET: "marketing" },
  "/tenants/campaigns": { GET: "marketing", POST: "marketing" },
  "/tenants/campaigns/[id]": { GET: "marketing", POST: "marketing", DELETE: "marketing" },
  "/tenants/campaigns/[id]/promotions": { POST: "marketing" },

  // ---- marketplaces: the working screens. The keys are under `settings`.
  "/tenants/marketplaces": { GET: "marketplaces" },
  "/tenants/marketplaces/sync": { GET: "marketplaces", POST: "marketplaces" },
  "/tenants/marketplaces/catalog": { GET: "marketplaces" },
  "/tenants/marketplaces/catalog/auto-link": { POST: "marketplaces" },
  "/tenants/marketplaces/catalog/links": { POST: "marketplaces" },
  "/tenants/marketplaces/catalog/links/[id]": { DELETE: "marketplaces" },
  "/tenants/marketplaces/questions/[id]/draft": { POST: "marketplaces" },
  "/tenants/marketplaces/questions/[id]/suggest": { POST: "marketplaces" },
  "/tenants/marketplaces/reviews/[id]/draft": { POST: "marketplaces" },
  "/tenants/marketplaces/reviews/[id]/suggest": { POST: "marketplaces" },
  "/tenants/marketplaces/[marketplace]/analytics": { GET: "marketplaces" },
  "/tenants/marketplaces/[marketplace]/orders": { GET: "marketplaces" },
  "/tenants/marketplaces/[marketplace]/orders/export": { GET: "marketplaces" },
  "/tenants/marketplaces/[marketplace]/orders/[id]": { GET: "marketplaces" },
  "/tenants/marketplaces/[marketplace]/price-stock": { GET: "marketplaces" },
  "/tenants/marketplaces/[marketplace]/price-stock/export": { GET: "marketplaces" },
  "/tenants/marketplaces/[marketplace]/price-stock/lines": { GET: "marketplaces" },
  "/tenants/marketplaces/[marketplace]/products": { GET: "marketplaces" },
  "/tenants/marketplaces/[marketplace]/products/[id]": { GET: "marketplaces" },
  "/tenants/marketplaces/[marketplace]/reviews": { GET: "marketplaces" },
  "/tenants/marketplaces/[marketplace]/status": { GET: "marketplaces" },
  "/tenants/marketplaces/[marketplace]/sync": { GET: "marketplaces", POST: "marketplaces" },
  "/tenants/wb/status": { GET: "marketplaces" },
  "/tenants/wb/tables": { GET: "marketplaces" },
  "/tenants/wb/fbs-orders": { GET: "marketplaces" },
  "/tenants/wb/fbs-orders/actions": { POST: "marketplaces" },
  "/tenants/wb/feedback-answers": { GET: "marketplaces", PUT: "marketplaces" },
  "/tenants/wb/feedback-answers/send": { POST: "marketplaces" },
  "/tenants/ozon/status": { GET: "marketplaces" },
  "/tenants/wb/write-preview": { GET: "marketplaces", PUT: "marketplaces" },
  // The gates of writing to Wildberries: seen from the working screens,
  // switched only with `settings` (§12.4).
  "/tenants/wb/write-settings": { GET: "marketplaces", PUT: "settings" },

  // ---- settings: the «Настройки» group, every key and every integration.
  // Closed for reading too: these answers carry what the shop is paid through
  // and what it is connected to.
  "/tenants/marketplaces/[marketplace]/key": { GET: "settings", PUT: "settings", DELETE: "settings" },
  "/tenants/wb/key": { GET: "settings", PUT: "settings", DELETE: "settings" },
  "/tenants/ozon/key": { GET: "settings", PUT: "settings", DELETE: "settings" },
  "/tenants/payment-settings": { GET: "settings", PUT: "settings", DELETE: "settings" },
  "/tenants/payment-settings/[id]": { GET: "settings" },
  "/tenants/payment-settings/manual": { GET: "settings", PUT: "settings" },
  "/tenants/payment-settings/pre-notice": { GET: "settings", PUT: "settings" },
  "/tenants/payment-settings/bitcart": { GET: "settings", PUT: "settings", DELETE: "settings" },
  "/tenants/payment-settings/btcpay": { GET: "settings", PUT: "settings", DELETE: "settings" },
  "/tenants/payment-settings/x402": { GET: "settings", PUT: "settings", DELETE: "settings" },
  "/tenants/tribute": { GET: "settings", PUT: "settings", DELETE: "settings" },
  "/tenants/telegram-bot": { GET: "settings", PUT: "settings", DELETE: "settings" },
  "/tenants/telegram-bot/webhook": { POST: "settings", DELETE: "settings" },
  "/tenants/delivery-settings": { GET: "settings", PUT: "settings", DELETE: "settings" },
  "/tenants/apiship/key": { GET: "settings", PUT: "settings", DELETE: "settings" },
  "/tenants/apiship/probe": { GET: "settings" },
  "/tenants/pochta": { GET: "settings", PUT: "settings", DELETE: "settings" },
  "/tenants/pochta/probe": { GET: "settings" },
  "/tenants/shipping-methods": { GET: "settings", POST: "settings" },
  "/tenants/shipping-methods/[id]": { GET: "settings", POST: "settings", DELETE: "settings" },
  "/tenants/shipping-methods/regions": { GET: "settings" },
  "/tenants/shipping-methods/reorder": { POST: "settings" },
  "/tenants/shipping-methods/settings": { GET: "settings", POST: "settings" },
  "/tenants/shipping-methods/zone-presets": { GET: "settings", POST: "settings" },
  "/tenants/requisites": { GET: "settings", PUT: "settings" },
  "/tenants/domains/[id]": { DELETE: "settings" },
  "/tenants/domains/[id]/primary": { POST: "settings", DELETE: "settings" },
  "/tenants/handle": { POST: "settings" },
  "/tenants/sites": { GET: "settings", POST: "settings" },
  "/tenants/hreflang-sisters": { GET: "settings", PUT: "settings" },
  "/tenants/notification-settings": { GET: "settings", PUT: "settings" },
  "/tenants/notification-settings/telegram": { DELETE: "settings" },
  "/tenants/notification-settings/telegram/code": { POST: "settings" },
  "/tenants/notification-settings/telegram/test": { POST: "settings" },
  "/tenants/login-settings": { GET: "settings", PUT: "settings" },
  "/tenants/analytics": { GET: "settings", PUT: "settings" },
  "/tenants/seo-verification": { GET: "settings", PUT: "settings" },
  "/tenants/redirects": { GET: "settings", POST: "settings" },
  "/tenants/redirects/[id]": { PUT: "settings", DELETE: "settings" },
  // The starter catalog of an empty shop, called by the onboarding wizard.
  "/tenants/seed": { POST: "settings" },

  // ---- staff
  "/tenants/staff": { GET: "staff", POST: "staff" },
  "/tenants/staff/[id]": { POST: "staff", DELETE: "staff" },
};

type CompiledRoute = {
  /** `null` stands for a parameter: any one non-empty segment. */
  segments: (string | null)[];
  rule: RouteRule;
};

const isParameter = (segment: string) => segment.startsWith("[") && segment.endsWith("]");

const splitPath = (path: string): string[] => path.split("/").filter((segment, index) => index > 0 || segment !== "");

const COMPILED_ROUTES: CompiledRoute[] = Object.entries(ROUTE_PERMISSIONS).map(([route, rule]) => ({
  segments: splitPath(route).map((segment) => (isParameter(segment) ? null : segment)),
  rule,
}));

const matches = (route: CompiledRoute, segments: string[]): boolean =>
  route.segments.length === segments.length &&
  route.segments.every((expected, index) =>
    // Express matches a static segment without regard to case, so
    // `/tenants/products/EXPORT` is the export route and must not be read
    // here as `/tenants/products/[id]`.
    expected === null ? segments[index] !== "" : expected === segments[index].toLowerCase(),
  );

/** A static segment outranks a parameter at the first place two routes differ, the router's own order. */
const moreSpecific = (left: CompiledRoute, right: CompiledRoute): CompiledRoute => {
  for (let index = 0; index < left.segments.length; index += 1) {
    const leftStatic = left.segments[index] !== null;
    const rightStatic = right.segments[index] !== null;

    if (leftStatic !== rightStatic) {
      return leftStatic ? left : right;
    }
  }

  return left;
};

/**
 * What `method` on `path` needs: a permission, `any`, or `null` when the table
 * has no row for it (owner only). `path` is the request's own, with or without
 * a query string or a trailing slash. `HEAD` is answered by the `GET` handler,
 * so it needs what `GET` needs.
 */
export const accessFor = (method: string, path: string): RouteAccess | null => {
  const segments = splitPath(path.split("?")[0].replace(/\/+$/, ""));
  const verb = method.toUpperCase() === "HEAD" ? "GET" : method.toUpperCase();

  const route = COMPILED_ROUTES.filter((candidate) => matches(candidate, segments)).reduce<CompiledRoute | null>(
    (best, candidate) => (best ? moreSpecific(best, candidate) : candidate),
    null,
  );

  return route?.rule[verb as RouteMethod] ?? null;
};

export type AccessDecision = { allowed: true } | { allowed: false; permission: TenantPermission | null };

/**
 * `permission` of a refusal is what the caller lacks, or `null` for a route
 * with no row, which no permission opens: only the owner's role does.
 */
export const decideAccess = (role: TenantAdminRole, method: string, path: string): AccessDecision => {
  const access = accessFor(method, path);

  if (access === null) {
    return role === "owner" ? { allowed: true } : { allowed: false, permission: null };
  }

  // A role this table does not know has no permissions, rather than a crash.
  if (access === "any" || (ROLE_PERMISSIONS[role] ?? []).includes(access)) {
    return { allowed: true };
  }

  return { allowed: false, permission: access };
};
