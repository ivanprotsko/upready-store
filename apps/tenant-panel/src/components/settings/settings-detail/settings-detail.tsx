import { EllipsisHorizontal, PencilSquare } from "@medusajs/icons"
import { Container, Heading, IconButton, StatusBadge, Text, clx } from "@medusajs/ui"
import { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { ActionMenu, type ActionGroup } from "../../common/action-menu"
import { SectionRow } from "../../common/section"
import { SingleColumnPageSkeleton } from "../../common/skeleton"
import { SingleColumnPage } from "../../layout/pages"

// t-2026-10-14-01 (panel redesign, stage 3, G1): the read page every settings
// screen shares, after design-system patterns E2, E11 and E13 and Medusa's
// `region-detail` / `store-detail`. The page only reads: each section is a
// `Container` with its header (title, one-phrase description, an optional
// `StatusBadge`, «…» → «Изменить») and `SectionRow` rows. The edit lives on
// the section's nested route, drawn by `SettingsEditDrawer` into the outlet.

export type SettingsStatus = {
  /** `purple` is the platform developer's role (`staffRoleColor`, t-2026-10-14-41). */
  color: "green" | "grey" | "orange" | "red" | "blue" | "purple"
  label: string
}

export type SettingsRow = {
  id: string
  label: string
  /** Empty (`null`, `undefined`, `""`) reads «—» (design-system rule 19). */
  value?: ReactNode
  /** One phrase under the value: what it does, or what an empty value means. */
  hint?: ReactNode
  /** Codes and ids the owner pastes from elsewhere read in monospace. */
  mono?: boolean
  status?: SettingsStatus
}

export type SettingsSection = {
  id: string
  title: string
  description?: string
  status?: SettingsStatus
  /** The section's nested edit route, relative to the page. */
  editTo?: string
  /**
   * The «…» menu when the section does more than edit (rule 21): groups in
   * order of use, the dangerous one last after a separator. `[]` draws no
   * «…». Without it the menu is the one «Изменить» → `editTo`.
   */
  actions?: ActionGroup[]
  /** The one header button, when the section's only action is the owner's next step. */
  action?: ReactNode
  rows: SettingsRow[]
}

export type SettingsDetailProps = {
  sections: SettingsSection[]
  /** Until the first answer lands the page is a skeleton (rule 12). */
  isPending?: boolean
}

const isEmpty = (value: ReactNode) =>
  value === null || value === undefined || value === ""

const SettingsRowValue = ({ row }: { row: SettingsRow }) => {
  // A row that is only a status (a badge, no value of its own) has no «—».
  const empty = isEmpty(row.value) && !row.status

  return (
    <div
      className="flex w-full min-w-0 flex-col items-start gap-y-1"
      data-testid={`settings-row-${row.id}`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {empty ? (
          <Text size="small" leading="compact">
            —
          </Text>
        ) : isEmpty(row.value) ? null : typeof row.value === "string" ? (
          <Text
            size="small"
            leading="compact"
            family={row.mono ? "mono" : "sans"}
            className={clx({ "break-all": row.mono })}
          >
            {row.value}
          </Text>
        ) : (
          row.value
        )}
        {row.status ? (
          <StatusBadge color={row.status.color}>{row.status.label}</StatusBadge>
        ) : null}
      </div>
      {row.hint ? (
        <Text size="xsmall" leading="compact" className="text-ui-fg-subtle text-pretty">
          {row.hint}
        </Text>
      ) : null}
    </div>
  )
}

export const SettingsDetailSection = ({
  section,
  level = "h2",
}: {
  section: SettingsSection
  level?: "h1" | "h2"
}) => {
  const { t } = useTranslation()

  const groups: ActionGroup[] = section.actions ?? [
    {
      actions: [
        {
          label: t("actions.change"),
          to: section.editTo ?? "edit",
          icon: <PencilSquare />,
        },
      ],
    },
  ]

  return (
    <Container className="divide-y p-0" data-testid={`settings-section-${section.id}`}>
      <div className="flex items-center justify-between gap-x-4 px-6 py-4">
        <div className="min-w-0">
          <Heading level={level}>{section.title}</Heading>
          {section.description ? (
            <Text size="small" className="text-ui-fg-subtle text-pretty">
              {section.description}
            </Text>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-x-2">
          {section.status ? (
            <StatusBadge color={section.status.color}>{section.status.label}</StatusBadge>
          ) : null}
          {section.action}
          {groups.length ? (
            <ActionMenu groups={groups}>
              <IconButton size="small" variant="transparent" aria-label={t("fields.actions")}>
                <EllipsisHorizontal />
              </IconButton>
            </ActionMenu>
          ) : null}
        </div>
      </div>
      {section.rows.map((row) => (
        <SectionRow key={row.id} title={row.label} value={<SettingsRowValue row={row} />} />
      ))}
    </Container>
  )
}

export const SettingsDetail = ({ sections, isPending = false }: SettingsDetailProps) => {
  if (isPending) {
    return <SingleColumnPageSkeleton sections={Math.max(1, sections.length)} />
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet>
      {sections.map((section, index) => (
        // The first section's title is the screen's own (E11): h1 there only.
        <SettingsDetailSection
          key={section.id}
          section={section}
          level={index === 0 ? "h1" : "h2"}
        />
      ))}
    </SingleColumnPage>
  )
}
