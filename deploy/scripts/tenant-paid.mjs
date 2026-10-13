#!/usr/bin/env node
// The operator's «paid» mark for a shop, t-2026-10-14-11.
//
// A buyer pays the platform through Tribute (a digital product), and the operator
// then marks that shop here. The mark is three keys of the tenant's `metadata`:
// `paid_via` ("tribute"), `paid_at` (ISO time) and `tribute_ref` (the Tribute order
// id). It goes through the backend's own POST /admin/tenants/:id, which merges
// `metadata` and leaves every other key alone; the three live-flag keys are not
// touched (only Ivan switches those, tenant-live.mjs).
//
//   node deploy/scripts/tenant-paid.mjs --tenant <ten_… id | handle> --via tribute --ref <tribute order id> [--at <iso>] [--dry-run]
//   node deploy/scripts/tenant-paid.mjs --list
//
// Options:
//   --tenant ID|HANDLE   the shop: a tenant id (ten_…) or its handle
//   --via tribute        how it was paid; tribute is the only value for now
//   --ref REF            the Tribute order id, kept as `tribute_ref`
//   --at ISO             when it was paid (default: now), kept as `paid_at`
//   --dry-run            print before and after, write nothing
//   --list               print every shop with `metadata.paid_via` set: date, via, ref
//   --api URL            the backend origin (default: TENANT_PAID_API_URL)
// Env:
//   TENANT_PAID_API_URL      the backend origin, e.g. https://shipshift.dev
//   TENANT_PAID_ADMIN_TOKEN  admin JWT, or a secret API key (sk_…), the way order-smoke.mjs takes it.
//
// Exit codes: 0 done, 1 no such tenant, 2 usage, a missing env or a refused request.

export class UsageError extends Error {}

const TENANT_ID = /^ten_[A-Za-z0-9]+$/;
const HANDLE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REF = /^[A-Za-z0-9._:-]{1,120}$/;
const VIAS = ["tribute"];
const PAGE = 200;

export function parseArgs(argv, now = new Date()) {
  const out = { tenant: null, via: null, ref: null, at: null, dryRun: false, list: false, api: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const eq = arg.indexOf("=");
    const [flag, inlineValue] = eq === -1 ? [arg, null] : [arg.slice(0, eq), arg.slice(eq + 1)];
    const takeValue = () => {
      const value = inlineValue !== null ? inlineValue : argv[++i];
      if (value === undefined || value.startsWith("--")) throw new UsageError(`${flag} needs a value`);
      return value;
    };
    if (flag === "--tenant") out.tenant = takeValue();
    else if (flag === "--via") out.via = takeValue();
    else if (flag === "--ref") out.ref = takeValue();
    else if (flag === "--at") out.at = takeValue();
    else if (flag === "--api") out.api = takeValue();
    else if (flag === "--dry-run") out.dryRun = true;
    else if (flag === "--list") out.list = true;
    else throw new UsageError(`unknown flag: ${arg}`);
  }

  if (out.list) {
    if (out.tenant !== null || out.via !== null || out.ref !== null || out.at !== null || out.dryRun) {
      throw new UsageError("--list reads and takes none of --tenant, --via, --ref, --at, --dry-run");
    }
    return out;
  }

  if (!out.tenant || !(TENANT_ID.test(out.tenant) || HANDLE.test(out.tenant))) {
    throw new UsageError("--tenant is a tenant id (ten_…) or the shop's handle");
  }
  if (!VIAS.includes(out.via)) throw new UsageError(`--via is one of: ${VIAS.join(", ")}`);
  if (!out.ref || !REF.test(out.ref)) throw new UsageError("--ref is the Tribute order id: letters, digits and . _ : -");
  if (out.at === null) {
    out.at = now.toISOString();
  } else if (!/^\d{4}-\d{2}-\d{2}(T|$)/.test(out.at) || Number.isNaN(Date.parse(out.at))) {
    throw new UsageError("--at is an ISO date or time, e.g. 2026-10-14T09:30:00Z");
  } else {
    out.at = new Date(out.at).toISOString();
  }
  return out;
}

/** The body of POST /admin/tenants/:id: exactly the three keys, nothing else. */
export function paidBody({ via, ref, at }) {
  return { metadata: { paid_via: via, paid_at: at, tribute_ref: ref } };
}

