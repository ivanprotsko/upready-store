import { useEffect, useRef, useState } from "react"
import { Badge, Button, Checkbox, Container, Heading, Input, Label, Switch, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useSaveTenantX402, useTenantX402 } from "../../../../hooks/api/x402"
import {
  EMPTY_X402_DRAFT,
  x402DraftErrors,
  x402DraftFrom,
  x402Payload,
  type X402Draft,
  type X402Field,
} from "../../../../lib/x402-settings"
import { UnreadableSecretAlert } from "../../integrations/components/unreadable-secret-alert"

/**
 * «x402 (USDC)» (t-2026-10-03-33): the shop's own receiving address for USDC,
 * next to BTCPay on «Приём оплат». Buyers and AI agents pay from their own
 * wallet and the money goes straight to the address typed here. Nothing in
 * this card is secret, so nothing is masked.
 *
 * Rule 19h shapes the load like the other cards here: `loaded === null` is
 * «not answered yet» with the controls rendered disabled, and a late answer
 * refills the draft only while the owner has not typed into it.
 *
 * The card exists only where the backend answers `available: true`, so the
 * owner never sees it on an instance that takes no cryptocurrency, not even
 * while the first answer is on its way.
 */

export const X402Card = () => {
  const { t } = useTranslation()
  const { x402, isPending, isError, error } = useTenantX402()
  const { mutateAsync: save, isPending: isSaving } = useSaveTenantX402()

  const [loaded, setLoaded] = useState<boolean | null>(null)
  const [draft, setDraft] = useState<X402Draft>(EMPTY_X402_DRAFT)
  const [errors, setErrors] = useState<Partial<Record<X402Field, string>>>({})
  const touchedRef = useRef(false)

  useEffect(() => {
    if (isPending) {
      return
    }
    setLoaded(true)
    if (!touchedRef.current) {
      setDraft(x402DraftFrom(x402?.settings, x402?.default_facilitator_url ?? ""))
    }
  }, [isPending, x402])

  if (isError) {
    throw error
  }

  if (x402?.available !== true) {
    return null
  }

  const settings = x402?.settings ?? null
  const busy = loaded === null || isSaving
  const defaultFacilitatorUrl = x402?.default_facilitator_url ?? ""

  const update = <K extends keyof X402Draft>(key: K, value: X402Draft[K]) => {
    touchedRef.current = true
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  const toggleNetwork = (id: string, checked: boolean) =>
    update("networks", checked ? [...draft.networks.filter((n) => n !== id), id] : draft.networks.filter((n) => n !== id))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const found = x402DraftErrors(draft)
    setErrors(found)
    if (Object.keys(found).length) {
      toast.error(t("x402.errors.fixFields"))
      return
    }
    try {
      const saved = await save(x402Payload(draft))
      touchedRef.current = false
      setDraft(x402DraftFrom(saved.settings, saved.default_facilitator_url))
      toast.success(t("x402.saved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Container className="divide-y p-0" data-testid="x402-card">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading>{t("x402.title")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("x402.subtitle")}
          </Text>
        </div>
        <div className="flex items-center gap-x-2">
          {settings?.is_test ? (
            <Badge size="2xsmall" color="orange" data-testid="x402-test-badge">
              {t("x402.testBadge")}
            </Badge>
          ) : null}
          {x402?.unreadable ? (
            <Badge size="2xsmall" color="red" data-testid="x402-state">
              {t("integrations.state.unreadable")}
            </Badge>
          ) : settings ? (
            <Badge size="2xsmall" color={settings.is_enabled ? "green" : "grey"} data-testid="x402-state">
              {settings.is_enabled ? t("x402.stateOn") : t("x402.stateOff")}
            </Badge>
          ) : loaded ? (
            <Badge size="2xsmall" color="grey" data-testid="x402-state">
              {t("x402.stateNone")}
            </Badge>
          ) : null}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-y-6 px-6 py-6">
        {x402?.unreadable ? <UnreadableSecretAlert testId="x402-unreadable" /> : null}

        <Text size="small" className="text-ui-fg-subtle">
          {t("x402.intro")}
        </Text>

        <div className="flex items-center gap-x-3">
          <Switch
            id="x402_enabled"
            checked={draft.enabled}
            disabled={busy}
            onCheckedChange={(checked) => update("enabled", checked)}
            data-testid="x402-enabled"
          />
          <Label htmlFor="x402_enabled">{t("x402.fields.is_enabled")}</Label>
        </div>

        <div className="flex flex-col gap-y-2">
          <Label htmlFor="x402_pay_to">{t("x402.fields.pay_to")}</Label>
          <Input
            id="x402_pay_to"
            name="pay_to"
            autoComplete="off"
            data-testid="x402-pay_to"
            value={draft.pay_to}
            disabled={busy}
            aria-invalid={Boolean(errors.pay_to)}
            onChange={(event) => update("pay_to", event.target.value)}
            placeholder={loaded === null ? t("paymentSettings.loading") : "0x…"}
          />
          <Text size="small" className="text-ui-fg-subtle">
            {t("x402.payToHint")}
          </Text>
          {errors.pay_to ? (
            <Text size="small" className="text-ui-fg-error">
              {t(errors.pay_to)}
            </Text>
          ) : null}
        </div>

        <div className="flex flex-col gap-y-3">
          <Label>{t("x402.fields.networks")}</Label>
          {(x402?.networks_offered ?? []).map((network) => (
            <div key={network.id} className="flex items-center gap-x-3">
              <Checkbox
                id={`x402_network_${network.id}`}
                checked={draft.networks.includes(network.id)}
                disabled={busy}
                onCheckedChange={(checked) => toggleNetwork(network.id, checked === true)}
                data-testid={`x402-network-${network.id}`}
              />
              <Label htmlFor={`x402_network_${network.id}`}>
                {network.label}
                {network.testnet ? (
                  <span className="text-ui-fg-subtle"> ({t("x402.testBadge")})</span>
                ) : null}
              </Label>
            </div>
          ))}
          <Text size="small" className="text-ui-fg-subtle">
            {t("x402.networksHint")}
          </Text>
          {errors.networks ? (
            <Text size="small" className="text-ui-fg-error">
              {t(errors.networks)}
            </Text>
          ) : null}
        </div>

        <div className="flex flex-col gap-y-2">
          <Label htmlFor="x402_facilitator_url">{t("x402.fields.facilitator_url")}</Label>
          <Input
            id="x402_facilitator_url"
            name="facilitator_url"
            autoComplete="off"
            data-testid="x402-facilitator_url"
            value={draft.facilitator_url}
            disabled={busy}
            aria-invalid={Boolean(errors.facilitator_url)}
            onChange={(event) => update("facilitator_url", event.target.value)}
            placeholder={loaded === null ? t("paymentSettings.loading") : defaultFacilitatorUrl}
          />
          <Text size="small" className="text-ui-fg-subtle">
            {t("x402.facilitatorHint")}
          </Text>
          {errors.facilitator_url ? (
            <Text size="small" className="text-ui-fg-error">
              {t(errors.facilitator_url)}
            </Text>
          ) : null}
        </div>

        <div className="flex items-center gap-x-2">
          <Button type="submit" size="small" isLoading={isSaving} disabled={busy} data-testid="x402-save">
            {t("x402.save")}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-y-2 px-6 py-4">
        <Text size="small" weight="plus">
          {t("x402.agentTitle")}
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          {t("x402.agentHint")}
        </Text>
        <code
          className="txt-compact-small break-all rounded-md border bg-ui-bg-subtle px-2 py-1"
          data-testid="x402-agent-purchase-url"
        >
          {x402?.agent_purchase_url ?? t("paymentSettings.loading")}
        </code>
      </div>
    </Container>
  )
}
