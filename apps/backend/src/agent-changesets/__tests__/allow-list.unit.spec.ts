import fs from "node:fs";
import path from "node:path";
import { decideAccess } from "../../api/tenants/permissions";
import { classifyOp, DENIED_PREFIXES, OP_METHODS, OP_RULES, type OpMethod } from "../allow-list";

/**
 * The agent's allow-list, whole (t-2026-10-27-04).
 *
 *   1. Every write route on disk under `/tenants` has a verdict, so a new
 *      route cannot reach the agent before somebody classifies it.
 *   2. Every denial carries a reason a person can read.
 *   3. The subtrees the brief names are denied, existing routes and future ones.
 *   4. The few allowed ops are the ones the brief asks for, and a price only
 *      for the owner and the manager.
 */

const TENANTS_ROOT = path.resolve(__dirname, "../../api/tenants");

const walk = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
    );

/** Same three export shapes `permissions.unit.spec.ts` reads. */
const exportedWrites = (source: string): OpMethod[] => {
  const declared = [...source.matchAll(/export\s+(?:const|async\s+function|function)\s+([A-Z]+)\b/g)].map(
    (match) => match[1],
  );
  const reExported = [...source.matchAll(/export\s*\{([^}]*)\}/g)].flatMap((match) =>
    match[1].split(",").map((name) => name.trim().split(/\s+as\s+/).pop() ?? ""),
  );

  return OP_METHODS.filter((method) => [...declared, ...reExported].includes(method));
};

const writeRoutesOnDisk = (): [string, OpMethod][] =>
  walk(TENANTS_ROOT)
    .filter((file) => path.basename(file) === "route.ts")
    .flatMap((file) => {
      const folder = path.relative(TENANTS_ROOT, path.dirname(file)).split(path.sep).join("/");
      const route = folder ? `/tenants/${folder}` : "/tenants";
      return exportedWrites(fs.readFileSync(file, "utf8")).map((method) => [route, method] as [string, OpMethod]);
    });

const pathOf = (route: string) => route.replace(/\[[^\]]+\]/g, "id_123");

describe("every write route is classified", () => {
  const routes = writeRoutesOnDisk();

  it("finds the panel's write routes on disk", () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it.each(routes)("%s %s has a verdict of its own", (route, method) => {
    const rule = classifyOp(method, route);
    expect(rule.route).not.toBeNull();
    if (rule.verdict === "deny") {
      expect(rule.reason).not.toMatch(/unclassified/);
    }
  });

  it.each(routes)("%s %s answers the same for a real request path", (route, method) => {
    expect(classifyOp(method, pathOf(route)).verdict).toBe(classifyOp(method, route).verdict);
  });

  it("has no row for a route that is not on disk", () => {
    const onDisk = new Set(routes.map(([route, method]) => `${method} ${route}`));
    const rows = Object.entries(OP_RULES).flatMap(([route, rule]) =>
      Object.keys(rule).map((method) => `${method} ${route}`),
    );
    expect(rows.filter((row) => !onDisk.has(row))).toEqual([]);
  });
});

describe("denials", () => {
  it("give a reason, every one", () => {
    const rules = [
      ...DENIED_PREFIXES.map((entry) => entry.rule),
      ...Object.values(OP_RULES).flatMap((rule) => Object.values(rule)),
    ];
    for (const rule of rules) {
      if (rule?.verdict === "deny") {
        expect(rule.reason.length).toBeGreaterThan(20);
      }
    }
  });

  it.each([
    "/tenants/orders/order_1/cancel",
    "/tenants/orders/order_1/refund",
    "/tenants/order-edits/oe_1",
    "/tenants/returns/ret_1/receive",
    "/tenants/claims/claim_1",
    "/tenants/exchanges/ex_1",
    "/tenants/payments/pay_1/capture",
    "/tenants/payments/pay_1/refund",
    "/tenants/payment-settings",
    "/tenants/payment-settings/btcpay",
    "/tenants/reservations/res_1",
    "/tenants/customers/cus_1",
    "/tenants/domains",
    "/tenants/domains/dom_1/primary",
    "/tenants/marketplaces/wb/key",
    "/tenants/ozon/key",
    "/tenants/wb/key",
    "/tenants/apiship/key",
    "/tenants/telegram-bot",
    "/tenants/staff",
    "/tenants/staff/adm_1",
    "/tenants/me/password",
    "/tenants/agent-changesets",
  ])("refuse %s, existing route or not", (requestPath) => {
    for (const method of OP_METHODS) {
      expect(classifyOp(method, requestPath).verdict).toBe("deny");
    }
  });

  it("refuse a route nobody classified", () => {
    const rule = classifyOp("POST", "/tenants/something-new");
    expect(rule.verdict).toBe("deny");
  });

  it("refuse an upper-case spelling the router would still take", () => {
    expect(classifyOp("POST", "/tenants/ORDERS/order_1/cancel").verdict).toBe("deny");
  });
});

describe("allowed ops", () => {
  const allowed = writeRoutesOnDisk().filter(([route, method]) => classifyOp(method, route).verdict === "allow");

  it("are the page, home, branding, article and product writes, and nothing else", () => {
    expect(allowed.map(([route, method]) => `${method} ${route}`).sort()).toEqual([
      "POST /tenants/articles",
      "POST /tenants/pages",
      "POST /tenants/products/[id]",
      "POST /tenants/products/[id]/attributes",
      "POST /tenants/products/[id]/variants/[variant_id]",
      "PUT /tenants/articles/[slug]",
      "PUT /tenants/branding",
      "PUT /tenants/home",
      "PUT /tenants/pages/[key]",
    ]);
  });

  it("leave the product's own sub-routes to their own rows", () => {
    expect(classifyOp("POST", "/tenants/products/import").verdict).toBe("deny");
    expect(classifyOp("POST", "/tenants/products/prod_1").verdict).toBe("allow");
  });

  it("put a price in the hands of the owner and the manager only", () => {
    const rule = classifyOp("POST", "/tenants/products/prod_1/variants/variant_1");
    expect(rule.verdict === "allow" && rule.roles).toEqual(["owner", "manager"]);
  });

  it("never open a route the role itself could not call", () => {
    // The allow-list narrows; the route's own permission still applies.
    expect(decideAccess("operator", "PUT", "/tenants/home").allowed).toBe(false);
    expect(decideAccess("manager", "PUT", "/tenants/home").allowed).toBe(true);
  });
});
