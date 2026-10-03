import { useEffect, useRef, useState } from "react"
import { ArrowDownMini, ArrowUpMini, PencilSquare, Plus, Trash } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  Hint,
  IconButton,
  Input,
  Label,
  Select,
  Switch,
  Text,
  Textarea,
  clx,
  toast,
} from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import {
  type ManualPaymentContacts,
  type PaymentIconPreset,
  type PaymentRequisite,
  type TenantManualPayment,
  useTenantManualPayment,
  useUpdateTenantManualPayment,
} from "../../../../hooks/api/manual-payment"
import {
  CRYPTO_CURRENCIES,
  CRYPTO_NETWORKS,
  REQUISITES_MAX,
  initialsOf,
  isKnownNetwork,
  isValidBankNumber,
  isValidCryptoAddress,
  maskAddress,
  maskBankNumber,
  moveItem,
} from "../../../../lib/payment-requisites"

/**
 * «Перевод по реквизитам» (olavka-payments; t-cherk-com-hotfix batch 6, Ivan
 * 03.10: «Все в одном списке, редактирует через админку», «чтобы можно было
 * редактировать реквизиты, добавлять новые способы оплаты»). ONE ordered list
 * of bank items and crypto wallets, one switch for the whole method, and the
 * manager contacts the buyer uses to confirm the order. The buyer places the
 * order without paying on the site; it stays «awaiting payment» until the
 * owner confirms it under the order's payment.
 *
 * An item is added or changed in the form under the list («Готово»), and the
 * whole document is written by «Сохранить», like every other field here.
 *
 * Rule 19h shapes the load like the Robokassa form above: `loaded === null` is
 * «not answered yet» with the real controls rendered disabled, and a late
 * answer refills the draft only while the owner has not typed into it.
 */

type ContactsDraft = { whatsapp: string; telegram: string; email: string; note: string }

type Draft = {
  enabled: boolean
  requisites: PaymentRequisite[]
  contacts: ContactsDraft
}

type BankForm = {
  kind: "bank"
  id?: string
  icon: string | null
  /** «Другой банк»: no preset, the name typed by hand. */
  custom: boolean
  bank: string
  number: string
  holder: string
}

type CryptoForm = {
  kind: "crypto"
  id?: string
  currency: string
  network: string
  address: string
}

type ItemForm = BankForm | CryptoForm

/** The item being added (`index === null`) or changed, with its field errors after «Готово». */
type Editing = { index: number | null; form: ItemForm; errors: Record<string, string> }

const EMPTY_CONTACTS: ContactsDraft = { whatsapp: "", telegram: "", email: "", note: "" }

const EMPTY_DRAFT: Draft = { enabled: false, requisites: [], contacts: EMPTY_CONTACTS }

const contactsDraft = (contacts: ManualPaymentContacts): ContactsDraft => ({
  whatsapp: contacts.whatsapp ?? "",
  telegram: contacts.telegram ?? "",
  email: contacts.email ?? "",
  note: contacts.note ?? "",
})

const draftFrom = (record: TenantManualPayment | undefined): Draft =>
  record
    ? {
        enabled: record.enabled,
        requisites: record.requisites.map((item) => ({ ...item })),
        contacts: contactsDraft(record.contacts),
      }
    : EMPTY_DRAFT

const formFrom = (item: PaymentRequisite): ItemForm =>
  item.kind === "bank"
    ? {
        kind: "bank",
        id: item.id,
        icon: item.icon,
        custom: !item.icon,
        bank: item.bank,
        number: item.number,
        holder: item.holder ?? "",
      }
    : {
        kind: "crypto",
        id: item.id,
        currency: item.currency,
        network: item.network,
        address: item.address,
      }

/** The panel's own copy of the storefront's icons (`public/payment-icons`). */
const iconUrl = (key: string) => `${import.meta.env.BASE_URL}payment-icons/${key}.png`

