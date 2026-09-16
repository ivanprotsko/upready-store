import { useEffect, useRef, useState } from "react"
import {
  Badge,
  Button,
  Checkbox,
  Container,
  Heading,
  Input,
  Label,
  Select,
  Switch,
  Text,
  toast,
} from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../components/layout/pages"
import {
  type CdekDeliveryKind,
  type CdekSenderMode,
  type DeliverySettings as DeliverySettingsRecord,
  type DeliverySettingsResponse,
  useDeleteDeliverySettings,
  useDeliverySettings,
  useUpdateDeliverySettings,
} from "../../../hooks/api/delivery-settings"
import { SecretStatus } from "./secret-status"

// «Доставка СДЭК» (i02-apiship-cdek-shipping): the shop's own CDEK account and
// the delivery kinds it offers. The passwords are stored encrypted on the
// backend and never come back; the screen shows «задано ····1234» per password
// and lets the owner replace one by typing a new value into an empty field.
//
// The same two rules from rule 19h that shape the payments screen shape this
// one. While the saved record is still loading the REAL controls render,
// disabled, never a paragraph in their place, and the answer fills the form
// only if the owner has not touched it yet (`touchedRef`). «Not answered yet»
// is its own state (`loaded === null`), never a `false` reading as «nothing
// saved».

type SecretField = "password" | "test_password"
const SECRET_FIELDS: SecretField[] = ["test_password", "password"]

const ALL_KINDS: CdekDeliveryKind[] = ["courier", "pickup", "postamat"]

type Draft = {
  is_test: boolean
  is_enabled: boolean
  account: string
  test_account: string
  password: string
  test_password: string
  sender_mode: CdekSenderMode
  sender_city_name: string
  sender_city_code: string
  sender_address: string
  sender_name: string
  sender_phone: string
  shipment_point: string
  kinds: CdekDeliveryKind[]
  markup_amount: string
  markup_percent: string
  free_above_total: string
}

const EMPTY_DRAFT: Draft = {
  is_test: true,
  is_enabled: true,
  account: "",
  test_account: "",
  password: "",
  test_password: "",
  sender_mode: "warehouse",
  sender_city_name: "",
  sender_city_code: "",
  sender_address: "",
  sender_name: "",
  sender_phone: "",
  shipment_point: "",
  kinds: ["courier", "pickup"],
  markup_amount: "0",
  markup_percent: "0",
  free_above_total: "",
}

const draftFrom = (response: DeliverySettingsResponse | undefined): Draft => {
  const record: DeliverySettingsRecord | null = response?.settings ?? null
  if (!record) return EMPTY_DRAFT
  const kinds = response?.methods?.filter((m) => m.enabled).map((m) => m.kind) ?? []
  return {
    ...EMPTY_DRAFT,
    is_test: record.is_test,
    is_enabled: record.is_enabled,
    account: record.account,
    test_account: record.test_account,
    sender_mode: record.sender_mode,
    sender_city_name: record.sender_city_name ?? "",
    sender_city_code: record.sender_city_code ? String(record.sender_city_code) : "",
    sender_address: record.sender_address ?? "",
    sender_name: record.sender_name ?? "",
    sender_phone: record.sender_phone ?? "",
    shipment_point: record.shipment_point ?? "",
    kinds: kinds.length ? kinds : EMPTY_DRAFT.kinds,
    markup_amount: String(response?.pricing?.markup_amount ?? 0),
    markup_percent: String(response?.pricing?.markup_percent ?? 0),
    free_above_total:
      response?.pricing?.free_above_total === null ||
      response?.pricing?.free_above_total === undefined
        ? ""
        : String(response.pricing.free_above_total),
  }
}

