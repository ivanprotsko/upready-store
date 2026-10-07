import { PencilSquare } from "@medusajs/icons"
import { Button, Container, Heading, Select, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { ActionMenu } from "../../../../../components/common/action-menu"
import { useDocumentDirection } from "../../../../../hooks/use-document-direction"
// tenant-panel: `TenantAdmin` (hooks/api/users) instead of the Admin's
// `HttpTypes.AdminUser` — same three fields this component reads.
import { TenantAdmin, useUpdateUser } from "../../../../../hooks/api/users"
import { languages } from "../../../../../i18n/languages"
import { isStaffRole } from "../../../../../lib/permissions"

type ProfileGeneralSectionProps = {
  user: TenantAdmin
}

export const ProfileGeneralSection = ({ user }: ProfileGeneralSectionProps) => {
  const { i18n, t } = useTranslation()
  const direction = useDocumentDirection()

  const name = [user.first_name, user.last_name].filter(Boolean).join(" ")

  const sortedLanguages = languages
    .slice()
    .sort((a, b) => a.display_name.localeCompare(b.display_name))

  // o24-owner-profile (t-2026-09-24-n3): Ivan's own words — the language row
  // showed only the current value, and reaching the select meant noticing the
  // "…" menu opens an editor. The select now sits directly in the value
  // column: `i18n.changeLanguage` flips the UI at once (and, through the
  // detector's cookie/localStorage cache, survives a reload), the mutation
  // persists the choice server-side. A failed mutation rolls the visible
  // language back so the screen never claims a save that did not happen.
  const { mutate: updateUser } = useUpdateUser()

  const handleLanguageChange = async (code: string) => {
    const previous = i18n.language

    await i18n.changeLanguage(code)

    updateUser(
      { metadata: { ...user.metadata, language: code } },
      {
        onError: (error) => {
          i18n.changeLanguage(previous)
          toast.error(error.message)
        },
      }
    )
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading>{t("profile.domain")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("profile.manageYourProfileDetails")}
          </Text>
        </div>
        <ActionMenu
          groups={[
            {
              actions: [
                {
                  label: t("actions.edit"),
                  to: "edit",
                  icon: <PencilSquare />,
                },
              ],
            },
          ]}
        />
      </div>
      <div className="text-ui-fg-subtle grid grid-cols-2 items-center px-6 py-4">
        <Text size="small" leading="compact" weight="plus">
          {t("fields.name")}
        </Text>
        <Text size="small" leading="compact">
          {name || "-"}
        </Text>
      </div>
      <div className="grid grid-cols-2 items-center px-6 py-4">
        <Text size="small" leading="compact" weight="plus">
          {t("profile.fields.emailLabel")}
        </Text>
        <Text size="small" leading="compact">
          {user.email}
        </Text>
      </div>
      {/* t-2026-10-07-11: the login's own role in this shop, as the server
          named it; a server without roles sends none and the row is absent. */}
      {user.role ? (
        <div className="grid grid-cols-2 items-center px-6 py-4" data-testid="profile-role">
          <Text size="small" leading="compact" weight="plus">
            {t("profile.fields.roleLabel")}
          </Text>
          <Text size="small" leading="compact">
            {isStaffRole(user.role) ? t(`staff.roles.${user.role}`) : user.role}
          </Text>
        </div>
      ) : null}
      <div className="grid grid-cols-2 items-center px-6 py-4">
        <Text size="small" leading="compact" weight="plus">
          {t("profile.fields.languageLabel")}
        </Text>
        <Select dir={direction} value={i18n.language} onValueChange={handleLanguageChange}>
          <Select.Trigger className="py-1 text-[13px]">
            <Select.Value>
              {
                sortedLanguages.find((language) => language.code === i18n.language)
                  ?.display_name
              }
            </Select.Value>
          </Select.Trigger>
          <Select.Content>
            {languages.map((language) => (
              <Select.Item key={language.code} value={language.code}>
                {language.display_name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>
      <div className="grid grid-cols-2 items-center px-6 py-4">
        <Text size="small" leading="compact" weight="plus">
          {t("profile.fields.passwordLabel")}
        </Text>
        <Link to="password" className="w-fit">
          <Button size="small" variant="secondary">
            {t("actions.change")}
          </Button>
        </Link>
      </div>
      {/* TODO: Do we want to implement usage insights in V2? */}
      {/* <div className="grid grid-cols-2 items-center px-6 py-4">
        <Text size="small" leading="compact" weight="plus">
          {t("profile.fields.usageInsightsLabel")}
        </Text>
        <StatusBadge color="red" className="w-fit">
          {t("general.disabled")}
        </StatusBadge>
      </div> */}
    </Container>
  )
}
