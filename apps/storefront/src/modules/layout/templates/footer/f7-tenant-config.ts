/**
 * Per-shop copy for footer F7: the two link columns that stand beside
 * «О магазине» in Ivan's Figma mockup (node 9-70418, `t-2026-09-22-01` block 6).
 *
 * Why a file and not a panel field: the columns have no source in the tenant data today.
 * (The payment row used to live here too; t-2026-10-20-61 D12 moved it to the shop's own
 * payment settings, see `f7.tsx`.) `GET /store/tenant/seller` carries requisites and contacts only,
 * `listTenantPages()` carries the owner's published pages, and the tenant module's
 * `telegram_chat_id` is an order-notification setting, not a public channel link. The
 * brief's own answer for the badges is «badges from a static list per tenant config», so
 * this is that list, keyed by the tenant handle the middleware already resolves from the
 * Host header (`getTenantHandle` in `@lib/data/cookies`). It is a STOPGAP: the moment the
 * panel grows a "social links" and a "badge row" field, F7 reads them instead and this
 * file goes away.
 *
 * Everything here is shop DATA, not UI copy, which is why the Russian strings are literals
 * rather than next-intl keys — the same rule `SITE_NAME` and `SiteAttribution`'s anchor
 * already follow (a shop's own channel name is not translated 36 times).
 *
 * A tenant with no entry gets `EMPTY`: F7 then renders the one «О магазине» column and no
 * badge row, never an empty column and never a heading over nothing.
 */

/** The outline glyph F7 draws before a link, or nothing. */
export type F7Icon = "youtube" | "telegram"

export type F7Link = {
  /** What the visitor reads. Shop copy. */
  label: string
  /**
   * Where it goes. `null` when the owner has not given the address yet: F7 renders the
   * label as plain text rather than as an anchor, so a column can carry the mockup's
   * wording without this file inventing a URL that would 404 for a real buyer.
   */
  href: string | null
  icon?: F7Icon
}

export type F7Column = {
  /** Shop copy, e.g. «Здоровье без таблеток». Never rendered without at least one link. */
  heading: string
  links: F7Link[]
}

export type F7TenantConfig = {
  /** The extra columns, after the shop's own «О магазине» column. At most two fit the row. */
  columns: F7Column[]
}

const EMPTY: F7TenantConfig = { columns: [] }

const BY_HANDLE: Record<string, F7TenantConfig> = {
  /**
   * cherkashino — the mockup's own shop. Both `href`s are null on purpose: the channel
   * addresses are nowhere in this repository or in the tenant data (the Cherkashina
   * migration carried no social links, `artifacts/docs/2026-09-12-cherkashina-migration`),
   * and guessing one would put a dead link in front of a buyer. Ivan fills two strings
   * here and the columns become clickable, with nothing else to change.
   */
  cherkashino: {
    columns: [
      {
        heading: "Здоровье без таблеток",
        links: [
          { label: "YouTube", href: null, icon: "youtube" },
          { label: "Telegram", href: null, icon: "telegram" },
        ],
      },
      {
        heading: "Курсы",
        links: [
          { label: "Восстановление почек", href: null },
          { label: "Про АСД", href: null },
        ],
      },
    ],
  },
}

/** This shop's F7 copy, or the empty one for every tenant that has no entry. */
export function f7TenantConfig(handle: string | null): F7TenantConfig {
  if (!handle) {
    return EMPTY
  }

  return BY_HANDLE[handle] ?? EMPTY
}
