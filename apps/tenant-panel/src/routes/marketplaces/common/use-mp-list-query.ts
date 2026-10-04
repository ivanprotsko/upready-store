import { useQueryParams } from "../../../hooks/use-query-params"

/**
 * The query string of a marketplace list, read the way `useProductTableQuery`
 * reads the shop's: `offset`, `order`, `q` and the screen's own filter keys,
 * each a comma-separated list in the address. The address is the state, so a
 * filtered view can be sent to someone (the rule the order desk of w15 set).
 */
export const useMpListQuery = <TKey extends string>(
  keys: TKey[],
  pageSize: number
): {
  params: { limit: number; offset: number; q?: string; order?: string } & Record<TKey, string[] | undefined>
  raw: Record<string, string | undefined>
  dates: Record<TKey, string | undefined>
} => {
  const raw = useQueryParams(["offset", "order", "q", ...keys])
  const lists = {} as Record<TKey, string[] | undefined>
  const dates = {} as Record<TKey, string | undefined>
  for (const key of keys) {
    const value = raw[key]
    // A date filter arrives as JSON (`{"$gte":…}`); a select as `a,b,c`.
    if (value && value.startsWith("{")) {
      dates[key] = value
      lists[key] = undefined
    } else {
      lists[key] = value ? value.split(",") : undefined
      dates[key] = undefined
    }
  }
  return {
    params: {
      limit: pageSize,
      offset: raw.offset ? Number(raw.offset) : 0,
      q: raw.q,
      order: raw.order,
      ...lists,
    },
    raw,
    dates,
  }
}
