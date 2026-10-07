import { LockClosedSolid } from "@medusajs/icons"
import { Button, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

/**
 * «Нет доступа» (t-2026-10-07-11): what a login sees on an address its role
 * does not open. Drawn the way the panel's «not found» screen is
 * (`routes/no-match`), with the one way out every role has.
 */
export const NoAccess = () => {
  const { t } = useTranslation()

  return (
    <div
      data-testid="no-access"
      className="flex size-full min-h-[calc(100vh-57px-24px)] items-center justify-center"
    >
      <div className="flex flex-col items-center gap-y-6">
        <div className="text-ui-fg-subtle flex flex-col items-center gap-y-3">
          <LockClosedSolid />
          <div className="flex flex-col items-center justify-center gap-y-1">
            <Text size="small" leading="compact" weight="plus">
              {t("noAccess.title")}
            </Text>
            <Text size="small" className="text-ui-fg-muted text-balance text-center">
              {t("noAccess.message")}
            </Text>
          </div>
        </div>
        <Button asChild size="small" variant="secondary">
          <Link to="/">{t("noAccess.toOverview")}</Link>
        </Button>
      </div>
    </div>
  )
}
