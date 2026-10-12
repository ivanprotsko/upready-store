"use client"

import { CheckMini } from "@medusajs/icons"
import { useTranslations } from "next-intl"

import { signedInText } from "@lib/util/customer-avatar"
import LogIn from "@modules/common/icons/log-in"
import AccountLink from "@modules/layout/components/account-link"

type Customer = {
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  metadata?: Record<string, unknown> | null
}

type Props = {
  /** The signed-in buyer, or null for a guest. */
  customer: Customer | null
}

/**
 * «Вход в личный кабинет», the first step of the checkout form (t-2026-10-12-05, Ivan 12.10 items
 * 6.4 and 6.4.1: «шаг с авторизацией нужно показать в таком же стиле как шаги с адресом, способом
 * доставки, контактами»). It is the same row as `CheckoutAddressRow` and `CheckoutContactsRow`:
 * the 24 px icon, the `h2-docs` heading with the checkmark once done, the line under it at
 * `ps-8`, and the action on the right where those rows have «Изменить».
 *
 * A guest reads why to sign in and gets «Войти»; a signed-in buyer reads who they are and gets
 * «Изменить». Both open the sign-in modal every other page opens (`AccountLink` →
 * `LoginModalHost`, which the checkout layout keeps for a customer too, so signing in there with
 * another account replaces the session; `login` and `/api/yandex-callback` move the cart over).
 * The step never folds away after the sign-in.
 *
 * Every checkout needs an account (batch 7): the order, its requisites, its payment status and a
 * bought course all live in «Мой кабинет». Until this step is done, the address, the delivery,
 * the contacts and the payment stay closed (`checkoutStepLocks`).
 */
export default function CheckoutSignIn({ customer }: Props) {
  const t = useTranslations("CheckoutPage")
  const done = customer !== null
  const text = done
    ? (() => {
        const sentence = signedInText(customer)
        return t(sentence.key, sentence.values)
      })()
    : t("signInStepGuest")

  return (
    <>
      <div className="h-px bg-ui-border-base w-full first:hidden" />

      <div
        className="flex items-start justify-between w-full gap-x-4 py-2"
        data-testid="checkout-sign-in-step"
        data-state={done ? "signed-in" : "guest"}
      >
        <div className="flex min-w-0 flex-col gap-y-1">
          <span className="flex items-center gap-x-2">
            <span className="flex-shrink-0 text-ui-fg-base">
              <LogIn size={24} />
            </span>
            <h2 className="h2-docs text-ui-fg-base flex items-center gap-x-1.5">
              {t("signInStepHeading")}
              {done && (
                <CheckMini
                  className="text-status-success shrink-0"
                  aria-hidden
                  data-testid="sign-in-section-checkmark"
                />
              )}
            </h2>
          </span>
          <p
            className={
              done
                ? "ps-8 txt-small text-ui-fg-base [overflow-wrap:anywhere]"
                : "ps-8 txt-small text-ui-fg-subtle"
            }
            data-testid="checkout-sign-in-step-text"
          >
            {text}
          </p>
        </div>

        <AccountLink
          className="txt-compact-small-plus text-ui-fg-interactive shrink-0 pt-1"
          data-testid="checkout-sign-in-step-action"
        >
          {done ? t("edit") : t("signIn")}
        </AccountLink>
      </div>
    </>
  )
}
