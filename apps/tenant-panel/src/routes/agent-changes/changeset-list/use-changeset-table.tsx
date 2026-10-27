import { ArrowUpRightOnBox, EllipsisHorizontal } from "@medusajs/icons"
import { IconButton, StatusBadge, Text } from "@medusajs/ui"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { ActionMenu } from "../../../components/common/action-menu"
import type { Filter } from "../../../components/table/data-table"
import {
  CHANGESET_STATUSES,
  type AgentChangesetSummary,
  type ChangesetStatus,
  type SiteLinks,
} from "../../../hooks/api/agent-changesets"
import { useDate } from "../../../hooks/use-date"
import { useQueryParams } from "../../../hooks/use-query-params"
import {
  CHANGESET_STATUS_COLOR,
  changesetSourceLabel,
  changesetStatusHint,
  changesetStatusLabel,
  changesetWhat,
  changesetWhen,
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

const WhenCell = ({ row }: { row: AgentChangesetSummary }) => {
  const { getFullDate } = useDate()
  const when = changesetWhen(row)
  return (
    <Text size="small" leading="compact" className="whitespace-nowrap">
      {when ? getFullDate({ date: when, includeTime: true }) : "—"}
    </Text>
  )
}

/** «Stage ↗ · Сайт ↗»: where to look; a site without an address shows nothing. */
export const SiteLinksCell = ({ sites }: { sites: SiteLinks | undefined }) => {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-x-3 whitespace-nowrap">
      {sites?.stage_url ? (
        <a
          href={sites.stage_url}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small"
        >
          {t("agentChanges.links.stage")}
        </a>
      ) : null}
      {sites?.main_url ? (
        <a
          href={sites.main_url}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small"
        >
          {t("agentChanges.links.main")}
        </a>
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
          <Text
            size="small"
            leading="compact"
            className="truncate"
            title={changesetSourceLabel(t, row.original.source)}
          >
            {row.original.author_email ?? changesetSourceLabel(t, row.original.source)}
          </Text>
        ),
      }),
      columnHelper.display({
        id: "what",
        header: t("agentChanges.columns.what"),
        cell: ({ row }) => {
          const what = changesetWhat(t, row.original)
          return (
            <div className="flex h-full w-full max-w-[360px] items-center overflow-hidden">
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
        cell: () => <SiteLinksCell sites={sites} />,
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
