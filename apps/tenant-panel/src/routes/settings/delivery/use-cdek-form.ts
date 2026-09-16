import { useEffect, useRef, useState } from "react"
import { toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import {
  type CdekDeliveryKind,
  type CdekSenderMode,
  type DeliverySettings as DeliverySettingsRecord,
  type DeliverySettingsResponse,
  useDeleteDeliverySettings,
  useDeliverySettings,
  useUpdateDeliverySettings,
} from "../../../hooks/api/delivery-settings"

/**
 * ONE CDEK form, rendered on TWO screens
 * (p01-settings-integrations-restructure).
 *
 * Ivan's order of 2026-09-16 20:22 WITA moves the ACCOUNT (the sandbox pair and
 * the live pair) to `/settings/integrations/cdek` and leaves everything about
 * HOW the shop ships — the sender, the delivery kinds, the markup, the
 * free-shipping threshold, the test switch — on «Доставка СДЭК».
 *
 * WHY THE WHOLE DRAFT IS ALWAYS SUBMITTED, and why this is not a detail.
 * `PUT /tenants/delivery-settings` is one atomic operation: it verifies the
 * credentials against CDEK, writes the row AND re-provisions the shipping
 * options with `markup_amount: body.markup_amount ?? 0`. A half-payload from
 * the requisites screen would therefore reset the owner's markup and her free
 * shipping threshold to zero without an error anywhere — a silent data loss of
 * exactly the kind rule 20a describes, since zero is a legal value of the same
 * quantity. Both screens send the complete body they loaded, so a save on
 * either one is the same request the single screen used to send.
 *
 * Rule 19h is unchanged by the split: `loaded === null` is «not answered yet»,
 * the real controls render disabled instead of being swapped out, and a late
 * answer refills the draft only while the owner has not typed into it.
 */

export type CdekSecretField = "password" | "test_password"
export const CDEK_SECRET_FIELDS: CdekSecretField[] = ["test_password", "password"]

export const ALL_KINDS: CdekDeliveryKind[] = ["courier", "pickup", "postamat"]

export type CdekDraft = {
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

export const EMPTY_DRAFT: CdekDraft = {
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

const draftFrom = (response: DeliverySettingsResponse | undefined): CdekDraft => {
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

export const useCdekForm = () => {
  const { t } = useTranslation()
  const response = useDeliverySettings()
  const { settings, methods, webhook_url: webhookUrl, isPending, isError, error } = response

  // `null` = the saved record has not answered yet; a boolean once it has.
  const [loaded, setLoaded] = useState<boolean | null>(null)
  const [draft, setDraft] = useState<CdekDraft>(EMPTY_DRAFT)
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

  const update = <K extends keyof CdekDraft>(key: K, value: CdekDraft[K]) => {
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

    // The city is checked on BOTH screens, because the backend refuses the save
    // without it and the field itself lives on «Доставка». Saying so here beats
    // handing the owner of the requisites screen a CDEK error she cannot act on
    // from that page (the message names the other screen, `senderCityRequired`).
    if (draft.is_enabled && !draft.sender_city_name.trim() && !draft.sender_city_code.trim()) {
      toast.error(t("deliverySettings.senderCityRequired"))
      return
    }

    const secrets = Object.fromEntries(
      CDEK_SECRET_FIELDS.filter((field) => draft[field].trim().length > 0).map((field) => [
        field,
        draft[field].trim(),
      ])
    ) as Partial<Record<CdekSecretField, string>>

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

  return {
    settings: settings ?? null,
    methods,
    webhookUrl,
    loaded,
    draft,
    update,
    toggleKind,
    busy,
    isSaving,
    isRemoving,
    isError,
    error,
    handleSubmit,
    handleRemove,
  }
}

export type CdekForm = ReturnType<typeof useCdekForm>
