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

/** The app-icon set the backend builds from a favicon upload (t-2026-10-03-61): every size a PWA,
 * iOS, Android, Windows or macOS install asks for, and the colour behind the opaque ones. */
export type TenantAppIcons = {
  icon_svg_url: string | null
  favicon_ico_url: string | null
  apple_touch_icon_url: string | null
  icon_192_url: string | null
  icon_512_url: string | null
  icon_maskable_512_url: string | null
  mstile_150_url: string | null
  mstile_310_url: string | null
  mask_icon_url: string | null
  background_color: string | null
}

export const EMPTY_APP_ICONS: TenantAppIcons = {
  icon_svg_url: null,
  favicon_ico_url: null,
  apple_touch_icon_url: null,
  icon_192_url: null,
  icon_512_url: null,
  icon_maskable_512_url: null,
  mstile_150_url: null,
  mstile_310_url: null,
  mask_icon_url: null,
  background_color: null,
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
  app_icons: TenantAppIcons | null
}

export type PutTenantBrandingBody = Partial<{
  logo_light_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  og_image_url: string | null
  primary_color: string | null
  shop_name_short: string | null
  footer_credit: TenantFooterCredit | null
  app_icons: TenantAppIcons | null
}>

export type UploadBrandingKind =
  | "logo_light"
  | "logo_dark"
  | "favicon"
  | "favicon_maskable"
  | "favicon_mono"
  | "og_image"

export type UploadedBrandingFile = { id: string; url: string }

/** What one upload answers: the stored file, and for the three icon kinds the `app_icons` fields
 * it built (the whole set for `favicon`, only what it replaces for the other two). */
export type UploadedBranding = { file: UploadedBrandingFile; app_icons?: Partial<TenantAppIcons> }

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
): Promise<UploadedBranding> => {
  const form = new FormData()
  form.append("files", file)
  form.append("kind", kind)

  return sdk.client.fetch<UploadedBranding>("/tenants/branding/upload", {
    method: "POST",
    headers: { "Content-Type": null },
    body: form,
  })
}
