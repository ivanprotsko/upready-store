import { OrderCreditLineDTO } from "@medusajs/types"
import { ArrowDownRightMini, DocumentText, XCircle } from "@medusajs/icons"
import { AdminOrder, AdminPayment, HttpTypes } from "@medusajs/types"
import {
  Badge,
  Button,
  Container,
  Heading,
  Label,
  Prompt,
  StatusBadge,
  Text,
  Textarea,
  toast,
  Tooltip,
  usePrompt,
} from "@medusajs/ui"
import { useState } from "react"
import { Trans, useTranslation } from "react-i18next"
import { ActionMenu } from "../../../../../components/common/action-menu"
import DisplayId from "../../../../../components/common/display-id/display-id"
import {
  useCapturePayment,
  useAuthorizePaymentSession,
  useRejectPaymentReceipt,
} from "../../../../../hooks/api"
import { useDate } from "../../../../../hooks/use-date"
import { formatCurrency } from "../../../../../lib/format-currency"
import {
  getLocaleAmount,
  getStylizedAmount,
} from "../../../../../lib/money-amount-helpers"
import {
  getOrderPaymentStatus,
  getPaymentProviderLabel,
  manualPaymentStatus,
} from "../../../../../lib/order-helpers"
import { getPaymentsFromOrder } from "../../../../../lib/orders"
import { getTotalCaptured, getTotalPending } from "../../../../../lib/payment"
import { getLoyaltyPlugin } from "../../../../../lib/plugins"
import { ExtendedOrder, ExtendedRefund } from "../../constants"

type OrderPaymentSectionProps = {
  order: ExtendedOrder
  plugins: HttpTypes.AdminPlugin[]
}

export const OrderPaymentSection = ({
  order,
  plugins,
}: OrderPaymentSectionProps) => {
  const payments = getPaymentsFromOrder(order)

  const refunds = payments
    .map((payment) => payment?.refunds)
    .flat(1)
    .filter(Boolean) as ExtendedRefund[]

  return (
    <Container className="divide-y divide-dashed p-0">
      <Header order={order} />

      <PaymentBreakdown
        order={order}
        plugins={plugins}
        payments={payments}
        refunds={refunds}
        currencyCode={order.currency_code}
      />

      <Total order={order} />
    </Container>
  )
}

const Header = ({ order }: { order: ExtendedOrder }) => {
  const { t } = useTranslation()
  const { label, color } = manualPaymentStatus(t, order) ?? getOrderPaymentStatus(t, order.payment_status)

  return (
    <div className="flex items-center justify-between px-6 py-4">
      <Heading level="h2">{t("orders.payment.title")}</Heading>

      <StatusBadge color={color} className="text-nowrap">
        {label}
      </StatusBadge>
    </div>
  )
}

const Refund = ({
  refund,
  currencyCode,
}: {
  refund: HttpTypes.AdminRefund
  currencyCode: string
}) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const RefundReasonBadge = refund?.refund_reason && (
    <Badge
      size="2xsmall"
      className="cursor-default select-none capitalize"
      rounded="full"
    >
      {refund.refund_reason.label}
    </Badge>
  )

  const RefundNoteIndicator = refund.note && (
    <Tooltip content={refund.note}>
      <DocumentText className="text-ui-tag-neutral-icon ml-1 inline" />
    </Tooltip>
  )

  return (
    <div className="bg-ui-bg-subtle text-ui-fg-subtle grid grid-cols-[1fr_1fr_1fr_20px] items-center gap-x-4 px-6 py-4">
      <div className="flex flex-row">
        <div className="self-center pr-3">
          <ArrowDownRightMini className="text-ui-fg-muted" />
        </div>
        <div>
          <Text size="small" leading="compact" weight="plus">
            {t("orders.payment.refund")} {RefundNoteIndicator}
          </Text>
          <Text size="small" leading="compact">
            {getFullDate({ date: refund.created_at, includeTime: true })}
          </Text>
        </div>
      </div>
      <div className="flex items-center justify-end">{RefundReasonBadge}</div>
      <div className="flex items-center justify-end">
        <Text size="small" leading="compact">
          - {getLocaleAmount(refund.amount as number, currencyCode)}
        </Text>
      </div>
    </div>
  )
}

