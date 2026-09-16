import { useState } from "react"
import { Alert, Badge, Button, Container, Heading, Input, Label, Text, toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../../components/layout/pages"
import {
  useApishipKey,
  useApishipProbe,
  useDeleteApishipKey,
  useSaveApishipKey,
} from "../../../../hooks/api/apiship"
import { CrossLink } from "../components/cross-link"

/**
 * «Подключение → ApiShip» — the shop's ApiShip token
 * (p01-settings-integrations-restructure).
 *
 * Ivan's order of 2026-09-16 20:22 WITA lists ApiShip among the services whose
 * requisites the owner must be able to enter herself. Until this page ApiShip
 * was a row reading «скоро» on the marketplaces hub, with no slot in the
 * database behind it.
 *
 * WHAT THIS PAGE DOES NOT DO, said in plain words on the screen itself: it does
 * not put ApiShip into the checkout. i02 measured the ApiShip calculator
 * answering ZERO tariffs for this account in all four location combinations, so
 * the checkout quotes СДЭК directly, and storing a token changes nothing about
 * what the buyer sees (`artifacts/docs/i02-apiship-cdek-shipping/decision.md`).
 * A page that stayed silent about that would be read as «delivery is connected»
 * — a claim the product would then fail (rule 17a).
 *
 * THREE STATES, never two (rule 19h / 20a): no token stored, a token ApiShip
 * has not answered about yet, and ApiShip's own verdict. The verdict comes from
 * its own query, so a slow or dead ApiShip never holds the form.
 */
export const ApishipIntegration = () => {
  const { t } = useTranslation()
  const prompt = usePrompt()

  const { apiship, isPending, isError, error } = useApishipKey()
  const stored = apiship?.settings?.token.set ?? false

  // The probe only makes sense once something is stored, and it costs a call to
  // ApiShip; asking about a token that does not exist would be a request whose
  // answer we already know.
  const { result: probeResult, isPending: isProbing } = useApishipProbe({ enabled: stored })

  const [token, setToken] = useState("")
  const { mutateAsync: save, isPending: isSaving } = useSaveApishipKey()
  const { mutateAsync: remove, isPending: isRemoving } = useDeleteApishipKey()

  if (isError) {
    throw error
  }

  const busy = isPending || isSaving || isRemoving

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token.trim()) {
      toast.error(t("integrations.apiship.tokenRequired"))
      return
    }
    try {
      const saved = await save({ token: token.trim() })
      setToken("")
      toast.success(
        t("integrations.apiship.saved", { last4: saved.settings?.token.last4 ?? "" })
      )
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : String(saveError))
    }
  }

  const handleRemove = async () => {
    const confirmed = await prompt({
      title: t("integrations.apiship.removeTitle"),
      description: t("integrations.apiship.removeDescription"),
      confirmText: t("integrations.apiship.remove"),
      cancelText: t("integrations.apiship.cancel"),
    })
    if (!confirmed) {
      return
    }
    try {
      await remove()
      setToken("")
      toast.success(t("integrations.apiship.removed"))
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : String(removeError))
    }
  }

  const verdict = (() => {
    if (!stored) {
      return null
    }
    if (isProbing || !probeResult?.probe) {
      return { tone: "grey" as const, text: t("integrations.apiship.probeAsking") }
    }
    if (probeResult.probe.ok) {
      return {
        tone: "green" as const,
        text:
          probeResult.probe.connections === null
            ? t("integrations.apiship.probeOk")
            : t("integrations.apiship.probeOkWithCount", {
                count: probeResult.probe.connections,
              }),
      }
    }
    return {
      tone: "red" as const,
      text: probeResult.probe.error ?? t("integrations.apiship.probeFailed"),
    }
  })()

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading>{t("integrations.apiship.title")}</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              {t("integrations.apiship.subtitle")}
            </Text>
          </div>
          {isPending ? null : (
            <Badge
              size="2xsmall"
              color={stored ? "green" : "orange"}
              data-testid="apiship-state"
            >
              {stored
                ? t("integrations.state.connected", {
                    last4: apiship?.settings?.token.last4 ?? "",
                  })
                : t("integrations.state.missing")}
            </Badge>
          )}
        </div>

        <div className="px-6 py-4">
          {/* The honest limit, on the screen and not only in a report. */}
          <Alert variant="warning" data-testid="apiship-not-in-checkout">
            {t("integrations.apiship.notInCheckout")}
          </Alert>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-y-4 px-6 py-6">
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="apiship-token">{t("integrations.apiship.tokenLabel")}</Label>
            <Input
              id="apiship-token"
              name="token"
              type="password"
              autoComplete="new-password"
              data-testid="apiship-token"
              value={token}
              disabled={busy}
              onChange={(event) => setToken(event.target.value)}
              placeholder={
                stored
                  ? t("integrations.apiship.keepPlaceholder")
                  : t("integrations.apiship.emptyPlaceholder")
              }
            />
            <Text className="text-ui-fg-subtle" size="small">
              {t("integrations.apiship.tokenHint")}
            </Text>
          </div>

          {verdict ? (
            <div className="flex items-center gap-x-2">
              <Badge size="2xsmall" color={verdict.tone} data-testid="apiship-probe">
                {verdict.text}
              </Badge>
            </div>
          ) : null}

          <div className="flex items-center gap-x-2">
            <Button
              type="submit"
              size="small"
              isLoading={isSaving}
              disabled={busy}
              data-testid="apiship-save"
            >
              {t("integrations.apiship.save")}
            </Button>
            {stored ? (
              <Button
                type="button"
                size="small"
                variant="danger"
                isLoading={isRemoving}
                disabled={busy}
                onClick={handleRemove}
                data-testid="apiship-remove"
              >
                {t("integrations.apiship.remove")}
              </Button>
            ) : null}
          </div>
        </form>

        <div className="px-6 py-4">
          <CrossLink
            to="/settings/delivery"
            hint={t("integrations.apiship.deliveryHint")}
            label={t("deliverySettings.title")}
            testId="apiship-delivery-link"
          />
        </div>
      </Container>
    </SingleColumnPage>
  )
}
