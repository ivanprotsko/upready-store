import { Heading } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { RouteDrawer } from "../../../components/modals"
import { ChangePasswordForm } from "./components/change-password-form/change-password-form"

// o24-owner-profile (t-2026-09-24-n3): the drawer Ivan's «Изменить» button
// opens, same shape as `routes/profile/profile-edit` (RouteDrawer, fixed
// header, scrollable body, fixed footer with Cancel/Save), titled «Изменить
// пароль» instead of «Редактировать профиль».

export const PasswordEdit = () => {
  const { t } = useTranslation()

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>{t("profile.changePassword.title")}</Heading>
        </RouteDrawer.Title>
      </RouteDrawer.Header>
      <ChangePasswordForm />
    </RouteDrawer>
  )
}
