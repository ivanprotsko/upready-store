import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { OWNER_HOME, OWNER_NAV } from "../components/layout/owner-nav/nav-model.ts"
import {
  COMMAND_MENU_ACTIONS,
  commandMenuNavigation,
  commandMenuSearchTerm,
  commandMenuShortcutLabel,
  filterCommands,
  isCommandMenuShortcut,
  listSearchPath,
  normalizeQuery,
  pathKeywords,
  switchLayout,
} from "../lib/command-menu.ts"

/**
 * The owner's command menu (ask-20261005-112844-10ba). `lib/command-menu.ts`
 * is plain TS, so its lists and its matching are imported and run for real;
 * the dialog itself is the Admin's search dialog and is checked by the
 * snapshots in the task's evidence, not here.
 */

const here = dirname(fileURLToPath(import.meta.url))
const read = (path) => readFileSync(join(here, "..", path), "utf8")
const catalogs = {
  ru: JSON.parse(read("i18n/translations/ru.json")),
  en: JSON.parse(read("i18n/translations/en.json")),
}
const lookup = (catalog, key) =>
  key.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), catalog)

/** The rows the component builds, labelled from the Russian catalogue the way `t` would. */
const russianRows = () =>
  commandMenuNavigation().map((entry) => {
    const own = entry.label ?? lookup(catalogs.ru, entry.labelKey)
    const parent = entry.parent ? entry.parent.label ?? lookup(catalogs.ru, entry.parent.labelKey) : null
    const group = entry.groupLabelKey ? lookup(catalogs.ru, entry.groupLabelKey) : null
    return {
      to: entry.to,
      label: parent ? `${parent} · ${own}` : own,
      keywords: [...(group ? [group] : []), ...pathKeywords(entry.to)],
    }
  })
const russianActions = () =>
  COMMAND_MENU_ACTIONS.map((action) => ({
    id: action.id,
    label: lookup(catalogs.ru, action.labelKey),
    keywords: action.to ? pathKeywords(action.to) : [],
  }))

// ---------------------------------------------------------------- navigation

test("every screen of the sidebar is in the menu, in the sidebar's order, the marketplaces included", () => {
  const expected = [OWNER_HOME.to]
  for (const group of OWNER_NAV) {
    for (const item of group.items) {
      if (item.children?.length) {
        expected.push(...item.children.map((child) => child.to))
      } else {
        expected.push(item.to)
      }
    }
  }
  const targets = commandMenuNavigation().map((entry) => entry.to)
  assert.deepEqual(targets, expected)
  for (const required of [
    "/marketplaces/wildberries/products",
    "/marketplaces/wildberries/price-stock",
    "/marketplaces/wildberries/orders",
    "/marketplaces/wildberries/reviews",
    "/marketplaces/wildberries/analytics",
    "/marketplaces/wildberries/sync",
    "/marketplaces/ozon",
    "/marketplaces/ozon/products",
    "/marketplaces/ozon/price-stock",
    "/marketplaces/ozon/orders",
    "/marketplaces/ozon/sync",
  ]) {
    assert.ok(targets.includes(required), `the menu has no entry for ${required}`)
  }
})

test("menu values are unique, so cmdk never selects two rows at once", () => {
  const ids = [...commandMenuNavigation().map((entry) => entry.id), ...COMMAND_MENU_ACTIONS.map((a) => a.id)]
  assert.equal(new Set(ids).size, ids.length)
})

test("a marketplace screen carries the marketplace's name", () => {
  const sync = commandMenuNavigation().find((entry) => entry.to === "/marketplaces/wildberries/sync")
  assert.equal(sync?.parent?.label, "Wildberries")
  assert.equal(sync?.groupLabelKey, "app.nav.owner.groups.marketplaces")
})

/**
 * A target is served when app.tsx registers it as a top-level path, or
 * registers its first segments and, inside that route's braces, the rest as a
 * child path (`/products` + `create`).
 */
