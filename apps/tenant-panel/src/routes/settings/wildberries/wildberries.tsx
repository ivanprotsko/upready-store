import { Alert, Button, Container, Heading, Text } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../components/layout/pages"
import { useWbStatus } from "../../../hooks/api/wb-status"
import { useWbTables } from "../../../hooks/api/wb-tables"
import { WbCategoryList } from "./components/wb-category-list"
import { WbEndpointTable } from "./components/wb-endpoint-table"
import { WbFbsSection } from "./components/wb-fbs-section"
import { WbFieldRow } from "./components/wb-field-row"
import { WbFunnelTable } from "./components/wb-funnel-table"
import { WbQuestionsTable } from "./components/wb-questions-table"
import { WbReadOnlyBadge } from "./components/wb-read-only-badge"
import { WbSalesTable } from "./components/wb-sales-table"
import { WbSyncTable } from "./components/wb-sync-table"
import { WbWriteSection } from "./components/wb-write-section"

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

/**
 * The two halves of this screen (w23-wb-write-fbs-orders added the second).
 *
 * Tabs and not two routes: the connection, its key and the audit journal are
 * the context in which the desk's «ничего не отправлено» is checkable, and a
 * separate URL would put the claim and its evidence on different pages.
 */
const TABS = ["connection", "fbs"] as const

