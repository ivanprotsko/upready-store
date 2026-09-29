import i18n from "i18next"

/**
 * The panel's own language as an `Intl` locale, for money as well as dates
 * (U-07, 46df UX audit). Money used to take the browser's language: an en-US
 * browser on a Russian panel showed «₽1,644.01» next to «30 сент. 2026 г.».
 * `undefined` before i18next has a language, which is the browser's default.
 */
export const panelLocale = (): string | undefined => i18n.language || undefined
