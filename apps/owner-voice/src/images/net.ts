/**
 * The one door every outgoing request for a picture or a page goes through:
 * a timeout, a size cap, and for an address the owner typed an SSRF guard.
 *
 * The guard resolves the host and refuses loopback, private, link-local and
 * cloud-metadata addresses, again after each redirect (three at most). Reading
 * a body stops at the cap, so a hostile page cannot fill the memory.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

import type { FetchFn } from "../shop/api.ts";

export class NetError extends Error {
  readonly code: "refused" | "timeout" | "too_big" | "bad_type" | "http" | "redirects";
  constructor(code: NetError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export type Lookup = (host: string) => Promise<string[]>;

export const systemLookup: Lookup = async (host) => (await dnsLookup(host, { all: true })).map((a) => a.address);

/** True for an address no public page may point us at. */
export function isPrivateAddress(address: string): boolean {
  const raw = address.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(raw);
  if (mapped) return isPrivateAddress(mapped[1]!);
  const family = isIP(raw);
  if (family === 4) {
    const [a, b] = raw.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast, reserved, broadcast
    );
  }
  if (family === 6) {
    return (
      raw === "::" ||
      raw === "::1" ||
      /^fe[89ab]/.test(raw) || // link-local
      /^f[cd]/.test(raw) || // unique local
      /^ff/.test(raw) || // multicast
      /^64:ff9b:/.test(raw) ||
      /^fd00:ec2:/.test(raw) // AWS metadata
    );
  }
  return true; // not an address at all: refuse
}

export interface GuardedOptions {
  fetch?: FetchFn;
  lookup?: Lookup;
  timeoutMs: number;
  maxBytes: number;
  /** A regexp the content type must match, e.g. /^image\//; absent: any. */
  type?: RegExp;
  maxRedirects?: number;
}

export interface Fetched {
  url: string;
  contentType: string;
  data: Uint8Array;
}

/** A body read up to `max` bytes; more than that is an error, not a truncation. */
export async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) throw new NetError("too_big", "Ответ больше допустимого размера.");
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > max) throw new NetError("too_big", "Ответ больше допустимого размера.");
    return buf;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new NetError("too_big", "Ответ больше допустимого размера.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** One request with a timeout; the abort turns into a `timeout` error. */
export async function timed(fetchFn: FetchFn, url: string, init: Parameters<FetchFn>[1], timeoutMs: number): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: ctl.signal } as Parameters<FetchFn>[1]);
  } catch (err) {
    if (ctl.signal.aborted) throw new NetError("timeout", "Ответ не пришёл вовремя.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Refuse a URL that is not public https, or whose host resolves anywhere private. */
export async function assertPublic(raw: string, lookup: Lookup): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new NetError("refused", "Это не ссылка.");
  }
  if (url.protocol !== "https:") throw new NetError("refused", "Беру только ссылки https.");
  if (url.username || url.password) throw new NetError("refused", "Ссылка с логином не подходит.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : await lookup(host).catch(() => []);
  if (!addresses.length) throw new NetError("refused", "Адрес не нашёлся.");
  if (addresses.some(isPrivateAddress)) throw new NetError("refused", "Этот адрес закрытый: туда я не хожу.");
  return url;
}

/**
 * GET a public page or picture. Redirects are followed by hand so each hop is
 * checked: a public page that bounces to 169.254.169.254 stops at the hop.
 */
export async function guardedGet(raw: string, opts: GuardedOptions): Promise<Fetched> {
  const fetchFn = opts.fetch ?? fetch;
  const lookup = opts.lookup ?? systemLookup;
  const limit = opts.maxRedirects ?? 3;
  let current = raw;
  for (let hop = 0; hop <= limit; hop += 1) {
    const url = await assertPublic(current, lookup);
    const res = await timed(fetchFn, url.href, { method: "GET", redirect: "manual", headers: { accept: "text/html,image/*;q=0.9", "user-agent": "owner-voice/1" } }, opts.timeoutMs);
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!next) throw new NetError("http", "Страница перенаправляет в никуда.");
      current = new URL(next, url).href;
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      throw new NetError("http", `Страница ответила ${res.status}.`);
    }
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (opts.type && !opts.type.test(contentType)) {
      await res.body?.cancel().catch(() => {});
      throw new NetError("bad_type", "Это не то, что ждал: тип содержимого не подходит.");
    }
    return { url: url.href, contentType, data: await readCapped(res, opts.maxBytes) };
  }
  throw new NetError("redirects", "Слишком много перенаправлений.");
}
