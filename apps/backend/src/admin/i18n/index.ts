import en from "./json/en.json";
import ru from "./json/ru.json";

// The dashboard deep-merges these resources over its own (@medusajs/dashboard
// 2.19.0, `populateI18n` in src/dashboard-app/dashboard-app.tsx), so a key here
// replaces the dashboard's text without touching the package.
//
// `login` is the sign-in page (t-2026-10-12-32 FX3): `login.title` is its
// heading and the first half of its tab title, `login.hint` the line below.
// The dashboard's own title is «Welcome to Medusa» in every language it ships.
//
// The tenants pages hardcode Russian strings directly (see
// .ai/progress-w7.md, decision "i18n"): this repo's admin locale is not
// guaranteed to be "ru", and a missing-key fallback renders the raw key —
// that would violate "Russian in the UI" harder than skipping useTranslation.
// The `tenants` keys of json/ru.json are registered so the same key set is
// ready once route-level i18n is adopted; they do not drive any rendered text.

export const BRAND = "Upready Store";

// Every language @medusajs/dashboard 2.19.0 ships (src/i18n/languages.ts). The
// brand takes no translation, so each gets it as is; en and ru also get their
// own hint from json/. src/admin/__tests__/login-brand.unit.spec.ts fails when
// the installed dashboard ships a language that is missing here.
export const DASHBOARD_LANGUAGES = [
  "ar", "bg", "bs", "cs", "de", "el", "en", "enGB", "es", "fa", "fr",
  "he", "hr", "hu", "id", "it", "ja", "ko", "lt", "mk", "mn", "nl",
  "pl", "ptBR", "ptPT", "ro", "ru", "th", "tr", "uk", "vi", "zhCN", "zhTW",
] as const;

export default {
  ...Object.fromEntries(
    DASHBOARD_LANGUAGES.map((code) => [code, { translation: { login: { title: BRAND } } }])
  ),
  en: {
    translation: en,
  },
  ru: {
    translation: ru,
  },
}
