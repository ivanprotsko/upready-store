import { EllipsisHorizontal, PencilSquare, StarSolid, Trash } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  IconButton,
  StatusBadge,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { ActionMenu, type ActionGroup } from "../../../components/common/action-menu"
import { NoRecords } from "../../../components/common/empty-table-content"
import { Skeleton, SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { SingleColumnPage } from "../../../components/layout/pages"
import { SettingsDetailSection, type SettingsRow } from "../../../components/settings"
import { _DataTable } from "../../../components/table/data-table"
import {
  TenantDomain,
  useDeleteDomain,
  useDomains,
  useSetPrimaryDomain,
} from "../../../hooks/api/domains"
import { SiteCertificate, useSites } from "../../../hooks/api/sites"
import { useDataTable } from "../../../hooks/use-data-table"
import { domainToUnicode, isAceHostname } from "../../../lib/idn"
import { useCertificateStatus } from "../sites/certificate-status"

// The shop's address (t-2026-09-12-tenant-address-canonical). It replaces the
// "Domains" screen of tenant-panel wave 2, piece 9, which could only add a custom
// host and said nothing about the address the shop actually lives on.
//
// What it shows, and why, is `artifacts/docs/2026-09-12-storefront-wave2-mockup.md`
// §2; the policy behind it is `specs/tenant-address/CANONICAL.md`. Three kinds of
// address, and the screen names the difference in words rather than in an enum:
//
//   - the MAIN address: what search is pointed at, and what every other address
//     of the shop redirects to. Changeable, with a warning first;
//   - PREVIOUS addresses: they keep answering, redirect page for page, and stay
//     reserved for this shop for good;
//   - the TECHNICAL id address: never changes, never indexed, always redirects.
//
// t-2026-10-14-01 (panel redesign, G2): one card of two sections, after
// design-system E2 and E13. «Адрес магазина» reads the three addresses and
// changes the main one in the drawer on `change` (its «…»). «Свои домены» is a
// table of the custom hosts with each one's certificate; adding one is the
// drawer on `add`, with the registrar steps inside it, and «Сделать основным»
// and «Удалить» (after a confirmation naming the host) are the row's «…».

type DomainRow = TenantDomain & { certificate?: SiteCertificate }

const DomainState = ({ domain, checking }: { domain: DomainRow; checking: boolean }) => {
  const { t } = useTranslation()
  const certificateStatus = useCertificateStatus()

  if (domain.is_primary) {
    return <StatusBadge color="green">{t("tenantAddress.inSearch")}</StatusBadge>
  }

  if (domain.certificate) {
    const status = certificateStatus(domain.certificate)
    return <StatusBadge color={status.color}>{status.label}</StatusBadge>
  }

  // The certificate is a live probe of each host (`GET /tenants/sites`) and
  // lands after the list itself.
  return checking ? <Skeleton className="h-5 w-32" /> : null
}

const DomainRowActions = ({ domain }: { domain: DomainRow }) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const { mutate: setPrimary } = useSetPrimaryDomain()
  const { mutate: deleteDomain } = useDeleteDomain()
  const host = domainToUnicode(domain.host)

  const makePrimary = () =>
    setPrimary(domain.id, {
      onSuccess: () => toast.success(t("tenantAddress.madePrimary", { host })),
      // The backend first checks that the host answers as this shop.
      onError: (error) => toast.error(error.message),
    })

  const remove = async () => {
    const confirmed = await prompt({
      title: t("general.areYouSure"),
      description: t("tenantAddress.removeWarning", { host }),
      confirmText: t("actions.delete"),
      cancelText: t("actions.cancel"),
    })

    if (!confirmed) {
      return
    }

    deleteDomain(domain.id, {
      onSuccess: () => toast.success(t("tenantAddress.domainRemoved", { host })),
      onError: (error) => toast.error(error.message),
    })
  }

  const groups: ActionGroup[] = [
    {
      actions: domain.is_primary
        ? []
        : [{ icon: <StarSolid />, label: t("tenantAddress.makePrimary"), onClick: makePrimary }],
    },
    { actions: [{ icon: <Trash />, label: t("actions.delete"), onClick: remove }] },
  ]

  return (
    <ActionMenu groups={groups.filter((group) => group.actions.length)}>
      <IconButton size="small" variant="transparent" aria-label={t("fields.actions")}>
        <EllipsisHorizontal />
      </IconButton>
    </ActionMenu>
  )
}

const columnHelper = createColumnHelper<DomainRow>()

