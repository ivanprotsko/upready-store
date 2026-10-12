import fs from "node:fs";
import path from "node:path";
import {
  accessFor,
  decideAccess,
  permissionsOf,
  ROLE_PERMISSIONS,
  ROUTE_PERMISSIONS,
  TENANT_ADMIN_ROLES,
  TENANT_PERMISSIONS,
  type RouteAccess,
  type RouteMethod,
  type TenantAdminRole,
  type TenantPermission,
} from "../permissions";

/**
 * The two tables of `permissions.ts`, whole (t-2026-10-07-11).
 *
 * Three things are held here:
 *
 *   1. Every route file of the panel, and every method it exports, has a row.
 *      A new route cannot ship without somebody deciding who may call it.
 *   2. What each role is allowed and refused is written out below, route by
 *      route, and compared with what `decideAccess` answers. The expectation
 *      is this file's own list, not a second reading of the table, so a row
 *      moved to another permission fails here.
 *   3. The matching itself: parameters, case, trailing slash, `HEAD`, and the
 *      routes that share a prefix with a more open one.
 */

const TENANTS_ROOT = path.resolve(__dirname, "..");
const METHODS: RouteMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const walk = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
    );

/**
 * The methods a route file exports, in the three shapes this codebase uses:
 * `export const GET`, `export async function GET` and the Admin's own handler
 * re-exported as `export { GET } from "…"`.
 */
const exportedMethods = (source: string): RouteMethod[] => {
  const declared = [...source.matchAll(/export\s+(?:const|async\s+function|function)\s+([A-Z]+)\b/g)].map(
    (match) => match[1],
  );
  const reExported = [...source.matchAll(/export\s*\{([^}]*)\}/g)].flatMap((match) =>
    match[1].split(",").map((name) => name.trim().split(/\s+as\s+/).pop() ?? ""),
  );

  return METHODS.filter((method) => [...declared, ...reExported].includes(method));
};

/** `/tenants/orders/[id]` → the methods its `route.ts` exports. */
const routesOnDisk = (): Record<string, RouteMethod[]> =>
  Object.fromEntries(
    walk(TENANTS_ROOT)
      .filter((file) => path.basename(file) === "route.ts")
      .map((file) => {
        const folder = path.relative(TENANTS_ROOT, path.dirname(file)).split(path.sep).join("/");
        return [
          folder ? `/tenants/${folder}` : "/tenants",
          exportedMethods(fs.readFileSync(file, "utf8")),
        ] as const;
      }),
  );

/** A request path for a table key: every parameter gets a value. */
const pathOf = (route: string) => route.replace(/\[[^\]]+\]/g, "id_123");

const ALL = TENANT_ADMIN_ROLES;

describe("role → permissions", () => {
  it("has exactly the three roles of the contract and the nine permissions", () => {
    expect([...TENANT_ADMIN_ROLES]).toEqual(["owner", "manager", "operator"]);
    expect([...TENANT_PERMISSIONS]).toEqual([
      "orders",
      "customers",
      "reviews",
      "catalog",
      "storefront",
      "marketing",
      "marketplaces",
      "settings",
      "staff",
    ]);
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...TENANT_ADMIN_ROLES].sort());
  });

  it("gives each role the permissions of the contract, and nothing else", () => {
    expect(permissionsOf("owner")).toEqual([
      "orders",
      "customers",
      "reviews",
      "catalog",
      "storefront",
      "marketing",
      "marketplaces",
      "settings",
      "staff",
    ]);
    expect(permissionsOf("manager")).toEqual([
      "orders",
      "customers",
      "reviews",
      "catalog",
      "storefront",
      "marketing",
      "marketplaces",
    ]);
    expect(permissionsOf("operator")).toEqual(["orders", "customers"]);
  });

  it("hands out a copy, so a caller cannot widen a role by pushing into the answer", () => {
    permissionsOf("operator").push("staff");
    expect(permissionsOf("operator")).toEqual(["orders", "customers"]);
  });
});

