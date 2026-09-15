import { useState } from "react"
import { Trash } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  IconButton,
  Input,
  Text,
  toast,
} from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../components/layout/pages"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import {
  useChangeHandle,
  useCreateDomain,
  useDeleteDomain,
  useDomains,
  useSetPrimaryDomain,
} from "../../../hooks/api/domains"
import { domainToUnicode, isAceHostname } from "../../../lib/idn"

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
// Strings go through the panel's own i18n (`src/i18n/translations/{en,ru}.json`,
// key `tenantAddress`), the way `routes/home` does: the shop owners this panel is
// built for read Russian, and a screen about SEO consequences is the last place to
// make them read English literals.

/** The one DNS instruction a shop owner needs; the proxy side is hosting-spec B4. */
const CNAME_TARGET = __CNAME_TARGET__ || "stores.upready.dev"

export const Domains = () => {
  const { t } = useTranslation()
  const {
    domains,
    technical,
    primary_host: primaryHost,
    previous_hosts: previousHosts,
    technical_id_host: technicalIdHost,
    base_domain: baseDomain,
    isPending,
    isError,
    error,
  } = useDomains()

  const [host, setHost] = useState("")
  const [handle, setHandle] = useState("")
  const [changing, setChanging] = useState(false)

  const { mutateAsync: createDomain, isPending: isCreating } = useCreateDomain()
  const { mutateAsync: deleteDomain, isPending: isDeleting } = useDeleteDomain()
  const { mutateAsync: changeHandle, isPending: isChangingHandle } =
    useChangeHandle()
  const { mutateAsync: setPrimary, isPending: isPromoting } = useSetPrimaryDomain()

  if (isError) {
    throw error
  }

  if (isPending) {
    return <SingleColumnPageSkeleton sections={2} />
  }

  // The handle of the main address, when the main address is still the platform
  // subdomain. A shop on its own domain edits its handle just the same; the field
  // simply is not the address search sees any more.
  const currentHandle = (technical?.[0] ?? "").split(".")[0]

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault()

    const value = host.trim()

    if (!value) {
      return
    }

    await createDomain(
      { host: value },
      {
        // The backend owns every refusal — a host another shop already holds, a
        // reserved shape, a name that is not a host at all — and its message is
        // what the owner reads.
        onSuccess: () => {
          setHost("")
          toast.success(t("tenantAddress.domainAdded", { host: value }))
        },
        onError: (addError) => toast.error(addError.message),
      }
    )
  }

  const handleChangeAddress = async (event: React.FormEvent) => {
    event.preventDefault()

    const value = handle.trim().toLowerCase()

    if (!value || value === currentHandle) {
      return
    }

    await changeHandle(
      { handle: value },
      {
        onSuccess: (result) => {
          setChanging(false)
          setHandle("")
          toast.success(
            t("tenantAddress.changed", { host: result.primary_host })
          )
        },
        onError: (changeError) => toast.error(changeError.message),
      }
    )
  }

  const busy = isCreating || isDeleting || isChangingHandle || isPromoting

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet={false}>
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <Heading level="h2">{t("tenantAddress.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("tenantAddress.subtitle")}
          </Text>
        </div>

        <div className="flex flex-col gap-y-3 px-6 py-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Text size="small" weight="plus" className="font-mono">
              {primaryHost}
            </Text>
            <Badge size="2xsmall">{t("tenantAddress.primaryBadge")}</Badge>
            <Text size="small" className="text-ui-fg-subtle">
              {t("tenantAddress.primaryHint")}
            </Text>
            {!changing && (
              <Button
                size="small"
                variant="secondary"
                className="ml-auto"
                onClick={() => {
                  setHandle(currentHandle)
                  setChanging(true)
                }}
              >
                {t("tenantAddress.changeAction")}
              </Button>
            )}
          </div>

          {previousHosts?.map((previous) => (
            <div key={previous} className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Text size="small" className="font-mono text-ui-fg-subtle">
                {previous}
              </Text>
              <Badge size="2xsmall">{t("tenantAddress.previousBadge")}</Badge>
              <Text size="small" className="text-ui-fg-subtle">
                {t("tenantAddress.previousHint")}
              </Text>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Text size="small" className="font-mono text-ui-fg-subtle">
              {technicalIdHost}
            </Text>
            <Badge size="2xsmall">{t("tenantAddress.technicalBadge")}</Badge>
            <Text size="small" className="text-ui-fg-subtle">
              {t("tenantAddress.technicalHint")}
            </Text>
          </div>
        </div>

        {changing && (
          <form onSubmit={handleChangeAddress} className="flex flex-col gap-y-4 px-6 py-4">
            <div className="flex items-center gap-x-2">
              <Input
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                placeholder={currentHandle}
                autoFocus
                className="font-mono"
              />
              <Text size="small" className="font-mono text-ui-fg-subtle">
                .{baseDomain}
              </Text>
            </div>

            {/* The consequences, before the click and not in a help centre. The
                weeks of re-indexing are the real cost of this operation and the
                one thing an owner cannot discover on their own. */}
            <div className="flex flex-col gap-y-2 rounded-md border border-ui-border-strong bg-ui-bg-subtle p-4">
              <Text size="small" weight="plus">
                {t("tenantAddress.warningTitle")}
              </Text>
              <ul className="flex list-disc flex-col gap-y-1 pl-5">
                <li>
                  <Text size="small">{t("tenantAddress.warningNewWorks")}</Text>
                </li>
                <li>
                  <Text size="small">{t("tenantAddress.warningOldRedirects")}</Text>
                </li>
                <li>
                  <Text size="small">{t("tenantAddress.warningReindex")}</Text>
                </li>
                <li>
                  <Text size="small">{t("tenantAddress.warningReserved")}</Text>
                </li>
                <li>
                  <Text size="small">{t("tenantAddress.warningRepeat")}</Text>
                </li>
              </ul>
            </div>

            <div className="flex items-center gap-x-2">
              <Button
                size="small"
                type="submit"
                isLoading={isChangingHandle}
                disabled={busy || !handle.trim() || handle.trim() === currentHandle}
              >
                {t("tenantAddress.changeAction")}
              </Button>
              <Button
                size="small"
                variant="secondary"
                type="button"
                onClick={() => setChanging(false)}
              >
                {t("tenantAddress.cancel")}
              </Button>
            </div>
          </form>
        )}
      </Container>

      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <Heading level="h2">{t("tenantAddress.customTitle")}</Heading>
          <Text size="small" className="text-ui-fg-subtle font-mono">
            {t("tenantAddress.cname", { target: CNAME_TARGET })}
          </Text>
        </div>

        <div className="flex flex-col gap-y-3 px-6 py-4">
          {domains?.length ? (
            domains.map((domain) => (
              <div key={domain.id} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex flex-col">
                  <Text size="small" className="font-mono">
                    {domainToUnicode(domain.host)}
                  </Text>
                  {isAceHostname(domain.host) ? (
                    <Text size="xsmall" className="text-ui-fg-subtle font-mono">
                      {domain.host}
                    </Text>
                  ) : null}
                </div>
                {domain.is_primary ? (
                  <Badge size="2xsmall">{t("tenantAddress.primaryBadge")}</Badge>
                ) : (
                  <Button
                    size="small"
                    variant="transparent"
                    disabled={busy}
                    isLoading={isPromoting}
                    onClick={() =>
                      setPrimary(domain.id, {
                        onSuccess: () =>
                          toast.success(
                            t("tenantAddress.madePrimary", { host: domain.host })
                          ),
                        onError: (promoteError) => toast.error(promoteError.message),
                      })
                    }
                  >
                    {t("tenantAddress.makePrimary")}
                  </Button>
                )}
                <IconButton
                  size="small"
                  variant="transparent"
                  className="ml-auto"
                  disabled={busy}
                  onClick={() =>
                    deleteDomain(domain.id, {
                      onSuccess: () =>
                        toast.success(
                          t("tenantAddress.domainRemoved", { host: domain.host })
                        ),
                      onError: (removeError) => toast.error(removeError.message),
                    })
                  }
                >
                  <Trash />
                </IconButton>
              </div>
            ))
          ) : (
            <Text size="small" className="text-ui-fg-subtle">
              {t("tenantAddress.noCustomDomains")}
            </Text>
          )}

          <form onSubmit={handleAdd} className="flex items-center gap-x-2">
            <Input
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder="shop.example.com"
              className="font-mono"
            />
            <Button size="small" type="submit" isLoading={isCreating} disabled={busy}>
              {t("tenantAddress.addDomain")}
            </Button>
          </form>

          <Text size="small" className="text-ui-fg-subtle">
            {t("tenantAddress.customHint")}
          </Text>
        </div>
      </Container>
    </SingleColumnPage>
  )
}