type PaymentReceipt = {
  url: string
  uploaded_at: string
  /** Set only while the owner's rejection stands; the buyer's next upload clears it. */
  rejected_reason: string | null
}

/**
 * The buyer's receipt for a card transfer (`metadata.payment_receipt`, written
 * by the storefront's «Я оплатил», t-cherk-com-hotfix batch 3). The owner opens
 * it, checks the money arrived and confirms the payment with the button below,
 * or rejects it with a reason (batch 5: `status: "rejected"`,
 * `rejected_reason`, `rejected_at`).
 */
const readPaymentReceipt = (
  metadata: Record<string, unknown> | null | undefined
): PaymentReceipt | null => {
  const raw = metadata?.payment_receipt as
    | {
        url?: unknown
        uploaded_at?: unknown
        status?: unknown
        rejected_reason?: unknown
      }
    | null
    | undefined
  if (!raw || typeof raw.url !== "string" || typeof raw.uploaded_at !== "string") {
    return null
  }
  return {
    url: raw.url,
    uploaded_at: raw.uploaded_at,
    rejected_reason:
      raw.status === "rejected"
        ? typeof raw.rejected_reason === "string"
          ? raw.rejected_reason
          : ""
        : null,
  }
}

/**
 * «Отклонить чек» next to «Подтвердить оплату» (t-cherk-com-hotfix batch 5):
 * a prompt with a required reason, which the buyer then reads on the order
 * page. The prompt stays open until the rejection is saved, so a failed save
 * keeps the typed reason.
 */
const RejectReceiptButton = ({ orderId }: { orderId: string }) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const { mutateAsync, isPending } = useRejectPaymentReceipt(orderId)

  const handleReject = async () => {
    await mutateAsync(
      { reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(t("orders.payment.receiptRejectSuccess"))
          setOpen(false)
          setReason("")
        },
        onError: (error) => {
          toast.error(error.message)
        },
      }
    )
  }

  return (
    <Prompt open={open} onOpenChange={setOpen}>
      <Prompt.Trigger asChild>
        <Button
          className="shrink-0"
          size="small"
          variant="secondary"
          data-testid="order-payment-receipt-reject"
        >
          {t("orders.payment.receiptReject")}
        </Button>
      </Prompt.Trigger>
      <Prompt.Content>
        <Prompt.Header>
          <Prompt.Title>{t("orders.payment.receiptRejectTitle")}</Prompt.Title>
          <Prompt.Description>
            {t("orders.payment.receiptRejectDescription")}
          </Prompt.Description>
        </Prompt.Header>
        <div className="flex flex-col gap-y-2 px-6 pt-4">
          <Label htmlFor="payment-receipt-reject-reason" size="small" weight="plus">
            {t("orders.payment.receiptRejectReason")}
          </Label>
          <Textarea
            id="payment-receipt-reject-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("orders.payment.receiptRejectReasonPlaceholder")}
            maxLength={500}
            rows={3}
            data-testid="order-payment-receipt-reject-reason"
          />
        </div>
        <Prompt.Footer>
          <Prompt.Cancel>{t("actions.cancel")}</Prompt.Cancel>
          <Button
            size="small"
            variant="danger"
            onClick={handleReject}
            disabled={!reason.trim()}
            isLoading={isPending}
            data-testid="order-payment-receipt-reject-submit"
          >
            {t("orders.payment.receiptReject")}
          </Button>
        </Prompt.Footer>
      </Prompt.Content>
    </Prompt>
  )
}

