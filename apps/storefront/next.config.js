const path = require("path")
const checkEnvVariables = require("./check-env-variables")
const createNextIntlPlugin = require("next-intl/plugin")

const withNextIntl = createNextIntlPlugin()

checkEnvVariables()

/**
 * The Medusa version shown in the hero, read from the backend's package.json at
 * build time so the two cannot drift: the daily Update Medusa workflow bumps
 * that dependency, and the next build picks the new number up on its own.
 *
 * Left unset when apps/backend is not part of the checkout, for a storefront
 * copied out of the monorepo. The hero then drops the version segment, and
 * MEDUSA_VERSION can be passed in as a real environment variable instead.
 */
function readMedusaVersion() {
  try {
    const pkg = require(path.join(__dirname, "../backend/package.json"))
    const range = pkg.dependencies?.["@medusajs/medusa"]
    return range ? range.replace(/^[\^~]/, "") : undefined
  } catch {
    return undefined
  }
}

const MEDUSA_VERSION = readMedusaVersion()

/**
 * Medusa Cloud-related environment variables
 */
const S3_HOSTNAME = process.env.MEDUSA_CLOUD_S3_HOSTNAME
const S3_PATHNAME = process.env.MEDUSA_CLOUD_S3_PATHNAME

/**
 * The instance's own API origin (NEXT_PUBLIC_MEDUSA_BACKEND_URL, a build arg in
 * deploy/compose.mt.yml) serves the shops' uploads and profile media that
 * next/image renders; without it in `remotePatterns` every product picture is a
 * 400 from /_next/image (cherkashino.ru, 04.10.2026). See next-image-hosts.js.
 */
const { backendImagePattern } = require("./next-image-hosts")
const BACKEND_IMAGE_PATTERNS = backendImagePattern(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL)

/**
 * @type {import('next').NextConfig}
 */
// 46df A-21: which origins may frame the storefront in an <iframe>. Telegram's Mini App bridge
// (`src/modules/telegram/components/mini-app-bridge`, entry at `/mini`) redirects into the SAME
// regular pages (`/store`, `/products/<handle>`, `/cart`, …) every other visitor uses — there is
// no separate "embeddable" subtree to scope this to, so the allowance has to be site-wide.
// Telegram Web (web.telegram.org) is documented to open a bot's Mini App inside an iframe; native
// Telegram clients render it in their own WebView, which is unaffected by frame-ancestors either
// way. `'self'` covers the storefront's own iframes (none known today, kept for safety).
const FRAME_ANCESTORS = "'self' https://web.telegram.org https://*.telegram.org"

