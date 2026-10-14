import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  OWNER_NAV,
  OWNER_TABS,
} from "../components/layout/owner-nav/nav-model.ts"
import {
  COMMAND_MENU_ACTIONS,
  commandMenuActions,
  commandMenuNavigation,
} from "../lib/command-menu.ts"
import {
  PERMISSIONS,
  PLATFORM_ROLES,
  ROLE_NAMES,
  ROUTE_PERMISSIONS,
  STAFF_ROLES,
  can,
  pathAllowed,
  permissionOfPath,
  permissionsOf,
  visibleNav,
  visibleTabs,
} from "../lib/permissions.ts"
import { guardRoutes } from "../lib/route-guard.ts"

/**
 * Roles in the tenant panel (t-2026-10-07-11). Ivan, 2026-10-07: «Ролей нет:
 * каждый логин видит весь магазин. Это нужно исправить».
 *
 * The panel keeps no table of what a role may do: `GET /tenants/me` answers
 * with the caller's `permissions`, and the sidebar, the section tabs, the
 * command menu and the route guard look only at that list. `ME` below is what
 * the server answers for each role by the contract of the task's brief
 * (section 3.2); it lives in this test and nowhere in the panel.
 *
 * `lib/permissions.ts`, `lib/command-menu.ts` and `lib/route-guard.ts` are
 * plain TS, so they are imported and run for real. The React side is checked
 * the way the rest of this folder does it, by reading the source.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")

const ME = {
  owner: { role: "owner", permissions: [...PERMISSIONS] },
  manager: {
    role: "manager",
    permissions: ["orders", "customers", "reviews", "catalog", "storefront", "marketing", "marketplaces"],
  },
  operator: { role: "operator", permissions: ["orders", "customers"] },
}

/** The targets of a sidebar, an entry with screens under it listed by its screens. */
const targetsOf = (nav) =>
  nav.flatMap((group) =>
    group.items.flatMap((item) => (item.children ? item.children.map((child) => child.to) : [item.to]))
  )
const groupsOf = (nav) => nav.map((group) => group.id)
const navOf = (role) => visibleNav(OWNER_NAV, permissionsOf(ME[role]))

// ---------------------------------------------------------------- the list of permissions

test("the nine permissions of the contract, and the three role names the forms offer", () => {
  assert.deepEqual(
    [...PERMISSIONS],
    ["orders", "customers", "reviews", "catalog", "storefront", "marketing", "marketplaces", "settings", "staff"]
  )
  assert.deepEqual([...STAFF_ROLES], ["owner", "manager", "operator"])
  // t-2026-10-14-41: the platform's role is named, never offered.
  assert.deepEqual([...PLATFORM_ROLES], ["developer"])
  assert.deepEqual([...ROLE_NAMES], ["owner", "manager", "operator", "developer"])
})

test("permissions come from «who am I» and from nowhere else", () => {
  assert.deepEqual(permissionsOf(ME.operator), ["orders", "customers"])
  assert.deepEqual(permissionsOf({ permissions: [] }), [], "an empty list opens nothing")
  assert.deepEqual(permissionsOf(undefined), [], "nothing is open before the answer is in")
  assert.deepEqual(permissionsOf(null), [])
  // A server that has no roles yet sends no list: every login sees the shop, as before.
  assert.deepEqual(permissionsOf({ id: "ta_1" }), [...PERMISSIONS])
  // A permission the panel has no screen for is ignored, not trusted.
  assert.deepEqual(permissionsOf({ permissions: ["orders", "billing", 7] }), ["orders"])
})

test("the panel never decides by a role's name", () => {
  const files = (dir) =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        return entry === "__tests__" ? [] : files(full)
      }
      return /\.tsx?$/.test(entry) ? [full] : []
    })
  const offenders = files(SRC).filter((file) =>
    /\brole\s*[!=]==?\s*["'](owner|manager|operator)["']|["'](owner|manager|operator)["']\s*[!=]==?\s*\w*\.?role\b/.test(
      readFileSync(file, "utf8")
    )
  )
  assert.deepEqual(
    offenders.map((file) => file.slice(SRC.length + 1)),
    [],
    "a role name is compared in the panel: what a role may do is the server's table"
  )
})

// ---------------------------------------------------------------- every address knows its permission

