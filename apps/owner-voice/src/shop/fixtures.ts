/**
 * A `fetch` that answers from `fixtures/shop/*.json` instead of the network.
 *
 * It stands in for the shop when a key is missing, so the real client in
 * `api.ts` builds the same URLs and reads the same shapes in both modes. The
 * Store API files are recorded from cherkashino.com (20.10.2026); the
 * `tenants-*` files are shaped after the backend routes and say so in their
 * `_fixture` field, because the build machine has no shop login.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { FetchFn } from "./api.ts";

const DIR = fileURLToPath(new URL("../../fixtures/shop/", import.meta.url));

const FILES: Record<string, string> = {
  "/storefront/by-host": "by-host.json",
  "/store/regions": "store-regions.json",
  "/store/products": "store-products.json",
  "/tenants/analytics/summary": "tenants-analytics-summary.json",
  "/tenants/orders": "tenants-orders.json",
  "/tenants/inventory-items": "tenants-inventory-items.json",
  "/tenants/reviews": "tenants-reviews.json",
  "/store/tenant/product-categories": "assistant-store-categories.json",
  "/store/tenant/pages": "assistant-store-pages.json",
};

/** The shaped answers of the command map's read routes, one file keyed by path. */
const COMMANDS_FILE = "tenants-commands.json";

type Row = Record<string, unknown>;

const read = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(`${DIR}${file}`, "utf8")) as Record<string, unknown>;

/**
 * Lower case with ё read as е. Speech to text writes «мумие» for «мумиё» and
 * owners type either, so every match folds both sides.
 */
export const fold = (text: string): string => text.toLowerCase().replace(/ё/g, "е");

/** Every word of the query, cut to its first five letters, appears in the text: «печени» finds «Очищение печени». */
export function matchesQuery(text: string, q: string | null): boolean {
  if (!q) return true;
  const hay = fold(text);
  return fold(q)
    .split(/[^\p{L}\p{N}-]+/u)
    .filter(Boolean)
    .every((word) => hay.includes(word.slice(0, 5)));
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function narrow(path: string, body: Record<string, unknown>, params: URLSearchParams): Record<string, unknown> {
  const q = params.get("q");
  const limit = Number(params.get("limit") ?? 0) || undefined;
  const list = (key: string, keep: (row: Row) => boolean) => {
    const rows = ((body[key] as Row[] | undefined) ?? []).filter(keep).slice(0, limit);
    return { ...body, [key]: rows, count: rows.length };
  };
  switch (path) {
    case "/store/products":
      return list("products", (p) => matchesQuery(`${p.title} ${p.handle}`, q));
    case "/tenants/inventory-items":
      return list("inventory_items", (i) => matchesQuery(`${i.title} ${i.sku}`, q));
    case "/tenants/reviews": {
      const productIds = params.getAll("product_id");
      return list("reviews", (r) => !productIds.length || productIds.includes(String(r.product_id)));
    }
    case "/tenants/orders":
      return { ...list("orders", () => true), count: body.count };
    case "/tenants/analytics/summary":
      return { ...body, period: { ...(body.period as Row), key: params.get("period") ?? "7d" } };
    default:
      return body;
  }
}

const ORDER_PATH = /^\/tenants\/orders\/([^/]+)(?:\/(changes|line-items|preview))?$/;
const PRODUCT_PATH = /^\/tenants\/products\/([^/]+)$/;
const PAGE_PATH = /^\/store\/tenant\/pages\/([^/]+)$/;

/**
 * The answer for a path with no file of its own: one order or product, a page
 * body, a command-map list, or the buyer assistant's richer product list.
 */
function answer(path: string, params: URLSearchParams): Record<string, unknown> | null {
  const order = ORDER_PATH.exec(path);
  if (order) {
    const found = ((read("tenants-orders.json").orders ?? []) as Row[]).find((o) => o.id === decodeURIComponent(order[1]!));
    if (!found) return null;
    const extra = read(COMMANDS_FILE)["order-extra"] as Row;
    const full = { ...found, email: extra.email, shipping_address: extra.shipping_address, items: extra.items };
    if (order[2] === "changes") return { order_changes: extra.changes };
    if (order[2] === "line-items") return { order_items: (extra.items as Row[]).map((item) => ({ item, quantity: item.quantity })) };
    return { order: full };
  }
  const product = PRODUCT_PATH.exec(path);
  if (product && product[1] !== "export") {
    const found = ((read("assistant-store-products.json").products ?? []) as Row[]).find((p) => p.id === decodeURIComponent(product[1]!));
    return found ? { product: { ...found, status: "published" } } : null;
  }
  if (path === "/tenants/products") {
    const rows = ((read("assistant-store-products.json").products ?? []) as Row[])
      .filter((p) => matchesQuery(`${p.title} ${p.handle}`, params.get("q")))
      .map((p) => ({ id: p.id, title: p.title, handle: p.handle, status: "published" }));
    const limit = Number(params.get("limit") ?? 0) || rows.length;
    return { products: rows.slice(0, limit), count: rows.length, offset: 0, limit };
  }
  const page = PAGE_PATH.exec(path);
  if (page) return ((read("assistant-store-page-bodies.json").pages as Row)[decodeURIComponent(page[1]!)] as Row | undefined) ?? null;
  const shaped = read(COMMANDS_FILE)[path];
  return shaped && typeof shaped === "object" ? (shaped as Record<string, unknown>) : null;
}

/** The buyer assistant asks for descriptions and categories; those come from its own, richer recording. */
function assistantProducts(params: URLSearchParams): Record<string, unknown> {
  const body = read("assistant-store-products.json");
  const q = params.get("q");
  const ids = params.getAll("id");
  const handles = params.getAll("handle");
  const categories = params.getAll("category_id");
  const rows = ((body.products as Row[] | undefined) ?? []).filter(
    (p) =>
      matchesQuery(`${p.title} ${p.handle}`, q) &&
      (!ids.length || ids.includes(String(p.id))) &&
      (!handles.length || handles.includes(String(p.handle))) &&
      (!categories.length || ((p.categories as Row[] | undefined) ?? []).some((c) => categories.includes(String(c.id)))),
  );
  const limit = Number(params.get("limit") ?? 0) || rows.length;
  return { products: rows.slice(0, limit), count: rows.length, offset: 0, limit };
}

export function fixtureFetch(): FetchFn {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.pathname === "/auth/tenant/emailpass" && method === "POST") return json({ token: "fixture-token" });
    if (method !== "GET") return json({ message: `fixture: ${method} is not served` }, 405);
    if (url.pathname === "/store/products" && /description|categories/.test(url.searchParams.get("fields") ?? "")) {
      return json(assistantProducts(url.searchParams));
    }
    const file = FILES[url.pathname];
    if (!file) {
      const body = answer(url.pathname, url.searchParams);
      return body ? json(body) : json({ message: `fixture: no recording for ${url.pathname}` }, 404);
    }
    return json(narrow(url.pathname, read(file), url.searchParams));
  };
}
