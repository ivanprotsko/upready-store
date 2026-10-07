import { useState } from "react"
import { Button, Drawer, Input, Label, Select, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useCreateStaff, useUpdateStaff } from "../../../hooks/api/staff"
import { STAFF_ROLES, isStaffRole } from "../../../lib/permissions"
import {
  StaffDraft,
  StaffMember,
  createStaffBody,
  draftOfStaff,
  emptyStaffDraft,
  staffErrorText,
  staffRowActions,
  updateStaffBody,
} from "../../../lib/staff"

// t-2026-10-07-11: the one form of the staff screen. Without `member` it adds a
// login (email, name, role, password); with one it edits the name, the role
// and, when the field is filled, the password. What the form sends and what it
// refuses on its own is in `lib/staff.ts`; a refusal of the server is shown in
// the server's words under the fields.

type StaffDrawerProps = {
  member?: StaffMember
  onClose: () => void
}

export const StaffDrawer = ({ member, onClose }: StaffDrawerProps) => {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<StaffDraft>(() =>
    member ? draftOfStaff(member) : emptyStaffDraft()
  )
  const [error, setError] = useState<string | null>(null)

  const { mutateAsync: create, isPending: isCreating } = useCreateStaff()
  const { mutateAsync: update, isPending: isUpdating } = useUpdateStaff()

  const canChangeRole = !member || staffRowActions(member).canChangeRole
  const set = (patch: Partial<StaffDraft>) => setDraft((now) => ({ ...now, ...patch }))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const built = member ? updateStaffBody(member, draft) : createStaffBody(draft)
    if ("error" in built) {
      setError(t(`staff.errors.${built.error}`))
      return
    }

    try {
      if (member) {
        await update({ id: member.id, body: built.body })
        toast.success(t("staff.edit.success"))
      } else if ("email" in built.body) {
        await create(built.body)
        toast.success(t("staff.create.success"))
      }
      onClose()
    } catch (submitError) {
      setError(staffErrorText(submitError, t("staff.errors.general")))
    }
  }

  return (
    <Drawer open onOpenChange={(open) => (open ? undefined : onClose())}>
      <Drawer.Content data-testid="staff-drawer">
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <Drawer.Header>
            <Drawer.Title>{member ? t("staff.edit.title") : t("staff.create.title")}</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-y-4 overflow-y-auto">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="staff_email" size="small">
                {t("staff.fields.email")}
              </Label>
              <Input
                id="staff_email"
                type="email"
                autoComplete="off"
                value={draft.email}
                disabled={!!member}
                onChange={(event) => set({ email: event.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-x-4">
              <div className="flex flex-col gap-y-2">
                <Label htmlFor="staff_first_name" size="small">
                  {t("staff.fields.firstName")}
                </Label>
                <Input
                  id="staff_first_name"
                  value={draft.firstName}
                  onChange={(event) => set({ firstName: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-y-2">
                <Label htmlFor="staff_last_name" size="small">
                  {t("staff.fields.lastName")}
                </Label>
                <Input
                  id="staff_last_name"
                  value={draft.lastName}
                  onChange={(event) => set({ lastName: event.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-y-2">
              <Label size="small">{t("staff.fields.role")}</Label>
              <Select
                value={draft.role}
                disabled={!canChangeRole}
                onValueChange={(value) => (isStaffRole(value) ? set({ role: value }) : undefined)}
              >
                <Select.Trigger data-testid="staff-role">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {STAFF_ROLES.map((role) => (
                    <Select.Item key={role} value={role}>
                      {t(`staff.roles.${role}`)}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
              <Text size="small" className="text-ui-fg-subtle" data-testid="staff-role-hint">
                {canChangeRole ? t(`staff.roleHints.${draft.role}`) : t("staff.edit.selfRole")}
              </Text>
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="staff_password" size="small">
                {member ? t("staff.fields.newPassword") : t("staff.fields.password")}
              </Label>
              <Input
                id="staff_password"
                type="password"
                autoComplete="new-password"
                value={draft.password}
                onChange={(event) => set({ password: event.target.value })}
              />
              <Text size="small" className="text-ui-fg-subtle">
                {member ? t("staff.fields.newPasswordHint") : t("staff.fields.passwordHint")}
              </Text>
            </div>
            {error ? (
              <Text size="small" className="text-ui-fg-error" data-testid="staff-error">
                {error}
              </Text>
            ) : null}
          </Drawer.Body>
          <Drawer.Footer>
            <Drawer.Close asChild>
              <Button variant="secondary" size="small" type="button">
                {t("actions.cancel")}
              </Button>
            </Drawer.Close>
            <Button
              variant="primary"
              size="small"
              type="submit"
              isLoading={isCreating || isUpdating}
            >
              {member ? t("actions.save") : t("staff.create.submit")}
            </Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}
