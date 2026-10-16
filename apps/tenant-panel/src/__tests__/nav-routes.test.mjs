import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * The sidebar contract, checked by reading the source
 * (p01-settings-integrations-restructure).
 *
 * Ivan, 2026-09-16 20:22 WITA: «не правильно делать отдельный пункт для
 * навигации в внутри одной страницы через якорь #». The defect class is one a
 * reviewer catches once and a test catches forever, so it is a test:
 *
 *   1. no navigation target anywhere in the panel contains `#`;
 *   2. every `to` in the sidebar resolves to a route registered in `app.tsx`.
 *
 * WHY SOURCE TEXT AND NOT A RENDER. The nav array is built inside a hook that
 * needs i18next, a router and React; rendering it would pull the whole panel
 * into a test runner this package does not have. What the rule forbids is a
 * STRING in a `to`, and a string is exactly what the source carries — no
 * runtime can make a `to` whose text carries a hash stop carrying one.
 * The check therefore costs one `node --test` run and no dependency.
 *
 *   node --test apps/tenant-panel/src/__tests__/
 *
 * The blind spot is honest and named: a `to={...}` built at runtime is not
 * read here. `CrossLink` (the one component that takes a `to` as a prop) is
 * covered by check 1 through its call sites, which are literals.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const APP = join(SRC, "app.tsx")
// o21-owner-panel-ux: the menu is data now, in the owner nav model.
const LAYOUT = join(SRC, "components/layout/owner-nav/nav-model.ts")

/** Every `.ts`/`.tsx` file under `src`, so a new screen joins the check by existing. */
const sourceFiles = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      return sourceFiles(full)
    }
    return /\.tsx?$/.test(entry) ? [full] : []
  })

/** `to: "…"` and `to="…"` — the two spellings a literal target takes in this panel. */
const literalTargets = (source) => [
  ...[...source.matchAll(/\bto:\s*"([^"]*)"/g)].map((m) => m[1]),
  ...[...source.matchAll(/\bto="([^"]*)"/g)].map((m) => m[1]),
]

/** `path: "…"` of every route object in `app.tsx`. */
const registeredPaths = (source) =>
  [...source.matchAll(/\bpath:\s*"([^"]*)"/g)].map((m) => m[1])

/**
 * `app.tsx` with the route modules it imports for `children:` appended
 * (`homeSettingsChildren`, `ozonChildren`), which hold their routes outside it
 * so that it stays within its recorded length (t-2026-10-14-55).
 */
const appWithChildModules = () => {
  const app = readFileSync(APP, "utf8")
  const modules = [...app.matchAll(/^import \{ \w+ \} from "(\.\/routes\/[^"]+)"$/gm)].map(([, from]) =>
    [".ts", ".tsx"].map((ext) => join(SRC, `${from}${ext}`)).find((file) => existsSync(file))
  )
  return [app, ...modules.filter(Boolean).map((file) => readFileSync(file, "utf8"))].join("\n")
}

