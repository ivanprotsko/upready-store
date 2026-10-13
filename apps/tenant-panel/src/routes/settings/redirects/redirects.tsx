import { useMemo, useState } from "react"
import { Plus } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Select,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../components/layout/pages"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { TableScroll } from "../../../components/table/table-scroll"
import { useDomains } from "../../../hooks/api/domains"
import {
  useCreateTenantRedirect,
  useTenantRedirects,
} from "../../../hooks/api/redirects"
import { RedirectRow } from "./redirect-row"
import { REDIRECT_STATUS_CODES } from "./status-codes"

// b10-panel-gaps: «Старые адреса» — the shop's own redirect table. The routes
// (`/tenants/redirects*`) shipped with t11-seo-redirects and had no screen, so
// the 47 rules the migration of Oksana's shop imported were invisible to her.
//
// One screen, no children: a rule is three fields, edited in its own row, so
// there is nothing to open a drawer for. The shape follows ../domains next
// door — Container, the list, then the add form under it.

const PATH_PATTERN = /^\/[^\s?#]*$/

export const Redirects = () => {
  const { t } = useTranslation()
  const { redirects, isPending, isError, error } = useTenantRedirects()
  const { primary_host: primaryHost } = useDomains()

  const [fromPath, setFromPath] = useState("")
  const [toPath, setToPath] = useState("")
  const [statusCode, setStatusCode] = useState(String(REDIRECT_STATUS_CODES[0]))
  const [search, setSearch] = useState("")

  const { mutateAsync: create, isPending: isCreating } = useCreateTenantRedirect()

  const shopOrigin = primaryHost ? `https://${primaryHost}` : undefined

  // 47 rows after a migration is a list an owner scrolls, so the screen filters
  // it in the browser: every row is already here, no second request to make.
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const rows = redirects ?? []

    if (!needle) {
      return rows
    }

    return rows.filter(
      (row) =>
        row.from_path.toLowerCase().includes(needle) ||
        row.to_path.toLowerCase().includes(needle)
    )
  }, [redirects, search])

  if (isError) {
    throw error
  }

  if (isPending || !redirects) {
    return <SingleColumnPageSkeleton sections={1} />
  }

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()

    const from = fromPath.trim()
    const to = toPath.trim()

    if (!PATH_PATTERN.test(from) || !PATH_PATTERN.test(to)) {
      toast.error(t("redirects.pathError"))
      return
    }

    if (from === to) {
      toast.error(t("redirects.loopError"))
      return
    }

    await create(
      { from_path: from, to_path: to, status_code: Number(statusCode) },
      {
        onSuccess: () => {
          setFromPath("")
          setToPath("")
          toast.success(t("redirects.created"))
        },
        // The backend owns every refusal (a duplicate source path, a path that
        // is not a path) and its message is what the owner reads.
        onError: (createError) => toast.error(createError.message),
      }
    )
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet={false}>
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-y-1 px-6 py-4">
          <Heading level="h2">{t("redirects.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("redirects.subtitle")}
          </Text>
        </div>

        <form
          onSubmit={handleCreate}
          className="flex flex-wrap items-end gap-x-3 gap-y-3 px-6 py-4"
        >
          <div className="flex flex-col gap-y-1">
            <Label htmlFor="from_path" size="xsmall">
              {t("redirects.columnFrom")}
            </Label>
            <Input
              id="from_path"
              value={fromPath}
              onChange={(event) => setFromPath(event.target.value)}
              placeholder="/catalog/old-page"
              className="font-mono w-[280px]"
            />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label htmlFor="to_path" size="xsmall">
              {t("redirects.columnTo")}
            </Label>
            <Input
              id="to_path"
              value={toPath}
              onChange={(event) => setToPath(event.target.value)}
              placeholder="/ru/products/new-page"
              className="font-mono w-[280px]"
            />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="xsmall">{t("redirects.columnKind")}</Label>
            <Select value={statusCode} onValueChange={setStatusCode}>
              <Select.Trigger className="w-[220px]">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {REDIRECT_STATUS_CODES.map((code) => (
                  <Select.Item key={code} value={String(code)}>
                    {t(`redirects.status.${code}`, { defaultValue: String(code) })}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <Button size="small" type="submit" isLoading={isCreating}>
            <Plus /> {t("redirects.addAction")}
          </Button>
          <Text size="small" className="text-ui-fg-subtle basis-full">
            {t("redirects.hint")}
          </Text>
        </form>
        {redirects.length > 10 ? (
          // t-2026-10-13-30: a 320 px field and the counter beside it were
          // wider than a phone; the counter now wraps under the field.
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-6 py-3">
            <div className="w-full max-w-[320px]">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("redirects.searchPlaceholder")}
                className="w-full"
              />
            </div>
            <Text size="small" className="text-ui-fg-subtle whitespace-nowrap">
              {t("redirects.counter", {
                shown: visible.length,
                total: redirects.length,
              })}
            </Text>
          </div>
        ) : null}

        {redirects.length ? (
          <TableScroll>
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>{t("redirects.columnFrom")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("redirects.columnTo")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("redirects.columnKind")}</Table.HeaderCell>
                  <Table.HeaderCell />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {visible.map((redirect) => (
                  <RedirectRow
                    key={redirect.id}
                    redirect={redirect}
                    primaryHost={shopOrigin}
                  />
                ))}
              </Table.Body>
            </Table>
          </TableScroll>
        ) : (
          <div className="px-6 py-6">
            <Text size="small" className="text-ui-fg-subtle">
              {t("redirects.empty")}
            </Text>
          </div>
        )}
      </Container>
    </SingleColumnPage>
  )
}
