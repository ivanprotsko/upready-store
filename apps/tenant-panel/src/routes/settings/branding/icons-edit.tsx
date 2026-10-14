import { Text } from "@medusajs/ui"
import { UseFormReturn, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../components/common/form"
import { SettingsEditDrawer } from "../../../components/settings"
import { EMPTY_APP_ICONS, type TenantAppIcons } from "../../../hooks/api/branding"
import { useStore } from "../../../hooks/api/store"
import { AppIconsPreview } from "./app-icons"
import { UploadSlot } from "./upload-slot"
import { type IconsValues, useIconsEdit, useUploadGate } from "./use-branding-edit"

// t-2026-10-14-01 (panel redesign, G1 part 4): drawer of «Иконка приложения».
// Route `icons/edit`. The favicon and the set the platform builds from it
// (t-2026-10-03-61) travel together: a favicon upload replaces the whole set,
// removing the favicon clears it, and the two optional masters only patch
// their own fields of the set already there.

const iconsSchema = zod.object({
  favicon_url: zod.string().nullable(),
  app_icons: zod.custom<TenantAppIcons>().nullable(),
})

export const BrandingIconsEdit = () => {
  const { t } = useTranslation()
  const { branding, saved, isPending, save } = useIconsEdit()
  const { store } = useStore()
  const uploads = useUploadGate()

  const shopName = branding?.shop_name_short || store?.name || t("brandingSettings.previewShopName")

  return (
    <SettingsEditDrawer<IconsValues>
      title={t("brandingSettings.appIcons.title")}
      description={t("brandingSettings.appIcons.subtitle")}
      isPending={isPending}
      schema={iconsSchema}
      defaultValues={saved}
      onSubmit={uploads.guard(save)}
      successMessage={t("brandingSettings.saved")}
    >
      {(form) => <IconsFields form={form} shopName={shopName} onUploadingChange={uploads.track} />}
    </SettingsEditDrawer>
  )
}

const IconsFields = ({
  form,
  shopName,
  onUploadingChange,
}: {
  form: UseFormReturn<IconsValues>
  shopName: string
  onUploadingChange: (uploading: boolean) => void
}) => {
  const { t } = useTranslation()
  const [faviconUrl, icons] = useWatch({ control: form.control, name: ["favicon_url", "app_icons"] })

  // A master refines the set that is there when its upload lands, not the one
  // that was there when it started.
  const refine = (fields?: Partial<TenantAppIcons>) => {
    const current = form.getValues("app_icons")
    if (fields && current) {
      form.setValue("app_icons", { ...current, ...fields }, { shouldDirty: true })
    }
  }

  const master = (
    kind: "favicon_maskable" | "favicon_mono",
    url: string | null,
    label: string,
    zoneHint: string,
    formats?: string[]
  ) => (
    <Form.Field
      control={form.control}
      name="app_icons"
      render={() => (
        <Form.Item>
          <Form.Label optional>{label}</Form.Label>
          {icons ? (
            <UploadSlot
              kind={kind}
              url={url}
              shape="icon"
              removable={false}
              formats={formats}
              zoneHint={zoneHint}
              onUploadingChange={onUploadingChange}
              onChange={(_url, fields) => refine(fields)}
            />
          ) : (
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              {t("brandingSettings.appIcons.needsFavicon")}
            </Text>
          )}
        </Form.Item>
      )}
    />
  )

  return (
    <>
      <Form.Field
        control={form.control}
        name="favicon_url"
        render={({ field }) => (
          <Form.Item>
            <Form.Label>{t("brandingSettings.fields.favicon")}</Form.Label>
            <UploadSlot
              kind="favicon"
              url={field.value}
              shape="icon"
              zoneHint={t("brandingSettings.fields.faviconZone")}
              onUploadingChange={onUploadingChange}
              onChange={(url, built) => {
                // A favicon upload answers the whole set built from it, so the
                // set is replaced with the favicon and cleared with it.
                field.onChange(url)
                form.setValue("app_icons", url && built ? { ...EMPTY_APP_ICONS, ...built } : null, {
                  shouldDirty: true,
                })
              }}
            />
            <Form.Hint>{t("brandingSettings.fields.faviconHint")}</Form.Hint>
          </Form.Item>
        )}
      />

      <div className="flex flex-col gap-y-2">
        <Text size="small" leading="compact" weight="plus">
          {t("brandingSettings.appIcons.preview")}
        </Text>
        <AppIconsPreview icons={icons} faviconUrl={faviconUrl} shopName={shopName} />
      </div>

      {master(
        "favicon_maskable",
        icons?.icon_maskable_512_url ?? null,
        t("brandingSettings.appIcons.maskable"),
        t("brandingSettings.appIcons.maskableZone")
      )}
      {master(
        "favicon_mono",
        icons?.mask_icon_url ?? null,
        t("brandingSettings.appIcons.mono"),
        t("brandingSettings.appIcons.monoZone"),
        ["image/svg+xml"]
      )}
    </>
  )
}

export { BrandingIconsEdit as Component }
