import { useEffect, useRef, useState } from "react"
import { Plus, Trash } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  IconButton,
  Input,
  Label,
  Switch,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import {
  type ManualPaymentCard,
  type ManualPaymentWallet,
  type TenantManualPayment,
  useTenantManualPayment,
  useUpdateTenantManualPayment,
} from "../../../../hooks/api/manual-payment"

/**
 * «Оплата вне шлюза» (olavka-payments): the crypto wallets and the manager
 * contacts the storefront shows on the manual provider. Both kinds place the
 * order WITHOUT paying on the site — the order stays «awaiting payment» until
 * the owner confirms it under the order's payment, which is why this card
 * stands next to the gateway settings rather than replacing them.
 *
 * Rule 19h shapes the load like the Robokassa form above: `loaded === null` is
 * «not answered yet» with the real controls rendered disabled, and a late
 * answer refills the draft only while the owner has not typed into it.
 */

type Draft = {
  cryptoEnabled: boolean
  wallets: ManualPaymentWallet[]
  managerEnabled: boolean
  cards: { bank: string; number: string; holder: string }[]
  whatsapp: string
  telegram: string
  email: string
  note: string
}

const EMPTY_DRAFT: Draft = {
  cryptoEnabled: false,
  wallets: [],
  managerEnabled: false,
  cards: [],
  whatsapp: "",
  telegram: "",
  email: "",
  note: "",
}

const EMPTY_WALLET: ManualPaymentWallet = { network: "", currency: "", address: "" }

const EMPTY_CARD: Draft["cards"][number] = { bank: "", number: "", holder: "" }

/** At most this many cards, the backend's own limit. */
const MAX_CARDS = 5

const draftFrom = (record: TenantManualPayment | undefined): Draft =>
  record
    ? {
        cryptoEnabled: record.crypto.enabled,
        wallets: record.crypto.wallets.map((wallet) => ({ ...wallet })),
        managerEnabled: record.manager.enabled,
        cards: (record.manager.cards ?? []).map((card) => ({
          bank: card.bank,
          number: card.number,
          holder: card.holder ?? "",
        })),
        whatsapp: record.manager.whatsapp ?? "",
        telegram: record.manager.telegram ?? "",
        email: record.manager.email ?? "",
        note: record.manager.note ?? "",
      }
    : EMPTY_DRAFT

