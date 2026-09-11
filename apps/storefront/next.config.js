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
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: "standalone",
  // The dev overlay's badge defaults to the bottom-left corner, which is exactly where the
  // hidden settings panel's button sits (src/modules/studio). Measured on the stand: the
  // <nextjs-portal> subtree intercepts the pointer events over that corner, so the button
  // is unclickable in dev while the badge is there. This moves the badge, not the button —
  // dev-only, and it changes nothing about a production build.
  devIndicators: { position: "bottom-right" },
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
