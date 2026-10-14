import { Input, Label, Select, Text, Textarea } from "@medusajs/ui"
import { UseFormReturn, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../../components/common/form"
import { SwitchBox } from "../../../../components/common/switch-box"
import { SettingsEditDrawer } from "../../../../components/settings"
import {
  EMPTY_PRE_NOTICE_ENTRY,
  PAYMENT_PRE_NOTICE_REDIRECT_KINDS,
  type PaymentPreNoticeProviderKey,
  type PaymentPreNoticeRedirectKind,
  useTenantPaymentPreNotice,
  useUpdateTenantPaymentPreNotice,
} from "../../../../hooks/api/payment-pre-notice"
import { prePaymentNoticeText } from "../../../../lib/payment-pre-notice"

// t-2026-10-14-01 (panel redesign, G3, prototype state
// `payments-tribute-pre-notice-edit`): the one drawer of «Уведомление перед
// оплатой», shared by every method card that carries the section. The method
// is the card's, so the «Способ оплаты» select of the old card is gone; the
// fields are the old card's, in the prototype's order, and the preview below
// them is the ready phrase a buyer with a rouble cart reads (audit A6: no
// placeholder key in it). One PUT names one `provider_key` and changes only
// its entry, as before.

const NONE = "none" as const
const REDIRECT_OPTIONS = [NONE, ...PAYMENT_PRE_NOTICE_REDIRECT_KINDS] as const

const PreNoticeSchema = zod.object({
  is_foreign_card: zod.boolean(),
  charge_currency_code: zod.string().trim().max(10),
  redirect_kind: zod.enum(REDIRECT_OPTIONS),
  redirect_value: zod.string().trim().max(200),
  rate_source: zod.string().trim().max(200),
  refund_terms: zod.string().trim(),
})

type PreNoticeForm = zod.infer<typeof PreNoticeSchema>

/** The cards that carry the section, and the title their drawer says it for. */
export type PreNoticeWay = Extract<PaymentPreNoticeProviderKey, "robokassa" | "tribute" | "btcpay" | "bitcart" | "manual">

export const PaymentPreNoticeEdit = ({ providerKey }: { providerKey: PreNoticeWay }) => {
  const { t } = useTranslation()
  const { paymentPreNotice, isPending, isError, error } = useTenantPaymentPreNotice()
  const { mutateAsync } = useUpdateTenantPaymentPreNotice()

  if (isError) {
    throw error
  }

  const entry = paymentPreNotice?.[providerKey] ?? EMPTY_PRE_NOTICE_ENTRY

  const save = (values: PreNoticeForm) => {
    const redirect = values.redirect_kind === NONE ? null : values.redirect_kind
    return mutateAsync({
      provider_key: providerKey,
      is_foreign_card: values.is_foreign_card,
      charge_currency_code: values.charge_currency_code,
      redirect_kind: redirect,
      redirect_value: redirect ? values.redirect_value : "",
      rate_source: values.rate_source,
      refund_terms: values.refund_terms,
    })
  }

  return (
    <SettingsEditDrawer
      title={t("paymentMethods.preNotice.drawerTitle", {
        method: t(`paymentMethods.ways.${providerKey}.title`),
      })}
      description={t("paymentMethods.preNotice.description")}
      isPending={isPending}
      schema={PreNoticeSchema}
      defaultValues={{
        is_foreign_card: entry.is_foreign_card,
        charge_currency_code: entry.charge_currency_code ?? "",
        redirect_kind: entry.redirect_kind ?? NONE,
        redirect_value: entry.redirect_value ?? "",
        rate_source: entry.rate_source ?? "",
        refund_terms: entry.refund_terms ?? "",
      }}
      onSubmit={save}
      successMessage={t("paymentMethods.preNotice.saved")}
    >
      {(form) => <PreNoticeFields form={form} />}
    </SettingsEditDrawer>
  )
}

const PreNoticeFields = ({ form }: { form: UseFormReturn<PreNoticeForm> }) => {
  const { t } = useTranslation()
  const values = useWatch({ control: form.control })
  const kind = values.redirect_kind ?? NONE

  const preview = prePaymentNoticeText(
    {
      is_foreign_card: Boolean(values.is_foreign_card),
      charge_currency_code: values.charge_currency_code ?? null,
      redirect_kind: kind === NONE ? null : (kind as PaymentPreNoticeRedirectKind),
      redirect_value: values.redirect_value ?? null,
      rate_source: values.rate_source ?? null,
      refund_terms: values.refund_terms ?? null,
    },
    t
  )

  return (
    <>
      <SwitchBox
        control={form.control}
        name="is_foreign_card"
        label={t("paymentPreNotice.isForeignCard")}
        description={t("paymentMethods.preNotice.foreignCardHint")}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Form.Field
          control={form.control}
          name="charge_currency_code"
          render={({ field }) => (
            <Form.Item>
              <Form.Label optional>{t("paymentPreNotice.chargeCurrency")}</Form.Label>
              <Form.Control>
                <Input
                  {...field}
                  maxLength={10}
                  placeholder={t("paymentPreNotice.chargeCurrencyPlaceholder")}
                  data-testid="pre-notice-charge-currency"
                />
              </Form.Control>
              <Form.Hint>{t("paymentMethods.preNotice.chargeCurrencyHint")}</Form.Hint>
              <Form.ErrorMessage />
            </Form.Item>
          )}
        />
        <Form.Field
          control={form.control}
          name="redirect_kind"
          render={({ field: { value, onChange, ref, ...field } }) => (
            <Form.Item>
              <Form.Label>{t("paymentPreNotice.redirectKind.label")}</Form.Label>
              <Form.Control>
                <Select {...field} value={value} onValueChange={onChange}>
                  <Select.Trigger ref={ref} data-testid="pre-notice-redirect-kind">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {REDIRECT_OPTIONS.map((option) => (
                      <Select.Item key={option} value={option}>
                        {t(`paymentPreNotice.redirectKind.${option}`)}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </Form.Control>
              <Form.ErrorMessage />
            </Form.Item>
          )}
        />
      </div>
      {kind !== NONE ? (
        <Form.Field
          control={form.control}
          name="redirect_value"
          render={({ field }) => (
            <Form.Item>
              <Form.Label>{t(`paymentMethods.preNotice.redirectValue.${kind}.label`)}</Form.Label>
              <Form.Control>
                <Input
                  {...field}
                  maxLength={200}
                  placeholder={t(`paymentMethods.preNotice.redirectValue.${kind}.placeholder`)}
                  data-testid="pre-notice-redirect-value"
                />
              </Form.Control>
              <Form.ErrorMessage />
            </Form.Item>
          )}
        />
      ) : null}
      <Form.Field
        control={form.control}
        name="rate_source"
        render={({ field }) => (
          <Form.Item>
            <Form.Label optional>{t("paymentPreNotice.rateSource")}</Form.Label>
            <Form.Control>
              <Input {...field} maxLength={200} placeholder={t("paymentPreNotice.rateSourcePlaceholder")} />
            </Form.Control>
            <Form.ErrorMessage />
          </Form.Item>
        )}
      />
      <Form.Field
        control={form.control}
        name="refund_terms"
        render={({ field }) => (
          <Form.Item>
            <Form.Label optional>{t("paymentPreNotice.refundTerms")}</Form.Label>
            <Form.Control>
              <Textarea {...field} rows={2} placeholder={t("paymentPreNotice.refundTermsPlaceholder")} />
            </Form.Control>
            <Form.ErrorMessage />
          </Form.Item>
        )}
      />
      <section
        className="bg-ui-bg-subtle flex flex-col gap-y-2 rounded-lg border border-ui-border-base p-4"
        data-testid="pre-notice-drawer-preview"
      >
        <Label size="small" weight="plus">
          {t("paymentMethods.preNotice.previewLabel")}
        </Label>
        {preview === null ? (
          <Text size="small" className="text-ui-fg-muted">
            {t("paymentMethods.preNotice.previewHidden")}
          </Text>
        ) : (
          <Text size="small" className="text-pretty">
            {preview || t("paymentMethods.preNotice.onlyIntro")}
          </Text>
        )}
      </section>
    </>
  )
}