const Payment = ({
  order,
  payment,
  refunds,
  currencyCode,
}: {
  order: ExtendedOrder
  payment: HttpTypes.AdminPayment
  refunds: HttpTypes.AdminRefund[]
  currencyCode: string
}) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const prompt = usePrompt()
  const { mutateAsync } = useCapturePayment(order.id, payment.id)

  const handleCapture = async () => {
    const res = await prompt({
      title: t("orders.payment.capture"),
      description: t("orders.payment.capturePayment", {
        amount: formatCurrency(payment.amount as number, currencyCode),
      }),
      confirmText: t("actions.confirm"),
      cancelText: t("actions.cancel"),
      variant: "confirmation",
    })

    if (!res) {
      return
    }

    await mutateAsync(
      { amount: payment.amount as number },
      {
        onSuccess: () => {
          toast.success(
            t("orders.payment.capturePaymentSuccess", {
              amount: formatCurrency(payment.amount as number, currencyCode),
            })
          )
        },
        onError: (error) => {
          toast.error(error.message)
        },
      }
    )
  }

  const getPaymentStatusAttributes = (payment: AdminPayment) => {
    if (payment.canceled_at) {
      return [t("orders.payment.status.canceled"), "red"]
    } else if (payment.captured_at) {
      return [t("orders.payment.status.captured"), "green"]
    } else {
      return [t("orders.payment.status.awaiting"), "orange"]
    }
  }

  const [status, color] = getPaymentStatusAttributes(payment) as [
    string,
    "green" | "orange" | "red"
  ]

  const showCapture =
    payment.captured_at === null && payment.canceled_at === null

  const receipt =
    payment.provider_id === "pp_system_default"
      ? readPaymentReceipt(order.metadata)
      : null

  const totalRefunded = (payment.refunds ?? []).reduce(
    (acc, next) => next.amount + acc,
    0
  )

  return (
    <div className="divide-y divide-dashed">
      <div className="text-ui-fg-subtle grid grid-cols-[1fr_1fr_1fr_20px] items-center gap-x-4 px-6 py-4 sm:grid-cols-[1fr_1fr_1fr_1fr_20px]">
        <div className="w-full min-w-[60px] overflow-hidden">
          <Text
            size="small"
            leading="compact"
            weight="plus"
            className="truncate"
          >
            <DisplayId id={payment.id} />
          </Text>
          <Text size="small" leading="compact">
            {getFullDate({
              date: payment.created_at as string,
              includeTime: true,
            })}
          </Text>
        </div>
        <div className="hidden items-center justify-end sm:flex">
          <Text size="small" leading="compact">
            {getPaymentProviderLabel(t, payment.provider_id)}
          </Text>
        </div>
        <div className="flex items-center justify-end">
          <StatusBadge color={color} className="text-nowrap">
            {status}
          </StatusBadge>
        </div>
        <div className="flex items-center justify-end">
          <Text size="small" leading="compact">
            {getLocaleAmount(payment.amount as number, payment.currency_code)}
          </Text>
        </div>
        <ActionMenu
          groups={[
            {
              actions: [
                {
                  label: t("orders.payment.refund"),
                  icon: <XCircle />,
                  to: `/orders/${order.id}/refund?paymentId=${payment.id}`,
                  disabled:
                    !payment.captured_at ||
                    !!payment.canceled_at ||
                    totalRefunded >= payment.amount,
                },
              ],
            },
          ]}
        />
      </div>
      {receipt && (
        <div
          className="flex items-center justify-between gap-x-4 px-6 py-4"
          data-testid="order-payment-receipt"
        >
          <Text size="small" leading="compact">
            {receipt.rejected_reason !== null
              ? t("orders.payment.receiptRejected", {
                  reason: receipt.rejected_reason,
                })
              : t("orders.payment.receiptSent", {
                  date: getFullDate({
                    date: receipt.uploaded_at,
                    includeTime: true,
                  }),
                })}
          </Text>
          <a
            href={receipt.url}
            target="_blank"
            rel="noopener noreferrer"
            className="txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover shrink-0"
          >
            {t("orders.payment.receiptOpen")}
          </a>
        </div>
      )}
      {showCapture && (
        <div className="bg-ui-bg-subtle flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-x-2">
            <ArrowDownRightMini className="text-ui-fg-muted shrink-0" />
            <Text size="small" leading="compact">
              <Trans
                i18nKey="orders.payment.isReadyToBeCaptured"
                components={[<DisplayId key={payment.id} id={payment.id} />]}
              />
            </Text>
          </div>

          <div className="flex shrink-0 items-center gap-x-2">
            {receipt && receipt.rejected_reason === null && (
              <RejectReceiptButton orderId={order.id} />
            )}
            <Button
              className="shrink-0"
              size="small"
              variant="secondary"
              onClick={handleCapture}
            >
              <span className="hidden sm:block">
                {t("orders.payment.capture")}
              </span>
              <span className="sm:hidden">
                {t("orders.payment.capture_short")}
              </span>
            </Button>
          </div>
        </div>
      )}
      {refunds.map((refund) => (
        <Refund key={refund.id} refund={refund} currencyCode={currencyCode} />
      ))}
    </div>
  )
}

