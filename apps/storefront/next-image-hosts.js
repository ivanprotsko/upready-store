// CommonJS on purpose: next.config.js requires it at build time, before any transpiler runs.

/**
 * The `images.remotePatterns` entry for the instance's own API origin.
 *
 * NEXT_PUBLIC_MEDUSA_BACKEND_URL (a storefront build arg in deploy/compose.mt.yml)
 * serves every shop's uploads under /static/tenants/<tenant_id>/… and the profile
 * media under /static/store-profiles/…; product cards, category tiles and the
 * account pages render them through next/image. next/image answers 400 from
 * /_next/image for any host missing in `remotePatterns`, so a shop whose API lives
 * on a host not listed there shows no product pictures at all while the plain
 * <img> banners still load — found live on cherkashino.ru on 04.10.2026, whose
 * api.cherkashino.ru was in no list. Derived from the build arg so a new instance
 * domain needs no code change; an unset or malformed value adds nothing.
 *
 * @param {string | undefined} rawUrl the backend URL as passed at build time
 * @returns {{ protocol: "http" | "https", hostname: string }[]} zero or one pattern
 */
function backendImagePattern(rawUrl) {
  if (!rawUrl) return []
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    return []
  }
  const protocol = url.protocol.replace(/:$/, "")
  if (protocol !== "http" && protocol !== "https") return []
  if (!url.hostname) return []
  return [{ protocol, hostname: url.hostname }]
}

module.exports = { backendImagePattern }
