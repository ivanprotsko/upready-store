/**
 * The changeset backend on fixtures: `/tenants/agent-changesets*` answered in
 * memory, in the shapes and words of line A's routes (t-2026-10-27-04,
 * `apps/backend/src/api/tenants/agent-changesets`). The stand runs on it with
 * no shop login, and the tests drive propose → stage → publish → rollback,
 * the refusals and the drift through it.
 *
 * The allow-list here is a copy of the part owner-voice can reach (products,
 * home, branding, pages), with the backend's reasons word for word, so a
 * refusal on fixtures reads the same as a live one. The live allow-list stays
 * the judge: this file never decides anything for the real shop.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { FetchFn } from "./api.ts";
import type { Changeset, ChangesetStatus, FieldChange, Op, OpView } from "./changesets.ts";

const DIR = fileURLToPath(new URL("../../fixtures/shop/", import.meta.url));

type Row = Record<string, unknown>;

// ---- the backend's reasons, word for word (allow-list.ts, ops.ts)

const MONEY = "orders, payments and returns never go through the agent";
const BUYERS = "buyers' personal data never goes through the agent";
const ADDRESS = "the shop's address and domains are decided by Ivan and lead-devops";
const SECRET = "an integration secret or a marketplace key never goes through the agent";
const PEOPLE = "logins, roles and sites are the owner's own decision";
const STOCK = "stock is set by buyers and marketplaces, not by the agent";
const MARKETPLACE = "a write to a marketplace leaves the shop and cannot be rolled back";
const FILE = "an upload is a file, not a change; the change that uses it is the op";
const UNKNOWN = "not on the agent's list: an unclassified route is refused";

const PREFIXES: [string, string][] = [
  ["/tenants/orders", MONEY], ["/tenants/order-edits", MONEY], ["/tenants/returns", MONEY], ["/tenants/claims", MONEY],
  ["/tenants/exchanges", MONEY], ["/tenants/payments", MONEY], ["/tenants/payment-settings", MONEY],
  ["/tenants/reservations", MONEY], ["/tenants/tribute", MONEY], ["/tenants/customers", BUYERS],
  ["/tenants/domains", ADDRESS], ["/tenants/handle", ADDRESS], ["/tenants/redirects", ADDRESS],
  ["/tenants/apiship", SECRET], ["/tenants/ozon", SECRET], ["/tenants/pochta", SECRET], ["/tenants/telegram-bot", SECRET],
  ["/tenants/notification-settings", SECRET], ["/tenants/wb", MARKETPLACE], ["/tenants/marketplaces", MARKETPLACE],
  ["/tenants/staff", PEOPLE], ["/tenants/me", PEOPLE], ["/tenants/sites", PEOPLE], ["/tenants/seed", PEOPLE],
  ["/tenants/agent-changesets", PEOPLE], ["/tenants/inventory-items", STOCK], ["/tenants/stock-locations", STOCK],
];

interface Rule {
  re: RegExp;
  method: string;
  kind: string;
  scope: "site" | "product";
  fields: string[];
}

const RULES: Rule[] = [
  { re: /^\/tenants\/home$/, method: "PUT", kind: "home", scope: "site", fields: ["theme", "settings", "content"] },
  {
    re: /^\/tenants\/branding$/, method: "PUT", kind: "branding", scope: "site",
    fields: ["logo_light_url", "logo_dark_url", "favicon_url", "og_image_url", "primary_color", "shop_name_short", "footer_credit", "app_icons"],
  },
  { re: /^\/tenants\/pages\/[^/]+$/, method: "PUT", kind: "page", scope: "site", fields: ["title", "body", "published", "in_footer", "footer_order", "locale", "seo_title", "seo_description"] },
  { re: /^\/tenants\/products\/[^/]+$/, method: "POST", kind: "product", scope: "product", fields: ["title", "subtitle", "description", "thumbnail", "images", "categories"] },
];

class Refusal extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Row;
  constructor(status: number, code: string, message: string, details: Row = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function classify(op: Op): Rule | string {
  if (typeof op.path !== "string" || !op.path.startsWith("/tenants/")) return "an op's path is a /tenants/* path";
  if (op.path.includes("/upload")) return FILE;
  const prefixed = PREFIXES.find(([prefix]) => op.path === prefix || op.path.startsWith(`${prefix}/`));
  if (prefixed) return prefixed[1];
  const rule = RULES.find((r) => r.re.test(op.path) && r.method === op.method);
  if (!rule) return UNKNOWN;
  const extra = Object.keys(op.body ?? {}).filter((key) => !rule.fields.includes(key));
  if (extra.length) return `fields not open to the agent here: ${extra.join(", ")}`;
  return rule;
}

const read = (file: string): Row => JSON.parse(readFileSync(`${DIR}${file}`, "utf8")) as Row;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
const pick = (row: Row, keys: string[]): Row => Object.fromEntries(keys.map((k) => [k, row[k] ?? null]));

interface Stored {
  row: Changeset;
  ops: Op[];
  views: OpView[];
  /** What publishing left on the live site, per op, for the drift check. */
  published: string[];
}

