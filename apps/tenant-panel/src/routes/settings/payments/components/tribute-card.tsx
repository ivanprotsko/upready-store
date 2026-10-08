import { useEffect, useRef, useState } from "react"
import { Badge, Button, Container, Copy, Heading, Input, Label, Switch, Text, toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useDeleteTenantTribute, useSaveTenantTribute, useTenantTribute } from "../../../../hooks/api/tribute"
import {
  EMPTY_TRIBUTE_DRAFT,
  tributeDraftErrors,
  tributeDraftFrom,
  tributePayload,
  type TributeDraft,
  type TributeField,
} from "../../../../lib/tribute-settings"
import { SecretStatus } from "./secret-status"

/**
 * «Tribute» (t-cherk-22, part A): the shop's Tribute Shop API key, next to
 * Robokassa and BTCPay on «Приём оплат». The owner creates the key in the
 * Tribute dashboard and pastes it here; the card shows the webhook address to
 * paste back into Tribute.
 *
 * The key comes back as `{ set, last4 }` and its field starts empty: typed, it
 * replaces the stored key; left empty, the stored one stays. «Удалить ключ»
 * forgets it and switches Tribute off.
 *
 * Rule 19h shapes the load like the other cards here: `loaded === null` is
 * «not answered yet» with the controls rendered disabled, and a late answer
 * refills the draft only while the owner has not typed into it.
 *
 * The card exists only where the backend answers `available: true`
 * (`TRIBUTE_AVAILABLE`). On the RU instance Tribute is forbidden, so the owner
 * never sees it there, not even while the first answer is on its way.
 */
export const TributeCard = () => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const { tribute, isPending, isError, error } = useTenantTribute()
  const { mutateAsync: save, isPending: isSaving } = useSaveTenantTribute()
  const { mutateAsync: remove, isPending: isRemoving } = useDeleteTenantTribute()

  const [loaded, setLoaded] = useState<boolean | null>(null)
  const [draft, setDraft] = useState<TributeDraft>(EMPTY_TRIBUTE_DRAFT)
  const [errors, setErrors] = useState<Partial<Record<TributeField, string>>>({})
  const touchedRef = useRef(false)

  useEffect(() => {
    if (isPending) {
      return
    }
    setLoaded(true)
    if (!touchedRef.current) {
      setDraft(tributeDraftFrom(tribute?.settings))
    }
  }, [isPending, tribute])

  if (isError) {
    throw error
  }

  if (tribute?.available !== true) {
    return null
  }

  const settings = tribute.settings ?? null
  const busy = loaded === null || isSaving || isRemoving

  const update = <K extends keyof TributeDraft>(key: K, value: TributeDraft[K]) => {
    touchedRef.current = true
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const found = tributeDraftErrors(draft, settings)
    setErrors(found)
    if (Object.keys(found).length) {
      toast.error(t("tribute.errors.fixFields"))
      return
    }
    try {
      const saved = await save(tributePayload(draft))
      touchedRef.current = false
      setDraft(tributeDraftFrom(saved.settings))
      toast.success(t("tribute.saved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const handleRemove = async () => {
    const confirmed = await prompt({
      title: t("tribute.removeTitle"),
      description: t("tribute.removeDescription"),
      confirmText: t("tribute.remove"),
      cancelText: t("tribute.cancel"),
    })
    if (!confirmed) {
      return
    }
    try {
      const removed = await remove()
      touchedRef.current = false
      setErrors({})
      setDraft(tributeDraftFrom(removed.settings))
      toast.success(t("tribute.removed"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Container className="divide-y p-0" data-testid="tribute-card">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading>{t("tribute.title")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("tribute.subtitle")}
          </Text>
        </div>
        {settings ? (
          <Badge size="2xsmall" color={settings.is_enabled ? "green" : "grey"} data-testid="tribute-state">
            {settings.is_enabled ? t("tribute.stateOn") : t("tribute.stateOff")}
          </Badge>
        ) : loaded ? (
          <Badge size="2xsmall" color="grey" data-testid="tribute-state">
            {t("tribute.stateNone")}
          </Badge>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-y-6 px-6 py-6">
        <div className="flex items-center gap-x-3">
          <Switch
            id="tribute_enabled"
            checked={draft.enabled}
            disabled={busy}
            onCheckedChange={(checked) => update("enabled", checked)}
            data-testid="tribute-enabled"
          />
          <Label htmlFor="tribute_enabled">{t("tribute.fields.is_enabled")}</Label>
        </div>

        <div className="flex flex-col gap-y-2 md:max-w-[50%]">
          <div className="flex items-center justify-between">
            <Label htmlFor="tribute_api_key">{t("tribute.fields.api_key")}</Label>
            <SecretStatus masked={settings?.api_key} />
          </div>
          <Input
            id="tribute_api_key"
            name="api_key"
            type="password"
            autoComplete="new-password"
            data-testid="tribute-api_key"
            value={draft.api_key}
            disabled={busy}
            aria-invalid={Boolean(errors.api_key)}
            onChange={(event) => update("api_key", event.target.value)}
            placeholder={
              loaded === null
                ? t("paymentSettings.loading")
                : settings?.api_key.set
                  ? t("tribute.keepPlaceholder")
                  : t("tribute.emptyPlaceholder")
            }
          />
          {errors.api_key ? (
            <Text size="small" className="text-ui-fg-error">
              {t(errors.api_key)}
            </Text>
          ) : null}
        </div>

        <Text size="small" className="text-ui-fg-subtle">
          {t("tribute.apiKeyHint")}
        </Text>

        <div className="flex items-center gap-x-2">
          <Button type="submit" size="small" isLoading={isSaving} disabled={busy} data-testid="tribute-save">
            {t("tribute.save")}
          </Button>
          {settings ? (
            <Button
              type="button"
              size="small"
              variant="secondary"
              isLoading={isRemoving}
              disabled={busy}
              onClick={handleRemove}
              data-testid="tribute-remove"
            >
              {t("tribute.remove")}
            </Button>
          ) : null}
        </div>
      </form>

      <div className="flex flex-col gap-y-2 px-6 py-4">
        <Text size="small" weight="plus">
          {t("tribute.webhookTitle")}
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          {t("tribute.webhookHint")}
        </Text>
        <div className="flex items-center gap-x-2">
          <code
            className="txt-compact-small break-all rounded-md border bg-ui-bg-subtle px-2 py-1"
            data-testid="tribute-webhook-url"
          >
            {tribute.callback_url}
          </code>
          <Copy content={tribute.callback_url} className="text-ui-fg-muted" data-testid="tribute-webhook-copy" />
        </div>
      </div>
    </Container>
  )
}
