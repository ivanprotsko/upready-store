import { ArrowUpRightOnBox, EllipsisHorizontal } from "@medusajs/icons"
import { format } from "date-fns"
import { Button, IconButton, StatusBadge, Text } from "@medusajs/ui"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo, type MouseEvent } from "react"
import { useTranslation } from "react-i18next"

import { ActionMenu } from "../../../components/common/action-menu"
import { LinkButton } from "../../../components/common/link-button"
import type { Filter } from "../../../components/table/data-table"
import {
  CHANGESET_STATUSES,
  type AgentChangesetSummary,
  type ChangesetStatus,
  type SiteLinks,
} from "../../../hooks/api/agent-changesets"
import { useQueryParams } from "../../../hooks/use-query-params"
import {
  CHANGESET_STATUS_COLOR,
  changesetSourceLabel,
  changesetStatusHint,
  changesetStatusLabel,
  changesetWhat,
  changesetWhen,
  siteLink,
} from "../labels"
import { ACTION_ICON, useChangesetActions } from "../use-changeset-actions"

// t-2026-10-27-04: the columns of «Изменения агента», the brief's order:
// Когда · Кто · Что · Статус · Где смотреть · «…». One line per cell
// (table-cells-one-line); the source of a change is on hover of «Кто».

export const PAGE_SIZE = 20

export const useChangesetListQuery = () => {
  const raw = useQueryParams(["offset", "status"])
  return {
    raw,
    query: {
      status: CHANGESET_STATUSES.find((status) => status === raw.status),
      limit: PAGE_SIZE,
      offset: raw.offset ? Number(raw.offset) : 0,
    },
  }
}

const RowActions = ({ changeset, search }: { changeset: AgentChangesetSummary; search: string }) => {
  const { t } = useTranslation()
  const { moves, run, isPending } = useChangesetActions(changeset)

  return (
    <ActionMenu
      groups={[
        {
          actions: [
            {
              icon: <ArrowUpRightOnBox />,
              label: t("agentChanges.actions.open"),
              to: `/agent-changes/${changeset.id}${search}`,
            },
          ],
        },
        ...(moves.length
          ? [
              {
                actions: moves.map((move) => ({
                  icon: ACTION_ICON[move],
                  label: t(`agentChanges.actions.${move}`),
                  disabled: isPending,
                  destructive: move === "discard",
                  onClick: () => void run(move),
                })),
              },
            ]
          : []),
      ]}
    >
      <IconButton size="small" variant="transparent" aria-label={t("fields.actions")}>
        <EllipsisHorizontal />
      </IconButton>
    </ActionMenu>
  )
}

/** «27.10 12:02»: the year only when it is not this one; the full date on hover. */
const WhenCell = ({ row }: { row: AgentChangesetSummary }) => {
  const when = changesetWhen(row)
  if (!when) return <Text size="small">—</Text>
  const date = new Date(when)
  const short = format(date, date.getFullYear() === new Date().getFullYear() ? "dd.MM HH:mm" : "dd.MM.yyyy HH:mm")
  return (
    <Text size="small" leading="compact" className="whitespace-nowrap" title={format(date, "dd.MM.yyyy HH:mm")}>
      {short}
    </Text>
  )
}

/**
 * The row's «Stage ↗ · Сайт ↗», opening the changed page. The row itself is a
 * link, so these are buttons: a link inside a link is invalid HTML.
 */
const RowSiteLinks = ({ row, sites }: { row: AgentChangesetSummary; sites: SiteLinks | undefined }) => {
  const { t } = useTranslation()
  const open = (url: string | null) => (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (url) window.open(url, "_blank", "noopener,noreferrer")
  }
  const links = [
    { key: "stage", url: siteLink(sites?.stage_url, row.preview_path) },
    { key: "main", url: siteLink(sites?.main_url, row.preview_path) },
  ].filter((link) => link.url)
  return (
    <div className="flex items-center whitespace-nowrap">
      {links.map((link) => (
        <Button
          key={link.key}
          type="button"
          size="small"
          variant="transparent"
          title={link.url ?? undefined}
          onClick={open(link.url)}
        >
          {t(`agentChanges.links.${link.key}`)}
        </Button>
      ))}
    </div>
  )
}

/** «Stage ↗ · Сайт ↗»: where to look; a site without an address shows nothing. */
export const SiteLinksCell = ({ sites }: { sites: SiteLinks | undefined }) => {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-x-3 whitespace-nowrap">
      {sites?.stage_url ? (
        <LinkButton to={sites.stage_url} target="_blank" rel="noreferrer">
          {t("agentChanges.links.stage")}
        </LinkButton>
      ) : null}
      {sites?.main_url ? (
        <LinkButton to={sites.main_url} target="_blank" rel="noreferrer">
          {t("agentChanges.links.main")}
        </LinkButton>
      ) : null}
    </div>
  )
}

const columnHelper = createColumnHelper<AgentChangesetSummary>()

export const useChangesetColumns = (search: string, sites: SiteLinks | undefined) => {
  const { t } = useTranslation()

  return useMemo(
    () => [
      columnHelper.display({
        id: "when",
        header: t("agentChanges.columns.when"),
        cell: ({ row }) => <WhenCell row={row.original} />,
        meta: { phoneTop: true },
      }),
      columnHelper.accessor("author_email", {
        header: t("agentChanges.columns.who"),
        cell: ({ row }) => (
          <div className="flex h-full w-full max-w-[88px] xl:max-w-[200px] items-center overflow-hidden">
            <Text
              size="small"
              leading="compact"
              className="truncate"
              title={[row.original.author_email, changesetSourceLabel(t, row.original.source)].filter(Boolean).join(" · ")}
            >
              {row.original.author_email ?? changesetSourceLabel(t, row.original.source)}
            </Text>
          </div>
        ),
      }),
      columnHelper.display({
        id: "what",
        header: t("agentChanges.columns.what"),
        cell: ({ row }) => {
          const what = changesetWhat(t, row.original)
          return (
            <div className="flex h-full w-full max-w-[120px] xl:max-w-[280px] items-center overflow-hidden">
              <Text size="small" leading="compact" className="truncate" title={what}>
                {what}
              </Text>
            </div>
          )
        },
        meta: { phoneWide: true },
      }),
      columnHelper.accessor("status", {
        header: t("agentChanges.columns.status"),
        cell: ({ getValue }) => (
          <StatusBadge
            color={CHANGESET_STATUS_COLOR[getValue()]}
            title={changesetStatusHint(t, getValue())}
            className="whitespace-nowrap"
          >
            {changesetStatusLabel(t, getValue())}
          </StatusBadge>
        ),
        meta: { phoneTop: "end" },
      }),
      columnHelper.display({
        id: "links",
        header: t("agentChanges.columns.links"),
        cell: ({ row }) => <RowSiteLinks row={row.original} sites={sites} />,
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => <RowActions changeset={row.original} search={search} />,
      }),
    ],
    [t, search, sites]
  )
}

export const useChangesetFilters = (): Filter[] => {
  const { t } = useTranslation()

  return useMemo(
    () => [
      {
        key: "status",
        label: t("agentChanges.columns.status"),
        type: "select",
        options: CHANGESET_STATUSES.map((status: ChangesetStatus) => ({
          label: changesetStatusLabel(t, status),
          value: status,
        })),
      },
    ],
    [t]
  )
}