const nextConfig = {
  output: "standalone",
  // A-21: stop naming the framework on every response (`x-powered-by: Next.js`) — free
  // reconnaissance for an attacker with nothing the storefront needs to advertise.
  poweredByHeader: false,
  // The dev overlay's badge defaults to the bottom-left corner, which is exactly where the
  // hidden settings panel's button sits (src/modules/studio). Measured on the stand: the
  // <nextjs-portal> subtree intercepts the pointer events over that corner, so the button
  // is unclickable in dev while the badge is there. This moves the badge, not the button —
  // dev-only, and it changes nothing about a production build.
  // The bottom-right corner is no better: on a phone the bottom navigation spans the whole
  // bottom edge and the badge sat on its theme toggle (a click on it timed out in review).
  // No corner is free at 390px, so the badge is off; build errors still show as an overlay.
  devIndicators: false,
  // Two agents work the storefront in the same worktree during the store-profile
  // build-out; a shared .next/ makes their builds clobber each other. NEXT_DIST_DIR
  // gives each its own output tree and is unset (so ".next") everywhere else.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Next streams metadata by default, which lands <title>, the description,
  // the canonical and every hreflang in the body instead of the head. React
  // never hoists them, so Google ignores a canonical it finds there and
  // Lighthouse, whose gatherer reads "head meta", scores the page as having no
  // description. Matching every user agent turns metadata back into part of
  // the head that ships with the shell.
  htmlLimitedBots: /.*/,
  // Inlined into the bundle at build time, so the hero never reads the
  // backend's package.json at runtime, which output: "standalone" would not
  // have traced into the deployed app anyway.
  env: {
    ...(MEDUSA_VERSION ? { MEDUSA_VERSION } : {}),
  },
  // Emit .map files for the client bundles so production stack traces and
  // Lighthouse diagnostics resolve to real source.
  productionBrowserSourceMaps: true,
  experimental: {
    // A payment receipt (a phone photo or a PDF, up to 10 MB in
    // `lib/util/payment-receipt.ts`) goes through a server action, and the
    // default limit for one is 1 MB.
    serverActions: { bodySizeLimit: "11mb" },
    // Rewrites barrel imports into per-component deep imports so the client
    // bundle only carries the primitives we actually use, not the whole kit.
    // "radix-ui" is a single barrel re-exporting every primitive; @medusajs/ui
    // imports from it in 22 places, so DropdownMenu alone dragged in Select,
    // NavigationMenu, Menu, ScrollArea and Toast.
    optimizePackageImports: ["@medusajs/ui", "@medusajs/icons", "radix-ui"],
    // Inlines the route's CSS into <style> in the HTML instead of a
    // render-blocking <link>. The stylesheet is small enough that the extra
    // HTML bytes cost less than the extra round trip.
    inlineCss: true,
  },
  async headers() {
    return [
      {
        // Vendored flag-icons SVGs are addressed by country code and never
        // change; public/ is otherwise served with max-age=0.
        source: "/flags/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // A-21: no full Content-Security-Policy tonight (a real one needs an inventory of every
        // script/style/connect origin the storefront actually uses, a separate, bigger pass) —
        // only `frame-ancestors`, delivered as its own minimal CSP since that is the one
        // mechanism that can allow specific cross-origin framers (`X-Frame-Options` cannot list
        // more than one origin, and its `ALLOW-FROM` value was removed from browsers).
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${FRAME_ANCESTORS};`,
          },
        ],
      },
    ]
  },
  // Required so Next standalone traces files from the pnpm workspace root
  outputFileTracingRoot: path.join(__dirname, "../../"),
  reactStrictMode: true,
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  images: {
    unoptimized: false,
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "https",
        hostname: "s3.*.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "*.s3.*.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "*.s3.amazonaws.com",
      },
      // The five stands (t-2026-09-09-02) serve their own profile media
      // from the backend's api-<stand>.upready.dev under
      // /static/store-profiles/<id> (STORE_MEDIA_BASE_URL, read at build
      // time by scripts/build-profile.mjs's mediaUrl() and rendered
      // through next/image in modules/home/components/category-tiles).
      // Without this pattern next/image throws "hostname is not
      // configured" for every stand's hero and category-tile images once a
      // real image URL reaches it — found by reading mediaUrl() and this
      // remotePatterns list together, not yet exercised against a live
      // profile image (this checkout's media/ directories hold no .webp
      // files, gitignored, so the local smoke test's category-tiles render
      // with none to fetch).
      {
        protocol: "https",
        hostname: "api-*.upready.dev",
      },
      // Piece 9 (t-2026-09-12-mt-storefront-by-host): the shipshift.dev
      // deployment serves every tenant's profile media itself, at
      // /static/store-profiles/<profile> (docs/multitenancy §W3). A local
      // stand pointed at that live backend (NEXT_PUBLIC_MEDUSA_BACKEND_URL=
      // https://shipshift.dev) hits this host for hero and category-tile
      // images; without it next/image throws "hostname is not configured"
      // and the WHOLE page's client render crashes (not just a broken
      // image) — found opening a tenant's home page in a browser, not from
      // curl, which only sees the server-rendered HTML (rule 18f).
      {
        protocol: "https",
        hostname: "shipshift.dev",
      },
      // The instance's own API host (api.cherkashino.ru, api.olavka.ru, …), see
      // backendImagePattern() above.
      ...BACKEND_IMAGE_PATTERNS,
      ...(S3_HOSTNAME && S3_PATHNAME
        ? [
            {
              protocol: "https",
              hostname: S3_HOSTNAME,
              pathname: S3_PATHNAME,
            },
          ]
        : []),
    ],
  },
}

module.exports = withNextIntl(nextConfig)
