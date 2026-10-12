import { readFileSync } from "node:fs"
import { join } from "node:path"
import { NextIntlClientProvider } from "next-intl"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import CheckoutSignIn from "."

/**
 * t-2026-10-12-05, Ivan 12.10 items 6.4 and 6.4.1: «Вход в личный кабинет» is a step like the
 * address and the contacts, it stays after the sign-in, and its line says who is signed in.
 */

vi.mock("@modules/layout/components/account-link", () => ({
  default: ({ children, ...rest }: { children: ReactNode }) => (
    <span data-mock="account-link" {...rest}>
      {children}
    </span>
  ),
}))

const messages = (locale: string) =>
  JSON.parse(readFileSync(join(__dirname, `../../../../../messages/${locale}.json`), "utf8"))

const render = (customer: Parameters<typeof CheckoutSignIn>[0]["customer"], locale = "ru") =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages(locale)}>
      <CheckoutSignIn customer={customer} />
    </NextIntlClientProvider>
  )

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

describe("the sign-in step for a guest (6.4.1)", () => {
  it("asks to sign in, with «Войти» where the other steps have «Изменить»", () => {
    const html = render(null)
    expect(html).toContain('data-state="guest"')
    expect(text(html)).toContain("Вход в личный кабинет")
    expect(text(html)).toContain(
      "Пожалуйста, войдите, чтобы заказ сохранился в вашем личном кабинете нашего магазина."
    )
    expect(html).toMatch(/data-testid="checkout-sign-in-step-action"[^>]*>Войти</)
    expect(html).not.toContain("sign-in-section-checkmark")
  })
})

describe("the sign-in step once signed in (6.4)", () => {
  it("names the buyer and the address, with «Изменить» and the step's checkmark", () => {
    const html = render({ first_name: "Иван", last_name: "Процко", email: "ivanprotska@yandex.com" })
    expect(html).toContain('data-state="signed-in"')
    expect(text(html)).toContain("Вход в личный кабинет")
    expect(text(html)).toContain("Вы вошли как Иван Процко, адрес эл. почты: ivanprotska@yandex.com")
    expect(html).toMatch(/data-testid="checkout-sign-in-step-action"[^>]*>Изменить</)
    expect(html).toContain("sign-in-section-checkmark")
  })

  it("names the address alone when Yandex ID gave no name", () => {
    const html = render({ first_name: "", last_name: "", email: "ivanprotska@yandex.com" })
    expect(text(html)).toContain("Вы вошли с адресом эл. почты: ivanprotska@yandex.com")
    expect(text(html)).not.toContain("Вы вошли как")
  })

  it("reads in English too", () => {
    expect(text(render(null, "en"))).toContain("Sign in to your account")
    expect(text(render({ first_name: "Ivan", last_name: "", email: "i@example.com" }, "en"))).toContain(
      "You are signed in as Ivan, email address: i@example.com"
    )
  })
})
