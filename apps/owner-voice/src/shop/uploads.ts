/**
 * The upload client: the second request owner-voice sends that is not a GET,
 * beside the changeset client. It posts one picture to `POST /tenants/uploads`
 * after the owner's «да» and hands back the shop's own address for it, which
 * the changeset op then carries. The path is matched exactly before anything
 * leaves; the backend decides what a file may be (pictures only).
 */
import { buildUrl, type FetchFn } from "./api.ts";

/** The whole surface this client may reach. */
export const UPLOAD_PATH = /^\/tenants\/uploads$/;

export class UploadError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface UploadClientOptions {
  apiUrl: string;
  bearer(fresh?: boolean): Promise<string>;
  fetch: FetchFn;
}

export class UploadClient {
  readonly #opts: UploadClientOptions;

  constructor(opts: UploadClientOptions) {
    this.#opts = opts;
  }

  /** The shop's public URL of the stored picture. */
  async upload(name: string, contentType: string, data: Uint8Array): Promise<string> {
    const path = "/tenants/uploads";
    if (!UPLOAD_PATH.test(path)) throw new Error(`Not an upload path: ${path}`);
    const url = buildUrl(this.#opts.apiUrl, path);
    const form = () => {
      const f = new FormData();
      f.append("files", new Blob([data as BlobPart], { type: contentType }), name);
      return f;
    };
    const go = async (fresh: boolean) =>
      this.#opts.fetch(url, { method: "POST", headers: { accept: "application/json", authorization: `Bearer ${await this.#opts.bearer(fresh)}` }, body: form() });
    let res = await go(false);
    if (res.status === 401) res = await go(true);
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      body = { message: text.slice(0, 200) };
    }
    if (!res.ok) throw new UploadError(res.status, typeof body.message === "string" ? body.message : `POST ${path} answered ${res.status}`);
    const first = Array.isArray(body.files) ? (body.files[0] as Record<string, unknown> | undefined) : undefined;
    const href = first && typeof first.url === "string" ? first.url : null;
    if (!href) throw new UploadError(502, "The shop did not return the stored picture's address.");
    return new URL(href, `${this.#opts.apiUrl}/`).href;
  }
}

/** The upload route on fixtures: answers in the backend's shape and keeps nothing; it counts the calls for the tests. */
export class FixtureUploadBackend {
  readonly calls: { name: string; type: string; size: number }[] = [];
  readonly #base: string;

  constructor(publicBase: string) {
    this.#base = publicBase;
  }

  fetch(): FetchFn {
    return (async (input, init) => {
      const url = new URL(String(input));
      if (!UPLOAD_PATH.test(url.pathname) || init?.method !== "POST") return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
      const file = (init.body as FormData).get("files") as File;
      this.calls.push({ name: file.name, type: file.type, size: file.size });
      const key = `tenants/tnt_fixture/${file.name}`;
      return new Response(JSON.stringify({ files: [{ id: key, url: `${this.#base}/static/${key}` }] }), { status: 200, headers: { "content-type": "application/json" } });
    }) as FetchFn;
  }
}
