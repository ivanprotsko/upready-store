import { useEffect, useRef, useState } from "react"
import {
  Badge,
  Button,
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
  type MaskedSecret,
  type PaymentSettings as PaymentSettingsRecord,
  type RobokassaHashAlgorithm,
  useDeletePaymentSettings,
  usePaymentSettings,
  useUpdatePaymentSettings,
} from "../../../hooks/api/payment-settings"

// «Приём оплат» (t03-tenant-secrets-robokassa): the shop's own Robokassa
// account. The values are stored encrypted on the backend and never come back;
// the screen shows «задано ····1234» per password and lets the owner replace
// any one of them by typing a new value into an otherwise empty field.
//
// Two rules from rule 19h shape the form. While the saved record is still
// loading the REAL controls render, disabled, never a paragraph in their
// place: a click that lands in that window is queued by the browser on a
// disabled input, not swallowed by a swapped-out element. And the load lands
// whenever the network decides, so it may fill the form only if the owner has
// not touched it yet (`touchedRef`): a slow answer never overwrites what is
// already typed. «Not answered yet» is its own state (`loaded === null`), not
// a `false` that would read as «nothing saved».

type SecretField = "password1" | "password2" | "test_password1" | "test_password2"

const SECRET_FIELDS: SecretField[] = [
  "test_password1",
  "test_password2",
  "password1",
  "password2",
]

type Draft = {
  merchant_login: string
  hash_algorithm: RobokassaHashAlgorithm
  is_test: boolean
  is_enabled: boolean
  password1: string
  password2: string
  test_password1: string
  test_password2: string
}

const EMPTY_DRAFT: Draft = {
  merchant_login: "",
  hash_algorithm: "sha256",
  is_test: true,
  is_enabled: true,
  password1: "",
  password2: "",
  test_password1: "",
  test_password2: "",
}

const draftFrom = (record: PaymentSettingsRecord | null): Draft =>
  record
    ? {
        ...EMPTY_DRAFT,
        merchant_login: record.merchant_login,
        hash_algorithm: record.hash_algorithm,
        is_test: record.is_test,
        is_enabled: record.is_enabled,
      }
    : EMPTY_DRAFT

const HASH_ALGORITHMS: RobokassaHashAlgorithm[] = ["sha256", "md5", "sha384", "sha512"]

const SecretStatus = ({ masked }: { masked: MaskedSecret | undefined }) => {
  const { t } = useTranslation()
  if (!masked || !masked.set) {
    return (
      <Badge size="2xsmall" color="grey">
        {t("paymentSettings.secretNotSet")}
      </Badge>
    )
  }
  return (
    <Badge size="2xsmall" color="green">
      {t("paymentSettings.secretSet", { last4: masked.last4 ?? "" })}
    </Badge>
  )
}

