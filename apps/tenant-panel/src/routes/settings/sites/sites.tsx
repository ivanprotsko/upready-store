import { useEffect, useRef, useState } from "react"
import {
  Button,
  Checkbox,
  Container,
  Heading,
  IconButton,
  Input,
  Label,
  Select,
  StatusBadge,
  Text,
  toast,
} from "@medusajs/ui"
import { Trash } from "@medusajs/icons"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../components/layout/pages"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { useSwitchShop } from "../../../hooks/api/shops"
import {
  SiteCertificate,
  TenantSite,
  useCreateSite,
  useSites,
} from "../../../hooks/api/sites"
import {
  HreflangSister,
  useHreflangSisters,
  useUpdateHreflangSisters,
} from "../../../hooks/api/hreflang-sisters"
import { LOCALE_LABELS, LOCALE_CODES } from "../../../lib/locale-catalog"

// «Настройки → Сайты» (t-2026-09-24-n12,
// docs/multitenancy/sites-one-db-many-storefronts.md §3.4): the owner's sites,
// one card each, and «Создать сайт», which copies the site she is in. The
// word «группа» never reaches the screen; a shop with one site sees a list of
// one and the same button.

const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const CertificateState = ({ certificate }: { certificate: SiteCertificate }) => {
  const { t, i18n } = useTranslation()

  if (certificate.status === "valid") {
    const until = certificate.valid_to
      ? new Date(certificate.valid_to).toLocaleDateString(i18n.language)
      : null
    return (
      <StatusBadge color="green">
        {until
          ? t("sites.certificate.validUntil", { date: until })
          : t("sites.certificate.valid")}
      </StatusBadge>
    )
  }

  return (
    <StatusBadge color={certificate.status === "invalid" ? "orange" : "grey"}>
      {t(`sites.certificate.${certificate.status}`)}
    </StatusBadge>
  )
}

const SiteCard = ({ site }: { site: TenantSite }) => {
  const { t } = useTranslation()
  const { mutate: switchShop, isPending } = useSwitchShop({
    onSuccess: () => window.location.assign("/settings/sites"),
    onError: (error) => toast.error(error.message),
  })

  return (
    <div className="flex flex-col gap-y-3 px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <Text size="small" weight="plus" leading="compact">
            {site.name}
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {site.primary_host}
          </Text>
        </div>
        {site.is_current ? (
          <StatusBadge color="blue">{t("sites.current")}</StatusBadge>
        ) : (
          <Button
            size="small"
            variant="secondary"
            isLoading={isPending}
            onClick={() => switchShop({ tenant_id: site.id })}
          >
            {t("sites.open")}
          </Button>
        )}
      </div>

      <ul className="flex flex-col gap-y-2">
        {site.technical_hosts.slice(0, 1).map((host) => (
          <li key={host} className="flex flex-wrap items-center justify-between gap-2">
            <Text size="small" leading="compact" className="break-all font-mono">
              {host}
            </Text>
            <StatusBadge color="green">{t("sites.certificate.platform")}</StatusBadge>
          </li>
        ))}
        {site.domains.map((domain) => (
          <li key={domain.host} className="flex flex-wrap items-center justify-between gap-2">
            <Text size="small" leading="compact" className="break-all font-mono">
              {domain.host}
              {domain.is_primary ? ` · ${t("sites.primary")}` : ""}
            </Text>
            <CertificateState certificate={domain.certificate} />
          </li>
        ))}
      </ul>
    </div>
  )
}

type SisterDraft = HreflangSister & { key: string }

let nextDraftKey = 0
const draftKey = () => `draft-${nextDraftKey++}`

/**
 * «Сайты-сестры за пределами этой базы» (t-cherk-31): the owner's override
 * for a sister that is not a tenant of this group's database — Ivan's Р2
 * fork, `.ru` and `.com` on different servers. A sister already in this
 * group needs no row here; `GET /store/tenant/sites` finds it on its own.
 */
