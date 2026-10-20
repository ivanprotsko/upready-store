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
};

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

export function fixtureFetch(): FetchFn {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.pathname === "/auth/tenant/emailpass" && method === "POST") return json({ token: "fixture-token" });
    if (method !== "GET") return json({ message: `fixture: ${method} is not served` }, 405);
    const file = FILES[url.pathname];
    if (!file) return json({ message: `fixture: no recording for ${url.pathname}` }, 404);
    return json(narrow(url.pathname, read(file), url.searchParams));
  };
}
