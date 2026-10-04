"use client"

import { User } from "@medusajs/icons"
import { Text } from "@medusajs/ui"
import { useTranslations } from "next-intl"

import SignInMethods, { type SignInMethodsProps } from "@modules/account/components/sign-in-methods"

/**
 * The guest block at the top of the cart sidebar: «Войдите, чтобы…» and this shop's own ways in.
 * The ways in are `SignInMethods`, the same block the sign-in modal and `/account` draw
 * (t-2026-10-04-24). Rendered inside `Drawer.Content`, so closing the sidebar unmounts it and
 * the next opening starts with the e-mail form folded.
 */
export default function CartSidebarSignIn(props: Omit<SignInMethodsProps, "emailOpen">) {
  const t = useTranslations("CartSidebar")

  return (
    <section
      className="flex flex-col gap-y-3 border-b border-dotted border-ui-border-strong px-4 py-4"
      data-testid="cart-sidebar-sign-in"
    >
      <div className="flex items-start gap-x-3">
        <Text size="small" leading="compact" className="flex-1 text-ui-fg-base">
          {t("signInPrompt")}
        </Text>
        <User className="mt-0.5 shrink-0 text-ui-fg-muted" aria-hidden />
      </div>
      <SignInMethods {...props} />
    </section>
  )
}
