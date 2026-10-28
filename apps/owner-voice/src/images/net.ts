/**
 * The one door every outgoing request for a picture or a page goes through:
 * a timeout, a size cap, and for an address the owner typed an SSRF guard.
 *
 * The guard resolves the host and refuses loopback, private, link-local and
 * cloud-metadata addresses, again after each redirect (three at most). The
 * connection is then pinned to the address that passed the check, with SNI and
 * Host still by name, so a second DNS answer cannot redirect it (rebinding).
 * Reading a body stops at the cap, so a hostile page cannot fill the memory.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

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

/** An IPv6 address as 16 bytes, in any written form (`::`, a dotted tail, a zone); null when it is not one. */
function ipv6Bytes(raw: string): Uint8Array | null {
  let text = raw.replace(/%.*$/, "");
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (tail) {
    if (isIP(tail[1]!) !== 4) return null;
    const [a, b, c, d] = tail[1]!.split(".").map(Number) as [number, number, number, number];
    text = `${text.slice(0, -tail[1]!.length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const groups = (part: string) => (part === "" ? [] : part.split(":"));
  const head = groups(halves[0]!);
  const rest = halves.length === 2 ? groups(halves[1]!) : [];
  const fill = 8 - head.length - rest.length;
  if (halves.length === 2 ? fill < 1 : fill !== 0) return null;
  const all = [...head, ...(halves.length === 2 ? Array<string>(fill).fill("0") : []), ...rest];
  const out = new Uint8Array(16);
  for (let i = 0; i < 8; i += 1) {
    if (!/^[0-9a-f]{1,4}$/.test(all[i]!)) return null;
    const v = parseInt(all[i]!, 16);
    out[i * 2] = v >> 8;
    out[i * 2 + 1] = v & 255;
  }
  return out;
}

function isPrivateV4(a: number, b: number): boolean {
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

/**
 * True for an address no public page may point us at. IPv6 is read into bytes,
 * because the URL parser writes `[::ffff:127.0.0.1]` as `[::ffff:7f00:1]`: the
 * IPv4 inside ::ffff:0:0/96, ::/96, 64:ff9b::/96 and 2002::/16 is checked too.
 */
export function isPrivateAddress(address: string): boolean {
  const raw = address.toLowerCase().replace(/^\[|\]$/g, "");
  const family = isIP(raw.replace(/%.*$/, ""));
  if (family === 4) {
    const [a, b] = raw.split(".").map(Number) as [number, number];
    return isPrivateV4(a, b);
  }
  if (family === 6) {
    const x = ipv6Bytes(raw);
    if (!x) return true;
    const zeros = (from: number, to: number) => x.slice(from, to).every((v) => v === 0);
    const v4 = (at: number) => isPrivateV4(x[at]!, x[at + 1]!);
    if (zeros(0, 10) && x[10] === 255 && x[11] === 255) return v4(12); // ::ffff:0:0/96
    if (zeros(0, 12)) return v4(12); // ::/96: unspecified, loopback, IPv4-compatible
    if (x[0] === 0 && x[1] === 0x64 && x[2] === 0xff && x[3] === 0x9b) return zeros(4, 12) ? v4(12) : true; // 64:ff9b::/96; 64:ff9b:1::/48 is local-use
    if (x[0] === 0x20 && x[1] === 0x02) return v4(2); // 6to4
    if (x[0] === 0x20 && x[1] === 0x01 && x[2] === 0 && x[3] === 0) return true; // Teredo
    if (x[0] === 0x20 && x[1] === 0x01 && x[2] === 0x0d && x[3] === 0xb8) return true; // documentation
    return (
      (x[0]! & 0xfe) === 0xfc || // unique local
      (x[0] === 0xfe && (x[1]! & 0xc0) === 0x80) || // link-local
      x[0] === 0xff || // multicast
      (x[0] === 0x01 && x[1] === 0 && zeros(2, 8)) // discard-only 100::/64
    );
  }
  return true; // not an address at all: refuse
}

/** One GET to an address already checked: the connection goes there, SNI and Host stay the name. */
export type Transport = (url: URL, pin: { address: string; family: 4 | 6 }, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;

/** The lookup a pinned connection uses: it answers with the one checked address and asks DNS nothing. */
export function pinnedLookup(pin: { address: string; family: 4 | 6 }) {
  return (_host: string, options: { all?: boolean } | undefined, cb: (err: Error | null, address: unknown, family?: number) => void): void => {
    if (options?.all) cb(null, [{ address: pin.address, family: pin.family }]);
    else cb(null, pin.address, pin.family);
  };
}

export const pinnedHttps: Transport = (url, pin, init) =>
  new Promise<Response>((resolve, reject) => {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const req = httpsRequest(
      {
        host,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: init.headers,
        lookup: pinnedLookup(pin) as never,
        ...(isIP(host) ? {} : { servername: host }),
        signal: init.signal,
      },
      (res) => {
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) for (const one of Array.isArray(v) ? v : v === undefined ? [] : [v]) headers.append(k, one);
        const status = res.statusCode ?? 502;
        const bodyless = status === 204 || status === 205 || status === 304;
        if (bodyless) res.resume();
        resolve(new Response(bodyless ? null : (Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>), { status, headers }));
      },
    );
    req.on("error", reject);
    req.end();
  });

export interface GuardedOptions {
  /** Tests only: a replacement for the whole request, with no pinning. Production leaves it out. */
  fetch?: FetchFn;
  /** The pinned request; absent: a real HTTPS connection to the checked address. */
  transport?: Transport;
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
  return (await resolvePublic(raw, lookup)).url;
}

/** The same check, and the addresses that passed it, for the connection to be pinned to. */
export async function resolvePublic(raw: string, lookup: Lookup): Promise<{ url: URL; addresses: string[] }> {
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
  return { url, addresses };
}

/**
 * GET a public page or picture. Redirects are followed by hand so each hop is
 * checked: a public page that bounces to 169.254.169.254 stops at the hop.
 */
export async function guardedGet(raw: string, opts: GuardedOptions): Promise<Fetched> {
  const lookup = opts.lookup ?? systemLookup;
  const limit = opts.maxRedirects ?? 3;
  let current = raw;
  for (let hop = 0; hop <= limit; hop += 1) {
    const { url, addresses } = await resolvePublic(current, lookup);
    const headers = { accept: "text/html,image/*;q=0.9", "user-agent": "owner-voice/1" };
    const pin = { address: addresses[0]!, family: isIP(addresses[0]!) === 6 ? (6 as const) : (4 as const) };
    const transport = opts.transport ?? pinnedHttps;
    const send: FetchFn = opts.fetch ?? ((u, init) => transport(new URL(String(u)), pin, { headers, signal: (init as { signal: AbortSignal }).signal }));
    const res = await timed(send, url.href, { method: "GET", redirect: "manual", headers }, opts.timeoutMs);
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