describe("route and method → permission: the table against the route files", () => {
  const onDisk = routesOnDisk();

  it("finds the panel's route files", () => {
    // 169 before this task, plus the two of `/tenants/staff`.
    expect(Object.keys(onDisk).length).toBeGreaterThanOrEqual(171);
    expect(onDisk["/tenants/staff"]).toEqual(["GET", "POST"]);
    expect(onDisk["/tenants/staff/[id]"]).toEqual(["POST", "DELETE"]);
    // A re-exported Admin handler is read as a method too.
    expect(onDisk["/tenants/regions"]).toEqual(["GET"]);
  });

  it("has a row for every method of every route file", () => {
    const missing = Object.entries(onDisk).flatMap(([route, methods]) =>
      methods.filter((method) => !ROUTE_PERMISSIONS[route]?.[method]).map((method) => `${method} ${route}`),
    );

    expect(missing).toEqual([]);
  });

  it("has no row without a route file and a method behind it", () => {
    const stale = Object.entries(ROUTE_PERMISSIONS).flatMap(([route, rule]) =>
      (Object.keys(rule) as RouteMethod[])
        .filter((method) => !onDisk[route]?.includes(method))
        .map((method) => `${method} ${route}`),
    );

    expect(stale).toEqual([]);
  });

  it("reads no route file as exporting nothing", () => {
    expect(Object.entries(onDisk).filter(([, methods]) => methods.length === 0)).toEqual([]);
  });

  it("uses only known permissions, and writes static segments in lower case", () => {
    const allowed: RouteAccess[] = [...TENANT_PERMISSIONS, "any"];

    for (const [route, rule] of Object.entries(ROUTE_PERMISSIONS)) {
      expect(Object.values(rule).every((access) => allowed.includes(access))).toBe(true);
      expect(route.replace(/\[[^\]]+\]/g, "")).toBe(route.replace(/\[[^\]]+\]/g, "").toLowerCase());
    }
  });

  it("resolves every row back to itself through the matcher", () => {
    for (const [route, rule] of Object.entries(ROUTE_PERMISSIONS)) {
      for (const [method, access] of Object.entries(rule)) {
        expect(`${method} ${route} → ${accessFor(method, pathOf(route))}`).toBe(`${method} ${route} → ${access}`);
      }
    }
  });
});

/**
 * The whole table once more, as this spec expects it: per permission, the
 * routes it closes. Written by hand from the contract (§3.2 of the brief) and
 * NOT derived from `ROUTE_PERMISSIONS`.
 */
