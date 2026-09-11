/**
 * Does the swap actually work in a browser, against the CSS this repository BUILDS?
 *
 * The mechanism rests on one thing that breaks silently: Tailwind's `dark:` variant must
 * compile to `[data-mode="dark"]`, the attribute the mode toggle writes, and `dark:block`
 * must come after `hidden` in the sheet. A wrong answer leaves valid markup, a 200 and the
 * wrong picture. So this loads the REAL built stylesheet out of `.next/static/css` and the
 * REAL `warmModeLayers()` (bundled from source with esbuild, not re-typed here), and puts
 * the markup `ModeImage` emits in front of Chromium, WebKit and Firefox.
 *
 * Run from apps/storefront after `npx next build`:
 *   node ../../artifacts/docs/mode-image-pairs/measure-swap.cjs [chromium|webkit|firefox]
 */
const PW = require("/opt/homebrew/lib/node_modules/playwright")
const http = require("http")
const fs = require("fs")
const path = require("path")
const { execFileSync } = require("child_process")

const STOREFRONT = path.resolve(__dirname, "../../../apps/storefront")
const CSS_DIR = path.join(STOREFRONT, ".next/static/css")

const IMG = (label) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16"><rect width="24" height="16" fill="#888"/><title>${label}</title></svg>`,
    "utf8"
  )

function builtCss() {
  if (!fs.existsSync(CSS_DIR)) {
    throw new Error(`no ${CSS_DIR} — run "npx next build" in apps/storefront first`)
  }
  const files = fs
    .readdirSync(CSS_DIR)
    .filter((f) => f.endsWith(".css"))
    .map((f) => path.join(CSS_DIR, f))
  const withBoth = files.filter((f) => {
    const s = fs.readFileSync(f, "utf8")
    return s.includes(".hidden{display:none") && s.includes("dark\\:block:where")
  })
  if (!withBoth.length) {
    throw new Error("the built CSS carries no dark:block rule — the swap cannot work")
  }
  return withBoth.map((f) => fs.readFileSync(f, "utf8")).join("\n")
}

/** The shipped warm-up, bundled from source. Never a copy: a copy would test the copy. */
function bundledWarmUp() {
  const out = path.join(require("os").tmpdir(), `warm-mode-layers-${process.pid}.js`)
  // esbuild ships as a transitive dependency of Next, so pnpm neither hoists it nor links
  // it into a workspace `.bin` — `require.resolve` cannot see it from the storefront. The
  // store is the one place it does exist; the version is read off disk rather than pinned
  // here, and an absent binary fails out loud.
  const store = path.resolve(STOREFRONT, "../../node_modules/.pnpm")
  const dir = fs
    .readdirSync(store)
    .filter((name) => name.startsWith("esbuild@"))
    .sort()
    .pop()
  if (!dir) {
    throw new Error(`no esbuild under ${store} — run pnpm install first`)
  }
  const esbuildBin = path.join(store, dir, "node_modules/esbuild/bin/esbuild")
  execFileSync(
    esbuildBin,
    [
      path.join(STOREFRONT, "src/lib/theme/warm-mode-layers.ts"),
      "--bundle",
      "--format=iife",
      "--global-name=WarmUp",
      `--outfile=${out}`,
    ],
    { stdio: "pipe" }
  )
  return fs.readFileSync(out, "utf8")
}

const page = (css, warmUp) => `<!doctype html>
<html data-theme="default" data-mode="light"><head><style>${css}</style>
<style>.frame{position:relative;width:240px;height:300px;background:#eee}</style>
</head><body>
<!-- exactly what ModeImage renders for a pair -->
<div class="frame" id="tile">
  <span data-mode-image="light" class="absolute inset-0 dark:hidden">
    <img src="/light.svg" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%">
  </span>
  <span data-mode-image="dark" class="absolute inset-0 hidden dark:block">
    <img src="/dark.svg" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%">
  </span>
</div>
<script>${warmUp}</script>
</body></html>`

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "content-type": "text/html" })
    res.end(server.html)
    return
  }
  if (req.url.endsWith(".svg")) {
    // A deliberate delay: an instant answer would hide the gap the warm-up exists to close.
    setTimeout(() => {
      res.writeHead(200, { "content-type": "image/svg+xml" })
      res.end(IMG(req.url))
    }, 120)
    return
  }
  res.writeHead(404)
  res.end()
})

const painted = (selector) => `(() => {
  const el = document.querySelector('${selector}')
  return el ? getComputedStyle(el).display : 'missing'
})()`

;(async () => {
  const engine = process.argv[2] || "chromium"
  server.html = page(builtCss(), bundledWarmUp())
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const port = server.address().port

  const browser = await PW[engine].launch()
  const p = await browser.newPage({ viewport: { width: 800, height: 600 } })
  const asked = []
  p.on("request", (r) => {
    if (r.resourceType() === "image") asked.push(new URL(r.url()).pathname)
  })

  await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" })
  await p.waitForTimeout(600)

  const light = {
    lightLayer: await p.evaluate(painted('[data-mode-image="light"]')),
    darkLayer: await p.evaluate(painted('[data-mode-image="dark"]')),
    requested: asked.slice().sort(),
  }

  // The warm-up runs BEFORE the attribute flips: that is the whole point.
  const before = asked.length
  await p.evaluate(() => window.WarmUp.warmModeLayers("dark"))
  const warmed = asked.slice(before)
  await p.evaluate(() => document.documentElement.setAttribute("data-mode", "dark"))
  await p.waitForTimeout(200)

  const dark = {
    lightLayer: await p.evaluate(painted('[data-mode-image="light"]')),
    darkLayer: await p.evaluate(painted('[data-mode-image="dark"]')),
  }

  const verdict = [
    light.lightLayer === "block" && light.darkLayer === "none",
    light.requested.length === 1 && light.requested[0] === "/light.svg",
    warmed.length === 1 && warmed[0] === "/dark.svg",
    dark.lightLayer === "none" && dark.darkLayer === "block",
  ]

  console.log(engine, "| light mode:", JSON.stringify(light))
  console.log(engine, "| warm-up requested before the flip:", JSON.stringify(warmed))
  console.log(engine, "| dark mode:", JSON.stringify(dark))
  console.log(engine, verdict.every(Boolean) ? "| PASS" : `| FAIL ${JSON.stringify(verdict)}`)

  await browser.close()
  server.close()
  process.exitCode = verdict.every(Boolean) ? 0 : 1
})().catch((e) => {
  console.error("MEASURE-SWAP FAILED:", e.message)
  process.exit(1)
})
