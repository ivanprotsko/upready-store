import { useEffect, useRef, useState } from "react"
import { Badge, Button, Container, Heading, Input, Label, Switch, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useSaveTenantBitcart, useTenantBitcart } from "../../../../hooks/api/bitcart"
import {
  bitcartDraftErrors,
  bitcartDraftFrom,
  bitcartPayload,
  EMPTY_BITCART_DRAFT,
  type BitcartDraft,
  type BitcartField,
} from "../../../../lib/bitcart-settings"
import { UnreadableSecretAlert } from "../../integrations/components/unreadable-secret-alert"
import { SecretStatus } from "./secret-status"

/**
 * «Криптовалюта (Bitcart)» (ask-20261005-070255-438f, stage 2): the shop's own
 * Bitcart store, next to the BTCPay card on «Приём оплат» and built the same
 * way. Only the «own server» mode: the owner creates the store, its wallets
 * and an API key on a Bitcart of their choosing and pastes four values here.
 * There is no webhook to set up: every invoice tells Bitcart where to report.
 *
 * Two addresses, because Bitcart serves its API and the page where the buyer
 * pays from two different places (in its one-domain mode `/api` and
 * `/admin`), and the API does not report the second.
 *
 * The token comes back as `{ set, last4 }` and its field starts empty: typed,
 * it replaces the stored value; left empty, it stays. A store is saved
 * switched off until the owner turns the switch on.
 *
 * Rule 19h shapes the load like the BTCPay card: `loaded === null` is «not
 * answered yet» with the controls rendered disabled, and a late answer
 * refills the draft only while the owner has not typed into it.
 *
 * The card exists only where the backend answers `available: true`
 * (`PAYMENTS_CRYPTO_AVAILABLE`, the switch BTCPay obeys too), so the owner
 * never sees it on the RU instance, not even while the first answer is on its
 * way.
 */

const TEXT_FIELDS: Array<{ field: Exclude<BitcartField, "api_key">; placeholder: string }> = [
  { field: "server_url", placeholder: "https://pay.example.com/api" },
  { field: "admin_url", placeholder: "https://pay.example.com/admin" },
  { field: "store_id", placeholder: "01J…" },
]

export const BitcartCard = () => {
  const { t } = useTranslation()
  const { bitcart, isPending, isError, error } = useTenantBitcart()
  const { mutateAsync: save, isPending: isSaving } = useSaveTenantBitcart()

  const [loaded, setLoaded] = useState<boolean | null>(null)
  const [draft, setDraft] = useState<BitcartDraft>(EMPTY_BITCART_DRAFT)
  const [errors, setErrors] = useState<Partial<Record<BitcartField, string>>>({})
  const touchedRef = useRef(false)

  useEffect(() => {
    if (isPending) {
      return
    }
    setLoaded(true)
    if (!touchedRef.current) {
      setDraft(bitcartDraftFrom(bitcart?.settings))
    }
  }, [isPending, bitcart])

  if (isError) {
    throw error
  }

  if (bitcart?.available !== true) {
    return null
  }

  const settings = bitcart?.settings ?? null
  const busy = loaded === null || isSaving

  const update = <K extends keyof BitcartDraft>(key: K, value: BitcartDraft[K]) => {
    touchedRef.current = true
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const found = bitcartDraftErrors(draft, settings)
    setErrors(found)
    if (Object.keys(found).length) {
      toast.error(t("bitcart.errors.fixFields"))
      return
    }
    try {
      const saved = await save(bitcartPayload(draft))
      touchedRef.current = false
      setDraft(bitcartDraftFrom(saved.settings))
      toast.success(t("bitcart.saved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Container className="divide-y p-0" data-testid="bitcart-card">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading>{t("bitcart.title")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("bitcart.subtitle")}
          </Text>
        </div>
        {bitcart?.unreadable ? (
          <Badge size="2xsmall" color="red" data-testid="bitcart-state">
            {t("integrations.state.unreadable")}
          </Badge>
        ) : settings ? (
          <Badge size="2xsmall" color={settings.is_enabled ? "green" : "grey"} data-testid="bitcart-state">
            {settings.is_enabled ? t("bitcart.stateOn") : t("bitcart.stateOff")}
          </Badge>
        ) : loaded ? (
          <Badge size="2xsmall" color="grey" data-testid="bitcart-state">
            {t("bitcart.stateNone")}
          </Badge>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-y-6 px-6 py-6">
        {bitcart?.unreadable ? <UnreadableSecretAlert testId="bitcart-unreadable" /> : null}

        <Text size="small" className="text-ui-fg-subtle">
          {t("bitcart.ownServerHint")}
        </Text>

        <div className="flex items-center gap-x-3">
          <Switch
            id="bitcart_enabled"
            checked={draft.enabled}
            disabled={busy}
            onCheckedChange={(checked) => update("enabled", checked)}
            data-testid="bitcart-enabled"
          />
          <Label htmlFor="bitcart_enabled">{t("bitcart.fields.is_enabled")}</Label>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {TEXT_FIELDS.map(({ field, placeholder }) => (
            <div key={field} className="flex flex-col gap-y-2">
              <Label htmlFor={`bitcart_${field}`}>{t(`bitcart.fields.${field}`)}</Label>
              <Input
                id={`bitcart_${field}`}
                name={field}
                autoComplete="off"
                data-testid={`bitcart-${field}`}
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

          <div className="flex flex-col gap-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="bitcart_api_key">{t("bitcart.fields.api_key")}</Label>
              <SecretStatus masked={settings?.api_key} />
            </div>
            <Input
              id="bitcart_api_key"
              name="api_key"
              type="password"
              autoComplete="new-password"
              data-testid="bitcart-api_key"
              value={draft.api_key}
              disabled={busy}
              aria-invalid={Boolean(errors.api_key)}
              onChange={(event) => update("api_key", event.target.value)}
              placeholder={settings?.api_key?.set ? t("bitcart.keepPlaceholder") : t("bitcart.emptyPlaceholder")}
            />
            {errors.api_key ? (
              <Text size="small" className="text-ui-fg-error">
                {t(errors.api_key)}
              </Text>
            ) : null}
          </div>
        </div>

        <Text size="small" className="text-ui-fg-subtle">
          {t("bitcart.addressHint")}
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          {t("bitcart.apiKeyHint")}
        </Text>

        <div className="flex items-center gap-x-2">
          <Button type="submit" size="small" isLoading={isSaving} disabled={busy} data-testid="bitcart-save">
            {t("bitcart.save")}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-y-2 px-6 py-4">
        <Text size="small" weight="plus">
          {t("bitcart.refundTitle")}
        </Text>
        <Text size="small" className="text-ui-fg-subtle" data-testid="bitcart-refund-hint">
          {t("bitcart.refundHint")}
        </Text>
      </div>

      <div className="flex flex-col gap-y-2 px-6 py-4">
        <Text size="small" weight="plus">
          {t("bitcart.notificationTitle")}
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          {bitcart?.notification_url ? t("bitcart.notificationHint") : t("bitcart.notificationOff")}
        </Text>
        {bitcart?.notification_url ? (
          <code
            className="txt-compact-small break-all rounded-md border bg-ui-bg-subtle px-2 py-1"
            data-testid="bitcart-notification-url"
          >
            {bitcart.notification_url}
          </code>
        ) : null}
      </div>
    </Container>
  )
}
