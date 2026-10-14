import { Select } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Navigate, useParams } from "react-router-dom"
import * as zod from "zod"

import { Form } from "../../../../components/common/form"
import { SettingsEditDrawer } from "../../../../components/settings"
import {
  type BankRequisite,
  type CryptoRequisite,
  type PaymentIconPreset,
  type PaymentRequisite,
  useTenantManualPayment,
  useUpdateTenantManualPayment,
} from "../../../../hooks/api/manual-payment"
import {
  CRYPTO_CURRENCIES,
  CRYPTO_NETWORKS,
  OTHER_BANK,
  REQUISITES_MAX,
  bankDraftErrors,
  bankDraftFrom,
  bankRequisite,
  cryptoDraftErrors,
  cryptoDraftFrom,
  cryptoRequisite,
  isKnownNetwork,
  putRequisite,
} from "../../../../lib/payment-requisites"
import { RequisiteIcon } from "./manual-payment-card"
import { MethodTextField } from "./method-text-field"

// t-2026-10-14-01 (panel redesign, G3, line us-8, prototype state
// `payments-manual-requisite-edit`): the drawer of one requisite — «Банк»
// (bank, number, recipient) or «Криптокошелёк» (currency, network, address).
// Routes: `bank/create`, `crypto/create` and `requisites/:requisiteId/edit`
// under `/settings/payments/manual`. It replaces the form under the old list
// with «Готово / Отмена»: the checks are the same (`bankDraftErrors`,
// `cryptoDraftErrors`, the backend's own rules) and the drawer sends the
// whole list with this item in its place, or last when it is new. The bank's
// name stays a field even for a bank from the list, so the owner can still
// call it the way the buyer should read it.

const BankSchema = zod.object({
  icon: zod.string(),
  bank: zod.string().max(60),
  number: zod.string().max(64),
  holder: zod.string().max(100),
})

const CryptoSchema = zod.object({
  currency: zod.string(),
  network: zod.string(),
  address: zod.string().max(200),
})

type Save = (item: PaymentRequisite) => Promise<unknown>

