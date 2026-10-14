import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * t-2026-10-09-56, Ivan's remarks on the live checkout (09.10). The sections are large
 * client components wired to server actions; what each remark changed is asserted on
 * their source, the convention `checkout-payment-section/consent-init.test.ts` uses, and
 * the logic behind them in `lib/util/checkout-steps.test.ts` and the catalog test.
 */

const read = (path: string) => readFileSync(join(__dirname, path), "utf8")
const shipping = read("index.tsx")
const payment = read("../checkout-payment-section/index.tsx")
const paymentTemplate = read("../../templates/checkout-payment/index.tsx")
const addressForm = read("../checkout-address-form/index.tsx")
const contactsForm = read("../checkout-contacts-form/index.tsx")
const contactsRow = read("../checkout-contacts-row/index.tsx")
const modal = read("../checkout-modal/index.tsx")
const cdekSheet = read("../checkout-cdek-point-sheet/index.tsx")
const pochtaSheet = read("../checkout-pochta-point-sheet/index.tsx")
const apishipSheet = read("../checkout-apiship-point-sheet/index.tsx")
const picker = read("../pickup-point-picker/index.tsx")
const consent = read("../checkout-consent/index.tsx")

describe("«Способ доставки» (items 1–4, 8, 10, 11)", () => {
  it("1: never writes «Укажите адрес — покажем цену и срок»", () => {
    expect(shipping).not.toMatch(/deliveryPriceAfterAddress/)
  })

  it("2: a price that waits for the address does not lock the method", () => {
    expect(shipping).toMatch(/!isPickupCard &&\s*!awaitingAddress &&\s*isShippingCardUnpriced/)
  })

  it("3: a locked method has no fill, so it does not look like an input", () => {
    expect(shipping).not.toMatch(/border-dashed border-ui-border-base bg-ui-bg-disabled/)
    expect(shipping).toMatch(/unpriced\s*\?\s*"border-ui-border-base bg-transparent"/)
  })

  it("4: every row keeps its radio mark, a locked one in the disabled look", () => {
    expect(shipping).not.toMatch(/unpriced && "invisible"/)
    expect(shipping).toMatch(/unpriced\s*\?\s*"bg-ui-bg-disabled shadow-borders-base"/)
  })

  it("8: one flat list, no way cards nesting the tariffs", () => {
    expect(shipping).not.toMatch(/renderWayCard|groupDeliveryWays|WAY_VALUE/)
  })

  it("10: a finished choice folds into a summary row with «Изменить»", () => {
    expect(shipping).toMatch(/data-testid="checkout-shipping-summary"/)
    expect(shipping).toMatch(/setCollapsed\(true\)/)
  })

  it("11: the heading has its icon, like «Адрес доставки» and «Контакты»", () => {
    expect(shipping).toMatch(/<Truck size=\{24\} \/>/)
  })
})

describe("the sections open in order, «Далее» instead of «Сохранить» (item 7)", () => {
  it("locks the delivery, the contacts and the payment until the sections before are done", () => {
    expect(shipping).toMatch(/data-testid="checkout-shipping-locked"/)
    expect(contactsRow).toMatch(/data-testid="checkout-contacts-locked"/)
    // t-2026-10-12-05: the sign-in is the first of the sections, a guest pays nothing.
    expect(paymentTemplate).toMatch(/checkoutStepLocksOf\(cart, shippingOptions, !!customer\)\.payment/)
  })

  it("names the address and contacts button «Далее» and disables it until the fields are right", () => {
    expect(addressForm).toMatch(/disabled=\{liveGaps\.length > 0 \|\| postalInvalid \|\| isSubmitting \|\| isRefreshing\}/)
    expect(addressForm).toMatch(/t\("next"\)/)
    expect(addressForm).not.toMatch(/t\("save"\)/)
    expect(contactsForm).toMatch(/disabled=\{Object\.keys\(fieldErrors\)\.length > 0/)
    expect(contactsForm).toMatch(/t\("next"\)/)
    expect(contactsForm).not.toMatch(/t\("save"\)/)
    expect(shipping).toMatch(/disabled=\{!isShippingComplete \|\| isPending\}/)
  })
})

describe("the consents at «Оплатить» (item 6)", () => {
  it("names the policy once, in the personal-data box, not again in the offer sentence", () => {
    expect(payment).toMatch(/t\.rich\("legal", \{ button: buttonText, terms: legalChunk\("terms"\) \}\)/)
    expect(payment).not.toMatch(/privacyPolicy: legalChunk/)
  })

  it("shows the «отметьте согласие» line only after a try to pay without it", () => {
    expect(payment).toMatch(/payTriedWithoutConsent && !consent\.personalData/)
    expect(payment).toMatch(/onClick=\{\(\) => setPayTriedWithoutConsent\(true\)\}/)
  })

  it("drops the «Доставка» / «Правила возврата» pair under the button", () => {
    expect(paymentTemplate).not.toMatch(/t\("shippingLink"\)|t\("returnsLink"\)/)
  })
})

describe("item 9, returned: the postcode and CDEK's refusal", () => {
  const fields = read("../../../common/components/address-autocomplete/manual-address-fields.tsx")

  it("disables «Далее» on a postcode of the wrong shape and names it at the field", () => {
    expect(addressForm).toMatch(/disabled=\{liveGaps\.length > 0 \|\| postalInvalid \|\| isSubmitting \|\| isRefreshing\}/)
    expect(fields).toMatch(/data-testid="address-postal-code-error"/)
    expect(fields).toMatch(/t\("postalCodeInvalid"\)/)
  })

  it("says at the card that CDEK could not find the address", () => {
    // t-2026-10-14-58: an ApiShip option may word it without naming CDEK.
    expect(shipping).toMatch(
      /addressRejectedIds\.has\(option\.id\)\s*\?\s*(apiship\.addressRejectedText\(option\) \?\? )?t\("shippingPriceAddressRejected"\)/
    )
  })
})

describe("the point sheets and the documents (items 9б, 12)", () => {
  it("9б: the point sheets give the map two thirds of a desktop, down to the bottom", () => {
    // t-2026-10-12-03 (Ivan 12.10, item 1) turned the full-screen window into a dialog with
    // margins; the list a third and the map two thirds stayed (`pickup-point-picker`).
    expect(modal).toMatch(/small:h-\[calc\(100dvh-4rem\)\]/)
    expect(picker).toMatch(/small:grid-cols-\[minmax\(0,1fr\)_minmax\(0,2fr\)\]/)
    for (const sheet of [cdekSheet, pochtaSheet, apishipSheet]) {
      expect(sheet).toMatch(/<PickupPointPicker</)
    }
  })

  it("12: the documents the checkout links open over it", () => {
    expect(consent).toMatch(/<LegalPageLink href=\{privacyHref\}>/)
    expect(consent).toMatch(/<LegalPageLink href=\{consentPageHref\}>/)
    expect(payment).toMatch(/<LegalPageLink href=\{href\}>\{chunks\}<\/LegalPageLink>/)
  })
})
