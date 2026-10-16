import { Alert, Badge, Button, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { MARKETPLACE_LABEL, slugOf } from "../../../hooks/api/marketplace-section"
import { useMarketplaceStatus, useMarketplaces } from "../../../hooks/api/marketplaces"
import { MpKeyForm } from "../../settings/marketplaces/components/mp-key-form"
import { MpReadOnlyBadge } from "../../settings/marketplaces/components/mp-read-only-badge"
import { MpPage } from "../common/mp-page"
import { useRouteMarketplace } from "../common/use-route-marketplace"

/** The screens of the marketplace that show its data, in the sidebar's order. */
const SCREENS = [
  { path: "products", labelKey: "app.nav.owner.mp.products" },
  { path: "price-stock", labelKey: "app.nav.owner.mp.priceStock" },
  { path: "orders", labelKey: "app.nav.owner.mp.orders" },
  { path: "sync", labelKey: "app.nav.owner.mp.sync" },
] as const

/**
 * «Ozon → Подключение» (t-2026-10-16-37): the first screen of the marketplace,
 * in place of the stub of 2026-10-05. It answers one question first, whether
 * the shop is connected, and puts the key fields right under the answer, so
 * the owner never has to look for where the Client-Id goes.
 *
 *   no key stored -> «Не подключено», what to enter and where to find it
 *   key stored    -> «Подключено», the key's own answer about its rights,
 *                    and the screens that show the data
 *
 * The form is `MpKeyForm`, the one «Настройки → Подключение» uses, so the key
 * is saved the same way: the shop's integration secret, encrypted, the secret
 * part never sent back. Nothing here talks to Ozon except the status query,
 * which asks the key what it may do through a registered read.
 */
export const MpConnection = () => {
  const { t } = useTranslation()
  const marketplace = useRouteMarketplace()
  const label = MARKETPLACE_LABEL[marketplace]
  const slug = slugOf(marketplace)

  const { marketplaces, isPending, isError, error } = useMarketplaces()
  const { card: detail } = useMarketplaceStatus(marketplace)

  if (isError) {
    throw error
  }

  const card = detail ?? marketplaces?.find((entry) => entry.id === marketplace) ?? null
  const connected = Boolean(card?.connection.key.set)
  // Until the status query lands, the rights are a question in flight, not «unknown».
  const readOnly = detail?.credentials?.read_only ?? "pending"

  return (
    <MpPage title={label} subtitle={t("mp.connection.subtitle", { marketplace: label })}>
      <div className="flex flex-col gap-y-3 px-6 py-4" data-testid={`mp-connection-${connected ? "on" : "off"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge size="2xsmall" color={connected ? "green" : "grey"}>
            {connected ? t("mp.connection.on") : t("mp.connection.off")}
          </Badge>
          {connected ? <MpReadOnlyBadge value={readOnly} /> : null}
        </div>
        <Text size="small" leading="compact" weight="plus">
          {connected
            ? t("mp.connection.onTitle", { marketplace: label })
            : t("mp.connection.offTitle", { marketplace: label })}
        </Text>
        <Text size="small" className="text-ui-fg-subtle max-w-[640px]">
          {connected
            ? t("mp.connection.onMessage")
            : t(`mp.connection.offMessage.${marketplace}`, {
                defaultValue: t("mp.connection.offMessageAny", { marketplace: label }),
              })}
        </Text>
        {connected ? (
          <div className="flex flex-wrap gap-2">
            {SCREENS.map((screen) => (
              <Button key={screen.path} size="small" variant="secondary" className="max-md:min-h-11" asChild>
                <Link to={`/marketplaces/${slug}/${screen.path}`}>{t(screen.labelKey)}</Link>
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      {card ? (
        <MpKeyForm card={card} />
      ) : isPending ? (
        <div className="px-6 py-6">
          <Text className="text-ui-fg-subtle" size="small">
            {t("marketplaces.loading")}
          </Text>
        </div>
      ) : (
        <div className="px-6 py-6">
          {/* The registry answered without this marketplace: a backend error, not an empty screen. */}
          <Alert variant="error">{t("integrations.marketplace.unknown", { slug })}</Alert>
        </div>
      )}
    </MpPage>
  )
}
