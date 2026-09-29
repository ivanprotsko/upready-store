import { Alert } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

/**
 * What the owner reads when a stored credential does not decrypt (46df D1):
 * the database was restored under another server key, or the row is damaged.
 * Nothing in it can be shown or used, so the only honest instruction is to
 * enter it again, or remove it. One component for every service, so the
 * wording cannot drift between Robokassa, СДЭК and the marketplaces.
 */
export const UnreadableSecretAlert = ({ testId }: { testId: string }) => {
  const { t } = useTranslation()
  return (
    <Alert variant="error" data-testid={testId}>
      {t("integrations.unreadable.alert")}
    </Alert>
  )
}
