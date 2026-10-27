import { ExclamationCircle } from "@medusajs/icons"
import { Badge, Button, Heading, StatusBadge, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import { SectionRow } from "../../../components/common/section"
import { RouteDrawer } from "../../../components/modals"
import {
  useAgentChangeset,
  type AgentChangeset,
  type AgentChangesetOp,
  type ChangesetDrift,
  type SiteLinks,
} from "../../../hooks/api/agent-changesets"
import { useDate } from "../../../hooks/use-date"
import {
  CHANGESET_STATUS_COLOR,
  changesetKindLabel,
  changesetSourceLabel,
  changesetStatusHint,
  changesetStatusLabel,
  changesetWhat,
  changesetWhen,
  fieldLabel,
  formatValue,
  siteLink,
} from "../labels"
import { useChangesetActions } from "../use-changeset-actions"

// t-2026-10-27-04: one changeset in a drawer at /agent-changes/:id. The rows
// say when, who and what; each op shows its field-by-field diff («было» →
// «стало») and where to look at it on the stage copy and on the live site.
// The footer holds the moves: «Показать на stage», «Опубликовать»,
// «Откатить», «Отменить», each but the first behind a prompt. A published
// changeset whose targets changed on the live site since shows that drift,
// and «Откатить» stays off: the server would refuse it and change nothing.

const LinkOut = ({ href, children }: { href: string; children: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small whitespace-nowrap"
  >
    {children}
  </a>
)

const ValueText = ({ value, muted }: { value: unknown; muted?: boolean }) => {
  const { t } = useTranslation()
  const text = formatValue(t, value)
  return (
    <Text
      size="small"
      leading="compact"
      className={`break-words ${muted ? "text-ui-fg-subtle line-through" : ""}`}
      title={text}
    >
      {text}
    </Text>
  )
}

const OpCard = ({ op, sites }: { op: AgentChangesetOp; sites: SiteLinks | undefined }) => {
  const { t } = useTranslation()
  const stage = op.scope ? siteLink(sites?.stage_url, op.preview_path) : null
  const main = siteLink(sites?.main_url, op.preview_path)

  return (
    <div className="flex flex-col gap-y-3 px-6 py-4" data-testid="agent-change-op">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-x-2">
          <Badge size="2xsmall">{changesetKindLabel(t, op.kind)}</Badge>
          <Text size="small" leading="compact" className="text-ui-fg-subtle truncate" title={op.path}>
            {op.preview_path ?? op.path}
          </Text>
        </div>
        <div className="flex items-center gap-x-3">
          {stage ? <LinkOut href={stage}>{t("agentChanges.links.stage")}</LinkOut> : null}
          {main ? <LinkOut href={main}>{t("agentChanges.links.main")}</LinkOut> : null}
        </div>
      </div>
      {op.changes.length ? (
        <div className="flex flex-col divide-y rounded-lg border">
          <div className="text-ui-fg-subtle hidden grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,2fr)] gap-x-3 px-3 py-2 md:grid">
            <Text size="xsmall" weight="plus">
              {t("agentChanges.diff.field")}
            </Text>
            <Text size="xsmall" weight="plus">
              {t("agentChanges.diff.before")}
            </Text>
            <Text size="xsmall" weight="plus">
              {t("agentChanges.diff.after")}
            </Text>
          </div>
          {op.changes.map((change) => (
            <div
              key={change.field}
              className="grid grid-cols-1 gap-x-3 gap-y-1 px-3 py-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,2fr)]"
            >
              <Text size="small" leading="compact" weight="plus">
                {fieldLabel(t, change.field)}
              </Text>
              <ValueText value={change.before} muted />
              <ValueText value={change.after} />
            </div>
          ))}
        </div>
      ) : (
        <Text size="small" leading="compact" className="text-ui-fg-muted">
          {t("agentChanges.diff.none")}
        </Text>
      )}
    </div>
  )
}

const DriftNotice = ({ drift }: { drift: ChangesetDrift[] }) => {
  const { t } = useTranslation()
  return (
    <div
      className="bg-ui-bg-subtle mx-6 my-4 flex flex-col gap-y-2 rounded-lg border p-3"
      data-testid="agent-change-drift"
      role="status"
    >
      <div className="flex items-center gap-x-2">
        <ExclamationCircle className="text-ui-fg-error shrink-0" />
        <Text size="small" leading="compact" weight="plus">
          {t("agentChanges.drift.title")}
        </Text>
      </div>
      <Text size="small" className="text-ui-fg-subtle text-pretty">
        {t("agentChanges.drift.description")}
      </Text>
      <ul className="flex flex-col gap-y-1">
        {drift.map((entry) => (
          <li key={entry.op_index}>
            <Text size="small" leading="compact" className="truncate" title={entry.path}>
              {entry.path}
            </Text>
          </li>
        ))}
      </ul>
    </div>
  )
}

const ChangesetRows = ({ changeset, sites }: { changeset: AgentChangeset; sites: SiteLinks | undefined }) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const when = changesetWhen(changeset)

  return (
    <div className="divide-y" data-testid="agent-change-detail">
      <SectionRow title={t("agentChanges.columns.what")} value={changesetWhat(t, changeset)} />
      <SectionRow
        title={t("agentChanges.columns.when")}
        value={when ? getFullDate({ date: when, includeTime: true }) : "—"}
      />
      <SectionRow
        title={t("agentChanges.columns.who")}
        value={[changeset.author_email, changesetSourceLabel(t, changeset.source)].filter(Boolean).join(" · ")}
      />
      <SectionRow
        title={t("agentChanges.columns.status")}
        value={
          <div className="flex flex-col items-start gap-y-1">
            <StatusBadge color={CHANGESET_STATUS_COLOR[changeset.status]}>
              {changesetStatusLabel(t, changeset.status)}
            </StatusBadge>
            <Text size="small" leading="compact" className="text-ui-fg-subtle text-pretty">
              {changesetStatusHint(t, changeset.status)}
            </Text>
          </div>
        }
      />
      {changeset.drift?.length ? <DriftNotice drift={changeset.drift} /> : null}
      <div className="px-6 pb-1 pt-4">
        <Heading level="h3">{t("agentChanges.detail.ops", { count: changeset.ops.length })}</Heading>
      </div>
      {changeset.ops.map((op) => (
        <OpCard key={op.index} op={op} sites={sites} />
      ))}
    </div>
  )
}

const Footer = ({ changeset }: { changeset: AgentChangeset }) => {
  const { t } = useTranslation()
  const { moves, run, isPending } = useChangesetActions(changeset)
  const drifted = Boolean(changeset.drift?.length)

  return (
    <div className="flex flex-wrap items-center justify-end gap-2" data-block="agent-change-footer">
      <RouteDrawer.Close asChild>
        <Button size="small" variant="secondary">
          {t("actions.close")}
        </Button>
      </RouteDrawer.Close>
      {moves
        .slice()
        .reverse()
        .map((move) => (
          <Button
            key={move}
            size="small"
            variant={move === "discard" ? "danger" : move === moves[0] ? "primary" : "secondary"}
            disabled={isPending || (move === "rollback" && drifted)}
            onClick={() => void run(move)}
          >
            {t(`agentChanges.actions.${move}`)}
          </Button>
        ))}
    </div>
  )
}

export const ChangesetDetail = () => {
  const { id } = useParams()
  const { t } = useTranslation()
  const { agent_changeset: changeset, sites, isPending, isError, error } = useAgentChangeset(id!)

  if (isError) {
    throw error
  }

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>{t("agentChanges.detail.title")}</Heading>
        </RouteDrawer.Title>
        <RouteDrawer.Description className="sr-only">{t("agentChanges.detail.description")}</RouteDrawer.Description>
      </RouteDrawer.Header>
      <RouteDrawer.Body className="overflow-y-auto p-0">
        {isPending || !changeset ? null : <ChangesetRows changeset={changeset} sites={sites} />}
      </RouteDrawer.Body>
      <RouteDrawer.Footer>{changeset ? <Footer changeset={changeset} /> : null}</RouteDrawer.Footer>
    </RouteDrawer>
  )
}