test("no navigation target in the panel carries an anchor", () => {
  const offenders = []
  for (const file of sourceFiles(SRC)) {
    for (const target of literalTargets(readFileSync(file, "utf8"))) {
      if (target.includes("#")) {
        offenders.push(`${file.slice(SRC.length + 1)} -> ${target}`)
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `a navigation target may not point at an anchor inside a page:\n${offenders.join("\n")}`
  )
})

test("every sidebar target resolves to a route registered in app.tsx", () => {
  const paths = registeredPaths(readFileSync(APP, "utf8"))
  assert.ok(paths.length > 20, `app.tsx yielded ${paths.length} routes, which cannot be right`)

  // A registered path may carry `:params`; compare segment by segment so
  // `/products/:id` answers for `/products/prod_1` without a router.
  const matches = (target) =>
    paths.some((pattern) => {
      const a = pattern.split("/")
      const b = target.split("/")
      return (
        a.length === b.length &&
        a.every((segment, index) => segment.startsWith(":") || segment === b[index])
      )
    })

  const targets = literalTargets(readFileSync(LAYOUT, "utf8"))
  assert.ok(targets.length > 5, `the sidebar yielded ${targets.length} targets, which cannot be right`)

  const dangling = targets.filter((target) => target.startsWith("/") && !matches(target))
  assert.deepEqual(
    dangling,
    [],
    `the sidebar points at addresses no route serves:\n${dangling.join("\n")}`
  )
})

test("the addresses Ivan named on 2026-09-16 are registered", () => {
  const paths = new Set(registeredPaths(readFileSync(APP, "utf8")))
  for (const required of [
    "/settings/integrations",
    "/settings/integrations/wildberries",
    "/settings/integrations/ozon",
    "/settings/integrations/robokassa",
    "/settings/integrations/apiship",
    "/settings/integrations/cdek",
    "/settings/marketplaces/wildberries",
    "/settings/marketplaces/ozon",
    // The old addresses stay registered: they are in the owner's bookmarks and
    // now redirect (`routes/settings/*/redirect.tsx`).
    "/settings/marketplaces",
    "/settings/wildberries",
    "/settings/ozon",
  ]) {
    assert.ok(paths.has(required), `app.tsx registers no route for ${required}`)
  }
})

/**
 * «Торговые площадки» (mp-section-design, Ivan 2026-10-05): a heading that is
 * not a link, «Wildberries» with six screens under it, «Ozon» with five
 * (t-2026-10-16-37). The
 * group is cut out of the model's source by its braces, the way the rest of
 * this file reads text rather than renders.
 */
const blockAt = (source, from) => {
  const start = source.indexOf("{", from)
  let depth = 0
  for (let index = start; index >= 0 && index < source.length; index += 1) {
    if (source[index] === "{") depth += 1
    if (source[index] === "}") depth -= 1
    if (depth === 0) return source.slice(start, index + 1)
  }
  return ""
}

const nav = readFileSync(LAYOUT, "utf8")
const ownerNav = nav.slice(nav.indexOf("export const OWNER_NAV"), nav.indexOf("export const ownsPath"))
const marketplacesGroup = (() => {
  const id = ownerNav.indexOf('id: "marketplaces"')
  return id < 0 ? "" : blockAt(ownerNav, ownerNav.lastIndexOf("{", id))
})()

/** The top-level entries of a group, each as the text of its `{ … }`. */
const itemsOf = (group) => {
  const list = group.slice(group.indexOf("[", group.indexOf("items:")) + 1)
  const items = []
  let depth = 0
  for (let index = 0; index < list.length; index += 1) {
    if (list[index] === "]" && depth === 0) break
    if (list[index] === "{" && depth === 0) {
      const item = blockAt(list, index)
      items.push(item)
      index += item.length - 1
      continue
    }
    if (list[index] === "[" || list[index] === "{") depth += 1
    if (list[index] === "]" || list[index] === "}") depth -= 1
  }
  return items
}

const childTargetsOf = (item) =>
  item.includes("children:") ? literalTargets(item.slice(item.indexOf("children:"))) : []

test("«Торговые площадки» is a heading: no link and no fold of its own", () => {
  assert.ok(marketplacesGroup, "OWNER_NAV has no group with id marketplaces")
  const own = marketplacesGroup.slice(0, marketplacesGroup.indexOf("items:"))
  assert.match(own, /\bheading:\s*true\b/, "the marketplaces group must be a heading")
  assert.doesNotMatch(own, /\bto:/, "the heading itself must not be a link")
  assert.doesNotMatch(own, /\bflat:\s*true\b/, "a heading is not a flat group")
})

test("«Wildberries» opens its first screen and unfolds into the six screens Ivan named", () => {
  const wildberries = itemsOf(marketplacesGroup).find((item) => /label:\s*"Wildberries"/.test(item))
  assert.ok(wildberries, "the marketplaces group has no Wildberries entry")
  const children = childTargetsOf(wildberries)
  assert.deepEqual(children, [
    "/marketplaces/wildberries/products",
    "/marketplaces/wildberries/price-stock",
    "/marketplaces/wildberries/orders",
    "/marketplaces/wildberries/reviews",
    "/marketplaces/wildberries/analytics",
    "/marketplaces/wildberries/sync",
  ])
  const own = wildberries.slice(0, wildberries.indexOf("children:"))
  assert.deepEqual(literalTargets(own), [children[0]], "the entry must open its first screen")
})

test("every child of a sidebar entry is a route registered in app.tsx", () => {
  const paths = new Set(registeredPaths(appWithChildModules()))
  const children = itemsOf(marketplacesGroup).flatMap(childTargetsOf)
  assert.ok(children.length >= 11, `the sidebar yielded ${children.length} children`)
  const missing = children.filter((target) => !paths.has(target))
  assert.deepEqual(missing, [], `children with no route in app.tsx:\n${missing.join("\n")}`)
})

test("«Ozon» opens «Подключение» and unfolds into the screens it has data for (t-2026-10-16-37)", () => {
  const ozon = itemsOf(marketplacesGroup).find((item) => /label:\s*"Ozon"/.test(item))
  assert.ok(ozon, "the marketplaces group has no Ozon entry")
  assert.doesNotMatch(ozon, /\bstub:\s*true\b/, "Ozon is no longer a stub")
  const children = childTargetsOf(ozon)
  assert.deepEqual(children, [
    "/marketplaces/ozon",
    "/marketplaces/ozon/products",
    "/marketplaces/ozon/price-stock",
    "/marketplaces/ozon/orders",
    "/marketplaces/ozon/sync",
  ])
  const own = ozon.slice(0, ozon.indexOf("children:"))
  assert.deepEqual(literalTargets(own), [children[0]], "the entry must open «Подключение»")

  const app = readFileSync(APP, "utf8")
  assert.doesNotMatch(app, /ozon-stub/, "the stub is mounted again")
  const routes = readFileSync(join(SRC, "routes/marketplaces/ozon-routes.tsx"), "utf8")
  assert.match(routes, /index:\s*true,[^}]*import\("\.\/mp-connection"\)/, "«Подключение» must be the index of /marketplaces/ozon")
  const connection = readFileSync(join(SRC, "routes/marketplaces/mp-connection/mp-connection.tsx"), "utf8")
  assert.ok(connection.includes("<MpKeyForm card={card} />"), "«Подключение» must carry the key fields")
})

test("the screens Ozon mounts read the marketplace from the address, not a Wildberries default", () => {
  for (const file of [
    "routes/marketplaces/mp-products/mp-products.tsx",
    "routes/marketplaces/mp-products/detail/mp-product-detail.tsx",
    "routes/marketplaces/mp-price-stock/mp-price-stock.tsx",
    "routes/marketplaces/mp-orders/mp-orders.tsx",
    "routes/marketplaces/mp-orders/detail/mp-order-detail.tsx",
    "routes/marketplaces/mp-sync/mp-sync.tsx",
    "routes/marketplaces/mp-connection/mp-connection.tsx",
  ]) {
    const source = readFileSync(join(SRC, file), "utf8")
    assert.ok(source.includes("useRouteMarketplace()"), `${file} must read the marketplace from the address`)
    assert.doesNotMatch(source, /marketplace = "wb"/, `${file} still defaults to Wildberries`)
  }
  const hook = readFileSync(join(SRC, "routes/marketplaces/common/use-route-marketplace.ts"), "utf8")
  assert.ok(hook.includes("MARKETPLACE_BY_SLUG"), "the slug map of marketplace-section is the one table of slugs")
})

test("the marketplace screens draw no tab row; promotions, delivery, payments and search do", () => {
  const tabs = nav.slice(nav.indexOf("export const OWNER_TABS"), nav.indexOf("export const findTabs"))
  assert.doesNotMatch(tabs, /marketplaces|tabs\.mp/, "a tab row over the marketplace screens is back")
  for (const owner of ["/promotions", "/shipping", "/settings/payments", "/settings/seo"]) {
    assert.ok(tabs.includes(`owner: "${owner}"`), `the tab row of ${owner} is gone`)
  }
})

test("the old marketplace addresses stay registered and redirect with the query string", () => {
  const app = readFileSync(APP, "utf8")
  const paths = new Set(registeredPaths(app))
  for (const [path, element] of [
    ["/marketplaces/catalog", "CatalogRedirect"],
    ["/marketplaces/price-stock", "PriceStockRedirect"],
    ["/marketplace-orders", "OrdersRedirect"],
    ["/marketplace-orders/:id", "OrdersRedirect"],
    ["/settings/marketplaces/sync", "SyncRedirect"],
    ["/settings/marketplaces/reviews", "ReviewsRedirect"],
    ["/settings/marketplaces/analytics", "AnalyticsRedirect"],
  ]) {
    assert.ok(paths.has(path), `app.tsx registers no route for ${path}`)
    const route = new RegExp(`path:\\s*"${path}",\\s*element:\\s*<${element} />`)
    assert.match(app, route, `${path} must render <${element} />`)
  }
  for (const path of ["/settings/marketplaces", "/settings/wildberries", "/settings/ozon"]) {
    assert.ok(paths.has(path), `app.tsx registers no route for ${path}`)
  }
  const redirects = readFileSync(join(SRC, "routes/marketplaces/common/redirects.tsx"), "utf8")
  assert.ok(redirects.includes("${search}"), "the section's redirects must carry the query string")
  assert.ok(redirects.includes("useParams"), "/marketplace-orders/:id must keep the order id")
  for (const file of [
    "routes/settings/marketplaces/redirect.tsx",
    "routes/settings/wildberries/redirect.tsx",
    "routes/settings/ozon/redirect.tsx",
  ]) {
    const source = readFileSync(join(SRC, file), "utf8")
    assert.ok(source.includes("${search}"), `${file} must carry the query string`)
  }
})

test("the old marketplace screens are gone from the tree and from app.tsx", () => {
  const app = readFileSync(APP, "utf8")
  for (const dir of [
    "routes/marketplaces/catalog",
    "routes/marketplaces/price-stock",
    "routes/marketplace-orders",
    "routes/settings/marketplace-sync",
    "routes/settings/marketplaces/reviews",
    "routes/settings/marketplaces/analytics",
  ]) {
    assert.ok(!existsSync(join(SRC, dir)), `${dir} is back`)
    assert.ok(!app.includes(`import("./${dir}")`), `app.tsx still imports ${dir}`)
  }
})

test("a folded «Wildberries» is remembered across a reload", () => {
  const source = readFileSync(join(SRC, "components/layout/owner-nav/owner-nav.tsx"), "utf8")
  assert.ok(source.includes('"owner-nav-closed-parents"'), "the folded parents are not stored")
})
