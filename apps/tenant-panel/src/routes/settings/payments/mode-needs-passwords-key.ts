/**
 * The text a Robokassa save refusal («не хватает паролей») uses. On the
 * Robokassa integration page the password fields are in front of the owner,
 * so the text points at the form on that page; «Приём оплат» renders no
 * password fields and sends the owner to the Robokassa page instead (46df).
 * Plain TS with no imports, so `src/__tests__` runs it for real.
 */
export const modeNeedsPasswordsKey = (isTest: boolean, credentialsOnPage: boolean) =>
  credentialsOnPage
    ? isTest
      ? ("paymentSettings.modeNeedsPasswords.testHere" as const)
      : ("paymentSettings.modeNeedsPasswords.liveHere" as const)
    : isTest
      ? ("paymentSettings.modeNeedsPasswords.test" as const)
      : ("paymentSettings.modeNeedsPasswords.live" as const)
