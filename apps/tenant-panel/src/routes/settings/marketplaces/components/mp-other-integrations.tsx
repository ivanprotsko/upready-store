import { Badge, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { usePaymentSettings } from "../../../../hooks/api/payment-settings"

/**
 * «Другие интеграции» — every service of this shop that is NOT a marketplace,
 * with its state and the screen that connects it
 * (w24-integration-keys-self-service).
 *
 * Ivan's order of 2026-09-16 11:37 WITA names the whole class: «пользователи
 * должны иметь возможность указать свои ключи для всех сервисов. Wildberries,
 * Ozon, Robokassa, ApiShip и тд». The marketplaces above come from the
 * registry; these do not have one yet, so the list is written out here — and
 * it is written out ONCE, on the hub, rather than being a thing the owner has
 * to know exists.
 *
 * An integration whose screen is not merged yet is listed as «скоро» with no
 * link. A link to a route that 404s would be worse than the honest label: the
 * owner would decide the panel is broken (rule 17a).
 */

type Entry = {
  id: string
  title: string
  subtitle: string
  to: string | null
  state: "connected" | "missing" | "soon"
}

const StateBadge = ({ state }: { state: Entry["state"] }) => {
  const { t } = useTranslation()
  if (state === "soon") {
    return (
      <Badge size="2xsmall" color="grey">
        {t("marketplaces.other.soon")}
      </Badge>
    )
  }
  return (
    <Badge size="2xsmall" color={state === "connected" ? "green" : "orange"}>
      {state === "connected" ? t("marketplaces.other.connected") : t("marketplaces.other.missing")}
    </Badge>
  )
}

export const MpOtherIntegrations = () => {
  const { t } = useTranslation()
  // One cheap GET. The masked account says whether Robokassa is connected; the
  // key values are never in that response (t03).
  const { settings, isPending } = usePaymentSettings()

  const entries: Entry[] = [
    {
      id: "robokassa",
      title: t("marketplaces.other.robokassa.title"),
      subtitle: t("marketplaces.other.robokassa.subtitle"),
      to: "/settings/payments",
      // While the account has not answered, «не настроена» would be a `false`
      // standing for «не спрошено» (rule 19h). «Скоро» is not that state
      // either, so the row waits with the neutral badge the loading state has.
      state: isPending ? "soon" : settings ? "connected" : "missing",
    },
    {
      id: "delivery",
      title: t("marketplaces.other.delivery.title"),
      subtitle: t("marketplaces.other.delivery.subtitle"),
      to: null,
      state: "soon",
    },
  ]

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("marketplaces.other.title")}</Heading>
        <Text className="text-ui-fg-subtle" size="small">
          {t("marketplaces.other.subtitle")}
        </Text>
      </div>
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex flex-wrap items-center justify-between gap-2 px-6 py-4"
          data-testid={`mp-other-${entry.id}`}
        >
          <div className="flex flex-col">
            <Text weight="plus">{entry.title}</Text>
            <Text className="text-ui-fg-subtle" size="small">
              {entry.subtitle}
            </Text>
          </div>
          <div className="flex items-center gap-x-3">
            <StateBadge state={entry.state} />
            {entry.to ? (
              <Link
                className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus"
                to={entry.to}
              >
                {t("marketplaces.other.open")}
              </Link>
            ) : null}
          </div>
        </div>
      ))}
    </Container>
  )
}