const EXPECTED: Record<TenantPermission | "any", string[]> = {
  any: [
    "POST /tenants",
    "GET /tenants/me",
    "POST /tenants/me",
    "POST /tenants/me/password",
    "GET /tenants/me/shops",
    "POST /tenants/me/switch",
    "GET /tenants/store",
    "GET /tenants/regions",
    "GET /tenants/sales-channels",
    "GET /tenants/sales-channels/[id]",
    "GET /tenants/stock-locations",
    "GET /tenants/stock-locations/[id]",
    "GET /tenants/shipping-options",
    "GET /tenants/fulfillment-providers",
    "GET /tenants/locale-settings",
    "GET /tenants/domains",
    "GET /tenants/branding",
    "GET /tenants/products",
    "GET /tenants/products/[id]",
    "GET /tenants/products/[id]/variants",
    "GET /tenants/products/[id]/variants/[variant_id]",
    "GET /tenants/product-variants",
  ],
  orders: [
    "GET /tenants/orders",
    "POST /tenants/orders/export",
    "GET /tenants/orders/[id]",
    "POST /tenants/orders/[id]/cancel",
    "GET /tenants/orders/[id]/changes",
    "GET /tenants/orders/[id]/line-items",
    "GET /tenants/orders/[id]/preview",
    "POST /tenants/orders/[id]/payment-receipt/reject",
    "POST /tenants/orders/[id]/fulfillments",
    "POST /tenants/orders/[id]/fulfillments/[fulfillment_id]/cancel",
    "POST /tenants/orders/[id]/fulfillments/[fulfillment_id]/mark-as-delivered",
    "POST /tenants/orders/[id]/fulfillments/[fulfillment_id]/shipments",
    "GET /tenants/order-edits",
    "GET /tenants/returns",
    "GET /tenants/claims",
    "GET /tenants/exchanges",
    "GET /tenants/reservations",
    "POST /tenants/payments/[id]/capture",
    "GET /tenants/analytics/summary",
  ],
  customers: ["GET /tenants/customers", "POST /tenants/customers/export", "GET /tenants/customers/[id]"],
  reviews: ["GET /tenants/reviews", "POST /tenants/reviews/[id]", "DELETE /tenants/reviews/[id]"],
  catalog: [
    "POST /tenants/products",
    "POST /tenants/products/[id]",
    "DELETE /tenants/products/[id]",
    "POST /tenants/products/[id]/variants",
    "POST /tenants/products/[id]/variants/[variant_id]",
    "DELETE /tenants/products/[id]/variants/[variant_id]",
    "GET /tenants/products/export",
    "GET /tenants/products/import",
    "POST /tenants/products/import",
    "GET /tenants/products/import/[import_id]",
    "DELETE /tenants/products/import/[import_id]",
    "POST /tenants/products/import/[import_id]/confirm",
    "GET /tenants/products/[id]/attributes",
    "POST /tenants/products/[id]/attributes",
    "GET /tenants/products/[id]/translations",
    "PUT /tenants/products/[id]/translations",
    "GET /tenants/products/[id]/options",
    "POST /tenants/products/[id]/options/batch",
    "POST /tenants/products/[id]/images/[image_id]/variants/batch",
    "POST /tenants/products/[id]/variants/batch",
    "POST /tenants/products/[id]/variants/inventory-items/batch",
    "POST /tenants/products/[id]/variants/[variant_id]/images/batch",
    "POST /tenants/products/[id]/variants/[variant_id]/inventory-items",
    "POST /tenants/products/[id]/variants/[variant_id]/inventory-items/[inventory_item_id]",
    "DELETE /tenants/products/[id]/variants/[variant_id]/inventory-items/[inventory_item_id]",
    "GET /tenants/product-categories",
    "POST /tenants/product-categories",
    "GET /tenants/product-categories/[id]",
    "POST /tenants/product-categories/[id]",
    "DELETE /tenants/product-categories/[id]",
    "POST /tenants/product-categories/[id]/products",
    "GET /tenants/product-attributes",
    "POST /tenants/product-attributes",
    "GET /tenants/product-attributes/[id]",
    "POST /tenants/product-attributes/[id]",
    "DELETE /tenants/product-attributes/[id]",
    "GET /tenants/product-attribute-presets",
    "POST /tenants/product-attribute-presets",
    "GET /tenants/product-attribute-coverage",
    "GET /tenants/product-options",
    "GET /tenants/product-tags",
    "GET /tenants/product-types",
    "GET /tenants/collections",
    "GET /tenants/price-preferences",
    "GET /tenants/shipping-profiles",
    "GET /tenants/inventory-items",
    "POST /tenants/inventory-items/location-levels/batch",
    "GET /tenants/courses",
    "POST /tenants/courses",
    "GET /tenants/courses/[id]",
    "POST /tenants/courses/[id]",
    "DELETE /tenants/courses/[id]",
    "GET /tenants/courses/[id]/lessons",
    "POST /tenants/courses/[id]/lessons",
    "POST /tenants/courses/[id]/lessons/reorder",
    "GET /tenants/courses/[id]/lessons/[lessonId]",
    "POST /tenants/courses/[id]/lessons/[lessonId]",
    "DELETE /tenants/courses/[id]/lessons/[lessonId]",
    "POST /tenants/uploads",
  ],
  storefront: [
    "GET /tenants/home",
    "PUT /tenants/home",
    "POST /tenants/home/template",
    "GET /tenants/pages",
    "POST /tenants/pages",
    "GET /tenants/pages/[key]",
    "PUT /tenants/pages/[key]",
    "DELETE /tenants/pages/[key]",
    "GET /tenants/articles",
    "POST /tenants/articles",
    "GET /tenants/articles/[slug]",
    "PUT /tenants/articles/[slug]",
    "DELETE /tenants/articles/[slug]",
    "GET /tenants/article-categories",
    "PUT /tenants/branding",
    "POST /tenants/branding/upload",
  ],
  marketing: [
    "GET /tenants/promotions",
    "POST /tenants/promotions",
    "GET /tenants/promotions/[id]",
    "POST /tenants/promotions/[id]",
    "DELETE /tenants/promotions/[id]",
    "GET /tenants/promotions/[id]/[rule_type]",
    "POST /tenants/promotions/[id]/rules/batch",
    "POST /tenants/promotions/[id]/buy-rules/batch",
    "POST /tenants/promotions/[id]/target-rules/batch",
    "GET /tenants/promotions/rule-attribute-options/[rule_type]",
    "GET /tenants/promotions/rule-value-options/[rule_type]/[rule_attribute_id]",
    "GET /tenants/campaigns",
    "POST /tenants/campaigns",
    "GET /tenants/campaigns/[id]",
    "POST /tenants/campaigns/[id]",
    "DELETE /tenants/campaigns/[id]",
    "POST /tenants/campaigns/[id]/promotions",
  ],
  marketplaces: [
    "GET /tenants/marketplaces",
    "GET /tenants/marketplaces/sync",
    "POST /tenants/marketplaces/sync",
    "GET /tenants/marketplaces/catalog",
    "POST /tenants/marketplaces/catalog/auto-link",
    "POST /tenants/marketplaces/catalog/links",
    "DELETE /tenants/marketplaces/catalog/links/[id]",
    "POST /tenants/marketplaces/questions/[id]/draft",
    "POST /tenants/marketplaces/questions/[id]/suggest",
    "POST /tenants/marketplaces/reviews/[id]/draft",
    "POST /tenants/marketplaces/reviews/[id]/suggest",
    "GET /tenants/marketplaces/[marketplace]/analytics",
    "GET /tenants/marketplaces/[marketplace]/orders",
    "GET /tenants/marketplaces/[marketplace]/orders/export",
    "GET /tenants/marketplaces/[marketplace]/orders/[id]",
    "GET /tenants/marketplaces/[marketplace]/price-stock",
    "GET /tenants/marketplaces/[marketplace]/price-stock/export",
    "GET /tenants/marketplaces/[marketplace]/price-stock/lines",
    "GET /tenants/marketplaces/[marketplace]/products",
    "GET /tenants/marketplaces/[marketplace]/products/[id]",
    "GET /tenants/marketplaces/[marketplace]/reviews",
    "GET /tenants/marketplaces/[marketplace]/status",
    "GET /tenants/marketplaces/[marketplace]/sync",
    "POST /tenants/marketplaces/[marketplace]/sync",
    "GET /tenants/wb/status",
    "GET /tenants/wb/tables",
    "GET /tenants/wb/fbs-orders",
    "POST /tenants/wb/fbs-orders/actions",
    "GET /tenants/wb/feedback-answers",
    "PUT /tenants/wb/feedback-answers",
    "POST /tenants/wb/feedback-answers/send",
    "GET /tenants/ozon/status",
    "GET /tenants/wb/write-preview",
    "PUT /tenants/wb/write-preview",
    "GET /tenants/wb/write-settings",
  ],
  settings: [
    "PUT /tenants/locale-settings",
    "GET /tenants/marketplaces/[marketplace]/key",
    "PUT /tenants/marketplaces/[marketplace]/key",
    "DELETE /tenants/marketplaces/[marketplace]/key",
    "GET /tenants/wb/key",
    "PUT /tenants/wb/key",
    "DELETE /tenants/wb/key",
    "PUT /tenants/wb/write-settings",
    "GET /tenants/ozon/key",
    "PUT /tenants/ozon/key",
    "DELETE /tenants/ozon/key",
    "GET /tenants/payment-settings",
    "PUT /tenants/payment-settings",
    "DELETE /tenants/payment-settings",
    "GET /tenants/payment-settings/[id]",
    "GET /tenants/payment-settings/manual",
    "PUT /tenants/payment-settings/manual",
    "GET /tenants/payment-settings/pre-notice",
    "PUT /tenants/payment-settings/pre-notice",
    "GET /tenants/payment-settings/bitcart",
    "PUT /tenants/payment-settings/bitcart",
    "DELETE /tenants/payment-settings/bitcart",
    "GET /tenants/payment-settings/btcpay",
    "PUT /tenants/payment-settings/btcpay",
    "DELETE /tenants/payment-settings/btcpay",
    "GET /tenants/payment-settings/x402",
    "PUT /tenants/payment-settings/x402",
    "DELETE /tenants/payment-settings/x402",
    "GET /tenants/tribute",
    "PUT /tenants/tribute",
    "DELETE /tenants/tribute",
    "GET /tenants/telegram-bot",
    "PUT /tenants/telegram-bot",
    "DELETE /tenants/telegram-bot",
    "POST /tenants/telegram-bot/webhook",
    "DELETE /tenants/telegram-bot/webhook",
    "GET /tenants/delivery-settings",
    "PUT /tenants/delivery-settings",
    "DELETE /tenants/delivery-settings",
    "GET /tenants/apiship/key",
    "PUT /tenants/apiship/key",
    "DELETE /tenants/apiship/key",
    "GET /tenants/apiship/probe",
    "GET /tenants/pochta",
    "PUT /tenants/pochta",
    "DELETE /tenants/pochta",
    "GET /tenants/pochta/probe",
    "GET /tenants/shipping-methods",
    "POST /tenants/shipping-methods",
    "GET /tenants/shipping-methods/[id]",
    "POST /tenants/shipping-methods/[id]",
    "DELETE /tenants/shipping-methods/[id]",
    "GET /tenants/shipping-methods/regions",
    "POST /tenants/shipping-methods/reorder",
    "GET /tenants/shipping-methods/settings",
    "POST /tenants/shipping-methods/settings",
    "GET /tenants/shipping-methods/zone-presets",
    "POST /tenants/shipping-methods/zone-presets",
    "GET /tenants/requisites",
    "PUT /tenants/requisites",
    "POST /tenants/domains",
    "DELETE /tenants/domains/[id]",
    "POST /tenants/domains/[id]/primary",
    "DELETE /tenants/domains/[id]/primary",
    "POST /tenants/handle",
    "GET /tenants/sites",
    "POST /tenants/sites",
    "GET /tenants/hreflang-sisters",
    "PUT /tenants/hreflang-sisters",
    "GET /tenants/notification-settings",
    "PUT /tenants/notification-settings",
    "DELETE /tenants/notification-settings/telegram",
    "POST /tenants/notification-settings/telegram/code",
    "POST /tenants/notification-settings/telegram/test",
    "GET /tenants/login-settings",
    "PUT /tenants/login-settings",
    "GET /tenants/analytics",
    "PUT /tenants/analytics",
    "GET /tenants/seo-verification",
    "PUT /tenants/seo-verification",
    "GET /tenants/redirects",
    "POST /tenants/redirects",
    "PUT /tenants/redirects/[id]",
    "DELETE /tenants/redirects/[id]",
    "POST /tenants/seed",
  ],
  staff: [
    "GET /tenants/staff",
    "POST /tenants/staff",
    "POST /tenants/staff/[id]",
    "DELETE /tenants/staff/[id]",
  ],
};