const RequisiteIcon = ({ icon, name }: { icon: string | null; name: string }) => {
  const [failed, setFailed] = useState(false)

  if (!icon || failed) {
    return (
      <div className="bg-ui-bg-component text-ui-fg-subtle txt-compact-xsmall-plus flex size-8 shrink-0 items-center justify-center rounded-md border border-ui-border-base">
        {initialsOf(name)}
      </div>
    )
  }

  return (
    <img
      src={iconUrl(icon)}
      alt=""
      className="size-8 shrink-0 rounded-md border border-ui-border-base bg-ui-bg-base object-contain"
      onError={() => setFailed(true)}
    />
  )
}

const itemIcon = (item: PaymentRequisite): string | null =>
  item.kind === "bank" ? item.icon : item.currency.toLowerCase()

const itemName = (item: PaymentRequisite): string =>
  item.kind === "bank" ? item.bank : `${item.currency} · ${item.network}`

const itemValue = (item: PaymentRequisite): string =>
  item.kind === "bank" ? maskBankNumber(item.number) : maskAddress(item.address)

export const ManualPaymentCard = () => {
  const { t } = useTranslation()
  const { manualPayment, presets, isPending, isError, error } = useTenantManualPayment()
  const { mutateAsync: save, isPending: isSaving } = useUpdateTenantManualPayment()

  const [loaded, setLoaded] = useState<boolean | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [editing, setEditing] = useState<Editing | null>(null)
  const touchedRef = useRef(false)

  useEffect(() => {
    if (isPending) {
      return
    }
    setLoaded(true)
    if (!touchedRef.current) {
      setDraft(draftFrom(manualPayment))
    }
  }, [isPending, manualPayment])

  if (isError) {
    throw error
  }

  const busy = loaded === null || isSaving
  const bankPresets = presets.filter((preset) => preset.kind === "bank")
  const full = draft.requisites.length >= REQUISITES_MAX

  const touch = () => {
    touchedRef.current = true
  }

  const setRequisites = (requisites: PaymentRequisite[]) => {
    touch()
    setDraft((previous) => ({ ...previous, requisites }))
  }

  const updateContact = (key: keyof ContactsDraft, value: string) => {
    touch()
    setDraft((previous) => ({ ...previous, contacts: { ...previous.contacts, [key]: value } }))
  }

  const startBank = () =>
    setEditing({
      index: null,
      form: { kind: "bank", icon: null, custom: false, bank: "", number: "", holder: "" },
      errors: {},
    })

  const startCrypto = () =>
    setEditing({
      index: null,
      form: { kind: "crypto", currency: "USDT", network: "TRC20", address: "" },
      errors: {},
    })

  const updateForm = (patch: Partial<BankForm> | Partial<CryptoForm>) =>
    setEditing((previous) =>
      previous ? { ...previous, form: { ...previous.form, ...patch } as ItemForm } : previous
    )

  const pickPreset = (preset: PaymentIconPreset | null) =>
    updateForm(
      preset
        ? { icon: preset.key, custom: false, bank: preset.name }
        : { icon: null, custom: true, bank: "" }
    )

  const applyItem = () => {
    if (!editing) {
      return
    }
    const { form } = editing
    const errors: Record<string, string> = {}
    let item: PaymentRequisite

    if (form.kind === "bank") {
      const bank = form.bank.trim()
      const number = form.number.trim()
      if (!form.icon && !form.custom) {
        errors.preset = t("manualPayment.errors.pickBank")
      }
      if (!bank) {
        errors.bank = t("manualPayment.errors.bankName")
      }
      if (!isValidBankNumber(number)) {
        errors.number = t("manualPayment.errors.bankNumber")
      }
      item = {
        id: form.id,
        kind: "bank",
        icon: form.custom ? null : form.icon,
        bank,
        number,
        holder: form.holder.trim() || null,
      }
    } else {
      const address = form.address.trim()
      if (!isKnownNetwork(form.network)) {
        errors.network = t("manualPayment.errors.network")
      } else if (!isValidCryptoAddress(form.network, address)) {
        errors.address = t("manualPayment.errors.address", {
          network: form.network,
          hint: t(`manualPayment.addressHint.${form.network}`),
        })
      }
      item = {
        id: form.id,
        kind: "crypto",
        currency: form.currency,
        network: form.network,
        address,
      }
    }

    if (Object.keys(errors).length) {
      setEditing({ ...editing, errors })
      return
    }

    setRequisites(
      editing.index === null
        ? [...draft.requisites, item]
        : draft.requisites.map((existing, i) => (i === editing.index ? item : existing))
    )
    setEditing(null)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (editing) {
      toast.error(t("manualPayment.errors.finishItem"))
      return
    }
    const contacts = {
      whatsapp: draft.contacts.whatsapp.trim() || null,
      telegram: draft.contacts.telegram.trim() || null,
      email: draft.contacts.email.trim() || null,
      note: draft.contacts.note.trim() || null,
    }
    if (
      draft.enabled &&
      draft.requisites.length === 0 &&
      !contacts.whatsapp &&
      !contacts.telegram &&
      !contacts.email
    ) {
      toast.error(t("manualPayment.errors.nothingToOffer"))
      return
    }
    try {
      await save({ enabled: draft.enabled, requisites: draft.requisites, contacts })
      touchedRef.current = false
      toast.success(t("manualPayment.saved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const form = editing?.form

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading>{t("manualPayment.title")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("manualPayment.subtitle")}
          </Text>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-y-8 px-6 py-6">
        <div className="flex items-center gap-x-3">
          <Switch
            id="manual_enabled"
            checked={draft.enabled}
            disabled={busy}
            onCheckedChange={(checked) => {
              touch()
              setDraft((previous) => ({ ...previous, enabled: checked }))
            }}
            data-testid="manual-payment-enabled"
          />
          <Label htmlFor="manual_enabled">{t("manualPayment.enabled")}</Label>
        </div>

        <section className="flex flex-col gap-y-3" data-testid="manual-payment-requisites">
          <div className="flex flex-col gap-y-1">
            <Label>{t("manualPayment.list.title")}</Label>
            <Text size="small" className="text-ui-fg-subtle">
              {t("manualPayment.list.hint", { max: REQUISITES_MAX })}
            </Text>
          </div>

          {draft.requisites.length === 0 ? (
            <Text size="small" className="text-ui-fg-muted" data-testid="manual-payment-empty">
              {t("manualPayment.list.empty")}
            </Text>
          ) : (
            <ul className="divide-y overflow-hidden rounded-lg border border-ui-border-base">
              {draft.requisites.map((item, index) => (
                <li
                  key={item.id ?? `new-${index}`}
                  className={clx(
                    "flex items-center gap-x-3 px-3 py-2",
                    editing?.index === index && "bg-ui-bg-highlight"
                  )}
                  data-testid={`manual-payment-item-${index}`}
                >
                  <RequisiteIcon icon={itemIcon(item)} name={itemName(item)} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Text size="small" weight="plus" className="truncate">
                      {itemName(item)}
                    </Text>
                    <Text size="small" className="text-ui-fg-subtle truncate font-mono">
                      {itemValue(item)}
                    </Text>
                  </div>
                  <div className="flex shrink-0 items-center gap-x-1">
                    <IconButton
                      type="button"
                      size="small"
                      variant="transparent"
                      disabled={busy || index === 0}
                      aria-label={t("manualPayment.list.moveUp")}
                      onClick={() => setRequisites(moveItem(draft.requisites, index, -1))}
                    >
                      <ArrowUpMini />
                    </IconButton>
                    <IconButton
                      type="button"
                      size="small"
                      variant="transparent"
                      disabled={busy || index === draft.requisites.length - 1}
                      aria-label={t("manualPayment.list.moveDown")}
                      onClick={() => setRequisites(moveItem(draft.requisites, index, 1))}
                    >
                      <ArrowDownMini />
                    </IconButton>
                    <IconButton
                      type="button"
                      size="small"
                      variant="transparent"
                      disabled={busy}
                      aria-label={t("manualPayment.list.edit")}
                      onClick={() => setEditing({ index, form: formFrom(item), errors: {} })}
                      data-testid={`manual-payment-edit-${index}`}
                    >
                      <PencilSquare />
                    </IconButton>
                    <IconButton
                      type="button"
                      size="small"
                      variant="transparent"
                      disabled={busy}
                      aria-label={t("manualPayment.list.remove")}
                      onClick={() => {
                        setRequisites(draft.requisites.filter((_, i) => i !== index))
                        if (editing?.index === index) {
                          setEditing(null)
                        }
                      }}
                    >
                      <Trash />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!editing && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="small"
                variant="secondary"
                disabled={busy || full}
                onClick={startBank}
                data-testid="manual-payment-add-bank"
              >
                <Plus />
                {t("manualPayment.list.addBank")}
              </Button>
              <Button
                type="button"
                size="small"
                variant="secondary"
                disabled={busy || full}
                onClick={startCrypto}
                data-testid="manual-payment-add-crypto"
              >
                <Plus />
                {t("manualPayment.list.addCrypto")}
              </Button>
            </div>
          )}

          {editing && form && (
            <div
              className="flex flex-col gap-y-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4"
              data-testid="manual-payment-item-form"
            >
              <Heading level="h3">
                {form.kind === "bank" ? t("manualPayment.bank.title") : t("manualPayment.crypto.title")}
              </Heading>

              {form.kind === "bank" ? (
                <>
                  <div className="flex flex-col gap-y-2">
                    <Label size="small">{t("manualPayment.bank.pick")}</Label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {bankPresets.map((preset) => (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() => pickPreset(preset)}
                          className={clx(
                            "flex items-center gap-x-2 rounded-md border bg-ui-bg-base px-2 py-1.5 text-left transition-fg",
                            form.icon === preset.key && !form.custom
                              ? "border-ui-border-interactive shadow-borders-interactive-with-active"
                              : "border-ui-border-base hover:bg-ui-bg-base-hover"
                          )}
                          data-testid={`manual-payment-preset-${preset.key}`}
                        >
                          <RequisiteIcon icon={preset.key} name={preset.name} />
                          <span className="txt-compact-small text-ui-fg-base truncate">{preset.name}</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => pickPreset(null)}
                        className={clx(
                          "flex items-center gap-x-2 rounded-md border bg-ui-bg-base px-2 py-1.5 text-left transition-fg",
                          form.custom
                            ? "border-ui-border-interactive shadow-borders-interactive-with-active"
                            : "border-ui-border-base hover:bg-ui-bg-base-hover"
                        )}
                        data-testid="manual-payment-preset-other"
                      >
                        <RequisiteIcon icon={null} name="+" />
                        <span className="txt-compact-small text-ui-fg-base truncate">
                          {t("manualPayment.bank.other")}
                        </span>
                      </button>
                    </div>
                    {editing.errors.preset && <Hint variant="error">{editing.errors.preset}</Hint>}
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-y-1">
                      <Label htmlFor="requisite_bank" size="small">
                        {t("manualPayment.bank.name")}
                      </Label>
                      <Input
                        id="requisite_bank"
                        size="small"
                        value={form.bank}
                        maxLength={60}
                        aria-invalid={Boolean(editing.errors.bank)}
                        onChange={(event) => updateForm({ bank: event.target.value })}
                      />
                      {editing.errors.bank && <Hint variant="error">{editing.errors.bank}</Hint>}
                    </div>
                    <div className="flex flex-col gap-y-1">
                      <Label htmlFor="requisite_number" size="small">
                        {t("manualPayment.bank.number")}
                      </Label>
                      <Input
                        id="requisite_number"
                        size="small"
                        value={form.number}
                        maxLength={64}
                        placeholder={t("manualPayment.bank.numberPlaceholder")}
                        aria-invalid={Boolean(editing.errors.number)}
                        onChange={(event) => updateForm({ number: event.target.value })}
                        data-testid="manual-payment-bank-number"
                      />
                      {editing.errors.number && <Hint variant="error">{editing.errors.number}</Hint>}
                    </div>
                    <div className="flex flex-col gap-y-1 md:col-span-2">
                      <Label htmlFor="requisite_holder" size="small">
                        {t("manualPayment.bank.holder")}
                      </Label>
                      <Input
                        id="requisite_holder"
                        size="small"
                        value={form.holder}
                        maxLength={100}
                        placeholder={t("manualPayment.bank.holderPlaceholder")}
                        onChange={(event) => updateForm({ holder: event.target.value })}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_2fr]">
                  <div className="flex flex-col gap-y-1">
                    <Label size="small">{t("manualPayment.crypto.currency")}</Label>
                    <Select value={form.currency} onValueChange={(value) => updateForm({ currency: value })}>
                      <Select.Trigger data-testid="manual-payment-crypto-currency">
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
                  </div>
                  <div className="flex flex-col gap-y-1">
                    <Label size="small">{t("manualPayment.crypto.network")}</Label>
                    <Select value={form.network} onValueChange={(value) => updateForm({ network: value })}>
                      <Select.Trigger data-testid="manual-payment-crypto-network">
                        <Select.Value placeholder={t("manualPayment.crypto.networkPlaceholder")} />
                      </Select.Trigger>
                      <Select.Content>
                        {CRYPTO_NETWORKS.map((network) => (
                          <Select.Item key={network} value={network}>
                            {network}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                    {editing.errors.network && <Hint variant="error">{editing.errors.network}</Hint>}
                  </div>
                  <div className="flex flex-col gap-y-1">
                    <Label htmlFor="requisite_address" size="small">
                      {t("manualPayment.crypto.address")}
                    </Label>
                    <Input
                      id="requisite_address"
                      size="small"
                      value={form.address}
                      maxLength={200}
                      className="font-mono"
                      aria-invalid={Boolean(editing.errors.address)}
                      onChange={(event) => updateForm({ address: event.target.value })}
                      data-testid="manual-payment-crypto-address"
                    />
                    {editing.errors.address && <Hint variant="error">{editing.errors.address}</Hint>}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-x-2">
                <Button type="button" size="small" onClick={applyItem} data-testid="manual-payment-item-apply">
                  {t("manualPayment.apply")}
                </Button>
                <Button type="button" size="small" variant="secondary" onClick={() => setEditing(null)}>
                  {t("manualPayment.cancel")}
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-y-4" data-testid="manual-payment-contacts">
          <div className="flex flex-col gap-y-1">
            <Label>{t("manualPayment.contacts.title")}</Label>
            <Text size="small" className="text-ui-fg-subtle">
              {t("manualPayment.contacts.hint")}
            </Text>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="manual_whatsapp">{t("manualPayment.contacts.whatsapp")}</Label>
              <Input
                id="manual_whatsapp"
                value={draft.contacts.whatsapp}
                disabled={busy}
                placeholder={t("manualPayment.contacts.whatsappPlaceholder")}
                onChange={(event) => updateContact("whatsapp", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="manual_telegram">{t("manualPayment.contacts.telegram")}</Label>
              <Input
                id="manual_telegram"
                value={draft.contacts.telegram}
                disabled={busy}
                placeholder={t("manualPayment.contacts.telegramPlaceholder")}
                onChange={(event) => updateContact("telegram", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="manual_email">{t("manualPayment.contacts.email")}</Label>
              <Input
                id="manual_email"
                type="email"
                value={draft.contacts.email}
                disabled={busy}
                onChange={(event) => updateContact("email", event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="manual_note">{t("manualPayment.contacts.note")}</Label>
            <Textarea
              id="manual_note"
              rows={3}
              value={draft.contacts.note}
              disabled={busy}
              placeholder={t("manualPayment.contacts.notePlaceholder")}
              onChange={(event) => updateContact("note", event.target.value)}
            />
          </div>
        </section>

        <div className="flex items-center gap-x-2">
          <Button
            type="submit"
            size="small"
            isLoading={isSaving}
            disabled={busy}
            data-testid="manual-payment-save"
          >
            {t("manualPayment.save")}
          </Button>
        </div>
      </form>
    </Container>
  )
}
