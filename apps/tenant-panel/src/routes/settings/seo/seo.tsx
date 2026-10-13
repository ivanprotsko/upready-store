import { useTranslation } from "react-i18next"

import { SettingsDetail, type SettingsStatus } from "../../../components/settings"
import { useTenantSeoVerification } from "../../../hooks/api/seo-verification"

// b10-panel-gaps: the two search-console ownership codes. `PUT
// /tenants/seo-verification` shipped with t11-seo-redirects and the owner had
// nowhere to paste a code, so the storefront's `<head>` never carried one.
//
// t-2026-10-14-01 (panel redesign, G1): the screen only reads. A saved code
// carries the «на всех страницах» badge (it is in the storefront `<head>`), an
// empty one says what to paste; both are edited in `seo-edit` («…» → «Изменить»).
export const SeoVerification = () => {
  const { t } = useTranslation()
  const { seo_verification: saved, isPending, isError, error } = useTenantSeoVerification()

  if (isError) {
    throw error
  }

  const live: SettingsStatus = { color: "green", label: t("seoVerification.live") }

  return (
    <SettingsDetail
      isPending={isPending}
      sections={[
        {
          id: "seo",
          title: t("seoVerification.title"),
          description: t("seoVerification.subtitle"),
          rows: [
            {
              id: "yandex",
              label: t("seoVerification.yandex.label"),
              value: saved?.yandex || null,
              mono: true,
              status: saved?.yandex ? live : undefined,
              hint: saved?.yandex ? undefined : t("seoVerification.yandex.emptyHint"),
            },
            {
              id: "google",
              label: t("seoVerification.google.label"),
              value: saved?.google || null,
              mono: true,
              status: saved?.google ? live : undefined,
              hint: saved?.google ? undefined : t("seoVerification.google.emptyHint"),
            },
          ],
        },
      ]}
    />
  )
}
