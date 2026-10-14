import { toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useDeleteStaff } from "../../../hooks/api/staff"
import { StaffMember, staffErrorText, staffName } from "../../../lib/staff"

// t-2026-10-14-01 (panel redesign, G2): the one «Удалить» of a login, for the
// row's «…» in the list and for the card's «…» (panel-ds E6). The prompt names
// the person and the address and says what stays; the server owns the refusal
// (the last owner) and the owner reads it in the panel's language.

export const useStaffDelete = () => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const { mutateAsync: remove } = useDeleteStaff()

  /** Resolves `true` once the login is gone, `false` when cancelled or refused. */
  return async (member: StaffMember): Promise<boolean> => {
    const name = staffName(member)
    const confirmed = await prompt({
      title: t("staff.delete.title"),
      description: name
        ? t("staff.delete.description", { name, email: member.email })
        : t("staff.delete.descriptionNoName", { email: member.email }),
      confirmText: t("actions.delete"),
      cancelText: t("actions.cancel"),
      variant: "danger",
    })
    if (!confirmed) {
      return false
    }
    try {
      await remove(member.id)
    } catch (deleteError) {
      toast.error(staffErrorText(deleteError, t("staff.errors.general"), (key) => t(key)))
      return false
    }
    toast.success(t("staff.delete.success"))
    return true
  }
}
