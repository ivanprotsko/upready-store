import { useEffect, useRef, useState } from "react"
import { Badge, Button, Container, Heading, Input, Label, Switch, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useSaveTenantBtcpay, useTenantBtcpay } from "../../../../hooks/api/btcpay"
import {
  btcpayDraftErrors,
  btcpayDraftFrom,
  btcpayPayload,
  EMPTY_BTCPAY_DRAFT,
  type BtcpayDraft,
  type BtcpayField,
} from "../../../../lib/btcpay-settings"
import { UnreadableSecretAlert } from "../../integrations/components/unreadable-secret-alert"
import { SecretStatus } from "./secret-status"

/**
 * «Криптовалюта (BTCPay Server)» (ask-20261005-070255-438f): the shop's own
 * BTCPay Server store, next to Robokassa and the transfers on «Приём оплат».
 * Only the «own server» mode: the owner creates the store, a Greenfield API
 * key and a webhook on a BTCPay Server of their choosing and pastes four
 * values here. The card shows the webhook address to paste back into BTCPay.
 *
 * The two secrets come back as `{ set, last4 }` and their fields start empty:
 * typed, they replace the stored value; left empty, it stays. A store is
 * saved switched off until the owner turns the switch on.
 *
 * Rule 19h shapes the load like the other cards here: `loaded === null` is
 * «not answered yet» with the controls rendered disabled, and a late answer
 * refills the draft only while the owner has not typed into it.
 *
 * The card exists only where the backend answers `available: true`
 * (`PAYMENTS_CRYPTO_AVAILABLE`). On the RU instance cryptocurrency is
 * forbidden, so the owner never sees it there, not even while the first
 * answer is on its way.
 */

const TEXT_FIELDS: Array<{ field: Extract<BtcpayField, "server_url" | "store_id">; placeholder: string }> = [
  { field: "server_url", placeholder: "https://pay.example.com" },
  { field: "store_id", placeholder: "7Hq2…" },
]

const SECRET_FIELDS: Array<Extract<BtcpayField, "api_key" | "webhook_secret">> = ["api_key", "webhook_secret"]

export const BtcpayCard = () => {
  const { t } = useTranslation()
  const { btcpay, isPending, isError, error } = useTenantBtcpay()
  const { mutateAsync: save, isPending: isSaving } = useSaveTenantBtcpay()

  const [loaded, setLoaded] = useState<boolean | null>(null)
  const [draft, setDraft] = useState<BtcpayDraft>(EMPTY_BTCPAY_DRAFT)
  const [errors, setErrors] = useState<Partial<Record<BtcpayField, string>>>({})
  const touchedRef = useRef(false)

  useEffect(() => {
    if (isPending) {
      return
    }
    setLoaded(true)
    if (!touchedRef.current) {
      setDraft(btcpayDraftFrom(btcpay?.settings))
    }
  }, [isPending, btcpay])

  if (isError) {
    throw error
  }

  if (btcpay?.available !== true) {
    return null
  }

  const settings = btcpay?.settings ?? null
  const busy = loaded === null || isSaving

  const update = <K extends keyof BtcpayDraft>(key: K, value: BtcpayDraft[K]) => {
    touchedRef.current = true
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const found = btcpayDraftErrors(draft, settings)
    setErrors(found)
    if (Object.keys(found).length) {
      toast.error(t("btcpay.errors.fixFields"))
      return
    }
    try {
      const saved = await save(btcpayPayload(draft))
      touchedRef.current = false
      setDraft(btcpayDraftFrom(saved.settings))
      toast.success(t("btcpay.saved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Container className="divide-y p-0" data-testid="btcpay-card">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading>{t("btcpay.title")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("btcpay.subtitle")}
          </Text>
        </div>
        {btcpay?.unreadable ? (
          <Badge size="2xsmall" color="red" data-testid="btcpay-state">
            {t("integrations.state.unreadable")}
          </Badge>
        ) : settings ? (
          <Badge size="2xsmall" color={settings.is_enabled ? "green" : "grey"} data-testid="btcpay-state">
            {settings.is_enabled ? t("btcpay.stateOn") : t("btcpay.stateOff")}
          </Badge>
        ) : loaded ? (
          <Badge size="2xsmall" color="grey" data-testid="btcpay-state">
            {t("btcpay.stateNone")}
          </Badge>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-y-6 px-6 py-6">
        {btcpay?.unreadable ? <UnreadableSecretAlert testId="btcpay-unreadable" /> : null}

        <Text size="small" className="text-ui-fg-subtle">
          {t("btcpay.ownServerHint")}
        </Text>

        <div className="flex items-center gap-x-3">
          <Switch
            id="btcpay_enabled"
            checked={draft.enabled}
            disabled={busy}
            onCheckedChange={(checked) => update("enabled", checked)}
            data-testid="btcpay-enabled"
          />
          <Label htmlFor="btcpay_enabled">{t("btcpay.fields.is_enabled")}</Label>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {TEXT_FIELDS.map(({ field, placeholder }) => (
            <div key={field} className="flex flex-col gap-y-2">
              <Label htmlFor={`btcpay_${field}`}>{t(`btcpay.fields.${field}`)}</Label>
              <Input
                id={`btcpay_${field}`}
                name={field}
                autoComplete="off"
                data-testid={`btcpay-${field}`}
                value={draft[field]}
                disabled={busy}
                aria-invalid={Boolean(errors[field])}
                onChange={(event) => update(field, event.target.value)}
                placeholder={loaded === null ? t("paymentSettings.loading") : placeholder}
              />
              {errors[field] ? (
                <Text size="small" className="text-ui-fg-error">
                  {t(errors[field] as string)}
                </Text>
              ) : null}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {SECRET_FIELDS.map((field) => (
            <div key={field} className="flex flex-col gap-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={`btcpay_${field}`}>{t(`btcpay.fields.${field}`)}</Label>
                <SecretStatus masked={settings?.[field]} />
              </div>
              <Input
                id={`btcpay_${field}`}
                name={field}
                type="password"
                autoComplete="new-password"
                data-testid={`btcpay-${field}`}
                value={draft[field]}
                disabled={busy}
                aria-invalid={Boolean(errors[field])}
                onChange={(event) => update(field, event.target.value)}
                placeholder={
                  settings?.[field]?.set ? t("btcpay.keepPlaceholder") : t("btcpay.emptyPlaceholder")
                }
              />
              {errors[field] ? (
                <Text size="small" className="text-ui-fg-error">
                  {t(errors[field] as string)}
                </Text>
              ) : null}
            </div>
          ))}
        </div>

        <Text size="small" className="text-ui-fg-subtle">
          {t("btcpay.apiKeyHint")}
        </Text>

        <div className="flex items-center gap-x-2">
          <Button type="submit" size="small" isLoading={isSaving} disabled={busy} data-testid="btcpay-save">
            {t("btcpay.save")}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-y-2 px-6 py-4">
        <Text size="small" weight="plus">
          {t("btcpay.webhookTitle")}
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          {t("btcpay.webhookHint")}
        </Text>
        <code
          className="txt-compact-small break-all rounded-md border bg-ui-bg-subtle px-2 py-1"
          data-testid="btcpay-webhook-url"
        >
          {btcpay?.webhook_url ?? t("paymentSettings.loading")}
        </code>
      </div>
    </Container>
  )
}
