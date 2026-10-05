import { useDomains } from "./api/domains"
import { useTenantLocaleSettings } from "./api/locale-settings"

/**
 * The shop's public address, built the way the overview builds it (primary
 * host plus default locale). `null` while the host is unknown. Read by the top
 * bar's «Открыть магазин» and by the command menu's action of the same name.
 */
export const useShopUrl = (): string | null => {
  const { primary_host: primaryHost } = useDomains()
  const { locale_settings: localeSettings } = useTenantLocaleSettings()

  if (!primaryHost) {
    return null
  }
  return `https://${primaryHost}/${localeSettings?.default_locale ?? "ru"}`
}