test("every address app.tsx serves behind the login has a row in the table", () => {
  const app = read("app.tsx")
  const paths = [...app.matchAll(/\bpath:\s*"(\/[^"]*)"/g)].map((match) => match[1])
  assert.ok(paths.length > 40, `app.tsx yielded ${paths.length} absolute paths, which cannot be right`)
  const publicPaths = ["/login", "/forgot-password", "/reset-password"]
  const undecided = paths.filter(
    (path) => !publicPaths.includes(path) && permissionOfPath(path) === undefined
  )
  assert.deepEqual(undecided, [], `addresses with no permission decided:\n${undecided.join("\n")}`)
  for (const path of publicPaths) {
    assert.equal(permissionOfPath(path), undefined, `${path} is open before the login`)
  }
})

test("every row of the table names a known permission or «open to all»", () => {
  for (const [prefix, permission] of ROUTE_PERMISSIONS) {
    assert.ok(prefix.startsWith("/"), prefix)
    assert.ok(permission === null || PERMISSIONS.includes(permission), `${prefix} -> ${permission}`)
  }
  const prefixes = ROUTE_PERMISSIONS.map(([prefix]) => prefix)
  assert.equal(new Set(prefixes).size, prefixes.length, "a prefix is listed twice")
})

test("the longest prefix decides, by whole segments, the query string aside", () => {
  assert.equal(permissionOfPath("/"), null)
  assert.equal(permissionOfPath("/settings/profile"), null)
  assert.equal(permissionOfPath("/settings/profile/password"), null)
  assert.equal(permissionOfPath("/settings/staff"), "staff")
  assert.equal(permissionOfPath("/settings/payments"), "settings")
  assert.equal(permissionOfPath("/settings/integrations/robokassa"), "settings")
  assert.equal(permissionOfPath("/settings/branding"), "storefront")
  assert.equal(permissionOfPath("/shipping/create"), "settings")
  assert.equal(permissionOfPath("/orders/order_1/fulfillment"), "orders")
  assert.equal(permissionOfPath("/customers/cus_1"), "customers")
  assert.equal(permissionOfPath("/reviews"), "reviews")
  assert.equal(permissionOfPath("/products?status=draft"), "catalog")
  assert.equal(permissionOfPath("/product-attributes"), "catalog")
  assert.equal(permissionOfPath("/campaigns/camp_1/edit"), "marketing")
  assert.equal(permissionOfPath("/marketplaces/wildberries/sync"), "marketplaces")
  assert.equal(permissionOfPath("/marketplace-orders/1"), "marketplaces")
  assert.equal(permissionOfPath("/journal/new"), "storefront")
  assert.equal(permissionOfPath("/nowhere"), undefined)
  assert.equal(permissionOfPath("/ordersx"), undefined, "a prefix owns whole segments only")
})

test("every target of the sidebar, the tabs and the menu's actions has its permission decided", () => {
  const targets = [
    ...targetsOf(OWNER_NAV),
    ...OWNER_TABS.flatMap((section) => section.tabs.map((tab) => tab.to)),
    ...COMMAND_MENU_ACTIONS.flatMap((action) => (action.to ? [action.to] : [])),
  ]
  const undecided = targets.filter((target) => permissionOfPath(target) === undefined)
  assert.deepEqual(undecided, [])
})

// ---------------------------------------------------------------- the menu, role by role

test("the owner sees the whole menu, «Сотрудники» included", () => {
  const nav = navOf("owner")
  assert.deepEqual(targetsOf(nav), targetsOf(OWNER_NAV))
  assert.deepEqual(groupsOf(nav), groupsOf(OWNER_NAV))
  assert.ok(targetsOf(nav).includes("/settings/staff"))
})

test("the manager sees sales, catalog, storefront, marketing and the marketplaces; of the settings only the profile", () => {
  const nav = navOf("manager")
  assert.deepEqual(groupsOf(nav), ["sales", "catalog", "storefront", "marketing", "marketplaces", "settings"])
  assert.deepEqual(targetsOf(nav), [
    "/orders",
    "/customers",
    "/reviews",
    "/products",
    "/categories",
    "/product-attributes",
    "/courses",
    "/home-settings",
    "/pages",
    "/journal",
    "/settings/branding",
    "/promotions",
    "/marketplaces/wildberries/products",
    "/marketplaces/wildberries/price-stock",
    "/marketplaces/wildberries/orders",
    "/marketplaces/wildberries/reviews",
    "/marketplaces/wildberries/analytics",
    "/marketplaces/wildberries/sync",
    "/marketplaces/ozon",
    "/settings/profile",
  ])
})