export const PaymentSettings = () => {
  const { t } = useTranslation()
  const { settings, result_url: resultUrl, isPending, isError, error } =
    usePaymentSettings()

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
      setDraft(draftFrom(settings ?? null))
    }
  }, [isPending, settings])

  const { mutateAsync: save, isPending: isSaving } = useUpdatePaymentSettings()
  const { mutateAsync: remove, isPending: isRemoving } = useDeletePaymentSettings()

  if (isError) {
    throw error
  }

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    touchedRef.current = true
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  const busy = loaded === null || isSaving || isRemoving

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.merchant_login.trim()) {
      toast.error(t("paymentSettings.merchantLoginRequired"))
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
        provider: "robokassa",
        merchant_login: draft.merchant_login.trim(),
        hash_algorithm: draft.hash_algorithm,
        is_test: draft.is_test,
        is_enabled: draft.is_enabled,
        ...secrets,
      },
      {
        onSuccess: (response) => {
          // The saved record is the truth again: clear the typed passwords and
          // let the masked view show what is stored.
          touchedRef.current = false
          setDraft(draftFrom(response.settings))
          toast.success(t("paymentSettings.saved"))
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
        toast.success(t("paymentSettings.removed"))
      },
      onError: (removeError) => toast.error(removeError.message),
    })
  }

  const secretLabel = (field: SecretField) => t(`paymentSettings.fields.${field}`)

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading>{t("paymentSettings.title")}</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              {t("paymentSettings.subtitle")}
            </Text>
          </div>
          {settings ? (
            <Badge size="2xsmall" color={settings.is_enabled ? "green" : "grey"}>
              {settings.is_enabled
                ? settings.is_test
                  ? t("paymentSettings.stateTest")
                  : t("paymentSettings.stateLive")
                : t("paymentSettings.stateOff")}
            </Badge>
          ) : loaded ? (
            <Badge size="2xsmall" color="grey">
              {t("paymentSettings.stateNone")}
            </Badge>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-y-6 px-6 py-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="provider">{t("paymentSettings.fields.provider")}</Label>
              <Select value="robokassa" disabled>
                <Select.Trigger id="provider">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="robokassa">Robokassa</Select.Item>
                </Select.Content>
              </Select>
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="merchant_login">{t("paymentSettings.fields.merchant_login")}</Label>
              <Input
                id="merchant_login"
                name="merchant_login"
                autoComplete="off"
                value={draft.merchant_login}
                disabled={busy}
                onChange={(event) => update("merchant_login", event.target.value)}
                placeholder={loaded === null ? t("paymentSettings.loading") : "OLAVKA"}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {SECRET_FIELDS.map((field) => (
              <div key={field} className="flex flex-col gap-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={field}>{secretLabel(field)}</Label>
                  <SecretStatus masked={settings?.[field]} />
                </div>
                <Input
                  id={field}
                  name={field}
                  type="password"
                  autoComplete="new-password"
                  value={draft[field]}
                  disabled={busy}
                  onChange={(event) => update(field, event.target.value)}
                  placeholder={
                    settings?.[field]?.set
                      ? t("paymentSettings.keepPlaceholder")
                      : t("paymentSettings.emptyPlaceholder")
                  }
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="hash_algorithm">{t("paymentSettings.fields.hash_algorithm")}</Label>
              <Select
                value={draft.hash_algorithm}
                disabled={busy}
                onValueChange={(value) => update("hash_algorithm", value as RobokassaHashAlgorithm)}
              >
                <Select.Trigger id="hash_algorithm">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {HASH_ALGORITHMS.map((algorithm) => (
                    <Select.Item key={algorithm} value={algorithm}>
                      {algorithm.toUpperCase()}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
            <div className="flex items-center gap-x-3 md:pt-7">
              <Switch
                id="is_test"
                checked={draft.is_test}
                disabled={busy}
                onCheckedChange={(checked) => update("is_test", checked)}
              />
              <Label htmlFor="is_test">{t("paymentSettings.fields.is_test")}</Label>
            </div>
            <div className="flex items-center gap-x-3 md:pt-7">
              <Switch
                id="is_enabled"
                checked={draft.is_enabled}
                disabled={busy}
                onCheckedChange={(checked) => update("is_enabled", checked)}
              />
              <Label htmlFor="is_enabled">{t("paymentSettings.fields.is_enabled")}</Label>
            </div>
          </div>

          <Text size="small" className="text-ui-fg-subtle">
            {t("paymentSettings.testHint")}
          </Text>

          <div className="flex items-center gap-x-2">
            <Button type="submit" size="small" isLoading={isSaving} disabled={busy}>
              {t("paymentSettings.save")}
            </Button>
            {settings ? (
              <Button
                type="button"
                size="small"
                variant="danger"
                isLoading={isRemoving}
                disabled={busy}
                onClick={handleRemove}
              >
                {t("paymentSettings.remove")}
              </Button>
            ) : null}
          </div>
        </form>

        <div className="flex flex-col gap-y-2 px-6 py-4">
          <Text size="small" weight="plus">
            {t("paymentSettings.resultUrlTitle")}
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            {t("paymentSettings.resultUrlHint")}
          </Text>
          <code
            className="txt-compact-small rounded-md border bg-ui-bg-subtle px-2 py-1"
            data-testid="robokassa-result-url"
          >
            {resultUrl ?? t("paymentSettings.loading")}
          </code>
        </div>
      </Container>
    </SingleColumnPage>
  )
}
