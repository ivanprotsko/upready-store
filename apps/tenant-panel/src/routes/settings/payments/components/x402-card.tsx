import { Badge } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Navigate } from "react-router-dom"

import { SettingsDetail, type SettingsSection } from "../../../../components/settings"
import { useTenantX402 } from "../../../../hooks/api/x402"
import { WAY_STATE_COLOR, wayStateKey, x402State } from "../payment-ways"
import { AddressValue } from "./address-value"

/**
 * «x402 (USDC)» (t-2026-10-03-33): the shop's own receiving address for USDC.
 * Buyers and AI agents pay from their own wallet and the money goes straight
 * to this address. Nothing here is secret, so nothing is masked.
 *
 * t-2026-10-14-01 (panel redesign, G3, prototype state `payments-x402`): the
 * card reads state (an address that only takes test networks says
 * «тестовая сеть», orange) → requisites, with the address for AI agents to
 * copy. Edited in the drawer `edit`. No «Уведомление перед оплатой»: the
 * platform keeps no notice for x402 and the checkout shows none, so the
 * section would store a text no buyer ever reads (decide.mjs, G3 us-7).
 *
 * The card exists only where the backend answers `available: true`; on an
 * instance that takes no cryptocurrency its address leads back to the list.
 */
export const X402Card = () => {
  const { t } = useTranslation()
  const { x402, isPending, isError, error } = useTenantX402()

  if (isError) {
    throw error
  }

  if (x402 && x402.available !== true) {
    return <Navigate to="/settings/payments" replace />
  }

  const settings = x402?.settings ?? null
  const state = x402State(settings, x402?.unreadable)
  const chosen = new Set(settings?.networks ?? [])

  const stateSection: SettingsSection = {
    id: "x402",
    title: t("paymentMethods.ways.x402.title"),
    description: t("paymentMethods.ways.x402.description"),
    status: { color: WAY_STATE_COLOR[state], label: t(wayStateKey(state)) },
    editTo: "edit",
    rows: [
      {
        id: "is_enabled",
        label: t("x402.fields.is_enabled"),
        value: settings?.is_enabled
          ? settings.is_test
            ? t("paymentMethods.x402.onTestnet")
            : t("paymentMethods.yes")
          : t("paymentMethods.no"),
        hint: x402?.unreadable
          ? t("paymentMethods.unreadableHint")
          : !settings
            ? t("paymentMethods.fillRequisites")
            : settings.is_test
              ? t("paymentMethods.x402.testnetHint")
              : undefined,
      },
    ],
  }

  const requisitesSection: SettingsSection = {
    id: "requisites",
    title: t("paymentMethods.requisites"),
    description: t("paymentMethods.x402.requisitesDescription"),
    editTo: "edit",
    rows: [
      {
        id: "pay_to",
        label: t("x402.fields.pay_to"),
        value: settings?.pay_to,
        mono: true,
        hint: t("paymentMethods.x402.payToHint"),
      },
      {
        id: "networks",
        label: t("x402.fields.networks"),
        value: x402?.networks_offered.length ? (
          <div className="flex flex-wrap gap-1.5" data-testid="x402-networks">
            {x402.networks_offered.map((network) => {
              const name = network.testnet
                ? t("paymentMethods.x402.testnetName", { name: network.label })
                : network.label
              return chosen.has(network.id) ? (
                <Badge key={network.id} size="2xsmall" color="green">
                  {name}
                </Badge>
              ) : (
                <Badge key={network.id} size="2xsmall" color="grey">
                  {t("paymentMethods.x402.networkOff", { name })}
                </Badge>
              )
            })}
          </div>
        ) : null,
      },
      {
        id: "facilitator_url",
        label: t("x402.fields.facilitator_url"),
        value: settings?.facilitator_url,
        mono: true,
        hint: t("x402.facilitatorHint"),
      },
      {
        id: "agent_purchase_url",
        label: t("x402.agentTitle"),
        value: x402?.agent_purchase_url ? (
          <AddressValue value={x402.agent_purchase_url} testId="x402-agent-purchase-url" />
        ) : null,
        hint: t("x402.agentHint"),
      },
    ],
  }

  return <SettingsDetail isPending={isPending} sections={[stateSection, requisitesSection]} />
}
