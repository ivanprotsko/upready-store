import { ArrowRight, EllipsisHorizontal } from "@medusajs/icons"
import { Button, Container, Heading, IconButton, StatusBadge, Text, toast } from "@medusajs/ui"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { ActionMenu } from "../../../components/common/action-menu"
import { SingleColumnPage } from "../../../components/layout/pages"
import { _DataTable } from "../../../components/table/data-table"
import { useSwitchShop } from "../../../hooks/api/shops"
import { TenantSite, useSites } from "../../../hooks/api/sites"
import { useDataTable } from "../../../hooks/use-data-table"
import { primaryCertificate, useCertificateStatus } from "./certificate-status"

// «Настройки → Сайты» (t-2026-09-24-n12,
// docs/multitenancy/sites-one-db-many-storefronts.md §3.4): the owner's sites.
// The word «группа» never reaches the screen; a shop with one site sees a list
// of one, which is why the list has no empty state.
//
// t-2026-10-14-01 (panel redesign, G2): a list after design-system E1. The
// row opens the site's card (`:id`), «Создать сайт» is the one header button
// and opens `create` over the list, and «…» holds the one thing a row does,
// «Перейти на сайт» for a site other than this one. The sister sites moved to
// the card of this site.

const columnHelper = createColumnHelper<TenantSite>()

const SiteRowActions = ({ site }: { site: TenantSite }) => {
  const { t } = useTranslation()
  const { mutate: switchShop } = useSwitchShop({
    onSuccess: () => window.location.assign("/settings/sites"),
    onError: (error) => toast.error(error.message),
  })

  if (site.is_current) {
    return null
  }

  return (
    <ActionMenu
      groups={[
        {
          actions: [
            {
              icon: <ArrowRight />,
              label: t("sites.open"),
              onClick: () => switchShop({ tenant_id: site.id }),
            },
          ],
        },
      ]}
    >
      <IconButton size="small" variant="transparent" aria-label={t("fields.actions")}>
        <EllipsisHorizontal />
      </IconButton>
    </ActionMenu>
  )
}

const SiteCertificateBadge = ({ site }: { site: TenantSite }) => {
  const { t } = useTranslation()
  const certificateStatus = useCertificateStatus()
  const certificate = primaryCertificate(site)
  const status = certificate
    ? certificateStatus(certificate, { short: true })
    : { color: "green" as const, label: t("sites.certificate.platform") }

  return <StatusBadge color={status.color}>{status.label}</StatusBadge>
}

const useColumns = () => {
  const { t } = useTranslation()

  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: t("sites.columns.name"),
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-x-2">
            <Text size="small" leading="compact" weight="plus" className="truncate">
              {row.original.name}
            </Text>
            {row.original.is_current ? (
              <StatusBadge color="blue">{t("sites.current")}</StatusBadge>
            ) : null}
          </div>
        ),
      }),
      columnHelper.accessor("primary_host", {
        header: t("sites.columns.primaryHost"),
        cell: ({ getValue }) => (
          <Text size="small" leading="compact" family="mono" className="break-all">
            {getValue()}
          </Text>
        ),
      }),
      columnHelper.display({
        id: "domains",
        header: t("sites.columns.domains"),
        cell: ({ row }) => (
          <Text size="small" leading="compact">
            {row.original.domains.length}
          </Text>
        ),
      }),
      columnHelper.display({
        id: "certificate",
        header: t("sites.columns.certificate"),
        cell: ({ row }) => <SiteCertificateBadge site={row.original} />,
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => <SiteRowActions site={row.original} />,
      }),
    ],
    [t]
  )
}

export const Sites = () => {
  const { t } = useTranslation()
  const { sites, isPending, isError, error } = useSites()
  const columns = useColumns()

  const { table } = useDataTable({
    data: sites ?? [],
    columns,
    count: sites?.length ?? 0,
    enablePagination: false,
    getRowId: (row) => row.id,
  })

  if (isError) {
    throw error
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4">
          <div className="min-w-0">
            <Heading level="h1">{t("sites.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle text-pretty">
              {t("sites.description")}
            </Text>
          </div>
          <Link to="create">
            <Button size="small" variant="secondary">
              {t("sites.create.title")}
            </Button>
          </Link>
        </div>

        <_DataTable
          table={table}
          columns={columns}
          count={sites?.length ?? 0}
          pageSize={Math.max(2, sites?.length ?? 0)}
          pagination={false}
          navigateTo={(row) => row.id}
          isLoading={isPending}
        />
      </Container>
    </SingleColumnPage>
  )
}