const useColumns = (checking: boolean) => {
  const { t } = useTranslation()

  return useMemo(
    () => [
      columnHelper.accessor("host", {
        header: t("tenantAddress.columns.domain"),
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col py-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Text size="small" leading="compact" family="mono" className="break-all">
                {domainToUnicode(row.original.host)}
              </Text>
              {row.original.is_primary ? (
                <Badge size="2xsmall">{t("tenantAddress.primaryBadge")}</Badge>
              ) : null}
            </div>
            {isAceHostname(row.original.host) ? (
              <Text size="xsmall" leading="compact" family="mono" className="text-ui-fg-subtle break-all">
                {row.original.host}
              </Text>
            ) : null}
          </div>
        ),
      }),
      columnHelper.display({
        id: "state",
        header: t("tenantAddress.columns.state"),
        cell: ({ row }) => <DomainState domain={row.original} checking={checking} />,
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => <DomainRowActions domain={row.original} />,
      }),
    ],
    [t, checking]
  )
}

const CustomDomainsSection = ({ domains }: { domains: TenantDomain[] }) => {
  const { t } = useTranslation()
  // The certificates come with the current site of `GET /tenants/sites`
  // (the fork of this build: no second probe in `/tenants/domains`).
  const { sites, isPending: checking } = useSites()
  const certificates = new Map(
    (sites?.find((site) => site.is_current)?.domains ?? []).map((domain) => [
      domain.host,
      domain.certificate,
    ])
  )
  const rows: DomainRow[] = domains.map((domain) => ({
    ...domain,
    certificate: certificates.get(domain.host),
  }))

  const columns = useColumns(checking)
  const { table } = useDataTable({
    data: rows,
    columns,
    count: rows.length,
    enablePagination: false,
    getRowId: (row) => row.id,
  })

  return (
    <Container className="divide-y p-0" data-testid="settings-section-custom-domains">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4">
        <div className="min-w-0">
          <Heading level="h2">{t("tenantAddress.customTitle")}</Heading>
          <Text size="small" className="text-ui-fg-subtle text-pretty">
            {t("tenantAddress.customDescription")}
          </Text>
        </div>
        {rows.length ? (
          <Link to="add">
            <Button size="small" variant="secondary">
              {t("tenantAddress.addDomainTitle")}
            </Button>
          </Link>
        ) : null}
      </div>

      {rows.length ? (
        <_DataTable
          table={table}
          columns={columns}
          count={rows.length}
          pageSize={rows.length}
          pagination={false}
        />
      ) : (
        <NoRecords
          title={t("tenantAddress.noCustomDomainsTitle")}
          message={t("tenantAddress.noCustomDomains")}
          action={{ to: "add", label: t("tenantAddress.addDomainTitle") }}
        />
      )}
    </Container>
  )
}

export const Domains = () => {
  const { t } = useTranslation()
  const {
    domains,
    primary_host: primaryHost,
    previous_hosts: previousHosts,
    technical_id_host: technicalIdHost,
    isPending,
    isError,
    error,
  } = useDomains()

  if (isError) {
    throw error
  }

  if (isPending) {
    return <SingleColumnPageSkeleton sections={2} />
  }

  const previous = previousHosts ?? []
  const redirects = { color: "grey" as const, label: t("tenantAddress.redirectsBadge") }

  const rows: SettingsRow[] = [
    {
      id: "primary",
      label: t("tenantAddress.primaryLabel"),
      value: primaryHost,
      mono: true,
      status: { color: "green", label: t("tenantAddress.inSearch") },
    },
    // A shop that never changed its address has no previous one, and no row.
    ...(previous.length
      ? [
          {
            id: "previous",
            label: t("tenantAddress.previousLabel", { count: previous.length }),
            value:
              previous.length === 1 ? (
                previous[0]
              ) : (
                <div className="flex flex-col gap-y-1">
                  {previous.map((host) => (
                    <Text key={host} size="small" leading="compact" family="mono" className="break-all">
                      {host}
                    </Text>
                  ))}
                </div>
              ),
            mono: true,
            status: redirects,
            hint: t("tenantAddress.previousHint"),
          },
        ]
      : []),
    {
      id: "technical",
      label: t("tenantAddress.technicalLabel"),
      value: technicalIdHost,
      mono: true,
      status: redirects,
      hint: t("tenantAddress.technicalHint"),
    },
  ]

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet>
      <SettingsDetailSection
        level="h1"
        section={{
          id: "address",
          title: t("tenantAddress.title"),
          description: t("tenantAddress.subtitle"),
          actions: [
            {
              actions: [
                {
                  icon: <PencilSquare />,
                  label: t("tenantAddress.changeAction"),
                  to: "change",
                },
              ],
            },
          ],
          rows,
        }}
      />
      <CustomDomainsSection domains={domains ?? []} />
    </SingleColumnPage>
  )
}
