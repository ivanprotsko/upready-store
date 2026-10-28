import type { TenantAdminRole } from "../api/tenants/permissions";

/**
 * Which `/tenants/*` writes the owner's agent may put in a changeset
 * (t-2026-10-27-04). One data file, read by the changeset routes and held
 * whole by `__tests__/allow-list.unit.spec.ts`: every write route on disk has
 * a verdict here, so a new route cannot reach the agent before somebody
 * decides whether it should.
 *
 * The line is the rollback. A write is allowed only when its old value can be
 * read back through the same API before publishing and written back after,
 * which is what `ops.ts` does for each `kind` below. Everything else is
 * denied with the reason, and the money, orders, buyers, addresses, secrets
 * and logins the brief names are denied whatever their rollback would be.
 *
 * `scope` says where a staged op lands. A `site` op runs on the stage site,
 * which has its own pages, home and branding. A `product` op does not run on
 * stage at all: the group's sites share their products, so writing one on
 * stage would write it on the live shop too. The stage storefront overlays it
 * instead (`overlay.ts`).
 */

export type OpMethod = "POST" | "PUT" | "PATCH" | "DELETE";

export const OP_METHODS: readonly OpMethod[] = ["POST", "PUT", "PATCH", "DELETE"];

export type OpKind =
  | "home"
  | "branding"
  | "page"
  | "page-create"
  | "article"
  | "article-create"
  | "product"
  | "variant"
  | "attributes";

export type AllowedOp = {
  verdict: "allow";
  kind: OpKind;
  scope: "site" | "product";
  /** The body keys the agent may send. Anything else is refused at draft time. */
  fields: readonly string[];
  /** Narrower than the route's own permission: only these roles may stage or publish it. */
  roles?: readonly TenantAdminRole[];
};

export type DeniedOp = { verdict: "deny"; reason: string };

export type OpRule = AllowedOp | DeniedOp;

const deny = (reason: string): DeniedOp => ({ verdict: "deny", reason });

// ---- the reasons, one sentence each, in the words the panel and the report show

const MONEY = deny("orders, payments and returns never go through the agent");
const BUYERS = deny("buyers' personal data never goes through the agent");
const ADDRESS = deny("the shop's address and domains are decided by Ivan and lead-devops");
const SECRET = deny("an integration secret or a marketplace key never goes through the agent");
const PEOPLE = deny("logins, roles and sites are the owner's own decision");
const STOCK = deny("stock is set by buyers and marketplaces, not by the agent");
const MARKETPLACE = deny("a write to a marketplace leaves the shop and cannot be rolled back");
const NO_ROLLBACK = deny("no rollback path: the old value cannot be read back and written again");
const SHARED = deny("shared by every site of the group, so a stage copy would be the live one");
const FILE = deny("an upload is a file, not a change; the change that uses it is the op");

/**
 * Whole subtrees. A route under one of these prefixes is denied for every
 * method, including routes that do not exist yet: a future
 * `/tenants/orders/:id/refund` is refused without anybody adding a row.
 */
export const DENIED_PREFIXES: readonly { prefix: string; rule: DeniedOp }[] = [
  { prefix: "/tenants/orders", rule: MONEY },
  { prefix: "/tenants/order-edits", rule: MONEY },
  { prefix: "/tenants/returns", rule: MONEY },
  { prefix: "/tenants/claims", rule: MONEY },
  { prefix: "/tenants/exchanges", rule: MONEY },
  { prefix: "/tenants/payments", rule: MONEY },
  { prefix: "/tenants/payment-settings", rule: MONEY },
  { prefix: "/tenants/reservations", rule: MONEY },
  { prefix: "/tenants/tribute", rule: MONEY },
  { prefix: "/tenants/customers", rule: BUYERS },
  { prefix: "/tenants/domains", rule: ADDRESS },
  { prefix: "/tenants/handle", rule: ADDRESS },
  { prefix: "/tenants/redirects", rule: ADDRESS },
  { prefix: "/tenants/apiship", rule: SECRET },
  { prefix: "/tenants/ozon", rule: SECRET },
  { prefix: "/tenants/wb", rule: MARKETPLACE },
  { prefix: "/tenants/marketplaces", rule: MARKETPLACE },
  { prefix: "/tenants/pochta", rule: SECRET },
  { prefix: "/tenants/telegram-bot", rule: SECRET },
  { prefix: "/tenants/notification-settings", rule: SECRET },
  { prefix: "/tenants/staff", rule: PEOPLE },
  { prefix: "/tenants/me", rule: PEOPLE },
  { prefix: "/tenants/sites", rule: PEOPLE },
  { prefix: "/tenants/seed", rule: PEOPLE },
  { prefix: "/tenants/agent-changesets", rule: PEOPLE },
  { prefix: "/tenants/inventory-items", rule: STOCK },
  { prefix: "/tenants/stock-locations", rule: STOCK },
];