/** The paid mark of a tenant as one line. */
export function describe(metadata) {
  const m = metadata ?? {};
  if (!m.paid_via) return "not marked paid";
  return `paid via ${m.paid_via}${m.paid_at ? ` at ${m.paid_at}` : ""}${m.tribute_ref ? `, ref ${m.tribute_ref}` : ""}`;
}

/** Tenants with `paid_via` set, newest payment first, as `date  via  ref  handle` lines. */
export function listLines(tenants) {
  return tenants
    .filter((tenant) => tenant.metadata?.paid_via)
    .sort((a, b) => String(b.metadata.paid_at ?? "").localeCompare(String(a.metadata.paid_at ?? "")))
    .map((tenant) =>
      [tenant.metadata.paid_at ?? "-", tenant.metadata.paid_via, tenant.metadata.tribute_ref ?? "-", tenant.handle].join("  "),
    );
}

class ApiError extends Error {
  constructor(status, message) {
    super(`${status} ${message}`);
    this.status = status;
  }
}

export function client(api, token, fetchImpl = fetch) {
  const call = async (method, path, { body, query } = {}) => {
    const url = new URL(`${api.replace(/\/+$/, "")}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
    const headers = {
      "content-type": "application/json",
      authorization: token.startsWith("sk_") ? `Basic ${Buffer.from(`${token}:`).toString("base64")}` : `Bearer ${token}`,
    };
    const res = await fetchImpl(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) };
    }
    if (!res.ok) throw new ApiError(res.status, `${method} ${path}: ${data.message ?? res.statusText}`);
    return data;
  };
  return {
    get: (path, query) => call("GET", path, { query }),
    post: (path, body) => call("POST", path, { body }),
  };
}

/** The tenant for an id or a handle, or null. A handle must match exactly: `q` is only a search. */
export async function findTenant(http, key) {
  if (TENANT_ID.test(key)) {
    try {
      return (await http.get(`/admin/tenants/${key}`)).tenant;
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }
  const { tenants } = await http.get("/admin/tenants", { q: key, limit: 50 });
  return tenants.find((tenant) => tenant.handle === key) ?? null;
}

export async function allTenants(http) {
  const found = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await http.get("/admin/tenants", { limit: PAGE, offset });
    found.push(...page.tenants);
    if (offset + PAGE >= page.count) return found;
  }
}

async function main(argv, env = process.env) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`tenant-paid: ${error.message}`);
    process.exit(2);
  }
  const api = args.api ?? env.TENANT_PAID_API_URL;
  const token = env.TENANT_PAID_ADMIN_TOKEN;
  if (!api) {
    console.error("tenant-paid: no backend address: pass --api or set TENANT_PAID_API_URL");
    process.exit(2);
  }
  if (!token) {
    console.error("tenant-paid: TENANT_PAID_ADMIN_TOKEN is not set (an admin JWT or a secret API key)");
    process.exit(2);
  }
  const http = client(api, token);

  try {
    if (args.list) {
      const lines = listLines(await allTenants(http));
      console.log(lines.length ? lines.join("\n") : "tenant-paid: no tenant is marked paid");
      return;
    }

    const tenant = await findTenant(http, args.tenant);
    if (!tenant) {
      console.error(`tenant-paid: no tenant "${args.tenant}" on ${api}; nothing changed`);
      process.exit(1);
    }
    console.log(`tenant-paid: ${tenant.handle} (${tenant.id}) before: ${describe(tenant.metadata)}`);
    const body = paidBody(args);
    if (args.dryRun) {
      console.log(`tenant-paid: dry run, would send POST /admin/tenants/${tenant.id} ${JSON.stringify(body)}`);
      return;
    }
    const { tenant: after } = await http.post(`/admin/tenants/${tenant.id}`, body);
    console.log(`tenant-paid: ${after.handle} (${after.id}) after: ${describe(after.metadata)}`);
  } catch (error) {
    console.error(`tenant-paid: ${error.message}`);
    process.exit(2);
  }
}

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

function startedDirectly() {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (startedDirectly()) {
  await main(process.argv.slice(2));
}
