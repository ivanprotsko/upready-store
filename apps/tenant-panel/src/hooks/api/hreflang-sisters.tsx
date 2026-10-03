import { FetchError } from "@medusajs/js-sdk"
import { UseMutationOptions, useMutation, useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryClient } from "../../lib/query-client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// t-cherk-31: the owner's override list of sister sites that live outside this
// database (Ivan's Р2 fork, `.ru`/`.com` on different servers). A sister
// already in this database's group needs no entry here — `GET /store/tenant/sites`
// derives it on its own.

export type HreflangSister = {
  domain: string
  locale: string
}

const HREFLANG_SISTERS_QUERY_KEY = "tenant-hreflang-sisters" as const
export const hreflangSistersQueryKeys = queryKeysFactory(HREFLANG_SISTERS_QUERY_KEY)

export const useHreflangSisters = () => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<{ sisters: HreflangSister[] }>("/tenants/hreflang-sisters"),
    queryKey: hreflangSistersQueryKeys.lists(),
  })

  return { sisters: data?.sisters, ...rest }
}

export const useUpdateHreflangSisters = (
  options?: UseMutationOptions<{ sisters: HreflangSister[] }, FetchError, { sisters: HreflangSister[] }>
) => {
  return useMutation({
    mutationFn: (body) =>
      sdk.client.fetch<{ sisters: HreflangSister[] }>("/tenants/hreflang-sisters", {
        method: "PUT",
        body,
      }),
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: hreflangSistersQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
