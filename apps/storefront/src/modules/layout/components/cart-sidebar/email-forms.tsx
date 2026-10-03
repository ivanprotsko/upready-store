"use client"

import { Button } from "@medusajs/ui"
import { useTranslations } from "next-intl"
import { useActionState, useRef, useState } from "react"

import { Link } from "@i18n/navigation"
import { login, signup } from "@lib/data/customer"
import { consentHref, type LegalLinkContext } from "@lib/util/legal-links"
import { PASSWORD_MIN_LENGTH } from "@lib/util/password"
import { readWishlistStorage } from "@lib/util/wishlist-storage"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"

type Props = {
  /** The id «По эл. почте» points its `aria-controls` at. */
  id: string
  /** The page the sidebar is open on: both actions redirect back to it on success. */
  returnTo: string
  siteName: string
  legal: LegalLinkContext
}

/**
 * The e-mail sign-in and sign-up inside the cart sidebar (t-2026-10-03-64, Ivan: «…или
 * переключения на регистрацию (которая должна там же появится, а кнопка "регистрация"
 * заменится на "войти", чтобы вернуться обратно»).
 *
 * The forms are the account page's own (`modules/account/components/login`,
 * `…/register`), submitted to the same server actions with the same fields: `login` and
 * `signup` set the session, move this cart onto the customer, merge the guest wishlist
 * and redirect to `returnTo`, the page the sidebar is open on. The pathname does not
 * change, so the sidebar stays open (`./context.tsx` closes it on navigation only) and
 * renders again for a signed-in buyer: the sign-in block goes, the cart stays.
 *
 * The second button of the pair swaps the form in place: «Регистрация» under the sign-in
 * form, «Войти» under the sign-up form.
 */
export default function CartSidebarEmailForms(props: Props) {
  const [view, setView] = useState<"signIn" | "register">("signIn")

  return view === "signIn" ? (
    <SignInForm {...props} onSwitch={() => setView("register")} />
  ) : (
    <RegisterForm {...props} onSwitch={() => setView("signIn")} />
  )
}

/** The guest wishlist, read just before the native submit reaches the action (t-cherk-32). */
function useWishlistField() {
  const ref = useRef<HTMLInputElement>(null)
  const fill = () => {
    if (ref.current) {
      ref.current.value = JSON.stringify(readWishlistStorage(window.localStorage))
    }
  }
  return { ref, fill }
}

function SignInForm({ id, returnTo, onSwitch }: Props & { onSwitch: () => void }) {
  const t = useTranslations("Login")
  const tSide = useTranslations("CartSidebar")
  const [message, formAction] = useActionState(login, null)
  const wishlist = useWishlistField()

  return (
    <form
      id={id}
      className="flex flex-col gap-y-2"
      action={formAction}
      onSubmit={wishlist.fill}
      data-testid="cart-sidebar-sign-in-form"
    >
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="wishlist_product_ids" ref={wishlist.ref} />
      <Input
        label={t("email")}
        name="email"
        type="email"
        title={t("emailTitle")}
        autoComplete="email"
        required
        autoFocus
        data-testid="cart-sidebar-email-input"
      />
      <Input
        label={t("password")}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        data-testid="cart-sidebar-password-input"
      />
      <ErrorMessage error={message} data-testid="cart-sidebar-sign-in-error" />
      <div className="grid grid-cols-2 gap-3 pt-1" data-testid="cart-sidebar-auth-actions">
        <SubmitButton size="base" className="w-full min-w-0" data-testid="cart-sidebar-sign-in-submit">
          {t("signIn")}
        </SubmitButton>
        <Button
          type="button"
          variant="secondary"
          size="base"
          className="w-full min-w-0"
          onClick={onSwitch}
          data-testid="cart-sidebar-auth-switch"
        >
          {tSide("register")}
        </Button>
      </div>
    </form>
  )
}

function RegisterForm({ id, returnTo, siteName, legal, onSwitch }: Props & { onSwitch: () => void }) {
  const t = useTranslations("Register")
  // The same cast as `modules/account/components/register`: `signup` is typed for the
  // account page's own call site.
  const [message, formAction] = useActionState(
    signup as (state: string | null, formData: FormData) => Promise<string | null>,
    null as string | null
  )
  const wishlist = useWishlistField()
  // The account page's consent sentence, with the same links (`consentHref`).
  const privacyLink = consentHref("privacy", legal)
  const termsLink = consentHref("termsOfUse", legal)

  return (
    <form
      id={id}
      className="flex flex-col gap-y-2"
      action={formAction}
      onSubmit={wishlist.fill}
      data-testid="cart-sidebar-register-form"
    >
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="wishlist_product_ids" ref={wishlist.ref} />
      <div className="grid grid-cols-2 gap-2">
        <Input
          label={t("firstName")}
          name="first_name"
          required
          autoComplete="given-name"
          autoFocus
          data-testid="cart-sidebar-first-name-input"
        />
        <Input
          label={t("lastName")}
          name="last_name"
          required
          autoComplete="family-name"
          data-testid="cart-sidebar-last-name-input"
        />
      </div>
      <Input
        label={t("email")}
        name="email"
        type="email"
        required
        autoComplete="email"
        data-testid="cart-sidebar-email-input"
      />
      <Input label={t("phone")} name="phone" type="tel" autoComplete="tel" data-testid="cart-sidebar-phone-input" />
      <Input
        label={t("password")}
        name="password"
        type="password"
        required
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        data-testid="cart-sidebar-password-input"
      />
      <ErrorMessage error={message} data-testid="cart-sidebar-register-error" />
      <p className="text-ui-fg-subtle text-small-regular">
        {t("agreeText", { siteName })}{" "}
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
      </p>
      <div className="grid grid-cols-2 gap-3 pt-1" data-testid="cart-sidebar-auth-actions">
        <SubmitButton size="base" className="w-full min-w-0" data-testid="cart-sidebar-register-submit">
          {t("join")}
        </SubmitButton>
        <Button
          type="button"
          variant="secondary"
          size="base"
          className="w-full min-w-0"
          onClick={onSwitch}
          data-testid="cart-sidebar-auth-switch"
        >
          {t("signIn")}
        </Button>
      </div>
    </form>
  )
}
