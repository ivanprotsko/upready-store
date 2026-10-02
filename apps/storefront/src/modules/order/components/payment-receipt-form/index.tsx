"use client"

import { submitPaymentReceipt } from "@lib/data/payment-receipt"
import { RECEIPT_MAX_BYTES, RECEIPT_TYPES } from "@lib/util/payment-receipt"
import { Button } from "@medusajs/ui"
import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"

export type ReceiptRejection = {
  reason: string | null
  at: string | null
}

type Props = {
  orderId: string
  /** Whether the order already carries a receipt (`metadata.payment_receipt`) that is still waiting. */
  sent: boolean
  /**
   * Batch 6, Q3.3: the shop did not accept the receipt
   * (`metadata.payment_receipt.status === "rejected"`, with `rejected_reason` and
   * `rejected_at`). The block says so, names the reason, and «Отправить другой чек»
   * opens the same form; the new upload replaces the object and clears the rejection.
   */
  rejected?: ReceiptRejection | null
}

/**
 * «Я оплатил» under the shop's cards (t-cherk-com-hotfix batch 3): the button
 * opens a file field, the receipt goes to the shop, and the block turns into
 * «Чек отправлен, ждём подтверждения» until the owner confirms the payment.
 */
const PaymentReceiptForm = ({ orderId, sent: alreadySent, rejected = null }: Props) => {
  const t = useTranslations("ManualPayment")
  const [sent, setSent] = useState(alreadySent)
  const [open, setOpen] = useState(false)
  const [showRejection, setShowRejection] = useState(Boolean(rejected))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (sent) {
    return (
      <div
        className="flex flex-col gap-y-1 rounded-[6px] border border-ui-border-base bg-ui-bg-base p-4"
        data-testid="payment-receipt-sent"
        role="status"
      >
        <p className="txt-compact-medium-plus text-ui-fg-base">{t("receiptSent")}</p>
        <p className="txt-compact-small text-ui-fg-subtle">{t("receiptSentHint")}</p>
      </div>
    )
  }

  if (!open && showRejection && rejected) {
    return (
      <div
        className="flex flex-col gap-y-2 rounded-[6px] border border-ui-border-base bg-ui-bg-base p-4"
        data-testid="payment-receipt-rejected"
        role="status"
      >
        <p className="txt-compact-medium-plus text-ui-fg-error">{t("receiptRejected")}</p>
        {rejected.reason && (
          <p className="txt-compact-small text-ui-fg-base" data-testid="payment-receipt-rejected-reason">
            {t("receiptRejectedReason", { reason: rejected.reason })}
          </p>
        )}
        <Button
          type="button"
          size="large"
          className="w-full"
          onClick={() => {
            setShowRejection(false)
            setOpen(true)
          }}
          data-testid="payment-receipt-resend"
        >
          {t("receiptResend")}
        </Button>
      </div>
    )
  }

  if (!open) {
    return (
      <Button
        type="button"
        size="large"
        className="w-full"
        onClick={() => setOpen(true)}
        data-testid="payment-receipt-open"
      >
        {t("receiptPaid")}
      </Button>
    )
  }

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const file = formData.get("receipt")

    if (file instanceof File && file.size > RECEIPT_MAX_BYTES) {
      setError(t("receiptTooLarge"))
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await submitPaymentReceipt(orderId, formData)
      if (result.ok) {
        setSent(true)
      } else {
        setError(t(result.error))
      }
    })
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-y-3 rounded-[6px] border border-ui-border-base bg-ui-bg-base p-4"
      data-testid="payment-receipt-form"
    >
      <label htmlFor="payment-receipt" className="txt-compact-medium-plus text-ui-fg-base">
        {t("receiptLabel")}
      </label>
      <input
        id="payment-receipt"
        name="receipt"
        type="file"
        required
        accept={RECEIPT_TYPES.join(",")}
        className="txt-compact-small text-ui-fg-base"
      />
      <p className="txt-compact-small text-ui-fg-subtle">{t("receiptHint")}</p>
      {error && (
        <p className="txt-compact-small text-ui-fg-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" isLoading={pending} data-testid="payment-receipt-submit">
        {t("receiptSubmit")}
      </Button>
    </form>
  )
}

export default PaymentReceiptForm
