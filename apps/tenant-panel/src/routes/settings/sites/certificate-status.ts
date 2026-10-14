import { useTranslation } from "react-i18next"

import type { SettingsStatus } from "../../../components/settings"
import { useDate } from "../../../hooks/use-date"
import type { SiteCertificate, TenantSite } from "../../../hooks/api/sites"

// t-2026-10-14-01 (panel redesign, G2): one word for a host's certificate on
// the three screens that show it, the sites list, the site card and «Адрес
// магазина». The three states are the live probe of `GET /tenants/sites`
// (`tenant-sites/certificate.ts`); the date goes through `getFullDate`
// (design-system rule 14).

export const useCertificateStatus = () => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()

  /**
   * `short` drops the word «Сертификат» for the list column that is already
   * called «Сертификат»: «Действует до 1 янв. 2027».
   */
  return (certificate: SiteCertificate, { short = false } = {}): SettingsStatus => {
    if (certificate.status === "valid") {
      const date = certificate.valid_to ? getFullDate({ date: certificate.valid_to }) : ""
      if (!date) {
        return { color: "green", label: t("sites.certificate.valid") }
      }
      return {
        color: "green",
        label: short
          ? t("sites.certificate.activeUntil", { date })
          : t("sites.certificate.validUntil", { date }),
      }
    }

    return {
      color: certificate.status === "invalid" ? "orange" : "grey",
      label: t(`sites.certificate.${certificate.status}`),
    }
  }
}

/**
 * The certificate a site is found under: its main domain's when the main
 * address is a domain of its own, else the platform's wildcard one, which
 * covers every `<handle>.<platform domain>` address.
 */
export const primaryCertificate = (site: TenantSite): SiteCertificate | null =>
  site.domains.find((domain) => domain.is_primary)?.certificate ?? null
