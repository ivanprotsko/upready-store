import { useTranslation } from "react-i18next"

import { SettingsDetail } from "../../../components/settings"
import { useTenantLoginSettings } from "../../../hooks/api/login-settings"

/**
 * «Вход покупателей» (o25-login-methods): the shop chooses whether its
 * storefront buyers sign in with email and password, Yandex ID, or either.
 *
 * t-2026-10-14-01 (panel redesign, G1): the screen only reads — the chosen
 * method with its description, and whether this DEPLOYMENT has Yandex ID keys
 * at all (`yandex_platform_available`, read from the backend, the only place
 * that knows `YANDEX_CLIENT_ID`). The choice itself is made in
 * `customer-login-edit` («…» → «Изменить»).
 */
export const CustomerLogin = () => {
  const { t } = useTranslation()
  const { login_settings: saved, isPending, isError, error } = useTenantLoginSettings()

  if (isError) {
    throw error
  }

  const method = saved?.method ?? "both"
  const yandexAvailable = saved?.yandex_platform_available ?? false

  return (
    <SettingsDetail
      isPending={isPending}
      sections={[
        {
          id: "customer-login",
          title: t("customerLogin.title"),
          description: t("customerLogin.subtitle"),
          rows: [
            {
              id: "method",
              label: t("customerLogin.method"),
              value: t(`customerLogin.options.${method}.label`),
              hint: t(`customerLogin.options.${method}.description`),
            },
            {
              id: "yandex",
              label: t("customerLogin.yandex.title"),
              status: yandexAvailable
                ? { color: "green", label: t("customerLogin.yandex.on") }
                : { color: "grey", label: t("customerLogin.yandex.off") },
              hint: yandexAvailable ? undefined : t("customerLogin.yandex.offHint"),
            },
          ],
        },
      ]}
    />
  )
}
