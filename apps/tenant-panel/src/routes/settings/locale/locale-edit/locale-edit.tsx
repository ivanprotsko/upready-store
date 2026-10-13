import { Select } from "@medusajs/ui"
import { useEffect } from "react"
import { UseFormReturn, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../../components/common/form"
import { Combobox } from "../../../../components/inputs/combobox"
import { CountrySelect } from "../../../../components/inputs/country-select"
import { SettingsEditDrawer } from "../../../../components/settings"
import {
  useTenantLocaleSettings,
  useUpdateTenantLocaleSettings,
} from "../../../../hooks/api/locale-settings"
import {
  LOCALE_CODES,
  LOCALE_LABELS,
  localeOptions,
  type LocaleCode,
} from "../../../../lib/locale-catalog"
import { DEFAULT_DOCUMENT } from "../locale"

// t-2026-10-14-01 (panel redesign, G1): the three fields that used to stand on
// `/settings/locale` itself, now in the drawer of its «…» → «Изменить».

const buildSchema = (needsOneLocale: string) =>
  zod.object({
    enabled_locales: zod.array(zod.enum(LOCALE_CODES)).min(1, { message: needsOneLocale }),
    default_locale: zod.enum(LOCALE_CODES),
    default_country: zod.string().nullable(),
  })

type LocaleForm = zod.infer<ReturnType<typeof buildSchema>>

const LocaleFields = ({ form }: { form: UseFormReturn<LocaleForm> }) => {
  const { t } = useTranslation()
  const enabled = useWatch({ control: form.control, name: "enabled_locales" })
  const defaultLocale = useWatch({ control: form.control, name: "default_locale" })

  // The default is always a member of the enabled set: dropping it from the
  // multi-select falls back to whichever enabled locale is now first, rather
  // than saving a document the backend would refuse.
  useEffect(() => {
    if (enabled.length && !enabled.includes(defaultLocale)) {
      form.setValue("default_locale", enabled[0], { shouldDirty: true })
    }
  }, [enabled, defaultLocale, form])

  return (
    <>
      <Form.Field
        control={form.control}
        name="enabled_locales"
        render={({ field: { value, onChange, ...field } }) => (
          <Form.Item>
            <Form.Label>{t("localeSettings.enabledLocales")}</Form.Label>
            <Form.Control>
              <Combobox
                {...field}
                value={value}
                onChange={(next) => onChange((next ?? []) as LocaleCode[])}
                options={localeOptions}
                displayMode="chips"
                placeholder={t("localeSettings.enabledLocalesPlaceholder")}
              />
            </Form.Control>
            <Form.Hint>
              {t("localeSettings.enabledLocalesHint", {
                count: LOCALE_CODES.length - value.length,
              })}
            </Form.Hint>
            <Form.ErrorMessage />
          </Form.Item>
        )}
      />
      <Form.Field
        control={form.control}
        name="default_locale"
        render={({ field: { value, onChange, ref, ...field } }) => (
          <Form.Item>
            <Form.Label>{t("localeSettings.defaultLocale")}</Form.Label>
            <Form.Control>
              <Select
                {...field}
                value={value}
                onValueChange={(next) => onChange(next as LocaleCode)}
                disabled={enabled.length === 0}
              >
                <Select.Trigger ref={ref} data-testid="default-locale">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {enabled.map((code) => (
                    <Select.Item key={code} value={code}>
                      {LOCALE_LABELS[code]}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </Form.Control>
            <Form.Hint>{t("localeSettings.defaultLocaleHint")}</Form.Hint>
            <Form.ErrorMessage />
          </Form.Item>
        )}
      />
      <Form.Field
        control={form.control}
        name="default_country"
        render={({ field: { value, onChange, ...field } }) => (
          <Form.Item>
            <Form.Label optional>{t("localeSettings.defaultCountry")}</Form.Label>
            <Form.Control>
              <CountrySelect
                {...field}
                value={value ?? undefined}
                onChange={(next) => onChange(next || null)}
                placeholder={t("localeSettings.defaultCountryPlaceholder")}
                allowClear
              />
            </Form.Control>
            <Form.Hint>{t("localeSettings.defaultCountryHint")}</Form.Hint>
            <Form.ErrorMessage />
          </Form.Item>
        )}
      />
    </>
  )
}

export const LocaleEdit = () => {
  const { t } = useTranslation()
  const { locale_settings: saved, isPending, isError, error } = useTenantLocaleSettings()
  const { mutateAsync } = useUpdateTenantLocaleSettings()

  if (isError) {
    throw error
  }

  const doc = saved ?? DEFAULT_DOCUMENT

  return (
    <SettingsEditDrawer
      title={t("localeSettings.title")}
      isPending={isPending}
      schema={buildSchema(t("localeSettings.needsOneLocale"))}
      defaultValues={{
        enabled_locales: doc.enabled_locales,
        default_locale: doc.default_locale,
        default_country: doc.default_country,
      }}
      onSubmit={(values) => mutateAsync(values)}
      successMessage={t("localeSettings.saved")}
    >
      {(form) => <LocaleFields form={form} />}
    </SettingsEditDrawer>
  )
}
