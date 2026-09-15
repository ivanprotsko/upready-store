import { Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../components/layout/pages"
import { useWbStatus } from "../../../hooks/api/wb-status"
import { WbEndpointTable } from "./components/wb-endpoint-table"
import { WbFieldRow } from "./components/wb-field-row"
import { WbReadOnlyBadge } from "./components/wb-read-only-badge"
import { WbSyncTable } from "./components/wb-sync-table"

// w01-wb-readonly-client: the shop's Wildberries connection, read-only.
//
// There is no import button here on purpose. The import is a script
// (`pnpm --filter backend wb:sync`), and this client cannot write to
// Wildberries at all: the transport only sends the reads listed in
// apps/backend/src/modules/wb/endpoints.ts. What the owner needs from this
// screen is whether the key works, whether it is marked read-only, when data
// last came in and how much of it there is.
//
// Design system: @medusajs/ui, like every other screen of this panel, which is
// a copy of Medusa Admin 2.19. The divergence from the Geist canon is recorded
// in artifacts/docs/w01-wb-readonly-client/report.md rather than left silent.

const NOT_SET = "—"

const formatDateTime = (value: string | null, locale: string): string => {
  if (!value) {
    return NOT_SET
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? NOT_SET : date.toLocaleString(locale)
}

export const WildberriesSettings = () => {
  const { t, i18n } = useTranslation()
  const { status, isPending, isError, error } = useWbStatus()

  if (isError) {
    throw error
  }

  const locale = i18n.language || "ru"

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading>{t("wildberries.title")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("wildberries.subtitle")}
          </Text>
        </div>

        {isPending || !status ? (
          <div className="px-6 py-6">
            <Text className="text-ui-fg-subtle" size="small">
              {t("wildberries.loading")}
            </Text>
          </div>
        ) : (
          <>
            <div className="px-6 py-4">
              <WbFieldRow label={t("wildberries.key.label")}>
                {status.connection.key.set
                  ? t("wildberries.key.set", { last4: status.connection.key.last4 })
                  : t("wildberries.key.missing")}
              </WbFieldRow>
              <WbFieldRow label={t("wildberries.readOnly.label")}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <WbReadOnlyBadge value={status.token.read_only} />
                  <a
                    className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                    href={status.token.doc_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {t("wildberries.readOnly.docs")}
                  </a>
                </div>
              </WbFieldRow>
              <WbFieldRow label={t("wildberries.expiresAt")}>
                <span className={status.token.expired ? "text-ui-fg-error" : undefined}>
                  {formatDateTime(status.token.expires_at, locale)}
                  {status.token.expired ? ` ${t("wildberries.expired")}` : ""}
                </span>
              </WbFieldRow>
              <WbFieldRow label={t("wildberries.sellerId")}>
                <span className="tabular-nums">{status.token.seller_id ?? NOT_SET}</span>
              </WbFieldRow>
              <WbFieldRow label={t("wildberries.access")}>
                {status.token.bits.filter((bit) => bit.meaning).length
                  ? status.token.bits
                      .filter((bit) => bit.meaning)
                      .map((bit) => bit.meaning)
                      .join(", ")
                  : NOT_SET}
              </WbFieldRow>
              {status.token.error ? (
                <WbFieldRow label={t("wildberries.problem")}>
                  <span className="text-ui-fg-error">{status.token.error}</span>
                </WbFieldRow>
              ) : null}
            </div>

            <div className="flex flex-col gap-y-3 px-6 py-4">
              <div>
                <Text weight="plus">{t("wildberries.sync.title")}</Text>
                <Text className="text-ui-fg-subtle" size="small">
                  {t("wildberries.sync.hint")}
                </Text>
              </div>
              <WbSyncTable sync={status.sync} />
            </div>

            <div className="flex flex-col gap-y-3 px-6 py-4">
              <div>
                <Text weight="plus">{t("wildberries.mirrors.title")}</Text>
                <Text className="text-ui-fg-subtle" size="small">
                  {t("wildberries.mirrors.hint")}
                </Text>
              </div>
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                {Object.entries(status.mirrors).map(([name, count]) => (
                  <div key={name} className="flex flex-col">
                    <Text className="text-ui-fg-subtle" size="small">
                      {t(`wildberries.mirrors.${name}`, { defaultValue: name })}
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
                <Text weight="plus">{t("wildberries.endpoints.title")}</Text>
                <Text className="text-ui-fg-subtle" size="small">
                  {t("wildberries.endpoints.hint")}
                </Text>
              </div>
              <WbEndpointTable endpoints={status.endpoints} />
            </div>
          </>
        )}
      </Container>
    </SingleColumnPage>
  )
}
