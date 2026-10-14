import type { TFunction } from "i18next"

import type { SettingsStatus } from "../../../../components/settings"
import type {
  ApishipCarrier,
  ApishipKind,
  ApishipProbeResponse,
  ApishipResponse,
} from "../../../../hooks/api/apiship"
import { getLocaleAmount } from "../../../../lib/money-amount-helpers"

// t-2026-10-14-58, part B: what the ApiShip read page and its drawers share —
// the sender's fields in the order of the contract, the drawer routes, the
// header state and the probe's verdict.

export const SENDER_FIELDS = [
  "sender_name",
  "sender_company",
  "sender_phone",
  "sender_email",
  "sender_city",
  "sender_region",
  "sender_address",
  "sender_index",
  "sender_mode",
  "sender_point_id",
] as const

export type SenderField = (typeof SENDER_FIELDS)[number]

/** The drawers of the page, each on `edit/<section>`. */
export const APISHIP_EDIT_SECTIONS = ["connection", "sender", "parcel", "methods", "markup"] as const
export type ApishipEditSection = (typeof APISHIP_EDIT_SECTIONS)[number]

export const formatRub = (amount: number) => getLocaleAmount(amount, "rub")

/**
 * The header state (contract section 1): no row → «не подключено»; a row
 * that does not decrypt → enter again; switched off → «выключено»; else
 * connected, by its last four characters.
 */
export const connectionStatus = (t: TFunction, apiship: ApishipResponse): SettingsStatus => {
  if (apiship.unreadable) {
    return { color: "red", label: t("integrations.state.unreadable") }
  }
  if (!apiship.settings) {
    return { color: "orange", label: t("integrations.state.missing") }
  }
  if (!apiship.settings.is_enabled) {
    return { color: "grey", label: t("integrations.apiship.stateOff") }
  }
  return {
    color: "green",
    label: t("integrations.state.connected", { last4: apiship.settings.token.last4 ?? "" }),
  }
}

/**
 * The three answers of the probe (rule 20a): not entered, not answered yet,
 * and ApiShip's verdict — refused (401/403), silent (no status), or accepted.
 */
export const probeVerdict = (
  t: TFunction,
  {
    stored,
    isProbing,
    probe,
  }: { stored: boolean; isProbing: boolean; probe: ApishipProbeResponse | undefined }
): SettingsStatus | null => {
  if (!stored) {
    return null
  }
  if (isProbing || !probe?.probe) {
    return { color: "grey", label: t("integrations.apiship.probeAsking") }
  }
  const { ok, status, error, connections } = probe.probe
  if (ok) {
    return {
      color: "green",
      label:
        connections === null
          ? t("integrations.apiship.probeOk")
          : t("integrations.apiship.probeOkWithCount", { count: connections }),
    }
  }
  if (status === 401 || status === 403) {
    return { color: "red", label: t("integrations.apiship.probeRejected") }
  }
  if (status === null) {
    return {
      color: "red",
      label: error
        ? t("integrations.apiship.probeSilentWith", { error })
        : t("integrations.apiship.probeSilent"),
    }
  }
  return { color: "red", label: error ?? t("integrations.apiship.probeFailed") }
}

/**
 * A kind of a carrier has two answers (contract update of 14.10, Fable
 * 4853f805): `carriers[].kinds` is what the owner CHOSE, `methods[].enabled`
 * is what the checkout SHOWS. They part ways while ApiShip cannot quote yet.
 */
export const kindState = (carrier: ApishipCarrier, kind: ApishipKind) => ({
  chosen: carrier.kinds.includes(kind),
  live: carrier.methods.some((method) => method.kind === kind && method.enabled),
})

/** True when a chosen method is not at the checkout yet. */
export const hasPendingMethods = (carriers: ApishipCarrier[]) =>
  carriers.some((carrier) =>
    (["courier", "pickup"] as const).some((kind) => {
      const state = kindState(carrier, kind)
      return state.chosen && !state.live
    })
  )

/** Why the chosen methods wait: no token, ApiShip switched off, or no sender to quote from. */
export const pendingReason = (t: TFunction, apiship: ApishipResponse) =>
  !apiship.settings
    ? t("integrations.apiship.pendingNoToken")
    : !apiship.settings.is_enabled
      ? t("integrations.apiship.pendingOff")
      : t("integrations.apiship.pendingSender")

/** A whole number from a form field; empty or not a number reads `null`. */
export const toNumber = (text: string): number | null => {
  const trimmed = text.trim().replace(",", ".")
  if (!trimmed) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}
