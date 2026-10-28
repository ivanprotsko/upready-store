/**
 * The changeset client: the only request owner-voice sends that is not a GET.
 *
 * It talks to the backend's `/tenants/agent-changesets*` (line A,
 * t-2026-10-27-04) and to nothing else: every URL is checked against one
 * pattern before it leaves. The backend decides what a changeset may hold (its
 * allow-list: no orders, payments or returns); this client never works around a
 * refusal, it hands the backend's reason to the owner.
 *
 *   draft    POST /tenants/agent-changesets            { source, summary, ops }
 *   stage    POST /tenants/agent-changesets/:id/stage
 *   publish  POST /tenants/agent-changesets/:id/publish
 *   rollback POST /tenants/agent-changesets/:id/rollback  (409 drift: nothing rolled back)
 *   discard  POST /tenants/agent-changesets/:id/discard
 *   list     GET  /tenants/agent-changesets?status=&limit=
 *   show     GET  /tenants/agent-changesets/:id        (`latest` = last published)
 *
 * Off unless `CHANGESETS=1`: then `createApp` builds no client at all and a
 * confirm stays the stage 2 dry-run.
 */
import { buildUrl, type FetchFn, type Query } from "./api.ts";

export type OpMethod = "POST" | "PUT" | "PATCH" | "DELETE";

export interface Op {
  method: OpMethod;
  /** A `/tenants/*` path, e.g. `/tenants/products/prod_1`. */
  path: string;
  body?: Record<string, unknown>;
}

export type ChangesetStatus = "draft" | "staged" | "published" | "rolled_back" | "discarded";

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface OpView {
  index: number;
  method: OpMethod;
  path: string;
  kind: string;
  scope: "site" | "product";
  /** Where the change shows on a site: `/`, `/pages/<key>`, `/products/<handle>`. */
  preview_path: string | null;
  changes: FieldChange[];
}

export interface ChangesetSummary {
  id: string;
  status: ChangesetStatus;
  source: string;
  summary: string | null;
  author_email: string | null;
  op_count: number;
  op_kinds: string[];
  created_at: string;
  staged_at: string | null;
  published_at: string | null;
  rolled_back_at: string | null;
  discarded_at: string | null;
}

export interface Changeset extends ChangesetSummary {
  ops?: OpView[];
}

export interface Sites {
  main_url: string | null;
  stage_url: string | null;
}

export interface DriftRow {
  op_index: number;
  method: string;
  path: string;
  before: unknown;
  now: unknown;
}

/** A refusal of the backend, with its code (`op_denied`, `drift`, …) and its own sentence. */
export class ChangesetError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;
  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  get drift(): DriftRow[] {
    return Array.isArray(this.details.drift) ? (this.details.drift as DriftRow[]) : [];
  }
}

/** The whole surface the client may reach; anything else is refused before it leaves. */
export const CHANGESET_PATH = /^\/tenants\/agent-changesets(?:\/[A-Za-z0-9_-]+(?:\/(?:stage|publish|rollback|discard))?)?$/;

export interface ChangesetClientOptions {
  apiUrl: string;
  /** The shop login's token; `fresh` after a 401. */
  bearer(fresh?: boolean): Promise<string>;
  fetch: FetchFn;
}

export class ChangesetClient {
  readonly #opts: ChangesetClientOptions;

  constructor(opts: ChangesetClientOptions) {
    this.#opts = opts;
  }

  async list(query: { status?: ChangesetStatus; limit?: number } = {}): Promise<{ agent_changesets: ChangesetSummary[]; sites: Sites }> {
    return (await this.#send("GET", "/tenants/agent-changesets", undefined, { status: query.status, limit: query.limit ?? 5 })) as {
      agent_changesets: ChangesetSummary[];
      sites: Sites;
    };
  }

  show(id: string): Promise<{ agent_changeset: Changeset; sites: Sites }> {
    return this.#send("GET", `/tenants/agent-changesets/${encodeURIComponent(id)}`) as Promise<{ agent_changeset: Changeset; sites: Sites }>;
  }

  create(ops: Op[], summary: string): Promise<{ agent_changeset: Changeset; sites: Sites }> {
    return this.#send("POST", "/tenants/agent-changesets", { source: "owner-voice", summary: summary.slice(0, 200), ops }) as Promise<{
      agent_changeset: Changeset;
      sites: Sites;
    }>;
  }

  stage(id: string) {
    return this.#act(id, "stage");
  }
  publish(id: string) {
    return this.#act(id, "publish");
  }
  rollback(id: string) {
    return this.#act(id, "rollback");
  }
  discard(id: string) {
    return this.#act(id, "discard");
  }

  #act(id: string, action: "stage" | "publish" | "rollback" | "discard"): Promise<{ agent_changeset: Changeset }> {
    return this.#send("POST", `/tenants/agent-changesets/${encodeURIComponent(id)}/${action}`, {}) as Promise<{ agent_changeset: Changeset }>;
  }

  async #send(method: "GET" | "POST", path: string, body?: unknown, query: Query = {}): Promise<unknown> {
    if (!CHANGESET_PATH.test(path)) throw new Error(`Not a changeset path: ${path}`);
    const url = buildUrl(this.#opts.apiUrl, path, query);
    const go = async (fresh: boolean) =>
      this.#opts.fetch(url, {
        method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${await this.#opts.bearer(fresh)}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    let res = await go(false);
    // A token outlives nothing on a redeploy: log in again once.
    if (res.status === 401) res = await go(true);
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      parsed = { message: text.slice(0, 200) };
    }
    if (!res.ok) {
      const { type, message, ...details } = parsed;
      throw new ChangesetError(
        res.status,
        typeof type === "string" ? type : `http_${res.status}`,
        typeof message === "string" ? message : `${method} ${path} answered ${res.status}`,
        details,
      );
    }
    return parsed;
  }
}