/** Route by route, for everything the prefixes above do not cover. */
export const OP_RULES: Record<string, Partial<Record<OpMethod, OpRule>>> = {
  "/tenants": { POST: PEOPLE },

  // ---- allowed: the site's own content, written on the stage site
  "/tenants/home": {
    PUT: { verdict: "allow", kind: "home", scope: "site", fields: ["theme", "settings", "content"] },
  },
  "/tenants/branding": {
    PUT: {
      verdict: "allow",
      kind: "branding",
      scope: "site",
      fields: [
        "logo_light_url",
        "logo_dark_url",
        "favicon_url",
        "og_image_url",
        "primary_color",
        "shop_name_short",
        "footer_credit",
        "app_icons",
      ],
    },
  },
  "/tenants/branding/upload": { POST: FILE },
  "/tenants/pages": {
    POST: { verdict: "allow", kind: "page-create", scope: "site", fields: ["slug", "title"] },
  },
  "/tenants/pages/[key]": {
    PUT: {
      verdict: "allow",
      kind: "page",
      scope: "site",
      fields: ["title", "body", "published", "in_footer", "footer_order", "locale", "seo_title", "seo_description"],
    },
    DELETE: NO_ROLLBACK,
  },
  "/tenants/articles": {
    POST: {
      verdict: "allow",
      kind: "article-create",
      scope: "site",
      fields: [
        "slug",
        "locale",
        "title",
        "body",
        "excerpt",
        "cover_url",
        "status",
        "category",
        "author",
        "tags",
        "seo_title",
        "seo_description",
      ],
    },
  },
  "/tenants/articles/[slug]": {
    // No `slug`: a rename moves every language row and leaves a redirect,
    // which a snapshot of one row cannot undo. No `published_at` and no
    // `published`: the route stamps the date itself.
    PUT: {
      verdict: "allow",
      kind: "article",
      scope: "site",
      fields: [
        "locale",
        "title",
        "body",
        "excerpt",
        "cover_url",
        "status",
        "category",
        "author",
        "tags",
        "seo_title",
        "seo_description",
      ],
    },
    DELETE: NO_ROLLBACK,
  },

  // ---- allowed: one product of the group, overlaid on stage, written on publish
  "/tenants/products/[id]": {
    POST: {
      verdict: "allow",
      kind: "product",
      scope: "product",
      fields: ["title", "subtitle", "description", "thumbnail", "images", "categories"],
    },
    DELETE: NO_ROLLBACK,
  },
  "/tenants/products/[id]/variants/[variant_id]": {
    POST: {
      verdict: "allow",
      kind: "variant",
      scope: "product",
      fields: ["prices"],
      roles: ["owner", "manager"],
    },
    DELETE: NO_ROLLBACK,
  },
  "/tenants/products/[id]/attributes": {
    POST: { verdict: "allow", kind: "attributes", scope: "product", fields: ["values"] },
  },

  // ---- denied: catalog writes with no rollback in this line
  "/tenants/products": { POST: NO_ROLLBACK },
  "/tenants/products/[id]/translations": { PUT: NO_ROLLBACK },
  "/tenants/products/[id]/options/batch": { POST: NO_ROLLBACK },
  "/tenants/products/[id]/images/[image_id]/variants/batch": { POST: NO_ROLLBACK },
  "/tenants/products/[id]/variants": { POST: NO_ROLLBACK },
  "/tenants/products/[id]/variants/batch": { POST: NO_ROLLBACK },
  "/tenants/products/[id]/variants/[variant_id]/images/batch": { POST: NO_ROLLBACK },
  "/tenants/products/[id]/variants/inventory-items/batch": { POST: STOCK },
  "/tenants/products/[id]/variants/[variant_id]/inventory-items": { POST: STOCK },
  "/tenants/products/[id]/variants/[variant_id]/inventory-items/[inventory_item_id]": {
    POST: STOCK,
    DELETE: STOCK,
  },
  "/tenants/products/import": { POST: NO_ROLLBACK },
  "/tenants/products/import/[import_id]": { DELETE: NO_ROLLBACK },
  "/tenants/products/import/[import_id]/confirm": { POST: NO_ROLLBACK },
  "/tenants/product-categories": { POST: SHARED },
  "/tenants/product-categories/[id]": { POST: SHARED, DELETE: SHARED },
  "/tenants/product-categories/[id]/products": { POST: SHARED },
  "/tenants/product-attributes": { POST: SHARED },
  "/tenants/product-attributes/[id]": { POST: SHARED, DELETE: SHARED },
  "/tenants/product-attribute-presets": { POST: SHARED },
  "/tenants/reviews/[id]": { POST: NO_ROLLBACK, DELETE: NO_ROLLBACK },

  // ---- denied: marketing, courses, shipping and settings with no rollback in this line
  "/tenants/campaigns": { POST: NO_ROLLBACK },
  "/tenants/campaigns/[id]": { POST: NO_ROLLBACK, DELETE: NO_ROLLBACK },
  "/tenants/campaigns/[id]/promotions": { POST: NO_ROLLBACK },
  "/tenants/promotions": { POST: NO_ROLLBACK },
  "/tenants/promotions/[id]": { POST: NO_ROLLBACK, DELETE: NO_ROLLBACK },
  "/tenants/promotions/[id]/rules/batch": { POST: NO_ROLLBACK },
  "/tenants/promotions/[id]/buy-rules/batch": { POST: NO_ROLLBACK },
  "/tenants/promotions/[id]/target-rules/batch": { POST: NO_ROLLBACK },
  "/tenants/courses": { POST: NO_ROLLBACK },
  "/tenants/courses/[id]": { POST: NO_ROLLBACK, DELETE: NO_ROLLBACK },
  "/tenants/courses/[id]/lessons": { POST: NO_ROLLBACK },
  "/tenants/courses/[id]/lessons/reorder": { POST: NO_ROLLBACK },
  "/tenants/courses/[id]/lessons/[lessonId]": { POST: NO_ROLLBACK, DELETE: NO_ROLLBACK },
  "/tenants/shipping-methods": { POST: NO_ROLLBACK },
  "/tenants/shipping-methods/[id]": { POST: NO_ROLLBACK, DELETE: NO_ROLLBACK },
  "/tenants/shipping-methods/reorder": { POST: NO_ROLLBACK },
  "/tenants/shipping-methods/settings": { POST: NO_ROLLBACK },
  "/tenants/shipping-methods/zone-presets": { POST: NO_ROLLBACK },
  "/tenants/delivery-settings": { PUT: SECRET, DELETE: SECRET },
  "/tenants/analytics": { PUT: NO_ROLLBACK },
  "/tenants/seo-verification": { PUT: NO_ROLLBACK },
  "/tenants/locale-settings": { PUT: NO_ROLLBACK },
  "/tenants/login-settings": { PUT: PEOPLE },
  "/tenants/hreflang-sisters": { PUT: ADDRESS },
  "/tenants/requisites": { PUT: MONEY },
  "/tenants/uploads": { POST: FILE },
};