export interface FixtureBackendOptions {
  /** The stage site's origin on the cards, e.g. `https://stage.cherkashino.com`. */
  stageUrl: string;
  mainUrl: string;
  now?: () => Date;
}

/**
 * The live site on fixtures: products from the recording, the home page from
 * `tenants-commands.json`, branding and pages empty. A publish writes here, a
 * rollback writes the old value back; `touch` plays somebody editing the live
 * site in the panel meanwhile, which a rollback then reports as drift.
 */
export class FixtureChangesetBackend {
  readonly #opts: FixtureBackendOptions;
  readonly #items = new Map<string, Stored>();
  readonly #live = new Map<string, Row>();
  readonly #handles = new Map<string, string>();

  constructor(opts: FixtureBackendOptions) {
    this.#opts = opts;
    for (const p of (read("assistant-store-products.json").products ?? []) as Row[]) {
      this.#live.set(`/tenants/products/${p.id}`, { title: p.title, subtitle: p.subtitle ?? null, description: p.description ?? null, thumbnail: p.thumbnail ?? null, images: p.images ?? [] });
      this.#handles.set(String(p.id), String(p.handle));
    }
    const home = (read("tenants-commands.json")["/tenants/home"] as Row | undefined)?.home as Row | undefined;
    this.#live.set("/tenants/home", { theme: home?.theme ?? null, settings: home?.settings ?? null, content: home?.content ?? null });
    this.#live.set("/tenants/branding", {});
  }

  /** The live value at a path, as the panel would read it. */
  live(path: string): Row | null {
    return this.#live.get(path) ?? null;
  }

  /** Somebody edits the live site outside the agent. */
  touch(path: string, patch: Row): void {
    this.#live.set(path, { ...(this.#live.get(path) ?? {}), ...patch });
  }

  #now(): string {
    return (this.#opts.now?.() ?? new Date()).toISOString();
  }

  #sites() {
    return { main_url: this.#opts.mainUrl, stage_url: this.#opts.stageUrl };
  }

