import { Alert, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useMarketplaceStatus, type MarketplaceCard } from "../../../../hooks/api/marketplaces"
import { WbWriteSection } from "../../wildberries/components/wb-write-section"
import { MpDeniedTable } from "./mp-denied-table"
import { MpEndpointTable } from "./mp-endpoint-table"
import { MpFieldRow } from "./mp-field-row"
import { MpKeyForm } from "./mp-key-form"
import { MpReadOnlyBadge } from "./mp-read-only-badge"
import { MpScopeList } from "./mp-scope-list"
import { MpSyncTable } from "./mp-sync-table"

const NOT_SET = "—"

const formatDateTime = (value: string | null, locale: string): string => {
  if (!value) {
    return NOT_SET
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? NOT_SET : date.toLocaleString(locale)
}

/**
 * One marketplace, one card (w12-marketplace-core, spec 2.7).
 *
 * Everything on it comes from the adapter through the API: the connection, the
 * key's own account of itself, the registry of allowed reads, the list of
 * documented writes it is checked against, the last run per kind and the
 * normalized row counts. Nothing here knows the word "Wildberries" except the
 * one place that has to — the owner's write consent screen of w20, which is
 * Wildberries' alone until Ozon gets one.
 *
 * The credentials arrive in a SECOND request, because asking an Ozon key what
 * it may do is a real call to Ozon. While it is in flight the card says
 * «спрашиваем ключ…» and not «неизвестно» (rule 19h: an unanswered question is
 * a third state, not a negative answer).
 */
export const MpCard = ({ card }: { card: MarketplaceCard }) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || "ru"

  const { card: detail, isPending, isError } = useMarketplaceStatus(card.id)
  const credentials = detail?.credentials ?? null
  const linking = detail?.linking ?? card.linking

  /**
   * A key that was never stored is not a key that failed to answer
   * (w14-mp-catalog-link, Ivan 2026-09-16 09:11). With no key the panel showed
   * «не удалось определить» in «Права ключа», which reads as a BROKEN key: the
   * owner sees a red-flavoured verdict about a credential she has not created
   * yet. It is a value substituted for an absence (rule 20a).
   *
   * So the row has three cases, not two: no key -> «—» and the one line saying
   * how a key gets stored for this shop; key stored and unreadable -> «не
   * удалось определить», which is now a real claim; key stored and readable ->
   * the verdict.
   */
  const hasKey = card.connection.key.set

  const readOnly = credentials
    ? credentials.read_only
    : isPending
      ? ("pending" as const)
      : ("unknown" as const)

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{card.label}</Heading>
        <Text className="text-ui-fg-subtle" size="small">
          {t("marketplaces.card.subtitle")}
        </Text>
      </div>

      {credentials?.expiring_soon ? (
        <div className="px-6 pt-4">
          <Alert variant="warning">
            {t("marketplaces.expiringSoon", {
              label: card.label,
              days: credentials.expires_in_days,
            })}
          </Alert>
        </div>
      ) : null}

      {isError ? (
        <div className="px-6 pt-4">
          <Alert variant="error">{t("marketplaces.card.statusFailed")}</Alert>
        </div>
      ) : null}

      {/*
        The owner's own connect form (w24-integration-keys-self-service). It
        stands FIRST because it is the action of this card: before it the card
        could only report a key somebody else had stored, and the «Ключ» row it
        replaces said the same thing without letting her change it.

        `detail ?? card`: the list route does not ask the key what it may do,
        so only the detail carries `credentials`, and the form needs it to say
        «ключ с правами записи». While the detail is in flight the list card
        renders the same fields — an unanswered question is a third state, not
        a reason to hide the input (rule 19h).
      */}
      <MpKeyForm card={detail ?? card} />

      <div className="px-6 py-4">
        <MpFieldRow label={t("marketplaces.enabled.label")}>
          {card.connection.is_enabled
            ? t("marketplaces.enabled.yes")
            : t("marketplaces.enabled.no")}
        </MpFieldRow>
        <MpFieldRow label={t("marketplaces.readOnly.label")}>
          {hasKey ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <MpReadOnlyBadge value={readOnly} />
              {credentials?.read_only_source ? (
                <Text className="text-ui-fg-subtle" size="small">
                  {credentials.read_only_source}
                </Text>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-y-1">
              <Text size="small">{NOT_SET}</Text>
              <Text className="text-ui-fg-subtle" size="small">
                {card.connection.key.how_to_store}
              </Text>
            </div>
          )}
        </MpFieldRow>
        <MpFieldRow label={t("marketplaces.expiresAt")}>
          <span className={credentials?.expired ? "text-ui-fg-error" : undefined}>
            {credentials
              ? formatDateTime(credentials.expires_at, locale)
              : isPending
                ? t("marketplaces.readOnly.asking")
                : NOT_SET}
            {credentials?.expired ? ` ${t("marketplaces.expired")}` : ""}
          </span>
        </MpFieldRow>
        <MpFieldRow label={t("marketplaces.access")}>
          {credentials ? (
            <MpScopeList scopes={credentials.scopes} />
          ) : (
            <Text className="text-ui-fg-subtle" size="small">
              {isPending ? t("marketplaces.readOnly.asking") : t("marketplaces.scopes.none")}
            </Text>
          )}
        </MpFieldRow>
        {credentials?.error ? (
          <MpFieldRow label={t("marketplaces.problem")}>
            <span className="text-ui-fg-error">{credentials.error}</span>
          </MpFieldRow>
        ) : null}
      </div>

      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div>
          <Text weight="plus">{t("marketplaces.linking.title")}</Text>
          <Text className="text-ui-fg-subtle" size="small">
            {t("marketplaces.linking.hint")}
          </Text>
        </div>
        <Text
          className={linking.total > 0 && linking.linked === 0 ? "text-ui-fg-error" : undefined}
          size="small"
        >
          {linking.summary}
        </Text>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {(
            [
              ["total", linking.total],
              ["linked", linking.linked],
              ["notFound", linking.not_found],
              ["needsChoice", linking.needs_choice],
              ["stored", linking.stored],
            ] as const
          ).map(([name, count]) => (
            <div key={name} className="flex flex-col">
              <Text className="text-ui-fg-subtle" size="small">
                {t(`marketplaces.linking.${name}`)}
              </Text>
              <Text className="tabular-nums" weight="plus">
                {count}
              </Text>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div>
          <Text weight="plus">{t("marketplaces.sync.title")}</Text>
          <Text className="text-ui-fg-subtle" size="small">
            {t("marketplaces.sync.hint")}
          </Text>
        </div>
        <MpSyncTable sync={card.sync} />
      </div>

      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div>
          <Text weight="plus">{t("marketplaces.normalized.title")}</Text>
          <Text className="text-ui-fg-subtle" size="small">
            {t("marketplaces.normalized.hint")}
          </Text>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {Object.entries(card.normalized).map(([name, count]) => (
            <div key={name} className="flex flex-col">
              <Text className="text-ui-fg-subtle" size="small">
                {t(`marketplaces.normalizedKinds.${name}`, { defaultValue: name })}
              </Text>
              <Text className="tabular-nums" weight="plus">
                {count}
              </Text>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div>
          <Text weight="plus">{t("marketplaces.endpoints.title")}</Text>
          <Text className="text-ui-fg-subtle" size="small">
            {t("marketplaces.endpoints.hint")}
          </Text>
        </div>
        <MpEndpointTable endpoints={card.endpoints} />
        <MpDeniedTable denied={card.denied} />
      </div>

      {card.id === "wb" ? <WbWriteSection /> : null}
    </Container>
  )
}
