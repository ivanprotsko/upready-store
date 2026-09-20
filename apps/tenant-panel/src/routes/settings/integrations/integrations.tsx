import { Badge, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { SingleColumnPage } from "../../../components/layout/pages"
import { useApishipKey } from "../../../hooks/api/apiship"
import { useDeliverySettings } from "../../../hooks/api/delivery-settings"
import { useMarketplaceStatus, useMarketplaces } from "../../../hooks/api/marketplaces"
import { usePaymentSettings } from "../../../hooks/api/payment-settings"
import { MARKETPLACE_ID_BY_SLUG, slugForMarketplaceId } from "./marketplace-slug"

/**
 * «Подключение» — every service this shop holds credentials for, one row each
 * (p01-settings-integrations-restructure).
 *
 * Ivan, 2026-09-16 20:22 WITA: «давай перенесем все подключения на страницу
 * /settings/integrations/[robokassa, wildberries, ozon, api, ship, cdek]». This
 * is the hub of that address: state and a link, nothing else. Every field lives
 * one click away, on the service's own page, and the marketplace SCREENS (what
 * the key may do, what has been imported, what is in sync) live under
 * `/settings/marketplaces/<слаг>` — the section this hub replaced.
 *
 * WHAT A ROW SAYS. Three states, never two (rule 19h): «не спрошено» while a
 * query is in flight, «не подключено» once it has answered, «подключено
 * ••••last4» when a credential is stored. The marketplaces add the key's own
 * account of itself — rights and expiry — which costs one call to the
 * marketplace per stored key and is therefore asked only for a key that exists.
 */

type RowTone = "connected" | "missing" | "pending"

type Row = {
  id: string
  title: string
  subtitle: string
  to: string
  tone: RowTone
  /** «подключено ••••1234» — the four characters the owner can recognise. */
  last4: string | null
  /** One extra line under the badge: rights, expiry, a rejected token. */
  note: string | null
  noteIsError?: boolean
}

const StateBadge = ({ tone, last4 }: { tone: RowTone; last4: string | null }) => {
  const { t } = useTranslation()
  if (tone === "pending") {
    return (
      <Badge size="2xsmall" color="grey">
        {t("integrations.state.asking")}
      </Badge>
    )
  }
  return (
    <Badge size="2xsmall" color={tone === "connected" ? "green" : "orange"}>
      {tone === "connected"
        ? t("integrations.state.connected", { last4: last4 ?? "" })
        : t("integrations.state.missing")}
    </Badge>
  )
}

/**
 * The rights-and-expiry line of ONE marketplace. Its own component because the
 * status query is per marketplace, and a hook cannot be called in a loop.
 */
const MarketplaceRow = ({
  marketplaceId,
  label,
  keySet,
  last4,
}: {
  marketplaceId: string
  label: string
  keySet: boolean
  last4: string | null
}) => {
  const { t } = useTranslation()
  const slug = slugForMarketplaceId(marketplaceId)
  const { card, isPending } = useMarketplaceStatus(marketplaceId, { enabled: keySet })
  const credentials = card?.credentials ?? null

  const note = (() => {
    if (!keySet) {
      return null
    }
    if (isPending || !credentials) {
      return t("marketplaces.readOnly.asking")
    }
    if (credentials.error) {
      return credentials.error
    }
    const rights =
      credentials.read_only === true
        ? t("integrations.rights.readOnly")
        : credentials.read_only === false
          ? t("integrations.rights.write")
          : t("integrations.rights.unknown")
    if (!credentials.expires_at) {
      return rights
    }
    return t("integrations.rights.withExpiry", {
      rights,
      days: credentials.expires_in_days ?? 0,
    })
  })()

  return (
    <IntegrationRow
      row={{
        id: marketplaceId,
        title: label,
        subtitle: t("integrations.marketplace.rowSubtitle"),
        to: slug ? `/settings/integrations/${slug}` : "/settings/integrations",
        tone: keySet ? "connected" : "missing",
        last4,
        note,
        noteIsError: Boolean(credentials?.error) || credentials?.expired === true,
      }}
    />
  )
}

const IntegrationRow = ({ row }: { row: Row }) => {
  const { t } = useTranslation()
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 px-6 py-4"
      data-testid={`integration-${row.id}`}
    >
      <div className="flex min-w-0 flex-col">
        <Text weight="plus">{row.title}</Text>
        <Text className="text-ui-fg-subtle" size="small">
          {row.subtitle}
        </Text>
        {row.note ? (
          <Text
            className={row.noteIsError ? "text-ui-fg-error" : "text-ui-fg-subtle"}
            size="small"
          >
            {row.note}
          </Text>
        ) : null}
      </div>
      <div className="flex items-center gap-x-3">
        <StateBadge tone={row.tone} last4={row.last4} />
        <Link
          className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus"
          to={row.to}
          data-testid={`integration-open-${row.id}`}
        >
          {t("integrations.open")}
        </Link>
      </div>
    </div>
  )
}

