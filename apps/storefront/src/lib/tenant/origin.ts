/**
 * The origin a request arrived on, as `scheme://host`, for every absolute URL a
 * page emits: canonical and hreflang, JSON-LD, sitemap, robots, llms.txt, Open Graph.
 *
 * One storefront process serves every shop by Host, and `NEXT_PUBLIC_BASE_URL` is a
 * single value baked into the image at build time — measured 2026-09-12 on all five
 * tenant hosts of shipshift.dev: every `<head>` declared
 * `<link rel="canonical" href="https://stores.shipshift.dev/…">`, a host that 302s
 * into a 404. A build-time constant can name at most one of the shops the process
 * serves, so the base has to be read per request, from the same header the shop was
 * resolved from.
 *
 * The scheme is the proxy's word first (`x-forwarded-proto`; traefik sets it on every
 * request it terminates TLS for), then the URL Next parsed, which behind a proxy is
 * the plain-HTTP hop. The host is the Host header, lower-cased and without a trailing
 * dot, port included, so a stand on `acme.localhost:8010` links to itself.
 *
 * An empty host yields an empty string, never a bare `https://`: the caller then
 * falls back to `NEXT_PUBLIC_BASE_URL` (`getRequestBaseURL` in `lib/data/cookies.ts`).
 */
export function requestOrigin(headers: Headers, urlProtocol: string): string {
  const host = (headers.get("host") ?? "").trim().toLowerCase().replace(/\.$/, "")

  if (!host) {
    return ""
  }

  return `${requestScheme(headers, urlProtocol)}://${host}`
}

/** The scheme to build an absolute URL with: the proxy's word first. */
export function requestScheme(headers: Headers, urlProtocol: string): string {
  const forwarded = headers.get("x-forwarded-proto")?.split(",")[0]?.trim()

  return (forwarded || urlProtocol || "https").replace(/:$/, "")
}

/**
 * The address the VISITOR asked for, as the hop in front of us recorded it:
 * the first entry of `x-forwarded-host`, empty when the header is absent.
 * Lower-cased, no trailing dot, port included.
 *
 * Traefik writes it on every request it terminates, and Next writes it itself
 * when nothing else did, so on a request that came from a browser it equals the
 * `Host` header. The two differ on exactly one kind of request: the GET the
 * Next server makes TO ITSELF to render a Server Action's `redirect()` target
 * (`createRedirectRenderResult` in `next/dist/server/app-render/action-handler`),
 * which is addressed to the server's own origin and carries the visitor's
 * address on this header alone.
 */
export function forwardedHost(headers: Headers): string {
  const raw = headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? ""

  return raw.toLowerCase().replace(/\.$/, "")
}

/**
 * The public address of this request: what the visitor asked for when a proxy
 * recorded it, else the `Host` header. Never a guarantee that a shop answers
 * there — `resolveShopOfRequest` (`lib/tenant/request-shop.ts`) is what decides
 * that, and it only consults the forwarded name when `Host` names no shop.
 */
export function publicHost(headers: Headers): string {
  const forwarded = forwardedHost(headers)

  if (forwarded) {
    return forwarded
  }

  return (headers.get("host") ?? "").trim().toLowerCase().replace(/\.$/, "")
}

/**
 * The port the visitor's address carries, as `":8013"` or an empty string.
 *
 * Read from the PUBLIC address, not from the socket this request happened to
 * arrive on: the self-fetch above arrives on the server's own port (`:3000` in
 * a container) while the shop answers on 443, and a canonical URL rebuilt from
 * the wrong one names an address nothing listens on.
 */
export function requestPort(headers: Headers): string {
  const match = publicHost(headers).match(/:(\d+)$/)

  return match ? `:${match[1]}` : ""
}

/**
 * The origin of a NAMED host, on this request's scheme and port. The shop's MAIN
 * address is a hostname with no port — the backend stores it that way — while a
 * stand answers on `acme.localhost:8013`, so rebuilding the origin for the main
 * address has to carry the port over or every link on a stand would point at
 * port 80 (`specs/tenant-address/CANONICAL.md` §1.1).
 */
export function originForHost(
  headers: Headers,
  urlProtocol: string,
  host: string
): string {
  const clean = host.trim().toLowerCase().replace(/\.$/, "")

  if (!clean) {
    return ""
  }

  const port = clean.includes(":") ? "" : requestPort(headers)

  return `${requestScheme(headers, urlProtocol)}://${clean}${port}`
}
