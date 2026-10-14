import { Input } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../components/common/form"
import { SettingsEditDrawer } from "../../../components/settings"
import { UploadField } from "./upload-slot"
import { type LogoValues, useLogoEdit, useUploadGate } from "./use-branding-edit"

// t-2026-10-14-01 (panel redesign, G1 part 4): drawer of the first section,
// «Оформление» — what stands in the shop's header and what a shared link
// shows. Route `logo/edit`. The short name lives here now: it is what the
// header shows when no logo is uploaded.

const logoSchema = zod.object({
  logo_light_url: zod.string().nullable(),
  logo_dark_url: zod.string().nullable(),
  shop_name_short: zod.string().max(60),
  og_image_url: zod.string().nullable(),
})

export const BrandingLogoEdit = () => {
  const { t } = useTranslation()
  const { saved, isPending, save } = useLogoEdit()
  const uploads = useUploadGate()

  return (
    <SettingsEditDrawer<LogoValues>
      title={t("brandingSettings.title")}
      description={t("brandingSettings.subtitle")}
      isPending={isPending}
      schema={logoSchema}
      defaultValues={saved}
      onSubmit={uploads.guard(save)}
      successMessage={t("brandingSettings.saved")}
    >
      {(form) => (
        <>
          <UploadField
            control={form.control}
            name="logo_light_url"
            label={t("brandingSettings.fields.logoLight")}
            kind="logo_light"
            zoneHint={t("brandingSettings.fields.logoLightZone")}
            onUploadingChange={uploads.track}
          />
          <UploadField
            control={form.control}
            name="logo_dark_url"
            label={t("brandingSettings.fields.logoDark")}
            optional
            kind="logo_dark"
            dark
            zoneHint={t("brandingSettings.fields.logoDarkZone")}
            onUploadingChange={uploads.track}
          />
          <Form.Field
            control={form.control}
            name="shop_name_short"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t("brandingSettings.fields.shopNameShort")}</Form.Label>
                <Form.Control>
                  <Input {...field} autoComplete="off" maxLength={60} />
                </Form.Control>
                <Form.Hint>{t("brandingSettings.fields.shopNameShortHint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <UploadField
            control={form.control}
            name="og_image_url"
            label={t("brandingSettings.fields.ogImage")}
            kind="og_image"
            shape="cover"
            zoneHint={t("brandingSettings.fields.ogImageZone")}
            hint={t("brandingSettings.fields.ogImageHint")}
            onUploadingChange={uploads.track}
          />
        </>
      )}
    </SettingsEditDrawer>
  )
}

export { BrandingLogoEdit as Component }
