"use client"

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { setAddresses, updateCart } from "@lib/data/cart"
import { Button, Checkbox, Label } from "@medusajs/ui"
import type { HttpTypes } from "@medusajs/types"
import Input from "@modules/common/components/input"
import ErrorMessage from "@modules/checkout/components/error-message"
import { useTranslations } from "next-intl"

import {
  contactsFieldErrors,
  contactsStartValues,
  type ContactsAccount,
  type ContactsField,
} from "@lib/util/checkout-contacts"

// Moved to `@lib/util/checkout-contacts` so the server template can run the same
// test (t-2026-10-09-56); re-exported for the modules that import it from here.
export { contactsFieldErrors, EMAIL_RE, type ContactsField } from "@lib/util/checkout-contacts"

interface CheckoutContactsFormProps {
  cart: HttpTypes.StoreCart
  /** The signed-in buyer; a field the cart has not got yet starts from it. */
  account?: ContactsAccount | null
  /** Called once the contacts are saved — the row collapses back to its summary. */
  onSaved: () => void
  /**
   * Called on an explicit cancel — same collapse, nothing written. Absent while the
   * contacts are not complete (batch 6 part 1): the form then has no «Закрыть».
   */
  onCancel?: () => void
  /** Focus the first field on mount: only when the buyer opened the form themselves. */
  autoFocus?: boolean
}

/**
 * t-2026-10-01-checkout-ivan-3 #7: inline accordion body, not a popup sheet.
 * `CheckoutContactsRow` mounts this only while it is open, which is also what
 * gives it "focus the first field on open" for free (the effect below runs
 * once, on that mount, and only when the buyer asked for the form).
 */
