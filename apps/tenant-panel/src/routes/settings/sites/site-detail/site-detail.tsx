import { ArrowRight } from "@medusajs/icons"
import { FetchError } from "@medusajs/js-sdk"
import { Badge, Container, Heading, StatusBadge, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import { SectionRow } from "../../../../components/common/section"
import { SingleColumnPageSkeleton } from "../../../../components/common/skeleton"
import { SingleColumnPage } from "../../../../components/layout/pages"
import {
  SettingsDetailSection,
  type SettingsRow,
  type SettingsSection,
} from "../../../../components/settings"
import { useHreflangSisters } from "../../../../hooks/api/hreflang-sisters"
import { useSwitchShop } from "../../../../hooks/api/shops"
import { TenantSite, useSites } from "../../../../hooks/api/sites"
import { LOCALE_LABELS, type LocaleCode } from "../../../../lib/locale-catalog"
import { domainToUnicode } from "../../../../lib/idn"
import { CrossLink } from "../../integrations/components/cross-link"
import { useCertificateStatus } from "../certificate-status"

// t-2026-10-14-01 (panel redesign, G2): the card of one site, after
// design-system E2. It only reads, in three sections: «Общее», «Домены» with
// each host's certificate and a link to «Адрес магазина» (the one screen that
// manages them, so no operation lives on two screens), and, on the card of
// THIS site, «Сайты-сёстры на других серверах» (t-cherk-31), edited in the
// drawer on `sisters/edit`. `GET /tenants/sites` has every site of the group,
// so the card needs no request of its own.

const GeneralSection = ({ site }: { site: TenantSite }) => {
  const { t } = useTranslation()
  const { mutate: switchShop } = useSwitchShop({
    onSuccess: () => window.location.assign("/settings/sites"),
    onError: (error) => toast.error(error.message),
  })

  const section: SettingsSection = {
    id: "general",
    title: site.name,
    status: site.is_current ? { color: "blue", label: t("sites.current") } : undefined,
    // Nothing of a site is edited here: the platform has no rename. Another
    // site's card carries the row's own «Перейти на сайт».
    actions: site.is_current
      ? []
      : [
          {
            actions: [
              {
                icon: <ArrowRight />,
                label: t("sites.open"),
                onClick: () => switchShop({ tenant_id: site.id }),
              },
            ],
          },
        ],
    rows: [
      { id: "name", label: t("sites.detail.name"), value: site.name },
      { id: "primary-host", label: t("sites.detail.primaryHost"), value: site.primary_host, mono: true },
      {
        id: "platform-host",
        label: t("sites.detail.platformHost"),
        value: site.technical_hosts[0],
        mono: true,
        status: { color: "green", label: t("sites.certificate.platform") },
      },
      { id: "shared", label: t("sites.detail.shared"), value: t("sites.detail.sharedValue") },
    ],
  }

  return <SettingsDetailSection section={section} level="h1" />
}

const DomainsSection = ({ site }: { site: TenantSite }) => {
  const { t } = useTranslation()
  const certificateStatus = useCertificateStatus()

  return (
    <Container className="divide-y p-0" data-testid="settings-section-domains">
      <div className="flex flex-col px-6 py-4">
        <Heading level="h2">{t("sites.detail.domainsTitle")}</Heading>
        <Text size="small" className="text-ui-fg-subtle text-pretty">
          {site.is_current
            ? t("sites.detail.domainsDescription")
            : t("sites.detail.domainsOtherDescription")}
        </Text>
      </div>
      {site.domains.length ? (
        site.domains.map((domain) => {
          const status = certificateStatus(domain.certificate)
          return (
            <SectionRow
              key={domain.host}
              title={domainToUnicode(domain.host)}
              value={
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge color={status.color}>{status.label}</StatusBadge>
                  {domain.is_primary ? <Badge size="2xsmall">{t("sites.primary")}</Badge> : null}
                </div>
              }
            />
          )
        })
      ) : (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            {t("sites.detail.noDomains")}
          </Text>
        </div>
      )}
      {site.is_current ? (
        <div className="px-6 py-4">
          <CrossLink
            to="/settings/domains"
            hint={t("sites.detail.domainsCrossLinkHint")}
            label={t("tenantAddress.title")}
            testId="site-domains-crosslink"
          />
        </div>
      ) : null}
    </Container>
  )
}

const SistersSection = () => {
  const { t } = useTranslation()
  const { sisters, isPending, isError, error } = useHreflangSisters()

  if (isError) {
    throw error
  }

  const sisterRows = (): SettingsRow[] => {
    if (isPending) {
      return []
    }
    // No sister is the usual case, a shop on one server; the row says so.
    if (!sisters?.length) {
      return [{ id: "sisters", label: t("sites.sisters.rowLabel"), hint: t("sites.sisters.empty") }]
    }
    return sisters.map((sister) => ({
      id: `sister-${sister.domain}`,
      label: sister.domain,
      value: LOCALE_LABELS[sister.locale as LocaleCode] ?? sister.locale,
    }))
  }
  const rows = sisterRows()

  return (
    <SettingsDetailSection
      section={{
        id: "sisters",
        title: t("sites.sisters.title"),
        description: t("sites.sisters.description"),
        editTo: "sisters/edit",
        rows,
      }}
    />
  )
}

export const SiteDetail = () => {
  const { id } = useParams()
  const { sites, isPending, isError, error } = useSites()

  if (isError) {
    throw error
  }

  if (isPending || !sites) {
    return <SingleColumnPageSkeleton sections={3} />
  }

  const site = sites.find((candidate) => candidate.id === id)

  if (!site) {
    // An id that is not a site of this owner's group is the router's «not
    // found», the same answer a wrong product id gets.
    throw new FetchError(id ?? "", "Not Found", 404)
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet>
      <GeneralSection site={site} />
      <DomainsSection site={site} />
      {site.is_current ? <SistersSection /> : null}
    </SingleColumnPage>
  )
}
