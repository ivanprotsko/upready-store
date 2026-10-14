import { Hint, Input, Text } from "@medusajs/ui"
import { UseFormReturn, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../components/common/form"
import { SwitchBox } from "../../../components/common/switch-box"
import { SettingsEditDrawer } from "../../../components/settings"
import { useStore } from "../../../hooks/api/store"
import { ColorInput, HEX_COLOR } from "./color-input"
import { contrastIsLow } from "./contrast"
import { HeaderPreview } from "./header-preview"
import { type ColorValues, useColorEdit } from "./use-branding-edit"

// t-2026-10-14-01 (panel redesign, G1 part 4): drawer of «Цвет и подпись».
// Route `color/edit`. The contrast is checked here, before the save: the
// warning and the header preview stand under the field. The footer credit
// lives here too, because it is also «how the storefront looks».

const colorSchema = (messages: { invalidColor: string; creditTextNeeded: string }) =>
  zod
    .object({
      primary_color: zod
        .string()
        .trim()
        .refine((value) => value === "" || HEX_COLOR.test(value), messages.invalidColor),
      credit_enabled: zod.boolean(),
      credit_text: zod.string().max(200),
      credit_href: zod.string().max(2048),
    })
    // An enabled credit with no text used to be saved switched off without a
    // word; now the field says so (decide d-2026-10-14-189).
    .superRefine((values, ctx) => {
      if (values.credit_enabled && !values.credit_text.trim()) {
        ctx.addIssue({ code: "custom", path: ["credit_text"], message: messages.creditTextNeeded })
      }
    })

export const BrandingColorEdit = () => {
  const { t } = useTranslation()
  const { branding, saved, isPending, save } = useColorEdit()
  const { store } = useStore()

  const shopName = branding?.shop_name_short || store?.name || t("brandingSettings.previewShopName")

  return (
    <SettingsEditDrawer<ColorValues>
      title={t("brandingSettings.color.title")}
      description={t("brandingSettings.color.subtitle")}
      isPending={isPending}
      schema={colorSchema({
        invalidColor: t("brandingSettings.fields.primaryColorInvalid"),
        creditTextNeeded: t("brandingSettings.fields.footerCreditTextNeeded"),
      })}
      defaultValues={saved}
      onSubmit={save}
      successMessage={t("brandingSettings.saved")}
    >
      {(form) => (
        <ColorFields form={form} logoUrl={branding?.logo_light_url ?? null} shopName={shopName} />
      )}
    </SettingsEditDrawer>
  )
}

const ColorFields = ({
  form,
  logoUrl,
  shopName,
}: {
  form: UseFormReturn<ColorValues>
  logoUrl: string | null
  shopName: string
}) => {
  const { t } = useTranslation()
  const [color, creditEnabled] = useWatch({ control: form.control, name: ["primary_color", "credit_enabled"] })

  // Client-side mirror of the platform's contrast check (`api/tenants/branding/contrast.ts`):
  // the drawer warns as the owner types; the colour is saved as it is all the same (never
  // silently override the owner's choice), and the platform's answer stays the source of truth.
  const lowContrast = HEX_COLOR.test(color) && contrastIsLow(color)

  return (
    <>
      <div className="flex flex-col gap-y-4">
        <Form.Field
          control={form.control}
          name="primary_color"
          render={({ field }) => (
            <Form.Item>
              <Form.Label>{t("brandingSettings.fields.primaryColor")}</Form.Label>
              <Form.Control>
                <ColorInput {...field} />
              </Form.Control>
              <Form.ErrorMessage />
              {lowContrast ? (
                <Hint variant="error" data-testid="branding-low-contrast">
                  {t("brandingSettings.fields.lowContrast")}
                </Hint>
              ) : null}
            </Form.Item>
          )}
        />
        <div className="flex flex-col gap-y-2">
          <Text size="small" leading="compact" weight="plus">
            {t("brandingSettings.preview")}
          </Text>
          <HeaderPreview logoUrl={logoUrl} name={shopName} color={color} />
        </div>
      </div>

      <div className="flex flex-col gap-y-4">
        <SwitchBox
          control={form.control}
          name="credit_enabled"
          label={t("brandingSettings.fields.footerCreditEnabled")}
          description={t("brandingSettings.fields.footerCreditDescription")}
        />
        {creditEnabled ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Form.Field
              control={form.control}
              name="credit_text"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>{t("brandingSettings.fields.footerCreditText")}</Form.Label>
                  <Form.Control>
                    <Input {...field} autoComplete="off" maxLength={200} />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            <Form.Field
              control={form.control}
              name="credit_href"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label optional>{t("brandingSettings.fields.footerCreditHref")}</Form.Label>
                  <Form.Control>
                    <Input {...field} autoComplete="off" placeholder="https://" className="font-mono" />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
          </div>
        ) : null}
      </div>
    </>
  )
}

export { BrandingColorEdit as Component }