const HreflangSistersSection = () => {
  const { t } = useTranslation()
  const { sisters: saved, isPending, isError, error } = useHreflangSisters()
  const { mutateAsync: save, isPending: isSaving } = useUpdateHreflangSisters()

  const [rows, setRows] = useState<SisterDraft[]>([])
  const [loaded, setLoaded] = useState(false)
  const touched = useRef(false)

  useEffect(() => {
    if (isPending || isError) {
      return
    }
    if (!touched.current) {
      setRows((saved ?? []).map((sister) => ({ ...sister, key: draftKey() })))
    }
    setLoaded(true)
  }, [isPending, isError, saved])

  if (isError) {
    throw error
  }

  const edit = (next: SisterDraft[]) => {
    touched.current = true
    setRows(next)
  }

  const addRow = () =>
    edit([...rows, { key: draftKey(), domain: "", locale: "en" }])

  const removeRow = (key: string) => edit(rows.filter((row) => row.key !== key))

  const updateRow = (key: string, patch: Partial<HreflangSister>) =>
    edit(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const onSave = async () => {
    const sisters = rows
      .map((row) => ({ domain: row.domain.trim(), locale: row.locale }))
      .filter((row) => row.domain.length > 0)

    try {
      await save({ sisters })
      touched.current = false
      toast.success(t("sites.sisters.saved"))
    } catch (saveError) {
      toast.error((saveError as Error).message)
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Heading level="h2">{t("sites.sisters.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("sites.sisters.description")}
        </Text>
      </div>

      <div className="flex flex-col gap-y-3 px-6 py-4">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-wrap items-center gap-x-2 gap-y-2">
            <Input
              value={row.domain}
              onChange={(event) => updateRow(row.key, { domain: event.target.value })}
              placeholder="cherkashino.com"
              className="max-w-[260px] font-mono"
            />
            <Select
              value={row.locale}
              onValueChange={(next) => updateRow(row.key, { locale: next })}
            >
              <Select.Trigger className="max-w-[180px]">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {LOCALE_CODES.map((code) => (
                  <Select.Item key={code} value={code}>
                    {LOCALE_LABELS[code]} ({code})
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
            <IconButton
              size="small"
              variant="transparent"
              type="button"
              onClick={() => removeRow(row.key)}
            >
              <Trash />
            </IconButton>
          </div>
        ))}

        <Button
          size="small"
          variant="secondary"
          type="button"
          className="self-start"
          onClick={addRow}
        >
          {t("sites.sisters.add")}
        </Button>

        <Text size="small" className="text-ui-fg-subtle">
          {t("sites.sisters.hint")}
        </Text>

        <div className="flex justify-end">
          <Button
            size="small"
            type="button"
            isLoading={isSaving}
            disabled={!loaded}
            onClick={onSave}
          >
            {t("sites.sisters.submit")}
          </Button>
        </div>
      </div>
    </Container>
  )
}

export const Sites = () => {
  const { t } = useTranslation()
  const { sites, isPending, isError, error } = useSites()
  const { mutateAsync: createSite, isPending: isCreating } = useCreateSite()

  const [name, setName] = useState("")
  const [handle, setHandle] = useState("")
  const [copyPages, setCopyPages] = useState(true)
  const [copyShipping, setCopyShipping] = useState(true)

  if (isError) {
    throw error
  }

  if (isPending || !sites) {
    return <SingleColumnPageSkeleton sections={2} />
  }

  const normalisedHandle = handle.trim().toLowerCase()
  const handleValid = HANDLE_PATTERN.test(normalisedHandle) && normalisedHandle.length >= 3
  const current = sites.find((site) => site.is_current)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !handleValid) {
      return
    }
    await createSite(
      {
        name: name.trim(),
        handle: normalisedHandle,
        copy_pages: copyPages,
        copy_shipping: copyShipping,
      },
      {
        onSuccess: () => {
          toast.success(t("sites.created", { name: name.trim() }))
          setName("")
          setHandle("")
        },
        onError: (createError) => toast.error(createError.message),
      }
    )
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet={false}>
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-y-1 px-6 py-4">
          <Heading level="h2">{t("sites.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("sites.description")}
          </Text>
        </div>
        {sites.map((site) => (
          <SiteCard key={site.id} site={site} />
        ))}
      </Container>

      <Container className="divide-y p-0">
        <div className="flex flex-col gap-y-1 px-6 py-4">
          <Heading level="h2">{t("sites.create.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("sites.create.description", { name: current?.name ?? "" })}
          </Text>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-y-4 px-6 py-4">
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="site-name" size="small" weight="plus">
              {t("sites.create.name")}
            </Label>
            <Input
              id="site-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("sites.create.namePlaceholder")}
            />
          </div>
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="site-handle" size="small" weight="plus">
              {t("sites.create.handle")}
            </Label>
            <Input
              id="site-handle"
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="olavka-ru"
              aria-invalid={handle.length > 0 && !handleValid}
            />
            <Text size="small" className="text-ui-fg-subtle">
              {t("sites.create.handleHint")}
            </Text>
          </div>
          <div className="flex items-center gap-x-2">
            <Checkbox
              id="site-copy-pages"
              checked={copyPages}
              onCheckedChange={(checked) => setCopyPages(checked === true)}
            />
            <Label htmlFor="site-copy-pages" size="small">
              {t("sites.create.copyPages")}
            </Label>
          </div>
          <div className="flex items-center gap-x-2">
            <Checkbox
              id="site-copy-shipping"
              checked={copyShipping}
              onCheckedChange={(checked) => setCopyShipping(checked === true)}
            />
            <Label htmlFor="site-copy-shipping" size="small">
              {t("sites.create.copyShipping")}
            </Label>
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            {t("sites.create.notCopied")}
          </Text>
          <div className="flex justify-end">
            <Button
              type="submit"
              size="small"
              isLoading={isCreating}
              disabled={!name.trim() || !handleValid}
            >
              {t("sites.create.submit")}
            </Button>
          </div>
        </form>
      </Container>

      <HreflangSistersSection />
    </SingleColumnPage>
  )
}
