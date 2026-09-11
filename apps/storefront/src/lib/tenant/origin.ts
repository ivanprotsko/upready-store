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

  const forwarded = headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
  const scheme = (forwarded || urlProtocol || "https").replace(/:$/, "")

  return `${scheme}://${host}`
}