const BankDrawer = ({
  stored,
  presets,
  save,
}: {
  stored?: BankRequisite
  presets: PaymentIconPreset[]
  save: Save
}) => {
  const { t } = useTranslation()

  const schema = BankSchema.superRefine((draft, ctx) => {
    for (const [field, key] of Object.entries(bankDraftErrors(draft))) {
      ctx.addIssue({ code: "custom", path: [field], message: t(key as string) })
    }
  })

  const banks = presets.filter((preset) => preset.kind === "bank")
  // A stored icon the list no longer has stays pickable under the stored name.
  const options =
    stored?.icon && !banks.some((preset) => preset.key === stored.icon)
      ? [...banks, { key: stored.icon, name: stored.bank, country: null, kind: "bank" as const }]
      : banks

  return (
    <SettingsEditDrawer
      title={t("manualPayment.bank.title")}
      schema={schema}
      defaultValues={bankDraftFrom(stored)}
      onSubmit={(draft) => save(bankRequisite(draft, stored?.id))}
      successMessage={t("paymentMethods.manual.requisiteSaved")}
    >
      {(form) => (
        <>
          <Form.Field
            control={form.control}
            name="icon"
            render={({ field: { value, onChange, ref, ...field } }) => (
              <Form.Item>
                <Form.Label>{t("manualPayment.bank.pick")}</Form.Label>
                <Form.Control>
                  <Select
                    {...field}
                    value={value}
                    onValueChange={(next) => {
                      onChange(next)
                      const preset = options.find((option) => option.key === next)
                      form.setValue("bank", preset ? preset.name : "", { shouldDirty: true })
                    }}
                  >
                    <Select.Trigger ref={ref} data-testid="manual-requisite-bank-pick">
                      <Select.Value placeholder={t("paymentMethods.manual.bankPlaceholder")} />
                    </Select.Trigger>
                    <Select.Content>
                      {options.map((option) => (
                        <Select.Item key={option.key} value={option.key}>
                          <span className="flex items-center gap-x-2">
                            <RequisiteIcon icon={option.key} name={option.name} className="size-5" />
                            {option.name}
                          </span>
                        </Select.Item>
                      ))}
                      <Select.Item value={OTHER_BANK}>{t("manualPayment.bank.other")}</Select.Item>
                    </Select.Content>
                  </Select>
                </Form.Control>
                <Form.Hint>{t("paymentMethods.manual.bankHint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <MethodTextField
            control={form.control}
            name="bank"
            label={t("manualPayment.bank.name")}
            hint={t("paymentMethods.manual.nameHint")}
            testId="manual-requisite-bank"
          />
          <MethodTextField
            control={form.control}
            name="number"
            label={t("manualPayment.bank.number")}
            placeholder={t("manualPayment.bank.numberPlaceholder")}
            mono
            testId="manual-requisite-number"
          />
          <MethodTextField
            control={form.control}
            name="holder"
            label={t("manualPayment.bank.holder")}
            hint={t("paymentMethods.manual.holderHint")}
            testId="manual-requisite-holder"
          />
        </>
      )}
    </SettingsEditDrawer>
  )
}

const CryptoDrawer = ({ stored, save }: { stored?: CryptoRequisite; save: Save }) => {
  const { t } = useTranslation()

  const schema = CryptoSchema.superRefine((draft, ctx) => {
    for (const [field, key] of Object.entries(cryptoDraftErrors(draft))) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: t(key as string, {
          network: draft.network,
          hint: isKnownNetwork(draft.network) ? t(`manualPayment.addressHint.${draft.network}`) : "",
        }),
      })
    }
  })

  return (
    <SettingsEditDrawer
      title={t("manualPayment.crypto.title")}
      schema={schema}
      defaultValues={cryptoDraftFrom(stored)}
      onSubmit={(draft) => save(cryptoRequisite(draft, stored?.id))}
      successMessage={t("paymentMethods.manual.requisiteSaved")}
    >
      {(form) => {
        const network = form.watch("network")

        return (
          <>
            <Form.Field
              control={form.control}
              name="currency"
              render={({ field: { value, onChange, ref, ...field } }) => (
                <Form.Item>
                  <Form.Label>{t("manualPayment.crypto.currency")}</Form.Label>
                  <Form.Control>
                    <Select {...field} value={value} onValueChange={onChange}>
                      <Select.Trigger ref={ref} data-testid="manual-requisite-currency">
                        <Select.Value />
                      </Select.Trigger>
                      <Select.Content>
                        {CRYPTO_CURRENCIES.map((currency) => (
                          <Select.Item key={currency} value={currency}>
                            {currency}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            <Form.Field
              control={form.control}
              name="network"
              render={({ field: { value, onChange, ref, ...field } }) => (
                <Form.Item>
                  <Form.Label>{t("manualPayment.crypto.network")}</Form.Label>
                  <Form.Control>
                    <Select {...field} value={value} onValueChange={onChange}>
                      <Select.Trigger ref={ref} data-testid="manual-requisite-network">
                        <Select.Value placeholder={t("manualPayment.crypto.networkPlaceholder")} />
                      </Select.Trigger>
                      <Select.Content>
                        {CRYPTO_NETWORKS.map((option) => (
                          <Select.Item key={option} value={option}>
                            {option}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            <MethodTextField
              control={form.control}
              name="address"
              label={t("manualPayment.crypto.address")}
              hint={isKnownNetwork(network) ? t(`manualPayment.addressHint.${network}`) : undefined}
              mono
              testId="manual-requisite-address"
            />
          </>
        )
      }}
    </SettingsEditDrawer>
  )
}

export const ManualRequisiteEdit = ({ create }: { create?: PaymentRequisite["kind"] }) => {
  const { requisiteId } = useParams()
  const { manualPayment, presets, isPending, isError, error } = useTenantManualPayment()
  const { mutateAsync } = useUpdateTenantManualPayment()

  if (isError) {
    throw error
  }

  if (isPending || !manualPayment) {
    // The drawer opens once the list is read: a save must not drop the stored items.
    return null
  }

  const items = manualPayment.requisites
  const stored = create ? undefined : items.find((item) => item.id === requisiteId)

  // A requisite that is gone, or a new one past the limit, leads back to the card.
  if ((!create && !stored) || (create && items.length >= REQUISITES_MAX)) {
    return <Navigate to="/settings/payments/manual" replace />
  }

  const save: Save = (item) => mutateAsync({ requisites: putRequisite(items, item) })

  return (create ?? stored?.kind) === "crypto" ? (
    <CryptoDrawer stored={stored?.kind === "crypto" ? stored : undefined} save={save} />
  ) : (
    <BankDrawer stored={stored?.kind === "bank" ? stored : undefined} presets={presets} save={save} />
  )
}
