import { Badge } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SettingsDetail } from "../../../components/settings"
import { getCountryByIso2 } from "../../../lib/data/countries"
import {
  useTenantLocaleSettings,
  type TenantLocaleSettingsDocument,
} from "../../../hooks/api/locale-settings"
import { LOCALE_CODES, LOCALE_LABELS } from "../../../lib/locale-catalog"

// What the storefront uses while the shop has saved nothing; the read page
// shows it and the drawer opens on it.
export const DEFAULT_DOCUMENT: TenantLocaleSettingsDocument = {
  default_locale: "ru",
  enabled_locales: ["ru", "en"],
  default_country: null,
}

// t06-locale-currency: no Admin counterpart. Which of the storefront's 36
// locales this shop offers, its default, and the country its default prices
// in — the owner's own pick, replacing the build's shared
// STOREFRONT_DEFAULT_LOCALE/LOCALE_PIN/LOCALE_COUNTRY_MAP for this one shop.
//
// t-2026-10-14-01 (panel redesign, G1): the screen only reads, three rows of
// one section; the three fields are edited in `locale-edit` («…» → «Изменить»).
export const LocaleSettings = () => {
  const { t } = useTranslation()
  const { locale_settings: saved, isPending, isError, error } = useTenantLocaleSettings()

  if (isError) {
    throw error
  }

  // Nothing saved yet reads as the defaults the storefront actually uses.
  const doc = saved ?? DEFAULT_DOCUMENT
  const country = getCountryByIso2(doc.default_country)

  return (
    <SettingsDetail
      isPending={isPending}
      sections={[
        {
          id: "locale",
          title: t("localeSettings.title"),
          description: t("localeSettings.subtitle"),
          rows: [
            {
              id: "enabled-locales",
              label: t("localeSettings.enabledLocales"),
              value: (
                <div className="flex flex-wrap gap-1">
                  {doc.enabled_locales.map((code) => (
                    <Badge key={code} size="2xsmall">
                      {LOCALE_LABELS[code]}
                    </Badge>
                  ))}
                </div>
              ),
              hint: t("localeSettings.enabledLocalesHint", {
                count: LOCALE_CODES.length - doc.enabled_locales.length,
              }),
            },
            {
              id: "default-locale",
              label: t("localeSettings.defaultLocale"),
              value: LOCALE_LABELS[doc.default_locale],
              hint: t("localeSettings.defaultLocaleHint"),
            },
            {
              id: "default-country",
              label: t("localeSettings.defaultCountry"),
              value: country?.display_name ?? null,
              hint: country
                ? t("localeSettings.defaultCountrySetHint")
                : t("localeSettings.defaultCountryEmptyHint"),
            },
          ],
        },
      ]}
    />
  )
}