const CreditLine = ({
  creditLine,
  currencyCode,
  plugins,
}: {
  creditLine: OrderCreditLineDTO
  currencyCode: string
  plugins: HttpTypes.AdminPlugin[]
}) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const loyaltyPlugin = getLoyaltyPlugin(plugins)

  if (!loyaltyPlugin) {
    return null
  }

  const prettyReference = creditLine.reference
    ?.split("_")
    .join(" ")
    .split("-")
    .join(" ")

  const prettyReferenceId = creditLine.reference_id ? (
    <DisplayId id={creditLine.reference_id} />
  ) : null

  return (
    <div className="divide-y divide-dashed">
      <div className="text-ui-fg-subtle grid grid-cols-[1fr_1fr_20px] items-center gap-x-4 px-6 py-4 sm:grid-cols-[1fr_1fr_1fr_20px]">
        <div className="w-full min-w-[60px] overflow-hidden">
          <Text
            size="small"
            leading="compact"
            weight="plus"
            className="truncate"
          >
            {loyaltyPlugin ? (
              <Text size="small" leading="compact" weight="plus">
                {t("orders.creditLines.storeCreditRefund")}
              </Text>
            ) : (
              <DisplayId id={creditLine.id} />
            )}
          </Text>
          <Text size="small" leading="compact">
            {getFullDate({
              date: creditLine.created_at as unknown as string,
              includeTime: true,
            })}
          </Text>
        </div>
        <div className="hidden items-center justify-end sm:flex">
          <Text size="small" leading="compact" className="capitalize">
            {prettyReference} ({prettyReferenceId})
          </Text>
        </div>
        <div className="flex items-center justify-end">
          <Text size="small" leading="compact">
            {getLocaleAmount(creditLine.amount as number, currencyCode)}
          </Text>
        </div>
      </div>
    </div>
  )
}

const PendingAuthorizationBanner = ({
  order,
  sessionId,
}: {
  order: HttpTypes.AdminOrder
  sessionId: string
}) => {
  const { t } = useTranslation()
  const { mutateAsync, isPending } = useAuthorizePaymentSession(
    order.id,
    sessionId
  )

  const handleCheckStatus = async () => {
    await mutateAsync(undefined, {
      onSuccess: ({ is_authorized }) => {
        if (is_authorized) {
          toast.success(t("orders.payment.checkStatusSuccess"))
        } else {
          toast.info(t("orders.payment.stillPending"))
        }
      },
      onError: (error) => {
        toast.error(error.message)
      },
    })
  }

  return (
    <div className="bg-ui-bg-subtle flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-x-2">
        <ArrowDownRightMini className="text-ui-fg-muted shrink-0" />
        <Text size="small" leading="compact">
          {t("orders.payment.pendingAuthorization")}
        </Text>
      </div>

      <Button
        className="shrink-0"
        size="small"
        variant="secondary"
        onClick={handleCheckStatus}
        disabled={isPending}
      >
        {t("orders.payment.checkStatus")}
      </Button>
    </div>
  )
}

