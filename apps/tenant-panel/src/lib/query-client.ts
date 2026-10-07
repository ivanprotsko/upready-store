import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query"

import { ME_QUERY_KEY, shouldRefreshMe } from "./stale-role.ts"

export const MEDUSA_BACKEND_URL = __BACKEND_URL__ ?? "/"

// t-2026-10-07-11, addendum 13: a 403 from any shop route means the caller's
// role may have changed since the panel last asked «who am I». The answer is
// thrown away, `useMe` reads it again, and the sidebar and the route guard
// take the new permissions (`lib/stale-role.ts`).
const refreshMeOnForbidden = (error: unknown, queryKey?: readonly unknown[]) => {
  if (shouldRefreshMe(error, queryKey)) {
    void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
  }
}

export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => refreshMeOnForbidden(error, query.queryKey),
  }),
  mutationCache: new MutationCache({
    onError: (error) => refreshMeOnForbidden(error),
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 90000,
      retry: 1,
    },
  },
})