export const IntegrationsHub = () => {
  const { t } = useTranslation()

  const { marketplaces, isPending: mpPending, isError, error } = useMarketplaces()
  const { settings: payment, isPending: paymentPending } = usePaymentSettings()
  const { settings: delivery, isPending: deliveryPending } = useDeliverySettings()
  const { apiship, isPending: apishipPending } = useApishipKey()

  if (isError) {
    throw error
  }

  // Only the marketplaces this panel has a readable URL for get a row; the rest
  // would link nowhere. The ORDER is the order Ivan wrote the services in.
  const knownIds = Object.values(MARKETPLACE_ID_BY_SLUG) as string[]
  const mpRows = (marketplaces ?? []).filter((card) => knownIds.includes(card.id))

  const cdekStored = Boolean(delivery?.test_password?.set || delivery?.password?.set)
  const cdekLast4 = delivery?.is_test
    ? (delivery?.test_password?.last4 ?? null)
    : (delivery?.password?.last4 ?? null)

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="p-0">
        <div className="px-6 py-4">
          <Heading>{t("integrations.title")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("integrations.subtitle")}
          </Text>
        </div>
      </Container>

      <Container className="divide-y p-0">
        {mpPending ? (
          <div className="px-6 py-6">
            <Text className="text-ui-fg-subtle" size="small">
              {t("marketplaces.loading")}
            </Text>
          </div>
        ) : (
          mpRows.map((card) => (
            <MarketplaceRow
              key={card.id}
              marketplaceId={card.id}
              label={card.label}
              keySet={card.connection.key.set}
              last4={card.connection.key.last4}
            />
          ))
        )}

        <IntegrationRow
          row={{
            id: "robokassa",
            title: t("integrations.robokassa.title"),
            subtitle: t("integrations.robokassa.rowSubtitle"),
            to: "/settings/integrations/robokassa",
            tone: paymentPending ? "pending" : payment ? "connected" : "missing",
            last4: payment?.password1?.last4 ?? payment?.test_password1?.last4 ?? null,
            note: null,
          }}
        />

        <IntegrationRow
          row={{
            id: "apiship",
            title: t("integrations.apiship.title"),
            subtitle: t("integrations.apiship.rowSubtitle"),
            to: "/settings/integrations/apiship",
            tone: apishipPending
              ? "pending"
              : apiship?.settings?.token.set
                ? "connected"
                : "missing",
            last4: apiship?.settings?.token.last4 ?? null,
            note: t("integrations.apiship.rowNote"),
          }}
        />

        <IntegrationRow
          row={{
            id: "cdek",
            title: t("integrations.cdek.title"),
            subtitle: t("integrations.cdek.rowSubtitle"),
            to: "/settings/integrations/cdek",
            tone: deliveryPending ? "pending" : cdekStored ? "connected" : "missing",
            last4: cdekLast4,
            note: null,
          }}
        />
      </Container>
    </SingleColumnPage>
  )
}
