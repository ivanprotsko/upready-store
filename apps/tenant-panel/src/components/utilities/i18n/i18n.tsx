import i18n from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import { initReactI18next } from "react-i18next"

import { defaultI18nOptions } from "../../../i18n/config"
import translations from "../../../i18n/translations"

// tenant-panel: the Admin's `getI18nResources()` (from `useExtension`) merges
// the local translation catalogs with whatever extensions register. The panel
// has no extensions, so this uses its own two-locale `translations` module
// (en, ru) directly.
export const I18n = () => {
  if (i18n.isInitialized) {
    return null
  }

  i18n
    .use(
      new LanguageDetector(null, {
        lookupCookie: "lng",
        lookupLocalStorage: "lng",
      })
    )
    .use(initReactI18next)
    .init({
      ...defaultI18nOptions,
      resources: translations,
      supportedLngs: Object.keys(translations),
    })

  return null
}

export { i18n }
