import { createHash } from "node:crypto";
import { classifyOp, type AllowedOp, type OpKind, type OpMethod } from "./allow-list";

/**
 * One op of a changeset: the request the panel itself would send.
 * `path` is the full `/tenants/*` path, query string included when the
 * route reads one (`?locale=` on an article).
 */
export type ChangesetOp = {
  method: OpMethod;
  path: string;
  body?: Record<string, unknown>;
};

/** What an op's target looked like: its tracked fields, or `null` when it did not exist. */
export type OpValue = Record<string, unknown> | null;

/**
 * How one kind of op is read back, compared and undone (t-2026-10-27-04).
 *
 * `read` is the GET that returns the op's target on a tenant. `project` keeps
 * the fields the op can change, in a stable shape, so the same value always
 * hashes the same; it answers `null` for a target the GET does not find (404).
 * `restore` is the write that puts a snapshot back, or `null` when there is
 * none, and then the changeset cannot be published (`publish` refuses it).
 */
type OpSpec = {
  read: (op: ChangesetOp) => string;
  project: (answer: Record<string, unknown>, op: ChangesetOp) => OpValue;
  restore: (op: ChangesetOp, before: OpValue) => ChangesetOp | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pick = (source: unknown, keys: readonly string[]): Record<string, unknown> => {
  const record = isRecord(source) ? source : {};
  return Object.fromEntries(keys.map((key) => [key, record[key] === undefined ? null : record[key]]));
};

const segments = (path: string) => path.split("?")[0].split("/").filter(Boolean);

const queryOf = (path: string) => new URLSearchParams(path.split("?")[1] ?? "");

/** `body.locale`, else the op path's `?locale=`, else nothing. */
const localeOf = (op: ChangesetOp): string | null => {
  const fromBody = op.body?.locale;
  if (typeof fromBody === "string" && fromBody) return fromBody;
  return queryOf(op.path).get("locale");
};

const withLocale = (path: string, locale: string | null) =>
  locale ? `${path}?locale=${encodeURIComponent(locale)}` : path;

// ---- the fields each target is restored with

const BRANDING_FIELDS = [
  "logo_light_url",
  "logo_dark_url",
  "favicon_url",
  "og_image_url",
  "primary_color",
  "shop_name_short",
  "footer_credit",
  "app_icons",
] as const;

const PAGE_FIELDS = [
  "title",
  "body",
  "published",
  "in_footer",
  "footer_order",
  "seo_title",
  "seo_description",
] as const;

const ARTICLE_FIELDS = [
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
] as const;

/** A product's fields in the shape `POST /tenants/products/:id` takes them back. */
const PRODUCT_FIELD_SHAPES: Record<string, (value: unknown) => unknown> = {
  title: (value) => value ?? null,
  subtitle: (value) => value ?? null,
  description: (value) => value ?? null,
  thumbnail: (value) => value ?? null,
  images: (value) =>
    Array.isArray(value) ? value.filter(isRecord).map((image) => ({ url: image.url })) : [],
  categories: (value) =>
    Array.isArray(value)
      ? value
          .filter(isRecord)
          .map((category) => ({ id: category.id }))
          .sort((left, right) => String(left.id).localeCompare(String(right.id)))
      : [],
};

/** A variant's prices as `POST …/variants/:variant_id` takes them back: amount and currency, sorted. */
export const pricesOf = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .filter(isRecord)
    .map((price) => ({ amount: Number(price.amount), currency_code: String(price.currency_code).toLowerCase() }))
    .sort((left, right) => left.currency_code.localeCompare(right.currency_code) || left.amount - right.amount);

const bodyKeys = (op: ChangesetOp) => Object.keys(op.body ?? {});

/** `values: [{key, value}]` → the keys an attributes op names. */
const attributeKeys = (op: ChangesetOp): string[] =>
  (Array.isArray(op.body?.values) ? op.body.values : [])
    .filter(isRecord)
    .map((entry) => String(entry.key))
    .sort();

export const OP_SPECS: Record<OpKind, OpSpec> = {
  home: {
    read: () => "/tenants/home",
    project: (answer) => (isRecord(answer.home) ? pick(answer.home, ["theme", "settings", "content"]) : null),
    // A shop that never saved a home document has nothing to go back to: the
    // home route has no DELETE, so the first document is the panel's to write.
    restore: (op, before) => (before ? { method: "PUT", path: "/tenants/home", body: before } : null),
  },
  branding: {
    read: () => "/tenants/branding",
    // Every field, not the op's own: a new favicon resets `app_icons` on the
    // route, so a rollback has to write them back too.
    project: (answer) => pick(answer.branding, BRANDING_FIELDS),
    restore: (_op, before) => (before ? { method: "PUT", path: "/tenants/branding", body: before } : null),
  },
  page: {
    read: (op) => withLocale(op.path.split("?")[0], localeOf(op)),
    project: (answer) => (isRecord(answer.page) ? pick(answer.page, PAGE_FIELDS) : null),
    // A reserved page never saved reads as a blank page and is written back
    // blank. A custom page the op found missing cannot be written at all: its
    // PUT is a 404, so the op itself fails on publish.
    restore: (op, before) =>
      before
        ? {
            method: "PUT",
            path: op.path.split("?")[0],
            body: { ...before, ...(localeOf(op) ? { locale: localeOf(op) } : {}) },
          }
        : null,
  },
  "page-create": {
    read: (op) => `/tenants/pages/${String(op.body?.slug ?? "")}`,
    project: (answer) => (isRecord(answer.page) ? pick(answer.page, PAGE_FIELDS) : null),
    // Created by this changeset: going back is deleting it. A slug that
    // already existed makes the POST itself fail, so `before` is null here.
    restore: (op, before) =>
      before ? null : { method: "DELETE", path: `/tenants/pages/${String(op.body?.slug ?? "")}` },
  },
  article: {
    read: (op) => withLocale(op.path.split("?")[0], localeOf(op)),
    project: (answer) => {
      const [row] = Array.isArray(answer.articles) ? answer.articles : [];
      return isRecord(row) ? pick(row, ARTICLE_FIELDS) : null;
    },
    restore: (op, before) =>
      before ? { method: "PUT", path: op.path.split("?")[0], body: { ...before, locale: localeOf(op) } } : null,
  },
  "article-create": {
    read: (op) => withLocale(`/tenants/articles/${String(op.body?.slug ?? "")}`, localeOf(op)),
    project: (answer) => {
      const [row] = Array.isArray(answer.articles) ? answer.articles : [];
      return isRecord(row) ? pick(row, ARTICLE_FIELDS) : null;
    },
    restore: (op, before) =>
      before
        ? null
        : {
            method: "DELETE",
            path: withLocale(`/tenants/articles/${String(op.body?.slug ?? "")}`, localeOf(op)),
          },
  },
  product: {
    read: (op) => op.path.split("?")[0],
    project: (answer, op) => {
      if (!isRecord(answer.product)) return null;
      const product = answer.product;
      return Object.fromEntries(
        bodyKeys(op)
          .filter((key) => key in PRODUCT_FIELD_SHAPES)
          .sort()
          .map((key) => [key, PRODUCT_FIELD_SHAPES[key](product[key])]),
      );
    },
    restore: (op, before) => (before ? { method: "POST", path: op.path.split("?")[0], body: before } : null),
  },
  variant: {
    read: (op) => op.path.split("?")[0],
    project: (answer) => (isRecord(answer.variant) ? { prices: pricesOf(answer.variant.prices) } : null),
    restore: (op, before) => (before ? { method: "POST", path: op.path.split("?")[0], body: before } : null),
  },
  attributes: {
    read: (op) => op.path.split("?")[0],
    project: (answer, op) => {
      const rows = Array.isArray(answer.product_attributes) ? answer.product_attributes.filter(isRecord) : [];
      const byKey = new Map(rows.map((row) => [String(row.key), row.value ?? null]));
      return Object.fromEntries(attributeKeys(op).map((key) => [key, byKey.get(key) ?? null]));
    },
    // `null` clears a value on this route, so a characteristic the product
    // did not have goes back to having none.
    restore: (op, before) =>
      before
        ? {
            method: "POST",
            path: op.path.split("?")[0],
            body: { values: Object.entries(before).map(([key, value]) => ({ key, value })) },
          }
        : null,
  },
};

// ---- hashing

/** JSON with object keys sorted at every depth, so equal values give equal text. */
export const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
};