/** Who is let in by each kind of access, written out and not computed from `ROLE_PERMISSIONS`. */
const WHO: Record<TenantPermission | "any", readonly TenantAdminRole[]> = {
  any: ALL,
  orders: ALL,
  customers: ALL,
  reviews: ["owner", "manager"],
  catalog: ["owner", "manager"],
  storefront: ["owner", "manager"],
  marketing: ["owner", "manager"],
  marketplaces: ["owner", "manager"],
  settings: ["owner"],
  staff: ["owner"],
};

const expectedLines = Object.entries(EXPECTED).flatMap(([access, lines]) =>
  lines.map((line) => ({ access: access as TenantPermission | "any", line })),
);

describe("route and method → permission: the table against the contract", () => {
  it("lists every row of the table exactly once, under the permission the contract names", () => {
    const fromTable = Object.entries(ROUTE_PERMISSIONS)
      .flatMap(([route, rule]) => Object.entries(rule).map(([method, access]) => `${access}: ${method} ${route}`))
      .sort();

    expect(expectedLines.map(({ access, line }) => `${access}: ${line}`).sort()).toEqual(fromTable);
  });

  describe.each(ALL)("as %s", (role) => {
    const cases = expectedLines.map(({ access, line }) => {
      const [method, route] = line.split(" ");
      return { line, method, route, access, allowed: WHO[access].includes(role) };
    });

    it("is let into every route its permissions open", () => {
      const refused = cases
        .filter((entry) => entry.allowed)
        .filter((entry) => !decideAccess(role, entry.method, pathOf(entry.route)).allowed)
        .map((entry) => entry.line);

      expect(refused).toEqual([]);
    });

    it("is refused on every other route, with the permission it lacks", () => {
      const wrong = cases
        .filter((entry) => !entry.allowed)
        .filter((entry) => {
          const decision = decideAccess(role, entry.method, pathOf(entry.route));
          return decision.allowed || decision.permission !== entry.access;
        })
        .map((entry) => entry.line);

      expect(wrong).toEqual([]);
    });

    it("has at least one route open and, unless it is the owner, one closed", () => {
      expect(cases.some((entry) => entry.allowed)).toBe(true);
      expect(cases.some((entry) => !entry.allowed)).toBe(role !== "owner");
    });
  });
});

