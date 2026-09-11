import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: piece 2. The Admin's `usePlugins` calls `GET /admin/plugins`,
// which lists the plugins installed on the backend so a screen can render the
// widgets they contribute. The panel loads no extensions at all
// (`providers/providers.tsx` drops `ExtensionProvider`), so the answer is
// always the empty list and there is no `/tenants/plugins` route to add: the
// hook resolves locally instead of asking the backend.
//
// `order-detail.tsx` reads `const { plugins = [] } = usePlugins()` and passes
// the list to its layout; an empty list renders the screen's own sections and
// nothing else, which is what the panel wants.

const PLUGINS_QUERY_KEY = "plugins" as const
export const pluginsQueryKeys = queryKeysFactory(PLUGINS_QUERY_KEY)

export const usePlugins = (
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminPluginsListResponse,
      FetchError,
      HttpTypes.AdminPluginsListResponse,
      QueryKey
    >,
    "queryKey" | "queryFn"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: async () => ({ plugins: [] }),
    queryKey: pluginsQueryKeys.list(),
    ...options,
  })

  return { ...data, ...rest }
}
