import { Input, Select } from "@medusajs/ui"
import { useMemo } from "react"
import { UseFormReturn, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../components/common/form"
import { SettingsEditDrawer } from "../../../components/settings"
import { useCreateStaff, useUpdateStaff } from "../../../hooks/api/staff"
import { isRoleName } from "../../../lib/permissions"
import {
  STAFF_PASSWORD_MIN,
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

// t-2026-10-07-11: the one form of the staff screen. In `create` it adds a
// login (email, name, role, password); in `edit` it changes the name, the role
// and, when the field is filled, the password. What the form sends and what it
// refuses on its own is in `lib/staff.ts`.
//
// t-2026-10-14-01 (panel redesign, G2): the form is a `SettingsEditDrawer` on
// its own address, `/settings/staff/create` and `/settings/staff/:id/edit`
// (panel-ds E3, E4 as amended for a create of ≤ 5 fields), not a `Drawer` on
// a state flag. A field the form can check itself is refused at the field; a
// refusal of the server is `toast.error` in the owner's words.
//
// The roles and what each opens come from the server with the list (`roles`):
// the select offers them in its order, and the line under it names the
// permissions of the chosen one. The panel translates the names of roles and
// permissions and keeps no text of its own about what a role sees.

type StaffDrawerProps = {
  /** `edit` waits for `member`; the title and the checks follow the mode. */
  mode: "create" | "edit"
  member?: StaffMember
  roles?: StaffRoleGrant[]
  /** Until the list is read the drawer has no form, never one with blanks. */
  isPending?: boolean
}

/** The permissions a role opens, in the panel's words: «заказы, клиенты, …». */
export const useRoleSeesList = (roles: StaffRoleGrant[] | undefined, role: string) => {
  const { t } = useTranslation()
  return roleSees(roles, role)
    .map((permission) => t(`staff.permissions.${permission}`))
    .join(", ")
}

const StaffFields = ({
  form,
  member,
  roles,
}: {
  form: UseFormReturn<StaffDraft>
  member?: StaffMember
  roles?: StaffRoleGrant[]
}) => {
  const { t } = useTranslation()
  const role = useWatch({ control: form.control, name: "role" })
  const sees = useRoleSeesList(roles, role)

  const canChangeRole = !member || staffRowActions(member).canChangeRole
  const roleName = (value: string) => (isRoleName(value) ? t(`staff.roles.${value}`) : value)
  const roleHint = !canChangeRole
    ? t("staff.edit.selfRole")
    : sees
      ? t("staff.roleSees", { list: sees })
      : null

  return (
    <>
      <Form.Field
        control={form.control}
        name="email"
        render={({ field }) => (
          <Form.Item>
            <Form.Label>{t("staff.fields.email")}</Form.Label>
            <Form.Control>
              <Input
                {...field}
                type="email"
                autoComplete="off"
                placeholder={t("staff.fields.emailPlaceholder")}
                disabled={!!member}
              />
            </Form.Control>
            <Form.Hint>
              {member ? t("staff.fields.emailLocked") : t("staff.fields.emailHint")}
            </Form.Hint>
            <Form.ErrorMessage />
          </Form.Item>
        )}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Form.Field
          control={form.control}
          name="firstName"
          render={({ field }) => (
            <Form.Item>
              <Form.Label>{t("staff.fields.firstName")}</Form.Label>
              <Form.Control>
                <Input {...field} autoComplete="off" />
              </Form.Control>
              <Form.ErrorMessage />
            </Form.Item>
          )}
        />
        <Form.Field
          control={form.control}
          name="lastName"
          render={({ field }) => (
            <Form.Item>
              <Form.Label>{t("staff.fields.lastName")}</Form.Label>
              <Form.Control>
                <Input {...field} autoComplete="off" />
              </Form.Control>
              <Form.ErrorMessage />
            </Form.Item>
          )}
        />
      </div>
      <Form.Field
        control={form.control}
        name="role"
        render={({ field: { value, onChange, ref, ...field } }) => (
          <Form.Item>
            <Form.Label>{t("staff.fields.role")}</Form.Label>
            <Form.Control>
              <Select {...field} value={value} onValueChange={onChange} disabled={!canChangeRole}>
                <Select.Trigger ref={ref} data-testid="staff-role">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {staffRoleOptions(roles).map((option) => (
                    <Select.Item key={option} value={option}>
                      {roleName(option)}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </Form.Control>
            {roleHint ? <Form.Hint data-testid="staff-role-hint">{roleHint}</Form.Hint> : null}
            <Form.ErrorMessage />
          </Form.Item>
        )}
      />
      <Form.Field
        control={form.control}
        name="password"
        render={({ field }) => (
          <Form.Item>
            <Form.Label optional={!!member}>
              {member ? t("staff.fields.newPassword") : t("staff.fields.password")}
            </Form.Label>
            <Form.Control>
              <Input {...field} type="password" autoComplete="new-password" />
            </Form.Control>
            <Form.Hint>
              {member ? t("staff.fields.newPasswordHint") : t("staff.fields.passwordHint")}
            </Form.Hint>
            <Form.ErrorMessage />
          </Form.Item>
        )}
      />
    </>
  )
}

export const StaffDrawer = ({ mode, member, roles, isPending = false }: StaffDrawerProps) => {
  const { t } = useTranslation()
  const { mutateAsync: create } = useCreateStaff()
  const { mutateAsync: update } = useUpdateStaff()

  // An edit keeps the password unless the field is filled; a new login needs one.
  const editing = mode === "edit"
  const schema = useMemo(() => {
    const tooShort = t("staff.errors.passwordTooShort")
    return zod.object({
      email: editing
        ? zod.string()
        : zod.string().trim().min(1, { message: t("staff.errors.emailRequired") }),
      firstName: zod.string(),
      lastName: zod.string(),
      role: zod.string(),
      password: editing
        ? zod
            .string()
            .refine((value) => value.length === 0 || value.length >= STAFF_PASSWORD_MIN, {
              message: tooShort,
            })
        : zod.string().min(STAFF_PASSWORD_MIN, { message: tooShort }),
    })
  }, [editing, t])

  // A refusal of the form itself or of the server reaches the drawer as an
  // `Error` in the owner's words, and the drawer shows it as `toast.error`.
  const refuse = (error: string): never => {
    throw new Error(t(`staff.errors.${error}`))
  }
  const send = async (request: () => Promise<unknown>) => {
    try {
      await request()
    } catch (submitError) {
      // The server owns every other refusal (the last owner, an address taken).
      throw new Error(staffErrorText(submitError, t("staff.errors.general"), (key) => t(key)))
    }
  }

  const handleSubmit = async (draft: StaffDraft) => {
    if (member) {
      const built = updateStaffBody(member, draft)
      if ("error" in built) {
        return refuse(built.error)
      }
      return send(() => update({ id: member.id, body: built.body }))
    }
    const built = createStaffBody(draft)
    if ("error" in built) {
      return refuse(built.error)
    }
    return send(() => create(built.body))
  }

  return (
    <SettingsEditDrawer<StaffDraft>
      title={editing ? t("staff.edit.title") : t("staff.create.title")}
      isPending={isPending}
      schema={schema}
      defaultValues={member ? draftOfStaff(member) : emptyStaffDraft(roles)}
      onSubmit={handleSubmit}
      successMessage={editing ? t("staff.edit.success") : t("staff.create.success")}
      submitText={editing ? undefined : t("staff.create.submit")}
    >
      {(form) => <StaffFields form={form} member={member} roles={roles} />}
    </SettingsEditDrawer>
  )
}