describe("a route with no row", () => {
  it("is open to the owner only, and names no permission in the refusal", () => {
    expect(accessFor("GET", "/tenants/nobody-decided-yet")).toBeNull();
    expect(decideAccess("owner", "GET", "/tenants/nobody-decided-yet")).toEqual({ allowed: true });
    expect(decideAccess("manager", "GET", "/tenants/nobody-decided-yet")).toEqual({
      allowed: false,
      permission: null,
    });
    expect(decideAccess("operator", "POST", "/tenants/orders/id_1/nobody-decided-yet")).toEqual({
      allowed: false,
      permission: null,
    });
  });

  it("is also what a method the table does not list for a known route gets", () => {
    // `/tenants/orders` has a GET row and no DELETE.
    expect(accessFor("DELETE", "/tenants/orders")).toBeNull();
    expect(decideAccess("operator", "DELETE", "/tenants/orders").allowed).toBe(false);
  });
});

describe("matching a request to a row", () => {
  it("tells a read from a write on the same route", () => {
    expect(decideAccess("operator", "GET", "/tenants/products").allowed).toBe(true);
    expect(decideAccess("operator", "POST", "/tenants/products")).toEqual({
      allowed: false,
      permission: "catalog",
    });
    expect(decideAccess("manager", "GET", "/tenants/locale-settings").allowed).toBe(true);
    expect(decideAccess("manager", "PUT", "/tenants/locale-settings")).toEqual({
      allowed: false,
      permission: "settings",
    });
  });

  it("closes a read that carries settings or a key, for a role without `settings`", () => {
    for (const closed of [
      "/tenants/payment-settings",
      "/tenants/payment-settings/bitcart",
      "/tenants/wb/key",
      "/tenants/ozon/key",
      "/tenants/marketplaces/wb/key",
      "/tenants/sites",
      "/tenants/telegram-bot",
      "/tenants/apiship/key",
    ]) {
      expect(decideAccess("manager", "GET", closed)).toEqual({ allowed: false, permission: "settings" });
      expect(decideAccess("owner", "GET", closed).allowed).toBe(true);
    }
  });

  it("opens what the panel's shell reads to every role, and keeps the writes under their permission", () => {
    for (const open of ["/tenants/domains", "/tenants/branding", "/tenants/locale-settings"]) {
      expect(decideAccess("operator", "GET", open).allowed).toBe(true);
    }
    expect(decideAccess("manager", "POST", "/tenants/domains")).toEqual({ allowed: false, permission: "settings" });
    expect(decideAccess("manager", "DELETE", "/tenants/domains/dom_1")).toEqual({
      allowed: false,
      permission: "settings",
    });
    expect(decideAccess("operator", "PUT", "/tenants/branding")).toEqual({ allowed: false, permission: "storefront" });
    // The gates of writing to Wildberries: read with the working screens, switched with `settings`.
    expect(decideAccess("manager", "GET", "/tenants/wb/write-settings").allowed).toBe(true);
    expect(decideAccess("manager", "PUT", "/tenants/wb/write-settings")).toEqual({
      allowed: false,
      permission: "settings",
    });
  });

  it("prefers a static segment to a parameter, so a closed route is not read as an open one", () => {
    // `/tenants/products/[id]` is a reference read; these two are not.
    expect(accessFor("GET", "/tenants/products/export")).toBe("catalog");
    expect(accessFor("GET", "/tenants/products/import")).toBe("catalog");
    expect(accessFor("GET", "/tenants/products/prod_01")).toBe("any");
    // `/tenants/marketplaces/[marketplace]/sync` and `/tenants/marketplaces/catalog/links`.
    expect(accessFor("GET", "/tenants/marketplaces/catalog")).toBe("marketplaces");
    expect(accessFor("GET", "/tenants/marketplaces/wb/key")).toBe("settings");
    expect(accessFor("POST", "/tenants/products/prod_01/variants/batch")).toBe("catalog");
    expect(accessFor("GET", "/tenants/products/prod_01/variants/variant_01")).toBe("any");
  });

  it("matches a static segment without regard to case, as the router does", () => {
    expect(accessFor("GET", "/tenants/products/EXPORT")).toBe("catalog");
    expect(accessFor("GET", "/TENANTS/Payment-Settings")).toBe("settings");
    expect(decideAccess("operator", "GET", "/tenants/products/Export").allowed).toBe(false);
  });

  it("ignores the query string and a trailing slash", () => {
    expect(accessFor("GET", "/tenants/orders?limit=20&fields=id")).toBe("orders");
    expect(accessFor("GET", "/tenants/orders/")).toBe("orders");
    expect(accessFor("GET", "/tenants/payment-settings/?x=/tenants/me")).toBe("settings");
  });

  it("answers HEAD as GET, and reads the method in any case", () => {
    expect(accessFor("HEAD", "/tenants/payment-settings")).toBe("settings");
    expect(accessFor("get", "/tenants/orders")).toBe("orders");
  });

  it("does not let an empty segment stand for a parameter", () => {
    expect(accessFor("GET", "/tenants/products//variants")).toBeNull();
    expect(accessFor("GET", "/tenants//products")).toBeNull();
    expect(decideAccess("operator", "GET", "/tenants/products//variants").allowed).toBe(false);
  });

  it("treats a role it does not know as one with no permissions", () => {
    const unknown = "intern" as TenantAdminRole;

    expect(decideAccess(unknown, "GET", "/tenants/orders")).toEqual({ allowed: false, permission: "orders" });
    expect(decideAccess(unknown, "GET", "/tenants/me").allowed).toBe(true);
  });
});
