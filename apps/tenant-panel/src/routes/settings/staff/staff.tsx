import { useState } from "react"
import { PencilSquare, Plus, Trash } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  IconButton,
  StatusBadge,
  Table,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { SingleColumnPage } from "../../../components/layout/pages"
import { TableScroll } from "../../../components/table/table-scroll"
import { useDeleteStaff, useStaff } from "../../../hooks/api/staff"
import { useDate } from "../../../hooks/use-date"
import {
  StaffMember,
  staffErrorText,
  staffName,
  staffRoleColor,
  staffRoleOf,
  staffRowActions,
} from "../../../lib/staff"
import { StaffDrawer } from "./staff-drawer"

// t-2026-10-07-11: «Сотрудники» — the owner creates the logins of her staff
// herself and gives each a role (Ivan 2026-10-07: «Ролей нет: каждый логин
// видит весь магазин. Это нужно исправить»). The shape follows
// ../redirects next door: one Container, the heading with its action, the
// table. The add and edit forms are one drawer, the delete is a prompt.
//
// t-2026-10-14-41: the role is a badge with one colour per role
// (`staffRoleColor`, panel-ds E7). The platform's developer stands apart and
// its row offers neither «edit» nor «delete»: only the platform changes it.

export const Staff = () => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const { getFullDate } = useDate()
  const { staff, roles, isPending, isError, error } = useStaff()
  const { mutateAsync: remove } = useDeleteStaff()

  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<StaffMember | null>(null)

  if (isError) {
    throw error
  }

  if (isPending || !staff) {
    return <SingleColumnPageSkeleton sections={1} />
  }

  const handleDelete = async (member: StaffMember) => {
    const confirmed = await prompt({
      title: t("staff.delete.title"),
      description: t("staff.delete.description", { email: member.email }),
      confirmText: t("actions.delete"),
      cancelText: t("actions.cancel"),
      variant: "danger",
    })
    if (!confirmed) {
      return
    }
    await remove(member.id, {
      onSuccess: () => toast.success(t("staff.delete.success")),
      // The server owns the refusal (the last owner); she reads it in her language.
      onError: (deleteError) =>
        toast.error(staffErrorText(deleteError, t("staff.errors.general"), (key) => t(key))),
    }).catch(() => undefined)
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet={false}>
      <Container className="divide-y p-0" data-testid="staff">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
          <div className="flex flex-col gap-y-1">
            <Heading level="h2">{t("staff.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {t("staff.subtitle")}
            </Text>
          </div>
          <Button size="small" variant="secondary" onClick={() => setAdding(true)}>
            <Plus /> {t("staff.add")}
          </Button>
        </div>

        <TableScroll>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t("staff.columns.name")}</Table.HeaderCell>
                <Table.HeaderCell>{t("staff.columns.email")}</Table.HeaderCell>
                <Table.HeaderCell>{t("staff.columns.role")}</Table.HeaderCell>
                <Table.HeaderCell>{t("staff.columns.created")}</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {staff.map((member) => {
                const role = staffRoleOf(member)
                const actions = staffRowActions(member)
                return (
                  <Table.Row key={member.id} data-self={member.is_self ? "true" : undefined}>
                    <Table.Cell>
                      <div className="flex items-center gap-x-2">
                        <Text size="small" className="whitespace-nowrap">
                          {staffName(member) || "-"}
                        </Text>
                        {member.is_self ? (
                          <Badge size="2xsmall">{t("staff.you")}</Badge>
                        ) : null}
                      </div>
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">{member.email}</Table.Cell>
                    <Table.Cell className="whitespace-nowrap">
                      <StatusBadge color={staffRoleColor(member.role)} data-testid="staff-role-badge">
                        {role ? t(`staff.roles.${role}`) : member.role}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">
                      {getFullDate({ date: member.created_at })}
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex justify-end gap-x-1">
                        {actions.canEdit ? (
                          <IconButton
                            size="small"
                            variant="transparent"
                            aria-label={t("actions.edit")}
                            onClick={() => setEditing(member)}
                          >
                            <PencilSquare />
                          </IconButton>
                        ) : null}
                        {actions.canDelete ? (
                          <IconButton
                            size="small"
                            variant="transparent"
                            aria-label={t("actions.delete")}
                            onClick={() => handleDelete(member)}
                          >
                            <Trash />
                          </IconButton>
                        ) : null}
                      </div>
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>
        </TableScroll>
      </Container>

      {adding ? <StaffDrawer roles={roles} onClose={() => setAdding(false)} /> : null}
      {editing ? (
        <StaffDrawer
          key={editing.id}
          member={editing}
          roles={roles}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </SingleColumnPage>
  )
}
