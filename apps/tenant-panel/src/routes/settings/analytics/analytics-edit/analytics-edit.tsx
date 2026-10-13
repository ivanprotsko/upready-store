import { Input } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../../components/common/form"
import { SettingsEditDrawer } from "../../../../components/settings"
import {
  useTenantAnalytics,
  useUpdateTenantAnalytics,
} from "../../../../hooks/api/analytics-settings"

// t-2026-10-14-01 (panel redesign, G1): the two id fields that used to stand
// on `/settings/analytics` itself, now in the drawer of its «…» → «Изменить».
// The platform checks both ids; its refusal is the toast the owner reads.

const AnalyticsSchema = zod.object({
  yandex_metrica_id: zod.string().trim(),
  ga4_measurement_id: zod.string().trim(),
})

export const AnalyticsEdit = () => {
  const { t } = useTranslation()
  const { analytics, isPending, isError, error } = useTenantAnalytics()
  const { mutateAsync } = useUpdateTenantAnalytics()

  if (isError) {
    throw error
  }

  return (
    <SettingsEditDrawer
      title={t("analyticsSettings.title")}
      isPending={isPending}
      schema={AnalyticsSchema}
      defaultValues={{
        yandex_metrica_id: analytics?.yandex_metrica_id ?? "",
        ga4_measurement_id: analytics?.ga4_measurement_id ?? "",
      }}
      onSubmit={(values) => mutateAsync(values)}
      successMessage={t("analyticsSettings.saved")}
    >
      {(form) => (
        <>
          <Form.Field
            control={form.control}
            name="yandex_metrica_id"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t("analyticsSettings.yandexMetrica.label")}</Form.Label>
                <Form.Control>
                  <Input
                    {...field}
                    autoComplete="off"
                    inputMode="numeric"
                    placeholder="12345678"
                    className="font-mono"
                  />
                </Form.Control>
                <Form.Hint>{t("analyticsSettings.yandexMetrica.hint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <Form.Field
            control={form.control}
            name="ga4_measurement_id"
            render={({ field: { onChange, ...field } }) => (
              <Form.Item>
                <Form.Label>{t("analyticsSettings.ga4.label")}</Form.Label>
                <Form.Control>
                  <Input
                    {...field}
                    onChange={(event) => onChange(event.target.value.toUpperCase())}
                    autoComplete="off"
                    placeholder="G-XXXXXXXXXX"
                    className="font-mono"
                  />
                </Form.Control>
                <Form.Hint>{t("analyticsSettings.ga4.hint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
        </>
      )}
    </SettingsEditDrawer>
  )
}