test("the operator sees orders and customers; of the settings only the profile", () => {
  const nav = navOf("operator")
  assert.deepEqual(groupsOf(nav), ["sales", "settings"])
  assert.deepEqual(targetsOf(nav), ["/orders", "/customers", "/settings/profile"])
})

test("a login with no permission at all still has its profile", () => {
  const nav = visibleNav(OWNER_NAV, [])
  assert.deepEqual(targetsOf(nav), ["/settings/profile"])
})

test("no set of permissions leaves an empty group or an entry that may not be opened", () => {
  for (let mask = 0; mask < 2 ** PERMISSIONS.length; mask += 1) {
    const permissions = PERMISSIONS.filter((_, index) => mask & (1 << index))
    const nav = visibleNav(OWNER_NAV, permissions)
    for (const group of nav) {
      assert.ok(group.items.length > 0, `group ${group.id} is empty for [${permissions}]`)
      for (const item of group.items) {
        assert.ok(pathAllowed(permissions, item.to), `${item.to} is listed for [${permissions}]`)
        assert.ok(!item.children || item.children.length > 0, `${item.to} has no screens left`)
      }
    }
    for (const target of targetsOf(nav)) {
      assert.ok(pathAllowed(permissions, target), `${target} is listed for [${permissions}]`)
    }
  }
})

test("an entry that stays whole is the model's own object, so the sidebar lights it", () => {
  const nav = navOf("manager")
  const wildberries = nav.find((group) => group.id === "marketplaces").items[0]
  const source = OWNER_NAV.find((group) => group.id === "marketplaces").items[0]
  assert.equal(wildberries, source)
  const orders = nav.find((group) => group.id === "sales").items[0]
  assert.equal(orders, OWNER_NAV.find((group) => group.id === "sales").items[0])
})

// ---------------------------------------------------------------- the section tabs

test("the tab rows follow the permissions", () => {
  const tabsOf = (owner) => OWNER_TABS.find((section) => section.owner === owner).tabs
  const all = (owner, role) => visibleTabs(tabsOf(owner), permissionsOf(ME[role])).map((tab) => tab.to)

  assert.deepEqual(all("/promotions", "manager"), ["/promotions", "/campaigns"])
  assert.deepEqual(all("/promotions", "operator"), [])
  assert.deepEqual(all("/shipping", "manager"), [])
  assert.deepEqual(all("/settings/payments", "owner"), ["/settings/payments", "/settings/integrations/robokassa"])
  // One tab left is not a row of tabs.
  assert.deepEqual(
    visibleTabs(
      [
        { labelKey: "a", to: "/orders" },
        { labelKey: "b", to: "/products" },
      ],
      ["orders"]
    ),
    []
  )
})

// ---------------------------------------------------------------- the command menu, role by role

test("the command menu lists only the screens the role may open", () => {
  for (const role of Object.keys(ME)) {
    const permissions = permissionsOf(ME[role])
    const targets = commandMenuNavigation(visibleNav(OWNER_NAV, permissions)).map((entry) => entry.to)
    assert.deepEqual(targets, ["/", ...targetsOf(navOf(role))], role)
    for (const target of targets) {
      assert.ok(pathAllowed(permissions, target), `${role}: ${target}`)
    }
  }
  const operator = commandMenuNavigation(navOf("operator")).map((entry) => entry.to)
  assert.deepEqual(operator, ["/", "/orders", "/customers", "/settings/profile"])
})

test("the command menu offers only the actions the role may start", () => {
  const ids = (role) => commandMenuActions(permissionsOf(ME[role])).map((action) => action.id)
  const always = ["action:open-shop", "action:toggle-theme", "action:logout"]

  assert.deepEqual(ids("owner"), COMMAND_MENU_ACTIONS.map((action) => action.id))
  assert.deepEqual(ids("manager"), [
    "action:create-product",
    "action:create-category",
    "action:create-promotion",
    "action:new-article",
    ...always,
  ])
  assert.deepEqual(ids("operator"), always)
})

test("the command menu searches products and orders only with their permission", () => {
  const menu = read("components/command-menu/command-menu.tsx")
  assert.match(menu, /enabled: !!term && can\("catalog"\)/, "the product search is not gated")
  assert.match(menu, /enabled: !!term && can\("orders"\)/, "the order search is not gated")
  assert.match(menu, /commandMenuNavigation\(visibleNav\(OWNER_NAV, permissions\)\)/)
  assert.match(menu, /commandMenuActions\(permissions\)/)
  assert.doesNotMatch(menu, /COMMAND_MENU_ACTIONS\.map/, "the full list of actions is drawn again")
})

