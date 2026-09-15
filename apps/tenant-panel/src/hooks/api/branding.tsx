import { FetchError } from "@medusajs/js-sdk"
import {
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryClient } from "../../lib/query-client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// Бренд владельца (t16-owner-branding): логотип, фавикон, картинка для
// соцсетей, основной цвет, подпись в подвале. Свой хук панели, как у
// /tenants/seo-verification — у Admin аналога нет, там один магазин и один
// build-time профиль темы.

export type TenantFooterCredit = {
  enabled: boolean
  text: string
  href: string | null
}

export type TenantBranding = {
  logo_light_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  og_image_url: string | null
  primary_color: string | null
  primary_foreground: "#ffffff" | "#000000" | null
  low_contrast: boolean
  shop_name_short: string | null
  footer_credit: TenantFooterCredit | null
}

export type PutTenantBrandingBody = Partial<{
  logo_light_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  og_image_url: string | null
  primary_color: string | null
  shop_name_short: string | null
  footer_credit: TenantFooterCredit | null
}>

export type UploadBrandingKind = "logo_light" | "logo_dark" | "favicon" | "og_image"

export type UploadedBrandingFile = { id: string; url: string }

const BRANDING_QUERY_KEY = "branding" as const
export const brandingQueryKeys = queryKeysFactory(BRANDING_QUERY_KEY)

const invalidate = () => queryClient.invalidateQueries({ queryKey: brandingQueryKeys.all })

export const useTenantBranding = (
  options?: Omit<
    UseQueryOptions<{ branding: TenantBranding }, FetchError, { branding: TenantBranding }, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: brandingQueryKeys.details(),
    queryFn: () => sdk.client.fetch<{ branding: TenantBranding }>("/tenants/branding"),
    ...options,
  })

  return { branding: data?.branding, ...rest }
}

export const useUpdateTenantBranding = (
  options?: UseMutationOptions<{ branding: TenantBranding }, FetchError, PutTenantBrandingBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<{ branding: TenantBranding }>("/tenants/branding", {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      invalidate()
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

/** `POST /tenants/branding/upload` — separate from the panel's generic media
 * upload: this one enforces mime/size/dimension rules per `kind`. */
export const uploadBrandingFile = async (
  file: File,
  kind: UploadBrandingKind
): Promise<UploadedBrandingFile> => {
  const form = new FormData()
  form.append("files", file)
  form.append("kind", kind)

  const { file: uploaded } = await sdk.client.fetch<{ file: UploadedBrandingFile }>(
    "/tenants/branding/upload",
    { method: "POST", headers: { "Content-Type": null }, body: form }
  )

  return uploaded
}
