import { useState } from "react"
import { Button, Drawer, Input, Label, Select, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useCreateStaff, useUpdateStaff } from "../../../hooks/api/staff"
import { isRoleName } from "../../../lib/permissions"
import {
  StaffDraft,
  StaffMember,
  StaffRoleGrant,
  createStaffBody,
  draftOfStaff,
  emptyStaffDraft,
  roleSees,
  staffErrorText,
  staffRoleOptions,
  staffRowActions,
  updateStaffBody,
} from "../../../lib/staff"

// t-2026-10-07-11: the one form of the staff screen. Without `member` it adds a
// login (email, name, role, password); with one it edits the name, the role
// and, when the field is filled, the password. What the form sends and what it
// refuses on its own is in `lib/staff.ts`; a refusal of the server is shown in
// the server's words under the fields.
//
// The roles and what each opens come from the server with the list (`roles`):
// the select offers them in its order, and the line under it names the
// permissions of the chosen one. The panel translates the names of roles and
// permissions and keeps no text of its own about what a role sees.

type StaffDrawerProps = {
  member?: StaffMember
  roles?: StaffRoleGrant[]
  onClose: () => void
}

export const StaffDrawer = ({ member, roles, onClose }: StaffDrawerProps) => {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<StaffDraft>(() =>
    member ? draftOfStaff(member) : emptyStaffDraft(roles)
  )
  const [error, setError] = useState<string | null>(null)

  const { mutateAsync: create, isPending: isCreating } = useCreateStaff()
  const { mutateAsync: update, isPending: isUpdating } = useUpdateStaff()

  const canChangeRole = !member || staffRowActions(member).canChangeRole
  const roleName = (role: string) => (isRoleName(role) ? t(`staff.roles.${role}`) : role)
  const sees = roleSees(roles, draft.role)
  const roleHint = !canChangeRole
    ? t("staff.edit.selfRole")
    : sees.length
      ? t("staff.roleSees", {
          list: sees.map((permission) => t(`staff.permissions.${permission}`)).join(", "),
        })
      : null
  const set = (patch: Partial<StaffDraft>) => setDraft((now) => ({ ...now, ...patch }))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    try {
      if (member) {
        const built = updateStaffBody(member, draft)
        if ("error" in built) {
          setError(t(`staff.errors.${built.error}`))
          return
        }
        await update({ id: member.id, body: built.body })
        toast.success(t("staff.edit.success"))
      } else {
        const built = createStaffBody(draft)
        if ("error" in built) {
          setError(t(`staff.errors.${built.error}`))
          return
        }
        await create(built.body)
        toast.success(t("staff.create.success"))
      }
      onClose()
    } catch (submitError) {
      setError(staffErrorText(submitError, t("staff.errors.general"), (key) => t(key)))
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
                onValueChange={(value) => set({ role: value })}
              >
                <Select.Trigger data-testid="staff-role">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {staffRoleOptions(roles).map((role) => (
                    <Select.Item key={role} value={role}>
                      {roleName(role)}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
              {roleHint ? (
                <Text size="small" className="text-ui-fg-subtle" data-testid="staff-role-hint">
                  {roleHint}
                </Text>
              ) : null}
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