// ---------------------------------------------------------------- an address without the permission

test("a direct visit is allowed only with the screen's permission", () => {
  const operator = permissionsOf(ME.operator)
  const manager = permissionsOf(ME.manager)
  const owner = permissionsOf(ME.owner)

  for (const open of ["/", "/settings/profile", "/settings/profile/edit", "/orders/order_1", "/customers"]) {
    assert.equal(pathAllowed(operator, open), true, `operator: ${open}`)
  }
  for (const closed of [
    "/products",
    "/products/prod_1",
    "/reviews",
    "/pages",
    "/promotions",
    "/marketplaces/wildberries/orders",
    "/shipping",
    "/settings/payments",
    "/settings/integrations/robokassa",
    "/settings/staff",
  ]) {
    assert.equal(pathAllowed(operator, closed), false, `operator: ${closed}`)
  }
  for (const closed of ["/shipping", "/settings/domains", "/settings/integrations/wildberries", "/settings/staff"]) {
    assert.equal(pathAllowed(manager, closed), false, `manager: ${closed}`)
  }
  assert.equal(pathAllowed(manager, "/settings/branding"), true)
  assert.equal(pathAllowed(owner, "/settings/staff"), true)
  // An address the panel does not serve is the router's to answer («not found»).
  assert.equal(pathAllowed(operator, "/nowhere"), true)
  assert.equal(can(operator, null), true)
})

test("a closed address runs no loader, its own or a lazy module's, and an open one runs it", async () => {
  const calls = []
  const loader = (name) => async () => {
    calls.push(name)
    return { name }
  }
  const routes = [
    {
      path: "/orders",
      loader: loader("orders"),
      children: [
        { index: true, loader: loader("orders-index") },
        { path: ":id", lazy: async () => ({ loader: loader("order"), Component: () => null }) },
      ],
    },
    { path: "/products", lazy: async () => ({ loader: loader("products") }) },
    { path: "/static", lazy: async () => ({ Component: () => null }) },
  ]
  const permissions = permissionsOf(ME.operator)
  const asked = []
  const guarded = guardRoutes(routes, async (pathname) => {
    asked.push(pathname)
    return pathAllowed(permissions, pathname)
  })
  const args = (url) => ({ request: new Request(`https://panel.example${url}`), params: {} })

  // Open: every loader runs and its answer passes through.
  assert.deepEqual(await guarded[0].loader(args("/orders/order_1")), { name: "orders" })
  assert.deepEqual(await guarded[0].children[0].loader(args("/orders")), { name: "orders-index" })
  const order = await guarded[0].children[1].lazy()
  assert.deepEqual(await order.loader(args("/orders/order_1?tab=1")), { name: "order" })
  assert.equal(typeof order.Component, "function", "the rest of a lazy module is kept")
  assert.deepEqual(calls, ["orders", "orders-index", "order"])

  // Closed: the loader is not called and the answer is null.
  calls.length = 0
  const products = await guarded[1].lazy()
  assert.equal(await products.loader(args("/products/prod_1")), null)
  assert.deepEqual(calls, [], "a loader ran on a closed address")
  assert.ok(asked.includes("/products/prod_1"), "the guard asks about the address being opened")

  // A module without a loader stays as it is.
  const plain = await guarded[2].lazy()
  assert.equal(plain.loader, undefined)
})

