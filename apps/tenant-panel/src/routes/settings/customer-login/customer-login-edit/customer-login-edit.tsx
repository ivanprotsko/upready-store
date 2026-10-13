import { Hint, RadioGroup } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../../components/common/form"
import { SettingsEditDrawer } from "../../../../components/settings"
import {
  useTenantLoginSettings,
  useUpdateTenantLoginSettings,
} from "../../../../hooks/api/login-settings"

// t-2026-10-14-01 (panel redesign, G1): the three methods that used to stand
// on `/settings/customer-login` itself, now in the drawer of its «…».
//
// The two Yandex-inclusive options are disabled, with an honest hint,
// whenever this DEPLOYMENT has no Yandex ID keys at all
// (`yandex_platform_available`). A shop cannot turn on a sign-in method that
// cannot possibly work, and the radio's own semantics — exactly one method
// always selected — keeps "zero methods" from ever being representable here.

const METHODS = ["email", "yandex", "both"] as const

const CustomerLoginSchema = zod.object({
  method: zod.enum(METHODS),
})

export const CustomerLoginEdit = () => {
  const { t } = useTranslation()
  const { login_settings: saved, isPending, isError, error } = useTenantLoginSettings()
  const { mutateAsync } = useUpdateTenantLoginSettings()

  if (isError) {
    throw error
  }

  const yandexAvailable = saved?.yandex_platform_available ?? false

  return (
    <SettingsEditDrawer
      title={t("customerLogin.title")}
      isPending={isPending}
      schema={CustomerLoginSchema}
      defaultValues={{ method: saved?.method ?? "both" }}
      onSubmit={(values) => mutateAsync(values)}
      successMessage={t("customerLogin.saved")}
    >
      {(form) => (
        <>
          <Form.Field
            control={form.control}
            name="method"
            render={({ field: { value, onChange, ref, ...field } }) => (
              <Form.Item>
                <Form.Control>
                  <RadioGroup
                    {...field}
                    ref={ref}
                    value={value}
                    onValueChange={onChange}
                    className="flex flex-col gap-y-3"
                  >
                    {METHODS.map((option) => (
                      <RadioGroup.ChoiceBox
                        key={option}
                        value={option}
                        disabled={option !== "email" && !yandexAvailable}
                        label={t(`customerLogin.options.${option}.label`)}
                        description={t(`customerLogin.options.${option}.description`)}
                      />
                    ))}
                  </RadioGroup>
                </Form.Control>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          {!yandexAvailable ? (
            <Hint variant="info">{t("customerLogin.yandexUnavailableHint")}</Hint>
          ) : null}
        </>
      )}
    </SettingsEditDrawer>
  )
}