  #summary(s: Stored): Changeset {
    const { ops: _ops, ...row } = s.row;
    return row;
  }

  #find(id: string): Stored {
    if (id === "latest") {
      const last = [...this.#items.values()].filter((s) => s.row.status === "published").sort((a, b) => String(b.row.published_at).localeCompare(String(a.row.published_at)))[0];
      if (last) return last;
    }
    const found = this.#items.get(id);
    if (!found) throw new Refusal(404, "not_found", `Agent changeset ${id} was not found.`);
    return found;
  }

  #expect(s: Stored, from: ChangesetStatus[], action: string): void {
    if (!from.includes(s.row.status)) throw new Refusal(409, "wrong_status", `A ${s.row.status} changeset cannot be ${action}.`, { status: s.row.status });
  }

  create(body: Row): { agent_changeset: Changeset; sites: ReturnType<FixtureChangesetBackend["sites"]> } {
    const ops = body.ops;
    if (body.source !== "owner-voice" && body.source !== "telegram" && body.source !== "panel") throw new Refusal(400, "invalid_data", "source must be owner-voice, telegram or panel");
    if (!Array.isArray(ops) || ops.length < 1 || ops.length > 50) throw new Refusal(400, "invalid_ops", "A changeset holds 1 to 50 ops.");
    const views: OpView[] = (ops as Op[]).map((op, index) => {
      const rule = classify(op);
      if (typeof rule === "string") throw new Refusal(400, "op_denied", `Op ${index + 1}: ${rule}`, { op_index: index });
      const fields = Object.keys(op.body ?? {});
      const before = pick(this.#live.get(op.path) ?? {}, fields);
      const after = { ...before, ...(op.body ?? {}) };
      const changes: FieldChange[] = fields.filter((f) => hash(before[f]) !== hash(after[f])).map((f) => ({ field: f, before: before[f], after: after[f] }));
      const productId = /^\/tenants\/products\/([^/]+)$/.exec(op.path)?.[1];
      const preview = rule.kind === "home" || rule.kind === "branding" ? "/" : rule.kind === "page" ? `/pages/${op.path.split("/")[3]}` : productId && this.#handles.get(productId) ? `/products/${this.#handles.get(productId)}` : null;
      return { index, method: op.method, path: op.path, kind: rule.kind, scope: rule.scope, preview_path: preview, changes };
    });
    const row: Changeset = {
      id: `acs_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
      status: "draft",
      source: String(body.source),
      summary: typeof body.summary === "string" ? body.summary : null,
      author_email: "owner@fixture",
      op_count: views.length,
      op_kinds: [...new Set(views.map((v) => v.kind))],
      created_at: this.#now(),
      staged_at: null,
      published_at: null,
      rolled_back_at: null,
      discarded_at: null,
    };
    const stored: Stored = { row, ops: ops as Op[], views, published: [] };
    this.#items.set(row.id, stored);
    return { agent_changeset: { ...row, ops: views }, sites: this.#sites() };
  }

  sites() {
    return this.#sites();
  }

  act(id: string, action: string): { agent_changeset: Changeset } {
    const s = this.#find(id);
    if (action === "stage") {
      this.#expect(s, ["draft"], "staged");
      s.row = { ...s.row, status: "staged", staged_at: this.#now() };
    } else if (action === "publish") {
      this.#expect(s, ["staged"], "published");
      s.published = s.ops.map((op) => {
        const before = this.#live.get(op.path) ?? {};
        const after = { ...before, ...(op.body ?? {}) };
        this.#live.set(op.path, after);
        return hash(pick(after, Object.keys(op.body ?? {})));
      });
      s.row = { ...s.row, status: "published", published_at: this.#now() };
    } else if (action === "rollback") {
      this.#expect(s, ["published"], "rolled back");
      const drift = s.ops
        .map((op, i) => {
          const now = pick(this.#live.get(op.path) ?? {}, Object.keys(op.body ?? {}));
          // `before` is what publishing left, `now` what the live site holds.
          return hash(now) === s.published[i] ? null : { op_index: i, method: op.method, path: op.path, before: op.body ?? {}, now };
        })
        .filter(Boolean);
      if (drift.length) throw new Refusal(409, "drift", "The live site changed after this was published. Nothing was rolled back.", { drift });
      s.ops.forEach((op, i) => {
        const back = Object.fromEntries(s.views[i]!.changes.map((c) => [c.field, c.before]));
        this.#live.set(op.path, { ...(this.#live.get(op.path) ?? {}), ...back });
      });
      s.row = { ...s.row, status: "rolled_back", rolled_back_at: this.#now() };
    } else if (action === "discard") {
      this.#expect(s, ["draft", "staged"], "discarded");
      s.row = { ...s.row, status: "discarded", discarded_at: this.#now() };
    }
    return { agent_changeset: this.#summary(s) };
  }

  show(id: string) {
    const s = this.#find(id);
    return { agent_changeset: { ...this.#summary(s), ops: s.views }, sites: this.#sites() };
  }

  list(params: URLSearchParams) {
    const status = params.get("status");
    const limit = Number(params.get("limit") ?? 20) || 20;
    const rows = [...this.#items.values()]
      .filter((s) => !status || s.row.status === status)
      .sort((a, b) => b.row.created_at.localeCompare(a.row.created_at))
      .map((s) => this.#summary(s));
    return { agent_changesets: rows.slice(0, limit), count: rows.length, offset: 0, limit, sites: this.#sites() };
  }

  /** A `fetch` that answers `/tenants/agent-changesets*` and refuses everything else. */
  fetch(): FetchFn {
    return async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const method = (init?.method ?? "GET").toUpperCase();
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      const parts = url.pathname.split("/").filter(Boolean);
      try {
        if (parts[0] !== "tenants" || parts[1] !== "agent-changesets") return json({ message: `fixture: ${url.pathname} is not a changeset route` }, 404);
        const auth = new Headers(init?.headers).get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) return json({ message: "Unauthorized" }, 401);
        if (parts.length === 2 && method === "GET") return json(this.list(url.searchParams));
        if (parts.length === 2 && method === "POST") return json(this.create(JSON.parse(String(init?.body ?? "{}")) as Row), 201);
        if (parts.length === 3 && method === "GET") return json(this.show(parts[2]!));
        if (parts.length === 4 && method === "POST" && ["stage", "publish", "rollback", "discard"].includes(parts[3]!)) return json(this.act(parts[2]!, parts[3]!));
        return json({ message: `fixture: ${method} ${url.pathname}` }, 405);
      } catch (err) {
        if (err instanceof Refusal) return json({ type: err.code, message: err.message, ...err.details }, err.status);
        throw err;
      }
    };
  }
}