// app.tsx and the route modules it imports for `children:` (`homeSettingsChildren`,
// `ozonChildren`), which hold their routes outside it so that it stays within its
// recorded length (t-2026-10-14-55). Ozon's paths there are absolute (t-2026-10-16-37).
const readModule = (from) => {
  const file = [".ts", ".tsx"].map((ext) => `${from}${ext}`).find((path) => existsSync(join(here, "..", path)))
  return file ? read(file) : ""
}
const app = [
  read("app.tsx"),
  ...[...read("app.tsx").matchAll(/^import \{ \w+ \} from "\.\/(routes\/[^"]+)"$/gm)].map(([, from]) => readModule(from)),
].join("\n")
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
const served = (target) => {
  if (app.includes(`path: "${target}"`)) {
    return true
  }
  const segments = target.split("/")
  for (let cut = segments.length - 1; cut > 1; cut -= 1) {
    const head = segments.slice(0, cut).join("/")
    const tail = segments.slice(cut).join("/")
    const at = app.indexOf(`path: "${head}"`)
    if (at >= 0 && blockAt(app, app.lastIndexOf("{", at)).includes(`path: "${tail}"`)) {
      return true
    }
  }
  return false
}

test("every screen and every action of the menu opens a route app.tsx registers", () => {
  const targets = [
    ...commandMenuNavigation().map((entry) => entry.to),
    ...COMMAND_MENU_ACTIONS.flatMap((action) => (action.to ? [action.to] : [])),
  ]
  const dangling = targets.filter((target) => !served(target))
  assert.deepEqual(dangling, [], `the menu points at addresses no route serves:\n${dangling.join("\n")}`)
})

test("an action either opens a screen or runs one of the known commands", () => {
  for (const action of COMMAND_MENU_ACTIONS) {
    assert.ok(
      Boolean(action.to) !== Boolean(action.run),
      `${action.id} must have exactly one of to and run`
    )
    if (action.run) {
      assert.ok(["openShop", "toggleTheme", "logout"].includes(action.run), action.id)
    }
  }
})

// ---------------------------------------------------------------- filtering

test("an empty query lists everything in the given order", () => {
  const rows = russianRows()
  assert.deepEqual(filterCommands(rows, ""), rows)
  assert.deepEqual(filterCommands(rows, "   "), rows)
})

test("«заказы» puts the orders screen first, case and spaces aside", () => {
  for (const query of ["заказы", "ЗАКАЗЫ", "  заказ  "]) {
    const [first] = filterCommands(russianRows(), query)
    assert.equal(first?.to, "/orders", `query «${query}»`)
  }
})

test("a word in the label ranks above the same word in the group or the address", () => {
  const found = filterCommands(russianRows(), "товары").map((row) => row.to)
  assert.equal(found[0], "/products")
  assert.ok(found.includes("/marketplaces/wildberries/products"))
  assert.ok(found.indexOf("/products") < found.indexOf("/marketplaces/wildberries/products"))
})

test("every word of the query must match, in any order", () => {
  const found = filterCommands(russianRows(), "отзывы wildberries").map((row) => row.to)
  assert.deepEqual(found, ["/marketplaces/wildberries/reviews"])
  const reversed = filterCommands(russianRows(), "wildberries отзывы").map((row) => row.to)
  assert.deepEqual(reversed, found)
})

test("«wild» lists the six Wildberries screens", () => {
  const found = filterCommands(russianRows(), "wild").map((row) => row.to)
  assert.equal(found.length, 6)
  assert.ok(found.every((to) => to.startsWith("/marketplaces/wildberries/")))
})

test("the address finds a screen in English while the panel speaks Russian", () => {
  assert.equal(filterCommands(russianRows(), "payments")[0]?.to, "/settings/payments")
  assert.equal(filterCommands(russianRows(), "price stock")[0]?.to, "/marketplaces/wildberries/price-stock")
})

test("«ё» and «е» are the same letter", () => {
  assert.equal(normalizeQuery("Тёмная"), "темная")
  const found = filterCommands(russianActions(), "темная").map((row) => row.id)
  assert.deepEqual(found, ["action:toggle-theme"])
})

test("a query typed on the wrong keyboard layout still finds the screen", () => {
  assert.equal(switchLayout("pfrfps"), "заказы")
  assert.equal(switchLayout("заказы"), "pfrfps")
  assert.equal(filterCommands(russianRows(), "pfrfps")[0]?.to, "/orders")
  assert.equal(filterCommands(russianActions(), "cjplfnm")[0]?.id, "action:create-product")
})

