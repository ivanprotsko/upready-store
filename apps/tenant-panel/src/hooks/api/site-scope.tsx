import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import { UseMutationOptions, useMutation } from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryClient } from "../../lib/query-client"
import { productsQueryKeys } from "./products"

// t-2026-09-24-n12: which of the owner's sites show a product. The backend
// adds `site_scope` and `owned` to a product only when the shop has more than
// one site (`apps/backend/src/api/tenants/products/site-scope.ts`); a shop
// with one site never sees either field.

export type SiteScope = "all" | { tenant_ids: string[] }

export type ProductSiteFields = {
  site_scope?: SiteScope
  owned?: boolean
}

export const useUpdateProductSiteScope = (
  id: string,
  options?: UseMutationOptions<
    HttpTypes.AdminProductResponse,
    FetchError,
    { site_scope: SiteScope }
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<HttpTypes.AdminProductResponse>(
        `/tenants/products/${id}`,
        { method: "POST", body: payload, query: { fields: "id" } }
      ),
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({
        queryKey: productsQueryKeys.lists(),
      })
      await queryClient.invalidateQueries({
        queryKey: productsQueryKeys.detail(id),
      })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
