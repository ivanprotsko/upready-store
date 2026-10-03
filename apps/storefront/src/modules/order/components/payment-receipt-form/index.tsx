"use client"

import { submitPaymentReceipt } from "@lib/data/payment-receipt"
import { RECEIPT_MAX_BYTES, RECEIPT_TYPES } from "@lib/util/payment-receipt"
import { Camera, DocumentText, Photo, XMark } from "@medusajs/icons"
import { Button, IconButton, Text } from "@medusajs/ui"
import { useTranslations } from "next-intl"
import { useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react"

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

const formatSize = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

/**
 * «Я оплатил» under the shop's requisites (t-cherk-com-hotfix batch 3 → batch 7):
 * the button opens the receipt form, the receipt goes to the shop, and the block
 * turns into «Чек отправлен, ждём подтверждения» until the owner confirms the payment.
 *
 * Batch 7 (Ivan: «на мобильных устройствах выбрать файл, фото, или сделать фото»):
 * one file input with `accept="image/*,application/pdf"` and NO `capture`, so iOS
 * and Android offer the library, the camera and the files in their own sheet; plus
 * a visible «Сделать фото» button on a phone that drives a second input with
 * `capture="environment"`, which opens the camera straight away. On a desktop the
 * first button is a plain file choice. Drag-and-drop and clipboard paste are in the
 * backlog by Ivan's own words.
 */
const PaymentReceiptForm = ({ orderId, sent: alreadySent, rejected = null }: Props) => {
  const t = useTranslations("ManualPayment")
  const [sent, setSent] = useState(alreadySent)
  const [open, setOpen] = useState(false)
  const [showRejection, setShowRejection] = useState(Boolean(rejected))
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const pickRef = useRef<HTMLInputElement | null>(null)
  const cameraRef = useRef<HTMLInputElement | null>(null)

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

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0] ?? null
    // Clear the input, so the same file can be chosen again after «Убрать».
    event.target.value = ""
    if (!chosen) {
      return
    }
    setError(null)
    if (chosen.size > RECEIPT_MAX_BYTES) {
      setFile(null)
      setError(t("receiptTooLarge"))
      return
    }
    // A camera photo on some Androids arrives with an empty type; the backend checks
    // the real type again, so only a type that is known AND wrong is refused here.
    if (chosen.type && !RECEIPT_TYPES.includes(chosen.type)) {
      setFile(null)
      setError(t("receiptWrongType"))
      return
    }
    setFile(chosen)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file) {
      setError(t("receiptWrongType"))
      return
    }
    const formData = new FormData()
    formData.append("receipt", file, file.name)

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
      noValidate
      className="flex flex-col gap-y-3 rounded-[6px] border border-ui-border-base bg-ui-bg-base p-4"
      data-testid="payment-receipt-form"
    >
      <p className="txt-compact-medium-plus text-ui-fg-base">{t("receiptLabel")}</p>

      {/* The two inputs are hidden; the buttons below drive them. No `capture` on the
          first one on purpose: that is what makes a phone offer library, camera and
          files together. */}
      <input
        ref={pickRef}
        name="receipt"
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        tabIndex={-1}
        onChange={onPick}
        data-testid="payment-receipt-input"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={onPick}
        data-testid="payment-receipt-camera-input"
      />

      {file ? (
        <div
          className="flex items-center gap-x-3 rounded-md bg-ui-bg-subtle px-3 py-2"
          data-testid="payment-receipt-file"
        >
          <DocumentText className="shrink-0 text-ui-fg-subtle" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate txt-compact-small-plus text-ui-fg-base" data-testid="payment-receipt-file-name">
              {file.name}
            </span>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {formatSize(file.size)}
            </Text>
          </div>
          <IconButton
            type="button"
            size="small"
            variant="transparent"
            aria-label={t("receiptRemove")}
            onClick={() => setFile(null)}
            data-testid="payment-receipt-remove"
          >
            <XMark />
          </IconButton>
        </div>
      ) : (
        <div className="flex flex-col gap-2 small:flex-row">
          <Button
            type="button"
            variant="secondary"
            size="large"
            className="w-full"
            onClick={() => pickRef.current?.click()}
            data-testid="payment-receipt-pick"
          >
            <Photo aria-hidden />
            {t("receiptPick")}
          </Button>
          {/* A phone only: a desktop has no camera sheet to open, its file dialog is the
              button above. */}
          <Button
            type="button"
            variant="secondary"
            size="large"
            className="w-full small:hidden"
            onClick={() => cameraRef.current?.click()}
            data-testid="payment-receipt-camera"
          >
            <Camera aria-hidden />
            {t("receiptCamera")}
          </Button>
        </div>
      )}

      <p className="txt-compact-small text-ui-fg-subtle">{t("receiptHint")}</p>
      {error && (
        <p className="txt-compact-small text-ui-fg-error" role="alert" data-testid="payment-receipt-error">
          {error}
        </p>
      )}
      <Button type="submit" size="large" disabled={!file} isLoading={pending} data-testid="payment-receipt-submit">
        {t("receiptSubmit")}
      </Button>
    </form>
  )
}

export default PaymentReceiptForm
