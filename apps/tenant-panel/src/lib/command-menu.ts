import {
  OWNER_HOME,
  OWNER_NAV,
  type OwnerNavGroup,
} from "../components/layout/owner-nav/nav-model.ts"
import { pathAllowed, type Permission } from "./permissions.ts"

/**
 * The command menu's data and matching (ask-20261005-112844-10ba), kept free of
 * React so `src/__tests__/command-menu.test.mjs` imports and runs it as is.
 *
 * Ivan asked for the «меню command» to work with the shop quickly: ⌘K, type a
 * few letters, land on a screen, a product, an order, or start an action. The
 * screens come from the sidebar's own model (`nav-model.ts`), so a screen added
 * to the menu is in the palette by existing, «Торговые площадки» included.
 */

export type CommandMenuNavEntry = {
  /** cmdk `value`, unique across the palette. */
  id: string
  to: string
  labelKey: string
  /** A brand that is not translated («Wildberries»). */
  label?: string
  /** The entry whose screen this is, for «Wildberries · Цены и остатки». */
  parent?: { labelKey: string; label?: string }
  /** The sidebar group, shown next to the entry and matched as a keyword. */
  groupLabelKey: string | null
}

export type CommandMenuRun = "openShop" | "toggleTheme" | "logout"

export type CommandMenuAction = {
  id: string
  labelKey: string
  /** Where the action opens; an action without one runs `run` instead. */
  to?: string
  run?: CommandMenuRun
}

/**
 * Every screen of the sidebar, in the sidebar's order. An entry with screens
 * under it («Wildberries») is not listed itself: it opens its first screen,
 * and each screen carries its name, so «wild» lists all six.
 */
export const commandMenuNavigation = (
  nav: OwnerNavGroup[] = OWNER_NAV
): CommandMenuNavEntry[] => {
  const entries: CommandMenuNavEntry[] = [
    { id: `nav:${OWNER_HOME.to}`, to: OWNER_HOME.to, labelKey: OWNER_HOME.labelKey, groupLabelKey: null },
  ]
  for (const group of nav) {
    for (const item of group.items) {
      if (item.children?.length) {
        for (const child of item.children) {
          entries.push({
            id: `nav:${child.to}`,
            to: child.to,
            labelKey: child.labelKey,
            label: child.label,
            parent: { labelKey: item.labelKey, label: item.label },
            groupLabelKey: group.labelKey,
          })
        }
        continue
      }
      entries.push({
        id: `nav:${item.to}`,
        to: item.to,
        labelKey: item.labelKey,
        label: item.label,
        groupLabelKey: group.labelKey,
      })
    }
  }
  return entries
}

/**
 * Things the panel already does, one keystroke away. Each `to` is a screen
 * that exists in `app.tsx` (the test checks it); nothing here is new behaviour.
 */
export const COMMAND_MENU_ACTIONS: CommandMenuAction[] = [
  { id: "action:create-product", labelKey: "app.commandMenu.actions.createProduct", to: "/products/create" },
  { id: "action:create-category", labelKey: "app.commandMenu.actions.createCategory", to: "/categories/create" },
  { id: "action:create-promotion", labelKey: "app.commandMenu.actions.createPromotion", to: "/promotions/create" },
  { id: "action:new-article", labelKey: "app.commandMenu.actions.newArticle", to: "/journal/new" },
  { id: "action:create-shipping", labelKey: "app.commandMenu.actions.createShipping", to: "/shipping/create" },
  { id: "action:open-shop", labelKey: "app.commandMenu.actions.openShop", run: "openShop" },
  { id: "action:toggle-theme", labelKey: "app.commandMenu.actions.toggleTheme", run: "toggleTheme" },
  { id: "action:logout", labelKey: "app.commandMenu.actions.logout", run: "logout" },
]

/**
 * The actions a login may start (t-2026-10-07-11): one that opens a screen
 * needs that screen's permission, one that runs a command is open to all.
 */
export const commandMenuActions = (permissions: readonly Permission[]): CommandMenuAction[] =>
  COMMAND_MENU_ACTIONS.filter((action) => !action.to || pathAllowed(permissions, action.to))

/**
 * ⌘K on a Mac, Ctrl+K elsewhere. The physical key is read (`code`), not the
 * character: on the Russian layout the same key types «л», and the Admin's
 * `e.key === "k"` never fires for an owner who writes in Russian.
 */
