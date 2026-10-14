import { useRef } from "react"
import { useTranslation } from "react-i18next"

import {
  type PutTenantBrandingBody,
  type TenantAppIcons,
  useTenantBranding,
  useUpdateTenantBranding,
} from "../../../hooks/api/branding"

// t-2026-10-14-01 (panel redesign, G1 part 4): one record, three sections, one
// hook per section. Each drawer sends only its own fields: the platform merges
// a PUT field by field (`api/tenants/branding/route.ts`), so the other two
// sections stay as saved. What each one sends is what the single form on this
// page used to send for the same fields.

const useBrandingRecord = () => {
  const { branding, isPending, isError, error } = useTenantBranding()
  const { mutateAsync } = useUpdateTenantBranding()

  if (isError) {
    throw error
  }

  return { branding, isPending, put: (body: PutTenantBrandingBody) => mutateAsync(body) }
}

/** Counts the uploads in flight. «Сохранить» before they land is refused with a toast and the
 * drawer stays open, or the file would land after the drawer closed and be lost (decide
 * d-2026-10-14-188). */
export const useUploadGate = () => {
  const { t } = useTranslation()
  const inFlight = useRef(0)

  return {
    track: (uploading: boolean) => {
      inFlight.current = Math.max(0, inFlight.current + (uploading ? 1 : -1))
    },
    guard:
      <TValues>(save: (values: TValues) => Promise<unknown>) =>
      (values: TValues) => {
        if (inFlight.current > 0) {
          return Promise.reject(new Error(t("brandingSettings.file.stillUploading")))
        }
        return save(values)
      },
  }
}

export type LogoValues = {
  logo_light_url: string | null
  logo_dark_url: string | null
  shop_name_short: string
  og_image_url: string | null
}

/** «Оформление»: the two logos, the short name shown in their place, the social image. */
export const useLogoEdit = () => {
  const { branding, isPending, put } = useBrandingRecord()

  const saved: LogoValues = {
    logo_light_url: branding?.logo_light_url ?? null,
    logo_dark_url: branding?.logo_dark_url ?? null,
    shop_name_short: branding?.shop_name_short ?? "",
    og_image_url: branding?.og_image_url ?? null,
  }

  const save = (values: LogoValues) =>
    put({
      logo_light_url: values.logo_light_url,
      logo_dark_url: values.logo_dark_url,
      shop_name_short: values.shop_name_short.trim() ? values.shop_name_short.trim() : null,
      og_image_url: values.og_image_url,
    })

  return { saved, isPending, save }
}

export type IconsValues = {
  favicon_url: string | null
  app_icons: TenantAppIcons | null
}

/** «Иконка приложения»: the favicon and the icon set built from it travel together. */
export const useIconsEdit = () => {
  const { branding, isPending, put } = useBrandingRecord()

  const saved: IconsValues = {
    favicon_url: branding?.favicon_url ?? null,
    app_icons: branding?.app_icons ?? null,
  }

  const save = (values: IconsValues) =>
    put({ favicon_url: values.favicon_url, app_icons: values.app_icons })

  return { branding, saved, isPending, save }
}

export type ColorValues = {
  primary_color: string
  credit_enabled: boolean
  credit_text: string
  credit_href: string
}

/** «Цвет и подпись»: the primary colour and the footer credit line. */
export const useColorEdit = () => {
  const { branding, isPending, put } = useBrandingRecord()

  const saved: ColorValues = {
    primary_color: branding?.primary_color ?? "",
    credit_enabled: branding?.footer_credit?.enabled ?? false,
    credit_text: branding?.footer_credit?.text ?? "",
    credit_href: branding?.footer_credit?.href ?? "",
  }

  const save = (values: ColorValues) =>
    put({
      primary_color: values.primary_color ? values.primary_color : null,
      footer_credit: {
        enabled: values.credit_enabled,
        text: values.credit_text.trim(),
        href: values.credit_href.trim() || null,
      },
    })

  return { branding, saved, isPending, save }
}