const PaymentBreakdown = ({
  order,
  payments,
  refunds,
  currencyCode,
  plugins,
}: {
  order: ExtendedOrder
  payments: HttpTypes.AdminPayment[]
  refunds: ExtendedRefund[]
  currencyCode: string
  plugins: HttpTypes.AdminPlugin[]
}) => {
  const pendingAuthSessions = (order.payment_collections ?? []).flatMap((pc) =>
    ((pc as any).payment_sessions ?? [])
      .filter((s: any) => s.status === "pending_authorization")
      .map((s: any) => ({ session_id: s.id }))
  )

  /**
   * Refunds that are not associated with a payment.
   */
  const orderRefunds = refunds.filter((refund) => refund.payment_id === null)
  const creditLines = order.credit_lines ?? []
  const creditLineRefunds = creditLines.filter(
    (creditLine) => (creditLine.amount as number) < 0
  )

  const entries = [...orderRefunds, ...payments, ...creditLineRefunds]
    .sort((a, b) => {
      return (
        new Date(a.created_at as string).getTime() -
        new Date(b.created_at as string).getTime()
      )
    })
    .map((entry) => {
      let type = entry.id.startsWith("pay_") ? "payment" : "refund"

      if (entry.id.startsWith("ordcl_")) {
        type = "credit_line_refund"
      }

      return { event: entry, type }
    }) as (
    | { type: "payment"; event: HttpTypes.AdminPayment }
    | { type: "refund"; event: HttpTypes.AdminRefund }
    | {
        type: "credit_line_refund"
        event: OrderCreditLineDTO
      }
  )[]

  return (
    <div className="flex flex-col divide-y divide-dashed">
      {pendingAuthSessions.map(({ session_id }) => (
        <PendingAuthorizationBanner
          key={session_id}
          order={order}
          sessionId={session_id}
        />
      ))}
      {entries.map(({ type, event }) => {
        switch (type) {
          case "payment":
            return (
              <Payment
                key={event.id}
                order={order}
                payment={event}
                refunds={refunds.filter(
                  (refund) => refund.payment_id === event.id
                )}
                currencyCode={currencyCode}
              />
            )
          case "refund":
            return (
              <Refund
                key={event.id}
                refund={event}
                currencyCode={currencyCode}
              />
            )
          case "credit_line_refund":
            return (
              <CreditLine
                key={event.id}
                creditLine={event}
                currencyCode={currencyCode}
                plugins={plugins}
              />
            )
        }
      })}
    </div>
  )
}

const Total = ({ order }: { order: AdminOrder }) => {
  const { t } = useTranslation()
  const totalPending = getTotalPending(order.payment_collections)

  return (
    <div className="flex flex-col gap-y-4 px-6 py-4">
      <div className="flex items-center justify-between">
        <Text size="small" weight="plus" leading="compact">
          {t("orders.payment.totalPaidByCustomer")}
        </Text>

        <Text size="small" weight="plus" leading="compact">
          {getStylizedAmount(
            getTotalCaptured(order.payment_collections),
            order.currency_code
          )}
        </Text>
      </div>

      {order.status !== "canceled" && totalPending > 0 && (
        <div className="flex items-center justify-between">
          <Text size="small" weight="plus" leading="compact">
            {t("orders.payment.totalPending")}
          </Text>

          <Text size="small" weight="plus" leading="compact">
            {getStylizedAmount(totalPending, order.currency_code)}
          </Text>
        </div>
      )}
    </div>
  )
}
