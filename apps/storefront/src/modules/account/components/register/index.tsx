"use client"

import { useActionState } from "react"
import { PASSWORD_MIN_LENGTH } from "@lib/util/password"
import Input from "@modules/common/components/input"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { Link } from "@i18n/navigation"
import { signup } from "@lib/data/customer"
import { consentHref, type LegalLinkContext } from "@lib/util/legal-links"
import { useTranslations } from "next-intl"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
  /** From the server page, through `LoginTemplate` — see the note there (rule 19g). */
  siteName: string
  /** Same journey as `siteName`, for the same reason (f05-checkout-legal-stubs). */
  legal: LegalLinkContext
}

const Register = ({ setCurrentView, siteName, legal }: Props) => {
  const t = useTranslations("Register")
  // The signup consent sentence, like the checkout one: the shop's own
  // documents, the contract as the fallback, plain words rather than a link to
  // the starter's placeholder when the shop has written neither.
  const privacyLink = consentHref("privacy", legal)
  // The sentence says "Условиями использования", so it is the usage-terms slot
  // (b14-pages-legal-content); a shop without that page still falls back to the
  // contract inside `consentHref`.
  const termsLink = consentHref("termsOfUse", legal)
  const [message, formAction] = useActionState(signup as (state: string | null, formData: FormData) => Promise<string | null>, null as string | null)

  return (
    <div
      className="max-w-sm flex flex-col items-center"
      data-testid="register-page"
    >
      <h1 className="text-large-semi uppercase mb-6">
        {t("heading", { siteName: siteName })}
      </h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-4">
        {t("description", { siteName: siteName })}
      </p>
      <form className="w-full flex flex-col" action={formAction}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label={t("firstName")}
            name="first_name"
            required
            autoComplete="given-name"
            data-testid="first-name-input"
          />
          <Input
            label={t("lastName")}
            name="last_name"
            required
            autoComplete="family-name"
            data-testid="last-name-input"
          />
          <Input
            label={t("email")}
            name="email"
            required
            type="email"
            autoComplete="email"
            data-testid="email-input"
          />
          <Input
            label={t("phone")}
            name="phone"
            type="tel"
            autoComplete="tel"
            data-testid="phone-input"
          />
          <Input
            label={t("password")}
            name="password"
            required
            type="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            data-testid="password-input"
          />
        </div>
        <ErrorMessage error={message} data-testid="register-error" />
        <span className="text-center text-ui-fg-base text-small-regular mt-6">
          {t("agreeText", { siteName: siteName })}{" "}
          {privacyLink ? (
            <Link href={privacyLink} className="underline">
              {t("privacyPolicy")}
            </Link>
          ) : (
            t("privacyPolicy")
          )}{" "}
          {t("and")}{" "}
          {termsLink ? (
            <Link href={termsLink} className="underline">
              {t("termsOfUse")}
            </Link>
          ) : (
            t("termsOfUse")
          )}
          .
        </span>
        <SubmitButton className="w-full mt-6" data-testid="register-button">
          {t("join")}
        </SubmitButton>
      </form>
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        {t("alreadyMember")}{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
          className="underline"
        >
          {t("signIn")}
        </button>
        .
      </span>
    </div>
  )
}

export default Register
