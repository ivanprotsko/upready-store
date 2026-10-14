import type { TFunction } from "i18next"

/**
 * The text a Robokassa save refusal («не хватает паролей») uses. On the
 * Robokassa integration page the password fields are in front of the owner,
 * so the text points at the form on that page; «Приём оплат» renders no
 * password fields and sends the owner to the Robokassa page instead (46df).
 * Plain TS with type-only imports, so `src/__tests__` runs it for real.
 */
export const modeNeedsPasswordsKey = (isTest: boolean, credentialsOnPage: boolean) =>
  credentialsOnPage
    ? isTest
      ? ("paymentSettings.modeNeedsPasswords.testHere" as const)
      : ("paymentSettings.modeNeedsPasswords.liveHere" as const)
    : isTest
      ? ("paymentSettings.modeNeedsPasswords.test" as const)
      : ("paymentSettings.modeNeedsPasswords.live" as const)

type Translate = TFunction<"translation">

const MODE_PASSWORD_FIELDS = ["test_password1", "test_password2", "password1", "password2"]

/** «Для тестового режима не хватает: Тестовый пароль #1, …» in the panel's language. */
export const modeNeedsPasswordsText = (
  t: Translate,
  isTest: boolean,
  fields: string[],
  credentialsOnPage: boolean
) =>
  t(modeNeedsPasswordsKey(isTest, credentialsOnPage), {
    fields: fields.map((field) => t(`paymentSettings.fields.${field}`)).join(", "),
  })

const SERVER_MODE_ERROR = /^(Test|Live) mode needs (.+) before it can be enabled\.$/

/**
 * The API answers in English; the one refusal an owner meets in normal use
 * («Test mode needs test_password1 before it can be enabled.») is said in the
 * panel's language, anything else is passed through as is. Shared by the
 * Robokassa form and the Robokassa behaviour drawer (t-2026-10-14-01, G3).
 */
export const robokassaSaveErrorText = (t: Translate, message: string, credentialsOnPage: boolean) => {
  const match = SERVER_MODE_ERROR.exec(message)
  if (!match) {
    return message
  }
  const fields = match[2].split(" and ").filter((field) => MODE_PASSWORD_FIELDS.includes(field))
  return modeNeedsPasswordsText(t, match[1] === "Test", fields, credentialsOnPage)
}