export const ManualPaymentCard = () => {
  const { t } = useTranslation()
  const { manualPayment, isPending, isError, error } = useTenantManualPayment()
  const { mutateAsync: save, isPending: isSaving } = useUpdateTenantManualPayment()

  const [loaded, setLoaded] = useState<boolean | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
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

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    touchedRef.current = true
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  const updateWallet = (index: number, key: keyof ManualPaymentWallet, value: string) => {
    touchedRef.current = true
    setDraft((previous) => ({
      ...previous,
      wallets: previous.wallets.map((wallet, i) =>
        i === index ? { ...wallet, [key]: value } : wallet
      ),
    }))
  }

  const updateCard = (index: number, key: keyof Draft["cards"][number], value: string) => {
    touchedRef.current = true
    setDraft((previous) => ({
      ...previous,
      cards: previous.cards.map((card, i) => (i === index ? { ...card, [key]: value } : card)),
    }))
  }

  const addCard = () => update("cards", [...draft.cards, { ...EMPTY_CARD }])
  const removeCard = (index: number) =>
    update(
      "cards",
      draft.cards.filter((_, i) => i !== index)
    )

  const addWallet = () => update("wallets", [...draft.wallets, { ...EMPTY_WALLET }])
  const removeWallet = (index: number) =>
    update(
      "wallets",
      draft.wallets.filter((_, i) => i !== index)
    )

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const wallets = draft.wallets
      .map((wallet) => ({
        network: wallet.network.trim(),
        currency: wallet.currency.trim(),
        address: wallet.address.trim(),
      }))
      .filter((wallet) => wallet.network || wallet.currency || wallet.address)
    if (wallets.some((wallet) => !wallet.network || !wallet.currency || !wallet.address)) {
      toast.error(t("manualPayment.walletIncomplete"))
      return
    }
    if (draft.cryptoEnabled && wallets.length === 0) {
      toast.error(t("manualPayment.walletRequired"))
      return
    }
    const cards: ManualPaymentCard[] = draft.cards
      .map((card) => ({
        bank: card.bank.trim(),
        number: card.number.trim(),
        holder: card.holder.trim() || null,
      }))
      .filter((card) => card.bank || card.number || card.holder)
    if (cards.some((card) => !card.bank || !card.number)) {
      toast.error(t("manualPayment.cardIncomplete"))
      return
    }
    if (
      draft.managerEnabled &&
      cards.length === 0 &&
      !draft.whatsapp.trim() &&
      !draft.telegram.trim() &&
      !draft.email.trim()
    ) {
      toast.error(t("manualPayment.contactRequired"))
      return
    }
    try {
      await save({
        crypto: { enabled: draft.cryptoEnabled, wallets },
        manager: {
          enabled: draft.managerEnabled,
          cards,
          whatsapp: draft.whatsapp.trim() || null,
          telegram: draft.telegram.trim() || null,
          email: draft.email.trim() || null,
          note: draft.note.trim() || null,
        },
      })
      touchedRef.current = false
      toast.success(t("manualPayment.saved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

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
        <section className="flex flex-col gap-y-4" data-testid="manual-payment-crypto">
          <div className="flex items-center gap-x-3">
            <Switch
              id="manual_crypto_enabled"
              checked={draft.cryptoEnabled}
              disabled={busy}
              onCheckedChange={(checked) => update("cryptoEnabled", checked)}
            />
            <Label htmlFor="manual_crypto_enabled">{t("manualPayment.crypto.enabled")}</Label>
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            {t("manualPayment.crypto.hint")}
          </Text>

          {draft.wallets.map((wallet, index) => (
            <div
              key={index}
              className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_2fr_auto] md:items-end"
              data-testid={`manual-payment-wallet-${index}`}
            >
              <div className="flex flex-col gap-y-1">
                <Label htmlFor={`wallet_network_${index}`} size="small">
                  {t("manualPayment.crypto.network")}
                </Label>
                <Input
                  id={`wallet_network_${index}`}
                  size="small"
                  value={wallet.network}
                  disabled={busy}
                  placeholder={t("manualPayment.crypto.networkPlaceholder")}
                  onChange={(event) => updateWallet(index, "network", event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-y-1">
                <Label htmlFor={`wallet_currency_${index}`} size="small">
                  {t("manualPayment.crypto.currency")}
                </Label>
                <Input
                  id={`wallet_currency_${index}`}
                  size="small"
                  value={wallet.currency}
                  disabled={busy}
                  placeholder={t("manualPayment.crypto.currencyPlaceholder")}
                  onChange={(event) => updateWallet(index, "currency", event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-y-1">
                <Label htmlFor={`wallet_address_${index}`} size="small">
                  {t("manualPayment.crypto.address")}
                </Label>
                <Input
                  id={`wallet_address_${index}`}
                  size="small"
                  value={wallet.address}
                  disabled={busy}
                  onChange={(event) => updateWallet(index, "address", event.target.value)}
                />
              </div>
              <IconButton
                type="button"
                size="small"
                variant="transparent"
                disabled={busy}
                aria-label={t("manualPayment.crypto.removeWallet")}
                onClick={() => removeWallet(index)}
              >
                <Trash />
              </IconButton>
            </div>
          ))}

          <div>
            <Button
              type="button"
              size="small"
              variant="secondary"
              disabled={busy || draft.wallets.length >= 10}
              onClick={addWallet}
              data-testid="manual-payment-add-wallet"
            >
              <Plus />
              {t("manualPayment.crypto.addWallet")}
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-y-4" data-testid="manual-payment-manager">
          <div className="flex items-center gap-x-3">
            <Switch
              id="manual_manager_enabled"
              checked={draft.managerEnabled}
              disabled={busy}
              onCheckedChange={(checked) => update("managerEnabled", checked)}
            />
            <Label htmlFor="manual_manager_enabled">
              {t("manualPayment.manager.enabled")}
            </Label>
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            {t("manualPayment.manager.hint")}
          </Text>

          <div className="flex flex-col gap-y-2" data-testid="manual-payment-cards">
            <Label>{t("manualPayment.manager.cards")}</Label>
            <Text size="small" className="text-ui-fg-subtle">
              {t("manualPayment.manager.cardsHint")}
            </Text>
          </div>

          {draft.cards.map((card, index) => (
            <div
              key={index}
              className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_1fr_auto] md:items-end"
              data-testid={`manual-payment-card-${index}`}
            >
              <div className="flex flex-col gap-y-1">
                <Label htmlFor={`card_bank_${index}`} size="small">
                  {t("manualPayment.manager.cardBank")}
                </Label>
                <Input
                  id={`card_bank_${index}`}
                  size="small"
                  value={card.bank}
                  disabled={busy}
                  placeholder={t("manualPayment.manager.cardBankPlaceholder")}
                  onChange={(event) => updateCard(index, "bank", event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-y-1">
                <Label htmlFor={`card_number_${index}`} size="small">
                  {t("manualPayment.manager.cardNumber")}
                </Label>
                <Input
                  id={`card_number_${index}`}
                  size="small"
                  value={card.number}
                  disabled={busy}
                  inputMode="numeric"
                  onChange={(event) => updateCard(index, "number", event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-y-1">
                <Label htmlFor={`card_holder_${index}`} size="small">
                  {t("manualPayment.manager.cardHolder")}
                </Label>
                <Input
                  id={`card_holder_${index}`}
                  size="small"
                  value={card.holder}
                  disabled={busy}
                  placeholder={t("manualPayment.manager.cardHolderPlaceholder")}
                  onChange={(event) => updateCard(index, "holder", event.target.value)}
                />
              </div>
              <IconButton
                type="button"
                size="small"
                variant="transparent"
                disabled={busy}
                aria-label={t("manualPayment.manager.removeCard")}
                onClick={() => removeCard(index)}
              >
                <Trash />
              </IconButton>
            </div>
          ))}

          <div>
            <Button
              type="button"
              size="small"
              variant="secondary"
              disabled={busy || draft.cards.length >= MAX_CARDS}
              onClick={addCard}
              data-testid="manual-payment-add-card"
            >
              <Plus />
              {t("manualPayment.manager.addCard")}
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="manual_whatsapp">{t("manualPayment.manager.whatsapp")}</Label>
              <Input
                id="manual_whatsapp"
                value={draft.whatsapp}
                disabled={busy}
                placeholder={t("manualPayment.manager.whatsappPlaceholder")}
                onChange={(event) => update("whatsapp", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="manual_telegram">{t("manualPayment.manager.telegram")}</Label>
              <Input
                id="manual_telegram"
                value={draft.telegram}
                disabled={busy}
                placeholder={t("manualPayment.manager.telegramPlaceholder")}
                onChange={(event) => update("telegram", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="manual_email">{t("manualPayment.manager.email")}</Label>
              <Input
                id="manual_email"
                type="email"
                value={draft.email}
                disabled={busy}
                onChange={(event) => update("email", event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="manual_note">{t("manualPayment.manager.note")}</Label>
            <Textarea
              id="manual_note"
              rows={3}
              value={draft.note}
              disabled={busy}
              placeholder={t("manualPayment.manager.notePlaceholder")}
              onChange={(event) => update("note", event.target.value)}
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
