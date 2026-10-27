import { Alert, Badge, Button, Heading, StatusBadge, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import { LinkButton } from "../../../components/common/link-button"
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

/** One field's «было → стало», in the owner's words: the old value struck through above the new one. */
const ChangeValue = ({ before, after }: { before: unknown; after: unknown }) => {
  const { t } = useTranslation()
  return (
    <div className="flex min-w-0 flex-col items-start gap-y-1">
      <Text size="small" leading="compact" className="text-ui-fg-subtle [overflow-wrap:anywhere]">
        {t("agentChanges.diff.before")}: <span className="line-through">{formatValue(t, before)}</span>
      </Text>
      <Text size="small" leading="compact" className="[overflow-wrap:anywhere]">
        {t("agentChanges.diff.after")}: {formatValue(t, after)}
      </Text>
    </div>
  )
}

const OpCard = ({ op, sites }: { op: AgentChangesetOp; sites: SiteLinks | undefined }) => {
  const { t } = useTranslation()
  const stage = op.scope ? siteLink(sites?.stage_url, op.preview_path) : null
  const main = siteLink(sites?.main_url, op.preview_path)

  return (
    <div className="flex flex-col gap-y-3 px-6 pt-4" data-testid="agent-change-op">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-x-2">
          <Badge size="2xsmall">{changesetKindLabel(t, op.kind)}</Badge>
          <Text size="small" leading="compact" className="text-ui-fg-subtle truncate" title={op.path}>
            {op.preview_path ?? op.path}
          </Text>
        </div>
        <div className="flex items-center gap-x-3">
          {stage ? (
            <LinkButton to={stage} target="_blank" rel="noreferrer">
              {t("agentChanges.links.stage")}
            </LinkButton>
          ) : null}
          {main ? (
            <LinkButton to={main} target="_blank" rel="noreferrer">
              {t("agentChanges.links.main")}
            </LinkButton>
          ) : null}
        </div>
      </div>
      {op.changes.length ? (
        <div className="-mx-6 divide-y border-t">
          {op.changes.map((change) => (
            <SectionRow
              key={change.field}
              title={fieldLabel(t, change.field)}
              value={<ChangeValue before={change.before} after={change.after} />}
            />
          ))}
        </div>
      ) : (
        <Text size="small" leading="compact" className="text-ui-fg-muted pb-4">
          {t("agentChanges.diff.none")}
        </Text>
      )}
    </div>
  )
}

const DriftNotice = ({ drift, ops }: { drift: ChangesetDrift[]; ops: AgentChangesetOp[] }) => {
  const { t } = useTranslation()
  // Each place in the owner's words: what it is and its address on the site.
  const place = (entry: ChangesetDrift) => {
    const op = ops.find((candidate) => candidate.index === entry.op_index)
    return op ? [changesetKindLabel(t, op.kind), op.preview_path].filter(Boolean).join(" · ") : entry.path
  }
  return (
    <div className="px-6 py-4" data-testid="agent-change-drift">
      <Alert variant="error">
        <div className="flex flex-col gap-y-1">
          <Text size="small" leading="compact" weight="plus">
            {t("agentChanges.drift.title")}
          </Text>
          <Text size="small" className="text-pretty">
            {t("agentChanges.drift.description")}
          </Text>
          <ul className="flex flex-col gap-y-1">
            {drift.map((entry) => (
              <li key={entry.op_index}>
                <Text size="small" leading="compact" className="break-words">
                  {place(entry)}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      </Alert>
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
      {changeset.drift?.length ? <DriftNotice drift={changeset.drift} ops={changeset.ops} /> : null}
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
