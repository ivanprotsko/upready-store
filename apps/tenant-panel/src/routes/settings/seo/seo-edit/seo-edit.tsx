import { Hint, Input } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../../components/common/form"
import { SettingsEditDrawer } from "../../../../components/settings"
import {
  useTenantSeoVerification,
  useUpdateTenantSeoVerification,
} from "../../../../hooks/api/seo-verification"

// t-2026-10-14-01 (panel redesign, G1): the two code fields that used to stand
// on `/settings/seo` itself, now in the drawer of its «…» → «Изменить».

const SeoVerificationSchema = zod.object({
  yandex: zod.string().trim(),
  google: zod.string().trim(),
})

export const SeoVerificationEdit = () => {
  const { t } = useTranslation()
  const { seo_verification: saved, isPending, isError, error } = useTenantSeoVerification()
  const { mutateAsync } = useUpdateTenantSeoVerification()

  if (isError) {
    throw error
  }

  return (
    <SettingsEditDrawer
      title={t("seoVerification.title")}
      isPending={isPending}
      schema={SeoVerificationSchema}
      defaultValues={{ yandex: saved?.yandex ?? "", google: saved?.google ?? "" }}
      onSubmit={(values) => mutateAsync(values)}
      successMessage={t("seoVerification.saved")}
    >
      {(form) => (
        <>
          <Form.Field
            control={form.control}
            name="yandex"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t("seoVerification.yandex.label")}</Form.Label>
                <Form.Control>
                  <Input
                    {...field}
                    autoComplete="off"
                    placeholder="a1b2c3d4e5f60718"
                    className="font-mono"
                  />
                </Form.Control>
                <Form.Hint>{t("seoVerification.yandex.hint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <Form.Field
            control={form.control}
            name="google"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t("seoVerification.google.label")}</Form.Label>
                <Form.Control>
                  <Input
                    {...field}
                    autoComplete="off"
                    placeholder="QWErty1234567890abcdefGH_ijklMNOpqrs"
                    className="font-mono"
                  />
                </Form.Control>
                <Form.Hint>{t("seoVerification.google.hint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <Hint variant="info">{t("seoVerification.hint")}</Hint>
        </>
      )}
    </SettingsEditDrawer>
  )
}