/** Ops the agent's request may not carry at all, whatever the route says. */
export const UNKNOWN_ROUTE = deny("not on the agent's list: an unclassified route is refused");

// ---- matching a request path to a row

const isParameter = (segment: string) => segment.startsWith("[") && segment.endsWith("]");
const splitPath = (path: string) => path.split("/").filter(Boolean);

type CompiledRow = { route: string; segments: (string | null)[] };

const COMPILED: CompiledRow[] = Object.keys(OP_RULES).map((route) => ({
  route,
  segments: splitPath(route).map((segment) => (isParameter(segment) ? null : segment)),
}));

const staticCount = (row: CompiledRow) => row.segments.filter((segment) => segment !== null).length;

/**
 * The route file a request path lands on, the way `permissions.ts` matches:
 * a static segment outranks a parameter, so `/tenants/products/import` is the
 * import route and not a product with the id `import`.
 */
export const routeOf = (path: string): string | null => {
  const segments = splitPath(path.split("?")[0]);
  const candidates = COMPILED.filter(
    (row) =>
      row.segments.length === segments.length &&
      row.segments.every((expected, index) => expected === null || expected === segments[index].toLowerCase()),
  );

  candidates.sort((left, right) => staticCount(right) - staticCount(left));
  return candidates[0]?.route ?? null;
};

const underPrefix = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** The verdict for `method` on `path`, a route pattern or a real request path. */
export const classifyOp = (method: string, path: string): OpRule & { route: string | null } => {
  const bare = path.split("?")[0].replace(/\/+$/, "").toLowerCase();
  const verb = method.toUpperCase() as OpMethod;

  const prefixed = DENIED_PREFIXES.find((entry) => underPrefix(bare, entry.prefix));
  if (prefixed) {
    return { ...prefixed.rule, route: prefixed.prefix };
  }

  const route = OP_METHODS.includes(verb) ? (OP_RULES[path] ? path : routeOf(path)) : null;
  const rule = route ? OP_RULES[route][verb] : undefined;

  return { ...(rule ?? UNKNOWN_ROUTE), route };
};