export const hashValue = (value: OpValue): string =>
  createHash("sha256").update(stableJson(value)).digest("hex");

// ---- checking an op before it is stored

export type OpCheck = { ok: true; rule: AllowedOp } | { ok: false; reason: string };

/**
 * Whether the agent may store `op` at all: the route is allowed, the body
 * carries only the allowed fields, and the path names its target. The
 * caller's role is checked apart (`routes`), because it depends on who asks.
 */
export const checkOp = (op: unknown): OpCheck => {
  if (!isRecord(op) || typeof op.method !== "string" || typeof op.path !== "string") {
    return { ok: false, reason: "an op is {method, path, body}" };
  }

  if (!op.path.startsWith("/tenants/") || op.path.includes("..") || /[#\s]/.test(op.path)) {
    return { ok: false, reason: "an op's path is a /tenants/* path" };
  }

  const rule = classifyOp(op.method, op.path);
  if (rule.verdict === "deny") {
    return { ok: false, reason: rule.reason };
  }

  const body = op.body ?? {};
  if (!isRecord(body)) {
    return { ok: false, reason: "an op's body is an object" };
  }

  const extra = Object.keys(body).filter((key) => !rule.fields.includes(key));
  if (extra.length) {
    return { ok: false, reason: `fields not open to the agent here: ${extra.join(", ")}` };
  }

  const { route: _route, ...allowed } = rule;
  const needsLocale = allowed.kind === "article" || allowed.kind === "article-create";
  if (needsLocale && !localeOf(op as ChangesetOp)) {
    return { ok: false, reason: "an article op names its language: body.locale" };
  }

  if ((allowed.kind === "page-create" || allowed.kind === "article-create") && typeof body.slug !== "string") {
    return { ok: false, reason: "a new page or article names its slug" };
  }

  return { ok: true, rule: allowed };
};

/** The product an op of the `product` scope is about: the id after `/tenants/products/`. */
export const productIdOf = (op: ChangesetOp): string | null => {
  const [, second, third] = segments(op.path);
  return second === "products" && third ? third : null;
};

/** The variant a price op is about. */
export const variantIdOf = (op: ChangesetOp): string | null => {
  const parts = segments(op.path);
  return parts[3] === "variants" && parts[4] ? parts[4] : null;
};