test("the router is built from guarded routes and the shell swaps a closed screen for «Нет доступа»", () => {
  const app = read("app.tsx")
  assert.match(app, /createBrowserRouter\(guardRoutes\(routes, callerMayOpen\)/)

  const shell = read("components/layout/shell/shell.tsx")
  assert.match(shell, /<PermissionOutlet \/>/)
  assert.doesNotMatch(shell, /<Outlet \/>/, "the shell mounts a screen without asking")
  // A crumb of a detail screen reads its record, so a closed address draws none.
  const crumbs = shell.slice(shell.indexOf("const Breadcrumbs"), shell.indexOf("const ToggleSidebar"))
  assert.match(crumbs, /if \(!allowed\(pathname\)\) \{\s*return null/)

  const outlet = read("components/authentication/permission-outlet/permission-outlet.tsx")
  assert.match(outlet, /allowed\(pathname\) \? <Outlet \/> : <NoAccess \/>/)

  const screen = read("components/authentication/permission-outlet/no-access.tsx")
  assert.match(screen, /<Link to="\/">\{t\("noAccess\.toOverview"\)\}<\/Link>/, "no button to the overview")
  assert.doesNotMatch(screen, /hooks\/api|sdk\./, "«Нет доступа» asks the server for something")

  const tabs = read("components/layout/owner-nav/section-tabs.tsx")
  assert.match(tabs, /allowed\(pathname\) \? visibleTabs\(section\.tabs, permissions\) : \[\]/)

  const guard = read("lib/caller-may-open.ts")
  assert.match(guard, /queryClient\.fetchQuery\(meQueryOptions\(\)\)/, "the guard must reuse the cached «who am I»")
})

// ---------------------------------------------------------------- the sidebar and the overview ask only for what is open

test("the sidebar draws the filtered menu and reads a counter only with its permission", () => {
  const sidebar = read("components/layout/owner-nav/owner-nav.tsx")
  assert.match(sidebar, /visibleNav\(OWNER_NAV, permissions\)/)
  assert.doesNotMatch(sidebar, /OWNER_NAV\.map/, "the full menu is drawn again")
  assert.match(sidebar, /enabled: can\("orders"\)/)
  assert.match(sidebar, /enabled: can\("reviews"\)/)
  assert.match(sidebar, /enabled: can\("marketplaces"\)/)
})

test("the overview draws and requests a block only with its permission", () => {
  const home = read("routes/home/home.tsx")
  assert.match(home, /can\("catalog"\) \? <OverviewStats \/> : null/)
  assert.match(home, /can\("orders"\) \? <SalesSummary \/> : null/)
  assert.match(home, /can\("settings"\) \? <DeveloperDetails tenant=\{tenant\} \/> : null/)

  const attention = read("routes/home/owner-attention.tsx")
  assert.match(attention, /enabled: can\("storefront"\)/)
  assert.match(attention, /enabled: can\("catalog"\)/)
  assert.match(attention, /row\.count > 0 && allowed\(row\.to\)/)

  const launch = read("routes/home/owner-launch.tsx")
  assert.match(launch, /\.filter\(\(step\) => allowed\(step\.to\)\)/)
  assert.match(launch, /if \(steps\.length === 0\) \{\s*return null/)
  for (const permission of ["catalog", "storefront", "settings"]) {
    assert.ok(launch.includes(`enabled: can("${permission}")`), `the launch list reads ${permission} ungated`)
  }
  // Every read of the list goes through one of the gated option sets.
  assert.doesNotMatch(launch, /use\w+\((\{[^}]*\}, )?quiet\)/, "a read of the launch list is not gated")
})

// ---------------------------------------------------------------- the profile and the texts

test("the profile shows the login's own role", () => {
  const profile = read(
    "routes/profile/profile-detail/components/profile-general-section/profile-general-section.tsx"
  )
  assert.match(profile, /t\("profile\.fields\.roleLabel"\)/)
  assert.match(profile, /isRoleName\(user\.role\) \? t\(`staff\.roles\.\$\{user\.role\}`\) : user\.role/)
})

const catalogs = {
  ru: JSON.parse(read("i18n/translations/ru.json")),
  en: JSON.parse(read("i18n/translations/en.json")),
}
const lookup = (catalog, key) =>
  key.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), catalog)
const keysOf = (node, prefix = "") =>
  Object.entries(node).flatMap(([key, value]) =>
    value && typeof value === "object" ? keysOf(value, `${prefix}${key}.`) : [`${prefix}${key}`]
  )

test("the new texts exist in both languages, key for key", () => {
  for (const section of ["noAccess", "staff"]) {
    assert.deepEqual(
      keysOf(catalogs.ru[section]).sort(),
      keysOf(catalogs.en[section]).sort(),
      `${section}: the two catalogs differ`
    )
  }
  const keys = [
    "app.nav.owner.staff",
    "profile.fields.roleLabel",
    "noAccess.title",
    "noAccess.message",
    "noAccess.toOverview",
    "staff.roleSees",
    ...ROLE_NAMES.map((role) => `staff.roles.${role}`),
    ...PERMISSIONS.map((permission) => `staff.permissions.${permission}`),
  ]
  for (const [language, catalog] of Object.entries(catalogs)) {
    const missing = keys.filter((key) => typeof lookup(catalog, key) !== "string" || !lookup(catalog, key))
    assert.deepEqual(missing, [], `${language}.json lacks:\n${missing.join("\n")}`)
  }
  // A translation is a translation, not the Russian text copied across.
  for (const key of keysOf(catalogs.ru.staff)) {
    assert.notEqual(lookup(catalogs.ru.staff, key), lookup(catalogs.en.staff, key), `staff.${key}`)
  }
})