test("a query nothing matches gives an empty list, the empty state's cue", () => {
  assert.deepEqual(filterCommands(russianRows(), "zzzzqqq"), [])
  assert.deepEqual(filterCommands(russianActions(), "несуществующее"), [])
})

test("actions are found by what they do", () => {
  assert.equal(filterCommands(russianActions(), "создать товар")[0]?.id, "action:create-product")
  assert.equal(filterCommands(russianActions(), "выйти")[0]?.id, "action:logout")
  assert.equal(filterCommands(russianActions(), "магазин")[0]?.id, "action:open-shop")
})

// ---------------------------------------------------------------- shortcut and search term

test("⌘K and Ctrl+K open the menu, on the Russian layout too", () => {
  assert.equal(isCommandMenuShortcut({ code: "KeyK", key: "k", metaKey: true }), true)
  assert.equal(isCommandMenuShortcut({ code: "KeyK", key: "k", ctrlKey: true }), true)
  // The same key with the Russian layout on types «л».
  assert.equal(isCommandMenuShortcut({ code: "KeyK", key: "л", metaKey: true }), true)
  assert.equal(isCommandMenuShortcut({ code: "KeyK", key: "k" }), false)
  assert.equal(isCommandMenuShortcut({ code: "KeyK", key: "K", metaKey: true, shiftKey: true }), false)
  assert.equal(isCommandMenuShortcut({ code: "KeyK", key: "˚", metaKey: true, altKey: true }), false)
  assert.equal(isCommandMenuShortcut({ code: "KeyJ", key: "j", metaKey: true }), false)
})

test("the shortcut is printed for the owner's keyboard", () => {
  assert.equal(commandMenuShortcutLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)"), "⌘K")
  assert.equal(commandMenuShortcutLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "Ctrl K")
})

test("an order number is searched without its «#»", () => {
  assert.equal(commandMenuSearchTerm("#1024"), "1024")
  assert.equal(commandMenuSearchTerm("  ##12 "), "12")
  assert.equal(commandMenuSearchTerm("футболка"), "футболка")
  assert.equal(listSearchPath("/orders", "#1024"), "/orders?q=1024")
  assert.equal(listSearchPath("/products", "чай пуэр"), "/products?q=%D1%87%D0%B0%D0%B9+%D0%BF%D1%83%D1%8D%D1%80")
})

// ---------------------------------------------------------------- texts and wiring

test("every text of the menu exists in Russian and in English", () => {
  const keys = [
    ...COMMAND_MENU_ACTIONS.map((action) => action.labelKey),
    ...commandMenuNavigation().flatMap((entry) => [
      ...(entry.label ? [] : [entry.labelKey]),
      ...(entry.groupLabelKey ? [entry.groupLabelKey] : []),
    ]),
    ...[
      "title",
      "description",
      "placeholder",
      "close",
      "noResultsMessage",
      "orderTitle",
      "allProducts",
      "allOrders",
      "groups.navigation",
      "groups.actions",
      "groups.products",
      "groups.orders",
    ].map((key) => `app.commandMenu.${key}`),
  ]
  for (const [language, catalog] of Object.entries(catalogs)) {
    const missing = keys.filter((key) => typeof lookup(catalog, key) !== "string")
    assert.deepEqual(missing, [], `${language}.json lacks:\n${missing.join("\n")}`)
  }
})

/**
 * cmdk 0.2's `Command.Empty` renders nothing on its first render and shows
 * only after the item count next changes. Mounted behind a condition, once the
 * list is already empty, it never appears: «велосипед» showed a blank dialog
 * until this was found on the snapshots.
 */
test("the empty state is mounted with the dialog, not behind a condition", () => {
  const menu = read("components/command-menu/command-menu.tsx")
  assert.match(menu, /^\s*<CommandEmpty q=\{searchValue\} pending=\{searchPending\} \/>$/m)
  assert.doesNotMatch(menu, /&&\s*<CommandEmpty/)
})

test("the shell mounts the menu and both triggers open it", () => {
  const shell = read("components/layout/shell/shell.tsx")
  assert.match(shell, /<CommandMenuProvider>/)
  assert.match(shell, /<CommandMenuTopbarButton \/>/)
  assert.match(read("components/layout/main-layout/main-layout.tsx"), /<CommandMenuTrigger \/>/)
})
