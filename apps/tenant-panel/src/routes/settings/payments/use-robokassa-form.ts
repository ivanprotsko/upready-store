import { useEffect, useRef, useState } from "react"
import { toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import {
  type PaymentSettings as PaymentSettingsRecord,
  type RobokassaHashAlgorithm,
  type RobokassaSno,
  type RobokassaTax,
  type UnreadableSecret,
  useDeletePaymentSettings,
  usePaymentSettings,
  useUpdatePaymentSettings,
} from "../../../hooks/api/payment-settings"
import { modeNeedsPasswordsKey } from "./mode-needs-passwords-key"

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
  /** t-cherk-30: the 54-FZ receipt (`Receipt`), per shop. */
  fiscalization_enabled: boolean
  sno: RobokassaSno
  default_tax: RobokassaTax
  /** t-2026-10-12-13 (Ivan 12.10, 4.1: «нужно выключить оплату СБП»): the methods switched off. */
  disabled_methods: string[]
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
  fiscalization_enabled: false,
  sno: "osn",
  default_tax: "none",
  disabled_methods: [],
}

const TEST_PAIR: SecretField[] = ["test_password1", "test_password2"]
const LIVE_PAIR: SecretField[] = ["password1", "password2"]

/**
 * The passwords a mode still lacks: neither typed into the draft nor stored
 * on a readable record. The same rule `PUT /tenants/payment-settings` applies
 * before it enables a mode, checked here first so the owner reads it in her
 * language instead of the API's (46df U-01).
 */
export const missingPasswordsFor = (
  isTest: boolean,
  draft: RobokassaDraft,
  record: PaymentSettingsRecord | null
): SecretField[] =>
  (isTest ? TEST_PAIR : LIVE_PAIR).filter(
    (field) => !draft[field].trim() && !record?.[field]?.set
  )

const SERVER_MODE_ERROR = /^(Test|Live) mode needs (.+) before it can be enabled\.$/

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
        fiscalization_enabled: record.fiscalization_enabled,
        sno: record.sno,
        default_tax: record.default_tax,
        disabled_methods: record.disabled_methods ?? [],
      }
    : unreadable
      ? { ...EMPTY_DRAFT, is_test: unreadable.is_test, is_enabled: unreadable.is_enabled }
      : EMPTY_DRAFT

/**
 * `credentialsOnPage`: the screen renders the password fields itself (the
 * Robokassa integration page), so a refusal points the owner at the form in
 * front of them; «Приём оплат» has no password fields and sends them to the
 * Robokassa page instead.
 */
export const useRobokassaForm = ({ credentialsOnPage = false }: { credentialsOnPage?: boolean } = {}) => {
  const { t } = useTranslation()
  const {
    settings,
    unreadable,
    result_url: resultUrl,
    methods,
    robokassa_methods: robokassaMethods,
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

  const prompt = usePrompt()

  const modeError = (isTest: boolean, fields: SecretField[]) =>
    t(modeNeedsPasswordsKey(isTest, credentialsOnPage), {
      fields: fields.map((field) => t(`paymentSettings.fields.${field}`)).join(", "),
    })

  // The API answers in English; the one refusal an owner meets in normal use
  // is said in the panel's language, anything else is passed through as is.
  const saveErrorText = (message: string) => {
    const match = SERVER_MODE_ERROR.exec(message)
    if (!match) {
      return message
    }
    const fields = match[2]
      .split(" and ")
      .filter((field): field is SecretField => (SECRET_FIELDS as string[]).includes(field))
    return modeError(match[1] === "Test", fields)
  }

  const submit = async (isTest: boolean) => {
    if (!draft.merchant_login.trim()) {
      toast.error(t("paymentSettings.merchantLoginRequired"))
      return
    }
    const missing = missingPasswordsFor(isTest, draft, settings ?? null)
    if (draft.is_enabled && missing.length) {
      toast.error(modeError(isTest, missing))
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
        is_test: isTest,
        is_enabled: draft.is_enabled,
        fiscalization_enabled: draft.fiscalization_enabled,
        sno: draft.sno,
        default_tax: draft.default_tax,
        disabled_methods: draft.disabled_methods,
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
        onError: (saveError) => toast.error(saveErrorText(saveError.message)),
      }
    )
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    await submit(draft.is_test)
  }

  /**
   * 46df U-01: a live shop whose live passwords are gone (an unreadable row,
   * or never entered) could only be deleted. This is the way out that keeps
   * the account: save the test pair and switch the shop to test mode, on the
   * owner's own click, never silently.
   */
  const liveNeedsPasswords =
    loaded === true &&
    !draft.is_test &&
    draft.is_enabled &&
    missingPasswordsFor(false, draft, settings ?? null).length > 0

  const handleSubmitInTestMode = async () => {
    await submit(true)
  }

  // 46df U-05: removing the account is not undoable (the passwords are never
  // shown again), so it asks first.
  const handleRemove = async () => {
    const confirmed = await prompt({
      title: t("paymentSettings.removeConfirm.title"),
      description: t("paymentSettings.removeConfirm.description"),
      confirmText: t("paymentSettings.removeConfirm.confirm"),
      cancelText: t("paymentSettings.removeConfirm.cancel"),
    })
    if (!confirmed) {
      return
    }
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
    robokassaMethods: robokassaMethods ?? [],
    loaded,
    draft,
    update,
    busy,
    isSaving,
    isRemoving,
    isError,
    error,
    handleSubmit,
    handleSubmitInTestMode,
    liveNeedsPasswords,
    handleRemove,
  }
}

export type RobokassaForm = ReturnType<typeof useRobokassaForm>