export default function CheckoutContactsForm({
  cart,
  account = null,
  onSaved,
  onCancel,
  autoFocus = true,
}: CheckoutContactsFormProps) {
  const t = useTranslations("CheckoutPage")
  const router = useRouter()
  const recipientCheckboxId = useId()
  const firstFieldRef = useRef<HTMLInputElement | null>(null)
  const addr = cart.shipping_address
  const meta = cart.metadata as Record<string, string> | null

  const wasDifferentRecipient = meta?.has_different_recipient === "true"

  const [isDifferentRecipient, setIsDifferentRecipient] = useState(wasDifferentRecipient)
  const [formData, setFormData] = useState({
    // The cart's own contacts first, then the signed-in buyer's account
    // (`contactsStartValues`). A Telegram buyer's cart arrives with the synthetic
    // `tg_<id>@telegram.local` the sign-in copied from the customer. The e-mail
    // field opens empty instead, and the address typed here is what the order
    // carries: Medusa 2.19 lets a customer with an account set any email on the
    // cart (`updateCartWorkflow`).
    ...contactsStartValues(cart, account),
    recipient_first_name: wasDifferentRecipient ? addr?.first_name || "" : "",
    recipient_last_name: wasDifferentRecipient ? addr?.last_name || "" : "",
    recipient_phone: wasDifferentRecipient ? addr?.phone || "" : "",
  })
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Batch 6 part 1: an incomplete section keeps this form on screen until the
  // refreshed cart arrives, so «Сохранение…» lasts until then rather than the
  // button reading «Сохранить» again over the values just sent.
  const [isRefreshing, startRefresh] = useTransition()
  // Batch 6: a field's error shows under it only after the field was left (blur) or
  // the form was submitted — never before the buyer has typed anything.
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (autoFocus) firstFieldRef.current?.focus()
  }, [autoFocus])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setTouched((current) => ({ ...current, [e.target.name]: true }))
  }

  const fieldErrors = contactsFieldErrors(formData, isDifferentRecipient)
  const errorFor = (name: ContactsField): string | null => {
    const key = fieldErrors[name]
    if (!key || !(submitted || touched[name])) return null
    return t(key)
  }
  const fieldError = (name: ContactsField) => {
    const message = errorFor(name)
    return message ? (
      <p
        className="txt-compact-small text-ui-fg-error pt-1"
        role="alert"
        data-testid={`contacts-field-error-${name}`}
      >
        {message}
      </p>
    ) : null
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitted(true)
    const firstInvalid = (Object.keys(fieldErrors) as ContactsField[]).find(
      (name) => fieldErrors[name]
    )
    if (firstInvalid) {
      const field = e.currentTarget.elements.namedItem(firstInvalid)
      if (field instanceof HTMLInputElement) field.focus()
      return
    }
    setIsSubmitting(true)
    setError(null)

    const contact = isDifferentRecipient
      ? {
        first_name: formData.recipient_first_name,
        last_name: formData.recipient_last_name,
        phone: formData.recipient_phone,
      }
      : {
        first_name: formData.first_name,
        last_name: formData.last_name,
        phone: formData.phone,
      }

    const result = await setAddresses({
      shipping_address: contact,
      email: formData.email,
      same_as_billing: true,
    })
    if (result) {
      setError(result)
      setIsSubmitting(false)
      return
    }

    await updateCart({
      metadata: {
        contact_first_name: formData.first_name,
        contact_last_name: formData.last_name,
        contact_phone: formData.phone,
        has_different_recipient: isDifferentRecipient ? "true" : "false",
      },
    } as HttpTypes.StoreUpdateCart)

    setIsSubmitting(false)
    onSaved()
    startRefresh(() => router.refresh())
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col pt-2"
      data-testid="checkout-contacts-form"
    >
      <div className="flex flex-col gap-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Input
              ref={firstFieldRef}
              label={t("fieldFirstName")}
              name="first_name"
              autoComplete="given-name"
              value={formData.first_name}
              onChange={handleChange}
              onBlur={handleBlur}
              required
              aria-invalid={Boolean(errorFor("first_name"))}
              data-testid="shipping-first-name-input"
            />
            {fieldError("first_name")}
          </div>
          <div>
            <Input
              label={t("fieldLastName")}
              name="last_name"
              autoComplete="family-name"
              value={formData.last_name}
              onChange={handleChange}
              onBlur={handleBlur}
              required
              aria-invalid={Boolean(errorFor("last_name"))}
              data-testid="shipping-last-name-input"
            />
            {fieldError("last_name")}
          </div>
        </div>

        <div>
          <Input
            label={t("fieldEmail")}
            name="email"
            type="email"
            autoComplete="email"
            value={formData.email}
            onChange={handleChange}
            onBlur={handleBlur}
            required
            aria-invalid={Boolean(errorFor("email"))}
            data-testid="shipping-email-input"
          />
          {fieldError("email")}
        </div>

        <Input
          label={t("fieldPhone")}
          name="phone"
          autoComplete="tel"
          value={formData.phone}
          onChange={handleChange}
          data-testid="shipping-phone-input"
        />

        <div className="flex items-center gap-x-2">
          <Checkbox
            id={recipientCheckboxId}
            checked={isDifferentRecipient}
            onCheckedChange={(checked) => setIsDifferentRecipient(checked === true)} />
          <Label
            htmlFor={recipientCheckboxId}
            className="text-ui-fg-subtle !txt-medium cursor-pointer"
          >
            {t("recipientCheckbox")}
          </Label>
        </div>

        {isDifferentRecipient && (
          <div className="flex flex-col gap-y-3 pt-1">
            <p className="txt-compact-small-plus text-ui-fg-subtle">
              {t("recipientHeading")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  label={t("fieldFirstName")}
                  name="recipient_first_name"
                  autoComplete="given-name"
                  value={formData.recipient_first_name}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  required
                  aria-invalid={Boolean(errorFor("recipient_first_name"))}
                />
                {fieldError("recipient_first_name")}
              </div>
              <div>
                <Input
                  label={t("fieldLastName")}
                  name="recipient_last_name"
                  autoComplete="family-name"
                  value={formData.recipient_last_name}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  required
                  aria-invalid={Boolean(errorFor("recipient_last_name"))}
                />
                {fieldError("recipient_last_name")}
              </div>
            </div>
            <Input
              label={t("fieldPhone")}
              name="recipient_phone"
              autoComplete="tel"
              value={formData.recipient_phone}
              onChange={handleChange}
            />
          </div>
        )}
      </div>

      <ErrorMessage error={error} />

      <div className="flex gap-x-2 mt-4">
        {onCancel && (
          <Button
            type="button"
            onClick={onCancel}
            variant="secondary"
            size="large"
            className="w-full"
          >
            {t("close")}
          </Button>
        )}
        {/* t-2026-10-09-56 (Ivan 09.10: «избавиться от кнопки сохранить, ее нужно
            переименовать в "Далее" и пока поля не заполнены, она должна быть
            disabled»): the same test the section's checkmark uses. */}
        <Button
          type="submit"
          disabled={Object.keys(fieldErrors).length > 0 || isSubmitting || isRefreshing}
          size="large"
          className="w-full"
          data-testid="checkout-contacts-next"
        >
          {isSubmitting || isRefreshing ? t("saving") : t("next")}
        </Button>
      </div>
    </form>
  )
}
