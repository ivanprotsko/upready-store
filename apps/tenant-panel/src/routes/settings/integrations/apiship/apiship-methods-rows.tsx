import { StatusBadge, Text } from "@medusajs/ui"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

import type { SettingsRow } from "../../../../components/settings"
import {
  type ApishipCalculator,
  type ApishipKind,
  type ApishipProbeResponse,
  type ApishipResponse,
  useApishipTariffs,
} from "../../../../hooks/api/apiship"
import { formatRub, kindState, pendingReason } from "./apiship-model"

// t-2026-10-14-58, part B: the rows of «Способы на сайте» — one per carrier,
// its checkout methods on or off, its tariff, and whether the carrier is
// connected in the owner's ApiShip cabinet at all; then the tariff check the
// owner asked for with «Проверить тарифы».

const KINDS: ApishipKind[] = ["courier", "pickup"]

/** Where a carrier is connected: ApiShip's own cabinet, never this panel. */
export const CabinetHint = () => {
  const { t } = useTranslation()
  return (
    <Text size="xsmall" leading="compact" className="text-ui-fg-subtle" as="span">
      {t("integrations.apiship.cabinetHint")}{" "}
      <a
        href="https://a.apiship.ru"
        target="_blank"
        rel="noopener noreferrer"
        className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover transition-fg"
      >
        a.apiship.ru
      </a>
    </Text>
  )
}

/**
 * A pinned tariff by its name, as the methods drawer lists it («Посылка онлайн
 * (№ 47)»). `GET /tenants/apiship` keeps only the number: the name comes from
 * the carrier's tariff list the drawer loads (the same query, so one request
 * for both). Until it lands, or when the list has no such tariff, the number.
 */
const PinnedTariff = ({ providerKey, id, enabled }: { providerKey: string; id: number; enabled: boolean }) => {
  const { t } = useTranslation()
  const { tariffs } = useApishipTariffs(providerKey, { enabled })
  const name = tariffs?.find((tariff) => tariff.id === id)?.name
  return (
    <span data-testid={`apiship-tariff-${providerKey}`}>
      {name ? t("integrations.apiship.tariffOption", { name, id }) : t("integrations.apiship.tariffNumber", { id })}
    </span>
  )
}

const cheapestText = (
  t: TFunction,
  kind: "door" | "point",
  entry: ApishipCalculator["results"][number]["door"]
) =>
  entry.cheapest
    ? t(`integrations.apiship.quote.${kind}`, {
        cost: formatRub(entry.cheapest.cost),
        days:
          entry.cheapest.days_min === entry.cheapest.days_max
            ? String(entry.cheapest.days_min)
            : `${entry.cheapest.days_min}–${entry.cheapest.days_max}`,
      })
    : t(`integrations.apiship.quote.${kind}None`)

const quoteRow = (t: TFunction, calculator: ApishipCalculator): SettingsRow => ({
  id: "quote",
  label: t("integrations.apiship.quote.label", {
    from: calculator.route.from,
    to: calculator.route.to,
    weight: calculator.route.weight_g / 1000,
  }),
  status: calculator.error
    ? { color: "red", label: t("integrations.apiship.quote.failed", { error: calculator.error }) }
    : undefined,
  value: calculator.error ? undefined : (
    <div className="flex flex-col gap-y-1" data-testid="apiship-quote">
      {calculator.results.map((result) => (
        <Text key={result.provider_key} size="small" leading="compact">
          {result.label}: {cheapestText(t, "door", result.door)} · {cheapestText(t, "point", result.point)}
        </Text>
      ))}
    </div>
  ),
})

export const methodsRows = ({
  t,
  apiship,
  probe,
  quote,
}: {
  t: TFunction
  apiship: ApishipResponse
  probe: ApishipProbeResponse | undefined
  quote: ApishipProbeResponse | undefined
}): SettingsRow[] => {
  const connected = probe?.probe?.ok ? new Set(probe.providers_connected ?? []) : null

  const carrierRows: SettingsRow[] = apiship.carriers.map((carrier) => {
    const kinds = KINDS.filter(
      (kind) => carrier.kinds.includes(kind) || carrier.methods.some((method) => method.kind === kind)
    )
    const notConnected = connected !== null && !connected.has(carrier.provider_key)
    // Chosen but not at the checkout yet: ticked, with the reason, never «на сайте».
    const pending = kinds.some((kind) => kindState(carrier, kind).chosen && !kindState(carrier, kind).live)
    const tariff = carrier.tariff_id ? (
      <PinnedTariff providerKey={carrier.provider_key} id={carrier.tariff_id} enabled={Boolean(apiship.settings)} />
    ) : (
      t("integrations.apiship.tariffCheapest")
    )

    return {
      id: `carrier-${carrier.provider_key}`,
      label: carrier.label,
      value: (
        <div className="flex flex-wrap gap-2" data-testid={`apiship-carrier-${carrier.provider_key}`}>
          {kinds.map((kind) => {
            const { chosen, live } = kindState(carrier, kind)
            return (
              <StatusBadge key={kind} color={live ? "green" : chosen ? "blue" : "grey"}>
                {t(`integrations.apiship.kind.${kind}`)}:{" "}
                {live
                  ? t("integrations.apiship.methodOn")
                  : chosen
                    ? t("integrations.apiship.methodChosen")
                    : t("integrations.apiship.methodOff")}
              </StatusBadge>
            )
          })}
        </div>
      ),
      status: notConnected
        ? { color: "orange", label: t("integrations.apiship.carrierNotConnected") }
        : undefined,
      hint: notConnected ? (
        <CabinetHint />
      ) : pending ? (
        <span data-testid={`apiship-pending-${carrier.provider_key}`}>
          {pendingReason(t, apiship)} {t("integrations.apiship.tariffLabel")}: {tariff}
        </span>
      ) : (
        <>
          {t("integrations.apiship.tariffLabel")}: {tariff}
        </>
      ),
    }
  })

  const rows: SettingsRow[] = carrierRows.length
    ? carrierRows
    : [
        {
          id: "carriers-empty",
          label: t("integrations.apiship.sections.methods"),
          hint: t("integrations.apiship.methodsEmpty"),
        },
      ]

  if (quote?.calculator) {
    rows.push(quoteRow(t, quote.calculator))
  } else if (quote && quote.probe && !quote.probe.ok) {
    rows.push({
      id: "quote",
      label: t("integrations.apiship.checkTariffs"),
      status: { color: "red", label: quote.probe.error ?? t("integrations.apiship.probeFailed") },
    })
  }

  return rows
}
