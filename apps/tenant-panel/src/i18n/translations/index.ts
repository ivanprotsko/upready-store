import en from "./en.json"
import ru from "./ru.json"

// tenant-panel: the Admin's index.ts imports and re-exports 34 locales. The
// panel ships only English and Russian (piece-1 prompt, item 9).
export default {
  en: {
    translation: en,
  },
  ru: {
    translation: ru,
  },
}