/** A number typed into a text field; an empty or broken value reads as zero. */
const numberOf = (value: string): number => {
  const parsed = Number(value.replace(",", "."))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export const DeliverySettings = () => {
  const { t } = useTranslation()
  const response = useDeliverySettings()
  const { settings, methods, webhook_url: webhookUrl, isPending, isError, error } = response

  // `null` = the saved record has not answered yet; a boolean once it has.
  const [loaded, setLoaded] = useState<boolean | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const touchedRef = useRef(false)

  useEffect(() => {
    if (isPending) {
      return
    }
    setLoaded(true)
    if (!touchedRef.current) {
      setDraft(draftFrom(response as DeliverySettingsResponse))
    }
    // The hook rebuilds its result object on every render, so the effect keys
    // on the parts that actually change rather than on the object itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, settings, methods])

  const { mutateAsync: save, isPending: isSaving } = useUpdateDeliverySettings()
  const { mutateAsync: remove, isPending: isRemoving } = useDeleteDeliverySettings()

  if (isError) {
    throw error
  }

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    touchedRef.current = true
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  const toggleKind = (kind: CdekDeliveryKind, on: boolean) => {
    touchedRef.current = true
    setDraft((previous) => ({
      ...previous,
      kinds: on
        ? [...new Set([...previous.kinds, kind])]
        : previous.kinds.filter((entry) => entry !== kind),
    }))
  }

  const busy = loaded === null || isSaving || isRemoving

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (draft.is_enabled && !draft.sender_city_name.trim() && !draft.sender_city_code.trim()) {
      toast.error(t("deliverySettings.senderCityRequired"))
      return
    }

    const secrets = Object.fromEntries(
      SECRET_FIELDS.filter((field) => draft[field].trim().length > 0).map((field) => [
        field,
        draft[field].trim(),
      ])
    ) as Partial<Record<SecretField, string>>

    await save(
      {
        provider: "cdek",
        is_test: draft.is_test,
        is_enabled: draft.is_enabled,
        account: draft.account.trim(),
        test_account: draft.test_account.trim(),
        ...secrets,
        sender_mode: draft.sender_mode,
        sender_city_name: draft.sender_city_name.trim() || undefined,
        sender_city_code: draft.sender_city_code.trim()
          ? Number(draft.sender_city_code.trim())
          : null,
        sender_address: draft.sender_address.trim() || undefined,
        sender_name: draft.sender_name.trim() || undefined,
        sender_phone: draft.sender_phone.trim() || undefined,
        shipment_point: draft.shipment_point.trim() || undefined,
        kinds: draft.kinds,
        markup_amount: numberOf(draft.markup_amount),
        markup_percent: numberOf(draft.markup_percent),
        free_above_total: draft.free_above_total.trim() ? numberOf(draft.free_above_total) : null,
      },
      {
        onSuccess: (saved) => {
          touchedRef.current = false
          setDraft(draftFrom(saved))
          toast.success(
            saved.verified
              ? t("deliverySettings.savedWithTariffs", { count: saved.verified.tariffs })
              : t("deliverySettings.saved")
          )
          if (saved.webhook && !saved.webhook.registered && saved.webhook.error) {
            // Not a failed save: the shop quotes and ships without the
            // subscription, it only loses the automatic status updates.
            toast.warning(t("deliverySettings.webhookFailed", { reason: saved.webhook.error }))
          }
        },
        onError: (saveError) => toast.error(saveError.message),
      }
    )
  }

  const handleRemove = async () => {
    await remove(undefined, {
      onSuccess: () => {
        touchedRef.current = false
        setDraft(EMPTY_DRAFT)
        toast.success(t("deliverySettings.removed"))
      },
      onError: (removeError) => toast.error(removeError.message),
    })
  }

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading>{t("deliverySettings.title")}</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              {t("deliverySettings.subtitle")}
            </Text>
          </div>
          {settings ? (
            <Badge size="2xsmall" color={settings.is_enabled ? "green" : "grey"}>
              {settings.is_enabled
                ? settings.is_test
                  ? t("deliverySettings.stateTest")
                  : t("deliverySettings.stateLive")
                : t("deliverySettings.stateOff")}
            </Badge>
          ) : loaded ? (
            <Badge size="2xsmall" color="grey">
              {t("deliverySettings.stateNone")}
            </Badge>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-y-6 px-6 py-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="test_account">{t("deliverySettings.fields.test_account")}</Label>
              <Input
                id="test_account"
                autoComplete="off"
                value={draft.test_account}
                disabled={busy}
                onChange={(event) => update("test_account", event.target.value)}
                placeholder={loaded === null ? t("deliverySettings.loading") : ""}
                data-testid="cdek-test-account"
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="account">{t("deliverySettings.fields.account")}</Label>
              <Input
                id="account"
                autoComplete="off"
                value={draft.account}
                disabled={busy}
                onChange={(event) => update("account", event.target.value)}
                placeholder={loaded === null ? t("deliverySettings.loading") : ""}
                data-testid="cdek-account"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {SECRET_FIELDS.map((field) => (
              <div key={field} className="flex flex-col gap-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={field}>{t(`deliverySettings.fields.${field}`)}</Label>
                  <SecretStatus masked={settings?.[field]} />
                </div>
                <Input
                  id={field}
                  type="password"
                  autoComplete="new-password"
                  value={draft[field]}
                  disabled={busy}
                  onChange={(event) => update(field, event.target.value)}
                  placeholder={
                    settings?.[field]?.set
                      ? t("deliverySettings.keepPlaceholder")
                      : t("deliverySettings.emptyPlaceholder")
                  }
                  data-testid={`cdek-${field}`}
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="sender_mode">{t("deliverySettings.fields.sender_mode")}</Label>
              <Select
                value={draft.sender_mode}
                disabled={busy}
                onValueChange={(value) => update("sender_mode", value as CdekSenderMode)}
              >
                <Select.Trigger id="sender_mode">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="warehouse">
                    {t("deliverySettings.senderWarehouse")}
                  </Select.Item>
                  <Select.Item value="door">{t("deliverySettings.senderDoor")}</Select.Item>
                </Select.Content>
              </Select>
              <Text className="text-ui-fg-subtle" size="small">
                {t("deliverySettings.senderModeHint")}
              </Text>
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="sender_city_name">
                {t("deliverySettings.fields.sender_city_name")}
              </Label>
              <Input
                id="sender_city_name"
                value={draft.sender_city_name}
                disabled={busy}
                onChange={(event) => update("sender_city_name", event.target.value)}
                placeholder="Москва"
                data-testid="cdek-sender-city"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="sender_address">{t("deliverySettings.fields.sender_address")}</Label>
              <Input
                id="sender_address"
                value={draft.sender_address}
                disabled={busy}
                onChange={(event) => update("sender_address", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="shipment_point">
                {t("deliverySettings.fields.shipment_point")}
              </Label>
              <Input
                id="shipment_point"
                value={draft.shipment_point}
                disabled={busy}
                onChange={(event) => update("shipment_point", event.target.value)}
                placeholder="MSK1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="sender_name">{t("deliverySettings.fields.sender_name")}</Label>
              <Input
                id="sender_name"
                value={draft.sender_name}
                disabled={busy}
                onChange={(event) => update("sender_name", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="sender_phone">{t("deliverySettings.fields.sender_phone")}</Label>
              <Input
                id="sender_phone"
                value={draft.sender_phone}
                disabled={busy}
                onChange={(event) => update("sender_phone", event.target.value)}
                placeholder="+7…"
              />
            </div>
          </div>

          <div className="flex flex-col gap-y-2">
            <Label>{t("deliverySettings.fields.kinds")}</Label>
            <div className="flex flex-col gap-y-2">
              {ALL_KINDS.map((kind) => (
                <label key={kind} className="flex items-center gap-x-2">
                  <Checkbox
                    checked={draft.kinds.includes(kind)}
                    disabled={busy}
                    onCheckedChange={(checked) => toggleKind(kind, checked === true)}
                    id={`kind-${kind}`}
                  />
                  <Text size="small">{t(`deliverySettings.kinds.${kind}`)}</Text>
                </label>
              ))}
            </div>
            <Text className="text-ui-fg-subtle" size="small">
              {t("deliverySettings.kindsHint")}
            </Text>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="markup_amount">{t("deliverySettings.fields.markup_amount")}</Label>
              <Input
                id="markup_amount"
                inputMode="decimal"
                value={draft.markup_amount}
                disabled={busy}
                onChange={(event) => update("markup_amount", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="markup_percent">
                {t("deliverySettings.fields.markup_percent")}
              </Label>
              <Input
                id="markup_percent"
                inputMode="decimal"
                value={draft.markup_percent}
                disabled={busy}
                onChange={(event) => update("markup_percent", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="free_above_total">
                {t("deliverySettings.fields.free_above_total")}
              </Label>
              <Input
                id="free_above_total"
                inputMode="decimal"
                value={draft.free_above_total}
                disabled={busy}
                onChange={(event) => update("free_above_total", event.target.value)}
                placeholder={t("deliverySettings.freeAbovePlaceholder")}
              />
            </div>
          </div>

          <div className="flex flex-col gap-y-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <Label htmlFor="is_test">{t("deliverySettings.fields.is_test")}</Label>
                <Text className="text-ui-fg-subtle" size="small">
                  {t("deliverySettings.testHint")}
                </Text>
              </div>
              <Switch
                id="is_test"
                checked={draft.is_test}
                disabled={busy}
                onCheckedChange={(checked) => update("is_test", checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="is_enabled">{t("deliverySettings.fields.is_enabled")}</Label>
              <Switch
                id="is_enabled"
                checked={draft.is_enabled}
                disabled={busy}
                onCheckedChange={(checked) => update("is_enabled", checked)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-x-3">
            <Button type="submit" isLoading={isSaving} disabled={busy} data-testid="cdek-save">
              {t("deliverySettings.save")}
            </Button>
            {settings && (
              <Button
                type="button"
                variant="danger"
                isLoading={isRemoving}
                disabled={busy}
                onClick={handleRemove}
              >
                {t("deliverySettings.remove")}
              </Button>
            )}
          </div>
        </form>

        {(methods?.length ?? 0) > 0 && (
          <div className="flex flex-col gap-y-2 px-6 py-6">
            <Heading level="h3">{t("deliverySettings.methodsTitle")}</Heading>
            <ul className="flex flex-col gap-y-1" data-testid="cdek-methods">
              {(methods ?? []).map((method) => (
                <li key={method.id} className="flex items-center gap-x-2">
                  <Badge size="2xsmall" color={method.enabled ? "green" : "grey"}>
                    {method.enabled
                      ? t("deliverySettings.methodOn")
                      : t("deliverySettings.methodOff")}
                  </Badge>
                  <Text size="small">{method.name}</Text>
                </li>
              ))}
            </ul>
          </div>
        )}

        {webhookUrl && (
          <div className="flex flex-col gap-y-2 px-6 py-6">
            <Heading level="h3">{t("deliverySettings.webhookTitle")}</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              {t("deliverySettings.webhookHint")}
            </Text>
            <Text size="small" className="break-all font-mono">
              {webhookUrl}
            </Text>
            <Badge size="2xsmall" color={settings?.webhook_registered ? "green" : "grey"}>
              {settings?.webhook_registered
                ? t("deliverySettings.webhookRegistered")
                : t("deliverySettings.webhookNotRegistered")}
            </Badge>
          </div>
        )}
      </Container>
    </SingleColumnPage>
  )
}
