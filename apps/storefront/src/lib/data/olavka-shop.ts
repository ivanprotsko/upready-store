import { getTenantHandle } from "./cookies"

/**
 * BRANCH-LOCAL (`redesign-olavka`, t-2026-09-24-n15): the shops the Olavka redesign's
 * per-shop pieces are for, by the tenant handle the middleware resolves from the Host
 * (`getTenantHandle`): `olavka` on the production copy, `cherkashino-com` its clone for
 * cherkashino.com in the same group, `cherkashino` on the older stand data. The footer
 * (Ivan's remark 13) and the product card (remark 17) read it; every other shop keeps its
 * own. A stopgap like `f7-tenant-config.ts`: a key the panel offers replaces this list.
 */
export const OLAVKA_SHOP_HANDLES: ReadonlySet<string> = new Set([
  "olavka",
  "cherkashino-com",
  "cherkashino",
])

/** Whether this request is for one of `OLAVKA_SHOP_HANDLES` (a header read, no fetch). */
export async function isOlavkaShop(): Promise<boolean> {
  const handle = await getTenantHandle()
  return handle !== null && OLAVKA_SHOP_HANDLES.has(handle)
}