type Tab = (typeof TABS)[number]

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
  const { wb, isPending, isError, error } = useWbStatus()
  const [tab, setTab] = useState<Tab>("connection")
  // The tables load on their own: they aggregate mirrors of tens of thousands
  // of rows, and the connection card must not wait for them (w03).
  const { tables, isPending: tablesPending, isError: tablesFailed } = useWbTables()

  if (isError) {
    throw error
  }

  const locale = i18n.language || "ru"

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-y-3 px-6 py-4">
          <div>
            <Heading>{t("wildberries.title")}</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              {t("wildberries.subtitle")}
            </Text>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((name) => (
              <Button
                key={name}
                size="small"
                variant={tab === name ? "primary" : "secondary"}
                onClick={() => setTab(name)}
              >
                {t(`wildberries.tabs.${name}`)}
              </Button>
            ))}
          </div>
        </div>

        {isPending || !wb ? (
          <div className="px-6 py-6">
            <Text className="text-ui-fg-subtle" size="small">
              {t("wildberries.loading")}
            </Text>
          </div>
        ) : tab === "fbs" ? (
          <WbFbsSection />
        ) : (
          <>
            {wb.token.expiring_soon ? (
              <div className="px-6 pt-4">
                <Alert variant="warning">
                  {t("wildberries.expiringSoon", { days: wb.token.expires_in_days })}
                </Alert>
              </div>
            ) : null}

            <div className="px-6 py-4">
              <WbFieldRow label={t("wildberries.key.label")}>
                {wb.connection.key.set
                  ? t("wildberries.key.set", { last4: wb.connection.key.last4 })
                  : t("wildberries.key.missing")}
              </WbFieldRow>
              <WbFieldRow label={t("wildberries.readOnly.label")}>
                {/*
                  A key that was never stored has not been asked anything, so
                  there is no verdict to show (w14-mp-catalog-link). The live
                  surface of this row is the Wildberries CARD in «Маркетплейсы»
                  — this page redirects there since w12 — and the same defect
                  is fixed there; it is fixed here too so reviving the page
                  cannot revive the bug (rule 20).
                */}
                {wb.connection.key.set ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <WbReadOnlyBadge value={wb.token.read_only} />
                    <a
                      className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                      href={wb.token.read_only_source}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {t("wildberries.readOnly.docs")}
                    </a>
                  </div>
                ) : (
                  <div className="flex flex-col gap-y-1">
                    <span>{NOT_SET}</span>
                    <Text className="text-ui-fg-subtle" size="small">
                      Ключ не сохранён — как его сохранить, сказано в разделе «Маркетплейсы».
                    </Text>
                  </div>
                )}
              </WbFieldRow>
              <WbFieldRow label={t("wildberries.expiresAt")}>
                <span className={wb.token.expired ? "text-ui-fg-error" : undefined}>
                  {formatDateTime(wb.token.expires_at, locale)}
                  {wb.token.expired ? ` ${t("wildberries.expired")}` : ""}
                </span>
              </WbFieldRow>
              <WbFieldRow label={t("wildberries.sellerId")}>
                <span className="tabular-nums">{wb.token.seller_id ?? NOT_SET}</span>
              </WbFieldRow>
              <WbFieldRow label={t("wildberries.access")}>
                <WbCategoryList categories={wb.token.categories} bits={wb.token.bits} />
              </WbFieldRow>
              {wb.token.error ? (
                <WbFieldRow label={t("wildberries.problem")}>
                  <span className="text-ui-fg-error">{wb.token.error}</span>
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
              <WbSyncTable sync={wb.sync} />
            </div>

            <div className="flex flex-col gap-y-3 px-6 py-4">
              <div>
                <Text weight="plus">{t("wildberries.mirrors.title")}</Text>
                <Text className="text-ui-fg-subtle" size="small">
                  {t("wildberries.mirrors.hint")}
                </Text>
              </div>
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                {Object.entries(wb.mirrors).map(([name, count]) => (
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
                <Text weight="plus">{t("wildberries.sales.title")}</Text>
                <Text className="text-ui-fg-subtle" size="small">
                  {t("wildberries.sales.hint", { days: tables?.sales.window_days ?? 30 })}
                </Text>
              </div>
              {tables ? (
                <WbSalesTable sales={tables.sales} />
              ) : (
                <Text className="text-ui-fg-subtle" size="small">
                  {tablesFailed
                    ? t("wildberries.tablesFailed")
                    : tablesPending
                      ? t("wildberries.loading")
                      : t("wildberries.tablesFailed")}
                </Text>
              )}
            </div>

            <div className="flex flex-col gap-y-3 px-6 py-4">
              <div>
                <Text weight="plus">{t("wildberries.questions.title")}</Text>
                <Text className="text-ui-fg-subtle" size="small">
                  {t("wildberries.questions.hint")}
                </Text>
              </div>
              {tables ? (
                <WbQuestionsTable questions={tables.questions} />
              ) : (
                <Text className="text-ui-fg-subtle" size="small">
                  {tablesFailed
                    ? t("wildberries.tablesFailed")
                    : tablesPending
                      ? t("wildberries.loading")
                      : t("wildberries.tablesFailed")}
                </Text>
              )}
            </div>

            <div className="flex flex-col gap-y-3 px-6 py-4">
              <div>
                <Text weight="plus">{t("wildberries.funnel.title")}</Text>
                <Text className="text-ui-fg-subtle" size="small">
                  {t("wildberries.funnel.hint")}
                </Text>
              </div>
              {tables ? (
                <WbFunnelTable
                  analytics={tables.analytics}
                  listingsTotal={wb.mirrors.products ?? null}
                />
              ) : (
                <Text className="text-ui-fg-subtle" size="small">
                  {tablesFailed
                    ? t("wildberries.tablesFailed")
                    : tablesPending
                      ? t("wildberries.loading")
                      : t("wildberries.tablesFailed")}
                </Text>
              )}
            </div>

            <div className="flex flex-col gap-y-3 px-6 py-4">
              <div>
                <Text weight="plus">{t("wildberries.endpoints.title")}</Text>
                <Text className="text-ui-fg-subtle" size="small">
                  {t("wildberries.endpoints.hint")}
                </Text>
              </div>
              <WbEndpointTable endpoints={wb.endpoints} />
            </div>

            <WbWriteSection />
          </>
        )}
      </Container>
    </SingleColumnPage>
  )
}
