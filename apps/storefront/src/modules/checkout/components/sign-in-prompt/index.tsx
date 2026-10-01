import { getTranslations } from "next-intl/server"
import { Button } from "@medusajs/ui"
import AccountLink from "@modules/layout/components/account-link"

const SignInPrompt = async () => {
  const t = await getTranslations("SignInPrompt")
  return (
    <>
      <div className="bg-ui-bg-base flex items-center justify-between">
        <div>
          <h2 className="h2-docs">{t("heading")}</h2>
          <p className="txt-medium text-ui-fg-muted">{t("description")}</p>
        </div>
        <div>
          <AccountLink>
            <Button
              variant="secondary"
              size="large"
              data-testid="sign-in-button"
            >
              {t("signIn")}
            </Button>
          </AccountLink>
        </div>
      </div>
      <div className="h-px bg-ui-border-base w-full" />
    </>
  )
}

export default SignInPrompt
