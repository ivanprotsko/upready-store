import { describe, expect, it } from "vitest"

import { contactsStartValues } from "@lib/util/checkout-contacts"

/**
 * t-2026-10-16-38: on the stand walk of the cherkashino.com Mini App a signed-in
 * buyer met an empty «Contacts» form, although the account already had the name
 * and the phone. A Telegram buyer's name comes from Telegram at sign-in.
 */
describe("contactsStartValues", () => {
  const telegramBuyer = {
    first_name: "Oksana",
    last_name: "Ivanova",
    email: "tg_12345@telegram.local",
    phone: null,
  }

  it("starts a Telegram buyer from the account's name and never offers the synthetic e-mail", () => {
    expect(
      contactsStartValues({ email: "tg_12345@telegram.local", metadata: null }, telegramBuyer)
    ).toEqual({ first_name: "Oksana", last_name: "Ivanova", email: "", phone: "" })
  })

  it("starts an e-mail buyer from the account's name, phone and address", () => {
    expect(
      contactsStartValues(
        { email: null, metadata: {} },
        { first_name: "Anna", last_name: "Lee", email: "anna@example.com", phone: "+12025550143" }
      )
    ).toEqual({
      first_name: "Anna",
      last_name: "Lee",
      email: "anna@example.com",
      phone: "+12025550143",
    })
  })

  it("keeps what the buyer already saved on the cart over the account", () => {
    expect(
      contactsStartValues(
        {
          email: "orders@example.com",
          metadata: {
            contact_first_name: "Olga",
            contact_last_name: "Petrova",
            contact_phone: "+79990000000",
          },
        },
        { first_name: "Anna", last_name: "Lee", email: "anna@example.com", phone: "+12025550143" }
      )
    ).toEqual({
      first_name: "Olga",
      last_name: "Petrova",
      email: "orders@example.com",
      phone: "+79990000000",
    })
  })

  it("opens empty for a guest with an empty cart", () => {
    expect(contactsStartValues({ email: null, metadata: null }, null)).toEqual({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
    })
  })

  it("ignores a cart metadata value that is not a string", () => {
    expect(
      contactsStartValues(
        { email: null, metadata: { contact_first_name: 42 } },
        { first_name: "Anna", last_name: null, email: null, phone: null }
      )
    ).toEqual({ first_name: "Anna", last_name: "", email: "", phone: "" })
  })
})
