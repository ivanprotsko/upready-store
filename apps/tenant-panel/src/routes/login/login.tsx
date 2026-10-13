import { Spinner } from "@medusajs/icons"
import { Heading, InlineTip, Text } from "@medusajs/ui"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { BrandMark } from "../../components/common/brand-mark"
import { useAuthProviders } from "../../hooks/api"
import { EmailPassLogin } from "./components/email-pass-login"
import { hasEmailPassProvider } from "./utils"

// tenant-panel: rewritten from the Admin's login.tsx. Drops `useExtension`/
// `getWidgets` (no extensions), `CloudAuthLogin` and `SsoLogin` (no cloud or
// SSO auth providers for the `tenant` actor type), MFA state and
// `MfaChallengeCard` (the tenant contract has no MFA — `EmailPassLogin` keeps
// its `onMfaChallenge` prop, passed a no-op below, so that file stays
// byte-for-byte identical to upstream). The post-login redirect default moves
// from `/orders` to `/` inside `components/email-pass-login.tsx` itself,
// which owns the actual `navigate()` call. The reset-password link
// (f14-no-password-reset) lives inside that same file, next to the password
// field it sits under, and points at `routes/forgot-password`.
export const Login = () => {
  const { t } = useTranslation()

  const { providers, isLoading: isProvidersLoading } = useAuthProviders()

  const providerList = useMemo(() => providers ?? [], [providers])
  const isEmailPassInstalled = useMemo(
    () => hasEmailPassProvider(providerList),
    [providerList]
  )

  return (
    <div className="bg-ui-bg-subtle flex min-h-dvh w-dvw items-center justify-center">
      <div className="m-4 flex w-full max-w-[280px] flex-col items-center">
        <BrandMark />
        <div className="mb-4 flex flex-col items-center">
          <Heading>{t("login.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle text-center">
            {t("login.hint")}
          </Text>
        </div>
        <div className="flex w-full flex-col gap-y-3">
          {isProvidersLoading ? (
            <div className="flex w-full items-center justify-center py-6">
              <Spinner className="text-ui-fg-subtle animate-spin" />
            </div>
          ) : !providerList.length ? (
            <div>
              <InlineTip label={t("general.tip")}>
                {t("auth.login.noProviders")}
              </InlineTip>
            </div>
          ) : (
            isEmailPassInstalled && (
              <EmailPassLogin onMfaChallenge={() => {}} />
            )
          )}
        </div>
      </div>
    </div>
  )
}
