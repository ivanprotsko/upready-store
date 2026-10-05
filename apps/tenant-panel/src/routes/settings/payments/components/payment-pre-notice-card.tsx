import { useEffect, useRef, useState } from "react"
import { Button, Container, Heading, Input, Label, Select, Switch, Text, Textarea, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import {
  PAYMENT_PRE_NOTICE_PROVIDER_KEYS,
  PAYMENT_PRE_NOTICE_REDIRECT_KINDS,
  EMPTY_PRE_NOTICE_ENTRY,
  type PaymentPreNoticeEntry,
  type PaymentPreNoticeProviderKey,
  type PaymentPreNoticeRedirectKind,
  type TenantPaymentPreNotice,
  useTenantPaymentPreNotice,
  useUpdateTenantPaymentPreNotice,
} from "../../../../hooks/api/payment-pre-notice"
import { useTenantBtcpay } from "../../../../hooks/api/btcpay"
import { shouldShowPrePaymentNotice } from "../../../../lib/payment-pre-notice"

/**
 * «Предупреждение перед оплатой» (rule 5zd, t-2026-10-03-32): одна карточка,
 * пять способов оплаты (Robokassa, Tribute, BTCPay Server, перевод по
 * реквизитам, иностранная карта), для каждого — свои поля и живой
 * предпросмотр текста.
 *
 * Rule 19h: пока ответ не пришёл, элементы управления отрисованы, но
 * недоступны, а не скрыты; ранний ответ не перезатирает то, что владелец уже
 * начал печатать (`touchedKeys`).
 */

const METHOD_LABEL_KEYS: Record<PaymentPreNoticeProviderKey, string> = {
  robokassa: "paymentSettings.methodsSummary.robokassa",
  tribute: "paymentPreNotice.methods.tribute",
  btcpay: "btcpay.title",
  manual: "paymentSettings.methodsSummary.manual",
  card: "paymentPreNotice.methods.card",
}

type Draft = Record<PaymentPreNoticeProviderKey, PaymentPreNoticeEntry>

const EMPTY_DRAFT: Draft = {
  robokassa: { ...EMPTY_PRE_NOTICE_ENTRY },
  tribute: { ...EMPTY_PRE_NOTICE_ENTRY },
  btcpay: { ...EMPTY_PRE_NOTICE_ENTRY },
  manual: { ...EMPTY_PRE_NOTICE_ENTRY },
  card: { ...EMPTY_PRE_NOTICE_ENTRY },
}

const draftFrom = (doc: TenantPaymentPreNotice | undefined): Draft =>
  doc ? { ...EMPTY_DRAFT, ...doc } : EMPTY_DRAFT

export const PaymentPreNoticeCard = () => {
  const { t } = useTranslation()
  const { paymentPreNotice, isPending, isError, error } = useTenantPaymentPreNotice()
  const { mutateAsync: save, isPending: isSaving } = useUpdateTenantPaymentPreNotice()
  // BTCPay is a method to describe only where the instance takes cryptocurrency.
  const { btcpay } = useTenantBtcpay()
  const methodKeys = PAYMENT_PRE_NOTICE_PROVIDER_KEYS.filter(
    (key) => key !== "btcpay" || btcpay?.available === true
  )

  const [loaded, setLoaded] = useState<boolean | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [activeKey, setActiveKey] = useState<PaymentPreNoticeProviderKey>("robokassa")
  const [previewCurrency, setPreviewCurrency] = useState("rub")
  const touchedKeysRef = useRef<Set<PaymentPreNoticeProviderKey>>(new Set())

  useEffect(() => {
    if (isPending) {
      return
    }
    setLoaded(true)
    const next = draftFrom(paymentPreNotice)
    setDraft((previous) => {
      const merged = { ...previous }
      for (const key of PAYMENT_PRE_NOTICE_PROVIDER_KEYS) {
        if (!touchedKeysRef.current.has(key)) {
          merged[key] = next[key]
        }
      }
      return merged
    })
  }, [isPending, paymentPreNotice])

  if (isError) {
    throw error
  }

  const busy = loaded === null || isSaving
  const entry = draft[activeKey]

  const updateEntry = (patch: Partial<PaymentPreNoticeEntry>) => {
    touchedKeysRef.current.add(activeKey)
    setDraft((previous) => ({ ...previous, [activeKey]: { ...previous[activeKey], ...patch } }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const keys = [...touchedKeysRef.current]
    if (keys.length === 0) {
      return
    }
    try {
      for (const key of keys) {
        const value = draft[key]
        await save({
          provider_key: key,
          charge_currency_code: value.charge_currency_code ?? "",
          is_foreign_card: value.is_foreign_card,
          redirect_kind: value.redirect_kind,
          redirect_value: value.redirect_value ?? "",
          rate_source: value.rate_source ?? "",
          refund_terms: value.refund_terms ?? "",
        })
      }
      touchedKeysRef.current = new Set()
      toast.success(t("paymentPreNotice.saved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const redirectLabel: Record<PaymentPreNoticeRedirectKind, string> = {
    domain: t("paymentPreNotice.redirectKind.domain"),
    telegram_bot: t("paymentPreNotice.redirectKind.telegram_bot"),
    crypto_network: t("paymentPreNotice.redirectKind.crypto_network"),
    bank: t("paymentPreNotice.redirectKind.bank"),
  }

  const previewShows = shouldShowPrePaymentNotice(entry, previewCurrency)
  const previewText = previewShows
    ? [
        entry.redirect_kind
          ? t(`paymentPreNotice.preview.redirect.${entry.redirect_kind}`, {
              value: entry.redirect_value || t("paymentPreNotice.preview.valuePlaceholder"),
            })
          : null,
        entry.charge_currency_code
          ? entry.rate_source
            ? t("paymentPreNotice.preview.chargeWithSource", {
                currency: entry.charge_currency_code.toUpperCase(),
                rateSource: entry.rate_source,
              })
            : t("paymentPreNotice.preview.chargeNoSource", {
                currency: entry.charge_currency_code.toUpperCase(),
              })
          : null,
        entry.refund_terms ? t("paymentPreNotice.preview.refund", { terms: entry.refund_terms }) : null,
      ]
        .filter(Boolean)
        .join(" ")
    : null

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading>{t("paymentPreNotice.title")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("paymentPreNotice.subtitle")}
          </Text>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-y-6 px-6 py-6">
        <div className="flex flex-col gap-y-2">
          <Label size="small">{t("paymentPreNotice.method")}</Label>
          <Select
            value={activeKey}
            onValueChange={(value) => setActiveKey(value as PaymentPreNoticeProviderKey)}
          >
            <Select.Trigger data-testid="payment-pre-notice-method">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {methodKeys.map((key) => (
                <Select.Item key={key} value={key}>
                  {t(METHOD_LABEL_KEYS[key])}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>

        <div className="flex items-center gap-x-3">
          <Switch
            id="pre_notice_foreign_card"
            checked={entry.is_foreign_card}
            disabled={busy}
            onCheckedChange={(checked) => updateEntry({ is_foreign_card: checked })}
            data-testid="payment-pre-notice-foreign-card"
          />
          <Label htmlFor="pre_notice_foreign_card">{t("paymentPreNotice.isForeignCard")}</Label>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-y-1">
            <Label htmlFor="pre_notice_currency" size="small">
              {t("paymentPreNotice.chargeCurrency")}
            </Label>
            <Input
              id="pre_notice_currency"
              size="small"
              value={entry.charge_currency_code ?? ""}
              disabled={busy}
              maxLength={10}
              placeholder={t("paymentPreNotice.chargeCurrencyPlaceholder")}
              onChange={(event) => updateEntry({ charge_currency_code: event.target.value })}
              data-testid="payment-pre-notice-charge-currency"
            />
          </div>

          <div className="flex flex-col gap-y-1">
            <Label size="small">{t("paymentPreNotice.redirectKind.label")}</Label>
            <Select
              value={entry.redirect_kind ?? "none"}
              onValueChange={(value) =>
                updateEntry({
                  redirect_kind: value === "none" ? null : (value as PaymentPreNoticeRedirectKind),
                })
              }
            >
              <Select.Trigger data-testid="payment-pre-notice-redirect-kind">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="none">{t("paymentPreNotice.redirectKind.none")}</Select.Item>
                {PAYMENT_PRE_NOTICE_REDIRECT_KINDS.map((kind) => (
                  <Select.Item key={kind} value={kind}>
                    {redirectLabel[kind]}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>

          {entry.redirect_kind && (
            <div className="flex flex-col gap-y-1 md:col-span-2">
              <Label htmlFor="pre_notice_redirect_value" size="small">
                {t("paymentPreNotice.redirectValue")}
              </Label>
              <Input
                id="pre_notice_redirect_value"
                size="small"
                value={entry.redirect_value ?? ""}
                disabled={busy}
                maxLength={200}
                placeholder={t("paymentPreNotice.redirectValuePlaceholder")}
                onChange={(event) => updateEntry({ redirect_value: event.target.value })}
                data-testid="payment-pre-notice-redirect-value"
              />
            </div>
          )}

          <div className="flex flex-col gap-y-1 md:col-span-2">
            <Label htmlFor="pre_notice_rate_source" size="small">
              {t("paymentPreNotice.rateSource")}
            </Label>
            <Input
              id="pre_notice_rate_source"
              size="small"
              value={entry.rate_source ?? ""}
              disabled={busy}
              maxLength={200}
              placeholder={t("paymentPreNotice.rateSourcePlaceholder")}
              onChange={(event) => updateEntry({ rate_source: event.target.value })}
              data-testid="payment-pre-notice-rate-source"
            />
          </div>

          <div className="flex flex-col gap-y-1 md:col-span-2">
            <Label htmlFor="pre_notice_refund" size="small">
              {t("paymentPreNotice.refundTerms")}
            </Label>
            <Textarea
              id="pre_notice_refund"
              rows={2}
              value={entry.refund_terms ?? ""}
              disabled={busy}
              placeholder={t("paymentPreNotice.refundTermsPlaceholder")}
              onChange={(event) => updateEntry({ refund_terms: event.target.value })}
            />
          </div>
        </div>

        <section
          className="flex flex-col gap-y-2 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4"
          data-testid="payment-pre-notice-preview"
        >
          <div className="flex items-center justify-between gap-x-3">
            <Label size="small">{t("paymentPreNotice.previewLabel")}</Label>
            <div className="flex items-center gap-x-2">
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("paymentPreNotice.previewCartCurrency")}
              </Text>
              <Input
                size="small"
                className="w-20"
                value={previewCurrency}
                onChange={(event) => setPreviewCurrency(event.target.value)}
                data-testid="payment-pre-notice-preview-currency"
              />
            </div>
          </div>
          {previewShows ? (
            <Text size="small" data-testid="payment-pre-notice-preview-text">
              {previewText}
            </Text>
          ) : (
            <Text size="small" className="text-ui-fg-muted" data-testid="payment-pre-notice-preview-hidden">
              {t("paymentPreNotice.previewHidden")}
            </Text>
          )}
        </section>

        <div className="flex items-center gap-x-2">
          <Button
            type="submit"
            size="small"
            isLoading={isSaving}
            disabled={busy}
            data-testid="payment-pre-notice-save"
          >
            {t("paymentPreNotice.save")}
          </Button>
        </div>
      </form>
    </Container>
  )
}
