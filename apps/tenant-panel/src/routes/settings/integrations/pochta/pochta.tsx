import { useEffect, useState } from "react"
import { Alert, Badge, Button, Container, Heading, Input, Label, Switch, Text, toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../../components/layout/pages"
import { useDeletePochta, usePochta, usePochtaProbe, useSavePochta } from "../../../../hooks/api/pochta"

/**
 * «Настройки → Интеграции → Почта России» (46df-pochta).
 *
 * The token and the user key are write-only, like ApiShip's token: the page
 * shows whether each is stored and its last four characters, never the value.
 * The sender's post-office index and the default parcel weight are plain
 * settings. Saving with the switch on proves the token against the carrier
 * first and then provisions «Почта России — до отделения» for the checkout.
 *
 * «Проверить подключение» is its own query (the probe), so a slow carrier
 * never holds the form, and it has three answers per credential: not stored,
 * rejected, accepted. The page says in plain words what the user key adds,
 * because without it the checkout price is an estimate.
 */
export const PochtaIntegration = () => {
  const { t } = useTranslation()
  const prompt = usePrompt()

  const { pochta, isPending, isError, error } = usePochta()
  const settings = pochta?.settings ?? null
  const tokenStored = settings?.token.set ?? false

  const { result: probeResult, isFetching: isProbing, refetch: probe } = usePochtaProbe({ enabled: false })

  const [token, setToken] = useState("")
  const [userKey, setUserKey] = useState("")
  const [senderIndex, setSenderIndex] = useState("")
  const [weight, setWeight] = useState("1000")
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    if (!settings) return
    setSenderIndex(settings.sender_index)
    setWeight(String(settings.default_weight_g))
    setEnabled(settings.is_enabled)
  }, [settings])

  const { mutateAsync: save, isPending: isSaving } = useSavePochta()
  const { mutateAsync: remove, isPending: isRemoving } = useDeletePochta()

  if (isError) {
    throw error
  }

  const busy = isPending || isSaving || isRemoving

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!tokenStored && !token.trim()) {
      toast.error(t("integrations.pochta.tokenRequired"))
      return
    }
    try {
      await save({
        token: token.trim() || undefined,
        user_key: userKey.trim() || undefined,
        sender_index: senderIndex.trim() || undefined,
        default_weight_g: Number(weight) > 0 ? Math.round(Number(weight)) : undefined,
        is_enabled: enabled,
      })
      setToken("")
      setUserKey("")
      toast.success(t("integrations.pochta.saved"))
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : String(saveError))
    }
  }

  const handleClearUserKey = async () => {
    try {
      await save({ clear_user_key: true, is_enabled: enabled })
      toast.success(t("integrations.pochta.userKeyCleared"))
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : String(saveError))
    }
  }

  const handleRemove = async () => {
    const confirmed = await prompt({
      title: t("integrations.pochta.removeTitle"),
      description: t("integrations.pochta.removeDescription"),
      confirmText: t("integrations.pochta.remove"),
      cancelText: t("integrations.pochta.cancel"),
    })
    if (!confirmed) return
    try {
      await remove()
      setToken("")
      setUserKey("")
      toast.success(t("integrations.pochta.removed"))
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : String(removeError))
    }
  }

  const tokenVerdict = (() => {
    if (!probeResult?.probe) return null
    if (probeResult.probe.ok) {
      return {
        tone: "green" as const,
        text: t("integrations.pochta.probeOk", { count: probeResult.probe.points ?? 0 }),
      }
    }
    return { tone: "red" as const, text: probeResult.probe.error ?? t("integrations.pochta.probeFailed") }
  })()

  const userKeyVerdict = (() => {
    if (!probeResult?.probe) return null
    const verdict = probeResult.probe.user_key
    if (!verdict) return { tone: "orange" as const, text: t("integrations.pochta.userKeyMissing") }
    if (verdict.ok) return { tone: "green" as const, text: t("integrations.pochta.userKeyOk") }
    return { tone: "red" as const, text: verdict.error ?? t("integrations.pochta.probeFailed") }
  })()

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading>{t("integrations.pochta.title")}</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              {t("integrations.pochta.subtitle")}
            </Text>
          </div>
          {isPending ? null : (
            <Badge size="2xsmall" color={tokenStored && settings?.is_enabled ? "green" : "orange"} data-testid="pochta-state">
              {tokenStored
                ? settings?.is_enabled
                  ? t("integrations.state.connected", { last4: settings?.token.last4 ?? "" })
                  : t("integrations.pochta.stateOff")
                : t("integrations.state.missing")}
            </Badge>
          )}
        </div>

        <div className="px-6 py-4">
          <Alert variant="info" data-testid="pochta-user-key-note">
            {t("integrations.pochta.userKeyNote")}
          </Alert>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-y-5 px-6 py-6">
          <div className="flex items-center gap-x-3">
            <Switch id="pochta-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={busy} data-testid="pochta-enabled" />
            <Label htmlFor="pochta-enabled">{t("integrations.pochta.enabledLabel")}</Label>
          </div>

          <div className="flex flex-col gap-y-2">
            <Label htmlFor="pochta-token">{t("integrations.pochta.tokenLabel")}</Label>
            <Input
              id="pochta-token"
              name="token"
              type="password"
              autoComplete="new-password"
              data-testid="pochta-token"
              value={token}
              disabled={busy}
              onChange={(event) => setToken(event.target.value)}
              placeholder={
                tokenStored
                  ? t("integrations.pochta.keepPlaceholder", { last4: settings?.token.last4 ?? "" })
                  : t("integrations.pochta.emptyPlaceholder")
              }
            />
            <Text className="text-ui-fg-subtle" size="small">
              {t("integrations.pochta.tokenHint")}
            </Text>
          </div>

          <div className="flex flex-col gap-y-2">
            <Label htmlFor="pochta-user-key">{t("integrations.pochta.userKeyLabel")}</Label>
            <Input
              id="pochta-user-key"
              name="user_key"
              type="password"
              autoComplete="new-password"
              data-testid="pochta-user-key"
              value={userKey}
              disabled={busy}
              onChange={(event) => setUserKey(event.target.value)}
              placeholder={
                settings?.user_key.set
                  ? t("integrations.pochta.keepPlaceholder", { last4: settings.user_key.last4 ?? "" })
                  : t("integrations.pochta.userKeyPlaceholder")
              }
            />
            <Text className="text-ui-fg-subtle" size="small">
              {t("integrations.pochta.userKeyHint")}
            </Text>
            {settings?.user_key.set ? (
              <Button
                type="button"
                size="small"
                variant="transparent"
                className="w-fit"
                disabled={busy}
                onClick={handleClearUserKey}
                data-testid="pochta-user-key-clear"
              >
                {t("integrations.pochta.userKeyClear")}
              </Button>
            ) : null}
          </div>

          <div className="grid gap-4 small:grid-cols-2">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="pochta-sender-index">{t("integrations.pochta.senderIndexLabel")}</Label>
              <Input
                id="pochta-sender-index"
                name="sender_index"
                inputMode="numeric"
                maxLength={6}
                data-testid="pochta-sender-index"
                value={senderIndex}
                disabled={busy}
                onChange={(event) => setSenderIndex(event.target.value.replace(/\D/g, ""))}
                placeholder="101000"
              />
              <Text className="text-ui-fg-subtle" size="small">
                {t("integrations.pochta.senderIndexHint")}
              </Text>
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="pochta-weight">{t("integrations.pochta.weightLabel")}</Label>
              <Input
                id="pochta-weight"
                name="default_weight_g"
                type="number"
                min={1}
                max={50000}
                data-testid="pochta-weight"
                value={weight}
                disabled={busy}
                onChange={(event) => setWeight(event.target.value)}
              />
              <Text className="text-ui-fg-subtle" size="small">
                {t("integrations.pochta.weightHint")}
              </Text>
            </div>
          </div>

          {pochta?.method ? (
            <Text size="small" className="text-ui-fg-subtle" data-testid="pochta-method">
              {pochta.method.enabled
                ? t("integrations.pochta.methodOn", { name: pochta.method.name })
                : t("integrations.pochta.methodOff", { name: pochta.method.name })}
            </Text>
          ) : null}

          {tokenVerdict || isProbing ? (
            <div className="flex flex-wrap items-center gap-2">
              {isProbing ? (
                <Badge size="2xsmall" color="grey" data-testid="pochta-probe">
                  {t("integrations.state.asking")}
                </Badge>
              ) : (
                <>
                  {tokenVerdict ? (
                    <Badge size="2xsmall" color={tokenVerdict.tone} data-testid="pochta-probe">
                      {tokenVerdict.text}
                    </Badge>
                  ) : null}
                  {userKeyVerdict ? (
                    <Badge size="2xsmall" color={userKeyVerdict.tone} data-testid="pochta-probe-user-key">
                      {userKeyVerdict.text}
                    </Badge>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="small" isLoading={isSaving} disabled={busy} data-testid="pochta-save">
              {t("integrations.pochta.save")}
            </Button>
            <Button
              type="button"
              size="small"
              variant="secondary"
              isLoading={isProbing}
              disabled={busy || !tokenStored}
              onClick={() => probe()}
              data-testid="pochta-probe-run"
            >
              {t("integrations.pochta.probe")}
            </Button>
            {tokenStored ? (
              <Button
                type="button"
                size="small"
                variant="danger"
                isLoading={isRemoving}
                disabled={busy}
                onClick={handleRemove}
                data-testid="pochta-remove"
              >
                {t("integrations.pochta.remove")}
              </Button>
            ) : null}
          </div>
        </form>
      </Container>
    </SingleColumnPage>
  )
}
