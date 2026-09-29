import { useEffect, useRef, useState } from "react"
import { toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import {
  type PaymentSettings as PaymentSettingsRecord,
  type RobokassaHashAlgorithm,
  type UnreadableSecret,
  useDeletePaymentSettings,
  usePaymentSettings,
  useUpdatePaymentSettings,
} from "../../../hooks/api/payment-settings"

/**
 * ONE Robokassa form, rendered on TWO screens
 * (p01-settings-integrations-restructure).
 *
 * Ivan's order of 2026-09-16 20:22 WITA moves the CREDENTIALS of every service
 * under `/settings/integrations/<service>` and leaves the BEHAVIOUR where the
 * owner already looks for it — the test-mode switch and the hash algorithm stay
 * on «Приём оплат». Two screens, one form: the draft, the submit and the
 * loading rules live here, and each screen renders its own half of the fields.
 *
 * WHY THE WHOLE DRAFT IS ALWAYS SUBMITTED. `PUT /tenants/payment-settings`
 * takes `merchant_login` as REQUIRED and treats every other field as «this or
 * the stored one», so a half-payload from the credentials screen would be a
 * request that either fails validation or silently re-decides the test mode.
 * Both screens therefore send the same complete body, built from the record
 * they both loaded. Splitting the ENDPOINT to match the split screen would be
 * the duplication the move exists to avoid (rule 20).
 *
 * Rule 19h shapes the load exactly as it did before the split: `loaded === null`
 * is «not answered yet» and is its own state, the real controls render disabled
 * rather than being swapped for a paragraph, and a late answer refills the draft
 * only while the owner has not typed into it.
 */

export type SecretField = "password1" | "password2" | "test_password1" | "test_password2"

export const SECRET_FIELDS: SecretField[] = [
  "test_password1",
  "test_password2",
  "password1",
  "password2",
]

export type RobokassaDraft = {
  merchant_login: string
  hash_algorithm: RobokassaHashAlgorithm
  is_test: boolean
  is_enabled: boolean
  password1: string
  password2: string
  test_password1: string
  test_password2: string
}

export const EMPTY_DRAFT: RobokassaDraft = {
  merchant_login: "",
  hash_algorithm: "sha256",
  is_test: true,
  is_enabled: true,
  password1: "",
  password2: "",
  test_password1: "",
  test_password2: "",
}

export const HASH_ALGORITHMS: RobokassaHashAlgorithm[] = ["sha256", "md5", "sha384", "sha512"]

/**
 * An unreadable row (46df D1) keeps its mode and switch, which live in plain
 * columns; the login and the passwords are inside the payload nobody can read,
 * so the owner types them again.
 */
const draftFrom = (
  record: PaymentSettingsRecord | null,
  unreadable: UnreadableSecret | null = null
): RobokassaDraft =>
  record
    ? {
        ...EMPTY_DRAFT,
        merchant_login: record.merchant_login,
        hash_algorithm: record.hash_algorithm,
        is_test: record.is_test,
        is_enabled: record.is_enabled,
      }
    : unreadable
      ? { ...EMPTY_DRAFT, is_test: unreadable.is_test, is_enabled: unreadable.is_enabled }
      : EMPTY_DRAFT

export const useRobokassaForm = () => {
  const { t } = useTranslation()
  const {
    settings,
    unreadable,
    result_url: resultUrl,
    methods,
    isPending,
    isError,
    error,
  } = usePaymentSettings()

  // `null` = the saved record has not answered yet; a boolean once it has.
  const [loaded, setLoaded] = useState<boolean | null>(null)
  const [draft, setDraft] = useState<RobokassaDraft>(EMPTY_DRAFT)
  const touchedRef = useRef(false)

  useEffect(() => {
    if (isPending) {
      return
    }
    setLoaded(true)
    if (!touchedRef.current) {
      setDraft(draftFrom(settings ?? null, unreadable ?? null))
    }
  }, [isPending, settings, unreadable])

  const { mutateAsync: save, isPending: isSaving } = useUpdatePaymentSettings()
  const { mutateAsync: remove, isPending: isRemoving } = useDeletePaymentSettings()

  const update = <K extends keyof RobokassaDraft>(key: K, value: RobokassaDraft[K]) => {
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
          setDraft(draftFrom(response.settings, response.unreadable))
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

  return {
    settings: settings ?? null,
    unreadable: unreadable ?? null,
    resultUrl,
    methods: methods ?? null,
    loaded,
    draft,
    update,
    busy,
    isSaving,
    isRemoving,
    isError,
    error,
    handleSubmit,
    handleRemove,
  }
}

export type RobokassaForm = ReturnType<typeof useRobokassaForm>
