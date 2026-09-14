import ru from "./json/ru.json";

// The tenants pages hardcode Russian strings directly (see
// .ai/progress-w7.md, decision "i18n"): this repo's admin locale is not
// guaranteed to be "ru", and a missing-key fallback renders the raw key —
// that would violate "Russian in the UI" harder than skipping useTranslation.
// This resource is registered so the same key set is ready once route-level
// i18n is adopted; it does not currently drive any rendered text.
export default {
  ru: {
    translation: ru,
  },
}