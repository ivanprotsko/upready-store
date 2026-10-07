/**
 * A role changed while the panel was open (t-2026-10-07-11, addendum 13). The
 * panel keeps the caller's permissions from its last «who am I» answer, so a
 * login that was just made an operator still sees the manager's menu until
 * the server refuses a request. Any 403 from a shop route is that signal: the
 * «who am I» read is thrown away, and the sidebar and the route guard take
 * the new permissions.
 *
 * Plain TS, so `src/__tests__/stale-role.test.mjs` runs it as is.
 */
export const ME_QUERY_KEY = ["users", "me"] as const

const isMeQuery = (queryKey: readonly unknown[]) =>
  queryKey.length === ME_QUERY_KEY.length && ME_QUERY_KEY.every((part, index) => part === queryKey[index])

/** A failed request the server answered 403. */
export const isForbidden = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "status" in error && error.status === 403

/**
 * Whether a failed request should throw the «who am I» answer away. A 403 of
 * that read itself does not: asking again would only be refused again.
 */
export const shouldRefreshMe = (error: unknown, queryKey?: readonly unknown[]): boolean =>
  isForbidden(error) && !(queryKey && isMeQuery(queryKey))
