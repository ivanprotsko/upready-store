import { enUS, ru } from "date-fns/locale"
import { Language } from "./types"

// tenant-panel: the Admin's languages.ts lists 33 languages with their
// date-fns locales. The panel ships only English and Russian (piece-1
// prompt, item 9); `I18nProvider`/`i18n-provider.tsx` falls back to
// `languages[0]` when the detected locale isn't in this list, so English
// stays first.
export const languages: Language[] = [
  {
    code: "en",
    display_name: "English",
    ltr: true,
    date_locale: enUS,
  },
  {
    code: "ru",
    display_name: "Русский",
    ltr: true,
    date_locale: ru,
  },
]