export const isCommandMenuShortcut = (event: {
  code?: string
  key?: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}): boolean =>
  (event.metaKey === true || event.ctrlKey === true) &&
  event.altKey !== true &&
  event.shiftKey !== true &&
  (event.code === "KeyK" || event.key?.toLowerCase() === "k")

/** The shortcut as the owner's keyboard prints it: «⌘K» on Apple devices, «Ctrl K» elsewhere. */
export const commandMenuShortcutLabel = (userAgent: string): string =>
  /Mac|iPhone|iPad|iPod/.test(userAgent) ? "⌘K" : "Ctrl K"

/** Case, «ё» and spacing never decide a match. */
export const normalizeQuery = (value: string): string =>
  value.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ").trim()

const EN_KEYS = "`qwertyuiop[]asdfghjkl;'zxcvbnm,."
const RU_KEYS = "ёйцукенгшщзхъфывапролджэячсмитьбю"

/**
 * The same keys typed on the other layout: «pfrfps» is «заказы» typed with the
 * English layout on, «ghbdtn» is «привет». Lowercase in, lowercase out.
 */
export const switchLayout = (value: string): string =>
  Array.from(value)
    .map((char) => {
      const en = EN_KEYS.indexOf(char)
      if (en >= 0) {
        return RU_KEYS[en]
      }
      const ru = RU_KEYS.indexOf(char)
      return ru >= 0 ? EN_KEYS[ru] : char
    })
    .join("")

export type CommandMenuSearchable = {
  /** What the owner reads on the row. */
  label: string
  /** Matched too, ranked below the label: the group, the address. */
  keywords?: string[]
}

/** 3: the text starts with the word; 2: a word in it does; 1: it is inside; 0: absent. */
const wordScore = (text: string, word: string): number => {
  const at = text.indexOf(word)
  if (at < 0) {
    return 0
  }
  if (at === 0) {
    return 3
  }
  return text.split(/[\s/·\-–—,.()«»]+/).some((part) => part.startsWith(word)) ? 2 : 1
}

const rank = <T extends CommandMenuSearchable>(items: T[], query: string): T[] => {
  const words = query.split(" ")
  const scored: { item: T; score: number; index: number }[] = []
  items.forEach((item, index) => {
    const label = normalizeQuery(item.label)
    const keywords = (item.keywords ?? []).map(normalizeQuery)
    let score = 0
    for (const word of words) {
      // A word in the label counts double: «товары» puts «Товары» above
      // every Wildberries screen whose group happens to say «товары» too.
      const best = Math.max(
        wordScore(label, word) * 2,
        ...keywords.map((keyword) => wordScore(keyword, word))
      )
      if (best === 0) {
        return
      }
      score += best
    }
    scored.push({ item, score, index })
  })
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item)
}

/**
 * The rows that answer `query`, best first, ties in the given order. Every
 * word of the query must match the row. When nothing does, the query is tried
 * once more as if typed on the other keyboard layout.
 */
export const filterCommands = <T extends CommandMenuSearchable>(
  items: T[],
  query: string
): T[] => {
  const normalized = normalizeQuery(query)
  if (!normalized) {
    return items
  }
  const direct = rank(items, normalized)
  if (direct.length > 0) {
    return direct
  }
  const switched = switchLayout(normalized)
  return switched === normalized ? [] : rank(items, switched)
}

/** An address's words, so «payments» or «price stock» find the screen in any language. */
export const pathKeywords = (to: string): string[] =>
  to
    .split(/[/-]+/)
    .filter(Boolean)

/**
 * The text sent to `/tenants/products?q=` and `/tenants/orders?q=`. «#1024»
 * is how an order number is written, the API matches the bare number.
 */
export const commandMenuSearchTerm = (query: string): string =>
  query.trim().replace(/^#+/, "").trim()

/** How many products and orders the palette shows before «Все результаты». */
export const COMMAND_MENU_RESULT_LIMIT = 5

export const productPath = (id: string) => `/products/${id}`
export const orderPath = (id: string) => `/orders/${id}`

/** The list screen with the same search typed into its search field. */
export const listSearchPath = (list: "/products" | "/orders", query: string) =>
  `${list}?${new URLSearchParams({ q: commandMenuSearchTerm(query) }).toString()}`
