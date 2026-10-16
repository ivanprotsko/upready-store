/**
 * The contacts step's own test, out of `checkout-contacts-form` (a `"use client"`
 * module) so the server template can ask it too: the checkout opens its sections in
 * order (t-2026-10-09-56, Ivan's item 7) and decides on the server whether the
 * payment block may open yet. A server component calling a function imported from a
 * client module gets a client reference, not the function.
 */

import { realEmailOrEmpty } from "@lib/util/telegram-contact"

export type ContactsField =
  | "first_name"
  | "last_name"
  | "email"
  | "recipient_first_name"
  | "recipient_last_name"

/** Plain e-mail shape: something, `@`, something, a dot, something — the typo «anna@» fails it. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ContactsValues = {
  first_name: string
  last_name: string
  email: string
  recipient_first_name: string
  recipient_last_name: string
}

/**
 * Which field says what (batch 6): a required field left empty says «Заполните это
 * поле», an e-mail that is not an address says so in words — the browser's own
 * tooltip is not a text the buyer can read later. Returns the catalog KEY per field
 * (`CheckoutPage.*`), nothing for a field that is fine.
 */
export function contactsFieldErrors(
  values: ContactsValues,
  differentRecipient: boolean
): Partial<Record<ContactsField, "fieldRequired" | "emailInvalid">> {
  const errors: Partial<Record<ContactsField, "fieldRequired" | "emailInvalid">> = {}
  if (!values.first_name.trim()) errors.first_name = "fieldRequired"
  if (!values.last_name.trim()) errors.last_name = "fieldRequired"
  const email = values.email.trim()
  if (!email) errors.email = "fieldRequired"
  else if (!EMAIL_RE.test(email)) errors.email = "emailInvalid"
  if (differentRecipient) {
    if (!values.recipient_first_name.trim()) errors.recipient_first_name = "fieldRequired"
    if (!values.recipient_last_name.trim()) errors.recipient_last_name = "fieldRequired"
  }
  return errors
}

/** The slice of the signed-in buyer's account the contacts form may start from. */
export type ContactsAccount = {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
}

export type ContactsStartValues = {
  first_name: string
  last_name: string
  email: string
  phone: string
}

/**
 * What the contacts form opens with. A value the cart already carries wins,
 * because the buyer typed it for this order. A field the cart has not got yet
 * starts from the signed-in buyer's account (t-2026-10-16-38): the Telegram
 * sign-in already gave the account the buyer's name, so a buyer inside the
 * shop's Mini App does not type it a second time. The synthetic Telegram
 * e-mail is never offered, from either side.
 */
export function contactsStartValues(
  cart: { email?: string | null; metadata?: Record<string, unknown> | null },
  account: ContactsAccount | null
): ContactsStartValues {
  const meta = cart.metadata ?? {}
  const fromCart = (key: string): string => {
    const value = meta[key]
    return typeof value === "string" ? value : ""
  }
  return {
    first_name: fromCart("contact_first_name") || account?.first_name?.trim() || "",
    last_name: fromCart("contact_last_name") || account?.last_name?.trim() || "",
    email: realEmailOrEmpty(cart.email) || realEmailOrEmpty(account?.email),
    phone: fromCart("contact_phone") || account?.phone?.trim() || "",
  }
}
